import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { allSquares, squareKey, squaresEqual } from './board'
import { knightDistanceField } from './knightDistance'
import { nextMove } from './movement'
import type { MoveRequest } from './movement'
import type { PieceTypeId, Square, Tower } from './types'

function towersAt(...squares: Square[]): Map<string, Tower> {
  return new Map(
    squares.map((square, index) => [
      squareKey(square),
      {
        id: `tower-${index}`,
        square,
        cardRank: 2 as const,
        fireCooldownMs: 0,
        health: 8,
        maxHealth: 8,
        damage: 1,
        fireIntervalMs: 600,
        shield: 0,
        damageTaken: 0,
      },
    ]),
  )
}

const NO_TOWERS = new Map<string, Tower>()

/** Keeps call sites readable. Defaults match a freshly spawned Piece. */
function move(
  typeId: PieceTypeId,
  from: Square,
  towers: ReadonlyMap<string, Tower> = NO_TOWERS,
  overrides: Partial<MoveRequest> = {},
) {
  const request: MoveRequest = {
    typeId,
    from,
    moveCount: 0,
    handedness: 1,
    slideBonus: 0,
    hunting: false,
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers)
}

describe('pawn movement', () => {
  it('advances one square down its file', () => {
    expect(move('pawn', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
    })
  })

  it('never moves sideways, even when the Core is on another file', () => {
    // The Core is on file 3. A chess pawn cannot approach it laterally.
    const outcome = move('pawn', { file: 0, rank: 4 })

    expect(outcome).toEqual({ kind: 'move', to: { file: 0, rank: 3 } })
  })

  it('never moves backwards', () => {
    const outcome = move('pawn', { file: 5, rank: 6 })

    expect(outcome.kind).toBe('move')
    if (outcome.kind === 'move') expect(outcome.to.rank).toBeLessThan(6)
  })

  it('reaches the Core when it lies straight ahead', () => {
    const justAbove = { file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 }

    expect(move('pawn', justAbove)).toEqual({
      kind: 'reachCore',
    })
  })

  it('captures the Core diagonally, as a pawn does', () => {
    const diagonal = { file: CORE_SQUARE.file - 1, rank: CORE_SQUARE.rank + 1 }

    expect(move('pawn', diagonal)).toEqual({
      kind: 'reachCore',
    })
  })

  it('captures the Core from the other diagonal too', () => {
    const diagonal = { file: CORE_SQUARE.file + 1, rank: CORE_SQUARE.rank + 1 }

    expect(move('pawn', diagonal)).toEqual({
      kind: 'reachCore',
    })
  })

  it('attacks a Tower standing directly in its path', () => {
    const towers = towersAt({ file: 5, rank: 5 })

    const outcome = move('pawn', { file: 5, rank: 6 }, towers)

    expect(outcome).toEqual({ kind: 'attackTower', towerId: 'tower-0' })
  })

  it('ignores a Tower off to the diagonal when its path ahead is clear', () => {
    const towers = towersAt({ file: 4, rank: 5 })

    expect(move('pawn', { file: 5, rank: 6 }, towers)).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
    })
  })

  it('promotes on the back rank rather than stranding', () => {
    expect(move('pawn', { file: 0, rank: 0 })).toEqual({ kind: 'promote' })
  })

  it('promotes rather than sliding along the back rank toward the Core', () => {
    expect(move('pawn', { file: 2, rank: 0 })).toEqual({ kind: 'promote' })
  })
})

describe('rook movement', () => {
  it('advances one square down its file', () => {
    expect(move('rook', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('covers two squares when a King aura grants a slide bonus', () => {
    expect(move('rook', { file: 5, rank: 6 }, NO_TOWERS, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 4 },
      handedness: 1,
    })
  })

  it('attacks a Tower rather than sliding over it', () => {
    const towers = towersAt({ file: 5, rank: 5 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { slideBonus: 1 })).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })

  it('stops short when a Tower interrupts a slide it has already begun', () => {
    const towers = towersAt({ file: 5, rank: 4 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('sweeps sideways along the back rank when forward is off the board', () => {
    expect(move('rook', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })

  it('reflects off file 0 and flips handedness, so it never oscillates', () => {
    expect(move('rook', { file: 0, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 1, rank: 0 },
      handedness: 1,
    })
  })

  it('leaks into the Core when its sweep reaches the Core file', () => {
    expect(move('rook', { file: 4, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'reachCore',
    })
  })

  it('reflects off the high file edge and flips handedness', () => {
    expect(move('rook', { file: 7, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 0 },
      handedness: -1,
    })
  })

  it('ends a bonus slide at the corner rather than bending into an L', () => {
    // Forward to (5,0), then the only remaining step is sideways. A Rook does
    // not move in an L, so the slide stops.
    expect(
      move('rook', { file: 5, rank: 1 }, NO_TOWERS, { handedness: -1, slideBonus: 1 }),
    ).toEqual({
      kind: 'move',
      to: { file: 5, rank: 0 },
      handedness: -1,
    })
  })

  it('never returns to its own square when a bonus slide meets a file edge', () => {
    // Sideways to file 0, where the next step would reflect back to file 1.
    // Stopping at the corner keeps the hop meaningful; the reflection happens next hop.
    expect(
      move('rook', { file: 1, rank: 0 }, NO_TOWERS, { handedness: -1, slideBonus: 1 }),
    ).toEqual({
      kind: 'move',
      to: { file: 0, rank: 0 },
      handedness: -1,
    })
  })
})

describe('bishop movement', () => {
  it('advances one square on its forward diagonal', () => {
    expect(move('bishop', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 5 },
      handedness: 1,
    })
  })

  it('takes the other diagonal when its handedness points the other way', () => {
    expect(move('bishop', { file: 5, rank: 6 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 5 },
      handedness: -1,
    })
  })

  it('reflects off the file edge and flips handedness', () => {
    expect(move('bishop', { file: 7, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 5 },
      handedness: -1,
    })
  })

  it('stays on its own square colour, as a chess bishop does', () => {
    // (7,6) is a light square: file + rank is odd. Reflecting must preserve that.
    const outcome = move('bishop', { file: 7, rank: 6 })

    expect(outcome.kind).toBe('move')
    if (outcome.kind === 'move') {
      expect((outcome.to.file + outcome.to.rank) % 2).toBe((7 + 6) % 2)
    }
  })

  it('sweeps sideways once it reaches the back rank', () => {
    expect(move('bishop', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })
})

describe('knight movement', () => {
  it('hops two ranks forward and one file sideways', () => {
    expect(move('knight', { file: 4, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 4 },
    })
  })

  it('zig-zags: the next hop weaves back the other way', () => {
    expect(move('knight', { file: 5, rank: 4 }, NO_TOWERS, { moveCount: 1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 2 },
    })
  })

  it('starts on the opposite side when its handedness is reversed', () => {
    expect(move('knight', { file: 4, rank: 6 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 3, rank: 4 },
    })
  })

  it('mirrors the hop rather than leaving the board at a file edge', () => {
    expect(move('knight', { file: 7, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 4 },
    })
  })

  it('falls back to a one-forward hop when two ranks would leave the board', () => {
    expect(move('knight', { file: 4, rank: 1 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 0 },
    })
  })

  it('captures the Core with a one-forward hop', () => {
    // (1,1) -> (3,0) is a legal knight move, and the Core is on (3,0).
    expect(move('knight', { file: 1, rank: 1 })).toEqual({ kind: 'reachCore' })
  })

  it('attacks a Tower on its landing square rather than picking another hop', () => {
    const towers = towersAt({ file: 5, rank: 4 })

    expect(move('knight', { file: 4, rank: 6 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })

  it('hunts the Core instead of stranding where every forward hop leaves the board', () => {
    // Regression target: before hunting, this exact square is where a Knight
    // stranded forever. If the OR-condition in knightMove that triggers
    // hunting ever regresses back to only checking `piece.hunting`, this
    // reverts to `stuck` and fails.
    expect(move('knight', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 2 },
      hunting: true,
    })
  })

  it('takes its first legal hop even when another would land on the Core', () => {
    // From (5,1) the one-forward hops are (7,0) and (3,0) — the Core. The Knight
    // commits to the first in-bounds candidate, so it takes (7,0). Preferring the
    // Core would be goal-seeking, which would let Tower placement steer Pieces.
    expect(move('knight', { file: 5, rank: 1 })).toEqual({
      kind: 'move',
      to: { file: 7, rank: 0 },
    })
  })

  it('does capture the Core from the same square with the other handedness', () => {
    expect(move('knight', { file: 5, rank: 1 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'reachCore',
    })
  })
})

describe('knight hunting', () => {
  it('the latch keeps hunting even where a forward hop exists, and it differs from the zig-zag', () => {
    // moveCount: 1 picks the zig-zag's "other" side, which is in bounds from
    // (4,6) — proven by the first assertion, so this is a real forward hop,
    // not a vacuous one. If the OR-condition in knightMove ever collapsed to
    // "no forward hop" alone and dropped the "piece.hunting already true"
    // half, a hunting Knight standing on a square like this one would revert
    // to that same zig-zag hop instead of continuing to hunt — exactly the
    // reversion the latch in types.ts exists to prevent.
    const from = { file: 4, rank: 6 }
    const zigZag = move('knight', from, NO_TOWERS, { moveCount: 1 })
    expect(zigZag).toEqual({ kind: 'move', to: { file: 3, rank: 4 } })

    const hunting = move('knight', from, NO_TOWERS, { moveCount: 1, hunting: true })
    expect(hunting).toEqual({ kind: 'move', to: { file: 5, rank: 4 }, hunting: true })
  })

  it('strictly decreases distance to the Core on every hunting hop, for every square on the board', () => {
    // Exhaustive rather than a hand-picked square: this is exactly the
    // property the design's convergence argument depends on. If any square
    // existed where huntCore failed to find a distance-minus-one neighbour,
    // or picked one at the same or greater distance, this would be the test
    // to catch it — a single missed square would break the "arrives within
    // its own distance, in hops" guarantee that rules out cycles.
    const field = knightDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      const ownDistance = field.get(squareKey(square))
      expect(ownDistance).toBeDefined()

      const outcome = move('knight', square, NO_TOWERS, { hunting: true })

      if (ownDistance === 1) {
        expect(outcome).toEqual({ kind: 'reachCore' })
        continue
      }

      expect(outcome.kind).toBe('move')
      if (outcome.kind === 'move') {
        expect(field.get(squareKey(outcome.to))).toBe((ownDistance ?? 0) - 1)
      }
    }
  })

  it('is Tower-blind: no Tower placement changes which square a hunting Knight chooses', () => {
    // moveCount: 1 so the zig-zag a non-hunting Knight would take from here —
    // (3,4) — is a different square from the hunting target below. Without
    // that, a version of `huntCore` that was never actually wired in could
    // still pass by coincidence, because the default zig-zag from this square
    // happens to land on the same square hunting does.
    const from = { file: 4, rank: 6 }
    const overrides = { moveCount: 1, hunting: true }
    const chosen = { kind: 'move' as const, to: { file: 5, rank: 4 }, hunting: true }

    expect(move('knight', from, NO_TOWERS, overrides)).toEqual(chosen)

    // A Tower nowhere near any candidate square: catches a distance field
    // that secretly consulted Towers when building distances for the whole
    // board, not just this one hop's candidates.
    const farTower = towersAt({ file: 0, rank: 7 })
    expect(move('knight', from, farTower, overrides)).toEqual(chosen)

    // (4,6) has two candidates tied at the same distance — (5,4) and (3,4).
    // A Tower on the untaken tie, (3,4), catches a fixed-order scan that
    // quietly prefers whichever tied candidate happens to be open, rather
    // than always committing to the same one first.
    const towerOnTiedAlternative = towersAt({ file: 3, rank: 4 })
    expect(move('knight', from, towerOnTiedAlternative, overrides)).toEqual(chosen)
  })

  it('grinds on a Tower blocking its chosen square rather than picking the other tied candidate', () => {
    // Same tie as the Tower-blindness test above, but the Tower now sits on
    // the square that WOULD be chosen, and moveCount: 1 rules out the same
    // zig-zag coincidence. The open, equally-valid (3,4) proves this is not
    // "no candidate was available" — a routing implementation would take it,
    // and only the no-pathfinding rule stops that.
    const from = { file: 4, rank: 6 }
    const chosen = { file: 5, rank: 4 }
    const towers = towersAt(chosen)

    expect(move('knight', from, towers, { moveCount: 1, hunting: true })).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })
})

describe('queen movement', () => {
  it('goes straight forward on an even hop', () => {
    expect(move('queen', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('goes diagonally forward on an odd hop', () => {
    expect(move('queen', { file: 5, rank: 6 }, NO_TOWERS, { moveCount: 1 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 5 },
      handedness: 1,
    })
  })

  it('holds one line for the whole of a bonus slide', () => {
    expect(move('queen', { file: 5, rank: 6 }, NO_TOWERS, { moveCount: 1, slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 7, rank: 4 },
      handedness: 1,
    })
  })

  it('stops at the file edge rather than bending mid-slide', () => {
    // (6,6) diagonally forward reaches (7,5); the next diagonal step would
    // reflect off the file edge and turn the hop into a V. The slide stops
    // instead, and the reflection happens on the Queen's next hop.
    expect(move('queen', { file: 6, rank: 6 }, NO_TOWERS, { moveCount: 1, slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 7, rank: 5 },
      handedness: 1,
    })
  })

  it('sweeps the back rank once it reaches it', () => {
    expect(move('queen', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })
})

describe('king movement', () => {
  it('advances exactly one square forward', () => {
    expect(move('king', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('ignores a slide bonus, because it is not a slider', () => {
    expect(move('king', { file: 5, rank: 6 }, NO_TOWERS, { slideBonus: 2 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('sweeps the back rank rather than stranding', () => {
    expect(move('king', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })
})
