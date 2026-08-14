import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { allSquares, isInBounds, squareKey, squaresEqual } from './board'
import { kingDistanceField, knightDistanceField, queenDistanceField, rookDistanceField, KNIGHT_OFFSETS } from './distanceFields'
import { towersAt } from './fixtures'
import { nextMove } from './movement'
import type { MoveRequest } from './movement'
import type { PieceTypeId, Square, Tower } from './types'

const NO_TOWERS = new Map<string, Tower>()
const EMPTY_AVOID = new Set<string>()

/** Keeps call sites readable. Defaults match a freshly spawned Piece. */
function move(
  typeId: PieceTypeId,
  from: Square,
  towers: ReadonlyMap<string, Tower> = NO_TOWERS,
  overrides: Partial<MoveRequest> = {},
  avoid: ReadonlySet<string> = EMPTY_AVOID,
) {
  const request: MoveRequest = {
    typeId,
    from,
    moveCount: 0,
    handedness: 1,
    slideBonus: 0,
    hunting: false,
    tier: 'green',
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers, avoid)
}

/**
 * Follows hunting hops from `from` until the Piece leaks into the Core, giving
 * up after 64 hops. `nextMove` re-derives the hunt target from the Piece's
 * colour each hop, so this walks a colour-locked Bishop correctly too.
 */
function walkToCore(typeId: PieceTypeId, from: Square, overrides: Partial<MoveRequest> = {}): boolean {
  let square = from
  for (let hops = 0; hops < 64; hops += 1) {
    const outcome = move(typeId, square, NO_TOWERS, { ...overrides, hunting: true })
    if (outcome.kind === 'reachCore') return true
    if (outcome.kind !== 'move') return false
    square = outcome.to
  }
  return false
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

  it('leaks into the Core when its hunt slide reaches it', () => {
    expect(move('rook', { file: 4, rank: 0 }, NO_TOWERS, { slideBonus: 1 })).toEqual({
      kind: 'reachCore',
    })
  })

  it('ends a bonus slide at the back rank rather than bending into an L', () => {
    // Forward to (5,0), and there the forward steps run out. A Rook does not
    // bend onto a new line mid-slide, so the slide stops; the hunt begins next hop.
    expect(
      move('rook', { file: 5, rank: 1 }, NO_TOWERS, { handedness: -1, slideBonus: 1 }),
    ).toEqual({
      kind: 'move',
      to: { file: 5, rank: 0 },
      handedness: -1,
    })
  })
})

describe('rook hunting', () => {
  it('slides toward the Core along the back rank instead of sweeping', () => {
    expect(move('rook', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('covers two squares toward the Core under a King aura', () => {
    expect(move('rook', { file: 7, rank: 0 }, NO_TOWERS, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 0 },
      hunting: true,
    })
  })

  it('stops on the phase target instead of overshooting it', () => {
    // From (7,3) — a synthetic hunting request, since a real hunt starts on
    // rank 0 — the first phase target is (3,3), where the Core's file meets
    // the Rook's rank. Even a slide long enough to cross it stops there:
    // overshooting would land at the same field distance and undo the
    // convergence argument.
    expect(move('rook', { file: 7, rank: 3 }, NO_TOWERS, { hunting: true, slideBonus: 5 })).toEqual({
      kind: 'move',
      to: { file: 3, rank: 3 },
      hunting: true,
    })
  })

  it('arrives at the Core from every square on the board', () => {
    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      expect(walkToCore('rook', square)).toBe(true)
    }
  })

  it('never increases field distance from hop to hop', () => {
    const field = rookDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue

      let current = square
      let previous = field.get(squareKey(current)) ?? 0
      for (let hops = 0; hops < 64; hops += 1) {
        const outcome = move('rook', current, NO_TOWERS, { hunting: true })
        if (outcome.kind === 'reachCore') break
        expect(outcome.kind).toBe('move')
        if (outcome.kind !== 'move') break

        const distance = field.get(squareKey(outcome.to)) ?? Number.MAX_SAFE_INTEGER
        expect(distance).toBeLessThanOrEqual(previous)
        previous = distance
        current = outcome.to
      }
    }
  })

  it('grinds a Tower on its chosen line rather than sliding around it', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('rook', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })

  it('stops short when a Tower interrupts a hunt slide it has already begun', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('rook', { file: 6, rank: 0 }, towers, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 0 },
      hunting: true,
    })
  })

  it('is Tower-blind: a Tower nowhere near the choice does not change it', () => {
    const chosen = { kind: 'move' as const, to: { file: 6, rank: 0 }, hunting: true }

    expect(move('rook', { file: 7, rank: 0 })).toEqual(chosen)
    expect(move('rook', { file: 7, rank: 0 }, towersAt({ file: 0, rank: 7 }))).toEqual(chosen)
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
})

describe('bishop hunting', () => {
  it('climbs to the diagonal intersection instead of sweeping the back rank', () => {
    // (5,0) is not on a Core diagonal. The intersection that routes it back
    // down to (3,0) is (4,1) — one rank UP, away from the back rank, which
    // is exactly why the hunting latch has to exist.
    expect(move('bishop', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 1 },
      hunting: true,
    })
  })

  it('leaks into the Core down the Core diagonal', () => {
    expect(move('bishop', { file: 4, rank: 1 }, NO_TOWERS, { hunting: true })).toEqual({
      kind: 'reachCore',
    })
  })

  it('keeps hunting at the intersection, where a forward diagonal exists again', () => {
    // The latch, pinned: at (4,1) the Bishop has a legal forward diagonal to
    // (5,0). Unlatched, it would take it, march back to the back rank, and
    // oscillate forever.
    const forward = move('bishop', { file: 4, rank: 1 })
    expect(forward).toEqual({ kind: 'move', to: { file: 5, rank: 0 }, handedness: 1 })

    const hunting = move('bishop', { file: 4, rank: 1 }, NO_TOWERS, { hunting: true })
    expect(hunting).toEqual({ kind: 'reachCore' })
  })

  it('arrives at the Core from every square of the Core colour', () => {
    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      if ((square.file + square.rank) % 2 !== (CORE_SQUARE.file + CORE_SQUARE.rank) % 2) continue
      expect(walkToCore('bishop', square)).toBe(true)
    }
  })

  it('grinds a Tower blocking the climb rather than taking another diagonal', () => {
    const towers = towersAt({ file: 4, rank: 1 })

    expect(move('bishop', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })

  it('leaks from the square in front of the Core when colour-locked', () => {
    // (4,0) is the opposite colour from the Core, so the Core's square is
    // unreachable — a leak from it is impossible. The hunt targets the square
    // directly in front of the Core instead, (3,1), and leaks from there, so
    // the Bishop still meets the Core the same way every other Piece does.
    expect(move('bishop', { file: 4, rank: 0 })).toEqual({ kind: 'reachCore' })
  })

  it('arrives from every colour-locked square too', () => {
    for (const square of allSquares(BOARD)) {
      if ((square.file + square.rank) % 2 === (CORE_SQUARE.file + CORE_SQUARE.rank) % 2) continue
      expect(walkToCore('bishop', square)).toBe(true)
    }
  })

  it('grinds a Tower standing on the square in front of the Core before leaking', () => {
    // The one square a colour-locked Bishop leaks FROM can hold a Tower, and
    // the Tower check outranks the leak check on purpose: the Bishop grinds
    // the wall down, it does not leak through it.
    const towers = towersAt({ file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 })

    expect(move('bishop', { file: 4, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
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
    // existed where huntByOffsets failed to find a distance-minus-one neighbour,
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
    // that, a version of `huntByOffsets` that was never actually wired in could
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
      hunting: true,
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
})

describe('queen hunting', () => {
  it('slides toward the Core along the back rank instead of sweeping', () => {
    expect(move('queen', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('hunts from either alternation parity', () => {
    // The rook/bishop alternation is forward-march behaviour only; a hunting
    // Queen uses full queen movement regardless of which line her next hop
    // would have been.
    expect(move('queen', { file: 5, rank: 0 }, NO_TOWERS, { moveCount: 1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('arrives at the Core from every square on the board', () => {
    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      expect(walkToCore('queen', square)).toBe(true)
    }
  })

  it('grinds a Tower on its chosen line rather than sliding around it', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('queen', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
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
})

describe('king hunting', () => {
  it('steps toward the Core instead of sweeping the back rank', () => {
    expect(move('king', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('leaks into the Core when adjacent to it', () => {
    expect(move('king', { file: 4, rank: 0 })).toEqual({ kind: 'reachCore' })
  })

  it('strictly decreases distance on every hunting step, for every square on the board', () => {
    // The same exhaustive shape as the Knight's "strictly decreases" test: a
    // King's hunt is a single step, so every square must have a neighbour at
    // exactly one less, or the walk can stall.
    const field = kingDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      const ownDistance = field.get(squareKey(square))
      expect(ownDistance).toBeDefined()

      const outcome = move('king', square, NO_TOWERS, { hunting: true })

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

  it('keeps hunting even where a forward step exists, and it differs from the march', () => {
    // The latch: from (1,1) a marching King steps forward to (1,0), but a
    // hunting King closes the file gap instead. If the trigger ever collapsed
    // to "forward off the board" alone and dropped the "already hunting"
    // half, this would revert to the forward step.
    const forward = move('king', { file: 1, rank: 1 })
    expect(forward).toEqual({ kind: 'move', to: { file: 1, rank: 0 }, handedness: 1 })

    const hunting = move('king', { file: 1, rank: 1 }, NO_TOWERS, { hunting: true })
    expect(hunting).toEqual({ kind: 'move', to: { file: 2, rank: 1 }, hunting: true })
  })

  it('grinds a Tower blocking its chosen square rather than stepping around it', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('king', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })

  it('is Tower-blind: a Tower nowhere near the choice does not change it', () => {
    const chosen = { kind: 'move' as const, to: { file: 4, rank: 0 }, hunting: true }

    expect(move('king', { file: 5, rank: 0 })).toEqual(chosen)
    expect(move('king', { file: 5, rank: 0 }, towersAt({ file: 0, rank: 7 }))).toEqual(chosen)
  })
})

describe('yellow coverage avoidance', () => {
  /**
   * A hunting Knight at (2,3) has exactly two d−1 candidates, both found at
   * runtime from the field so the test survives field changes: the first in
   * KNIGHT_OFFSETS order and the second. (1,1) and (4,2) both sit one knight
   * move from the Core at (3,0).
   */
  const from = { file: 2, rank: 3 }

  function knightCandidates(field: ReadonlyMap<string, number>): Square[] {
    const own = field.get(squareKey(from))
    if (own === undefined) throw new Error('expected a knight field entry for (2,3)')

    return KNIGHT_OFFSETS.map((offset) => ({ file: from.file + offset.file, rank: from.rank + offset.rank }))
      .filter(
        (square) => isInBounds(BOARD, square) && field.get(squareKey(square)) === own - 1,
      )
  }

  it('prefers an uncovered d−1 landing over a covered one', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined || candidates[1] === undefined)
      throw new Error('expected at least two candidates')

    const avoid = new Set([squareKey(candidates[0])])
    const outcome = move('knight', from, NO_TOWERS, { tier: 'yellow', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[1], hunting: true })
  })

  it('falls back to the first d−1 landing when every one is covered', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const avoid = new Set(candidates.map((square) => squareKey(square)))
    const outcome = move('knight', from, NO_TOWERS, { tier: 'yellow', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[0], hunting: true })
  })

  it('grinds a Tower-blocked d−1 landing rather than routing around it', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const towers = towersAt(candidates[0])
    const outcome = move('knight', from, towers, { tier: 'yellow', hunting: true }, new Set())

    expect(outcome).toEqual({ kind: 'attackTower', towerId: 'tower-0', hunting: true })
  })

  it('a green late-hunt Piece does not avoid', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const avoid = new Set(candidates.map((square) => squareKey(square)))
    const outcome = move('knight', from, NO_TOWERS, { tier: 'green', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[0], hunting: true })
  })

  it('a red Piece ignores the avoid set', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const avoid = new Set(candidates.map((square) => squareKey(square)))
    const outcome = move('knight', from, NO_TOWERS, { tier: 'red', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[0], hunting: true })
  })

  it('never dodges the Core, even when it is covered', () => {
    const outcome = move('king', { file: 3, rank: 1 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['3,0']))

    expect(outcome).toEqual({ kind: 'reachCore' })
  })

  it('a colour-locked Bishop never dodges its pre-Core target', () => {
    // (4,0) is on the opposite colour from the Core, so this Bishop hunts the
    // square directly in front of it, (3,1) — covered here, and still taken.
    const outcome = move('bishop', { file: 4, rank: 0 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['3,1']))

    expect(outcome).toEqual({ kind: 'reachCore' })
  })

  it('a slider prefers a direction whose landing square is uncovered', () => {
    // Locked Bishop at (5,1): its first direction lands on (4,2) (covered), so
    // it takes the second, which lands on (4,0).
    const outcome = move('bishop', { file: 5, rank: 1 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['4,2']))

    expect(outcome).toEqual({ kind: 'move', to: { file: 4, rank: 0 }, hunting: true })
  })

  it('a King prefers a direction whose landing square is uncovered', () => {
    // From (3,2) the King's fixed scan order first resolves the direction
    // landing on (3,1); covered here, it takes the next resolved d−1 landing,
    // (4,1).
    const outcome = move('king', { file: 3, rank: 2 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['2,2', '3,1']))

    expect(outcome).toEqual({ kind: 'move', to: { file: 4, rank: 1 }, hunting: true })
  })

  it("a King falls back to today's first landing when every one is covered", () => {
    // From (3,2) every resolved d−1 landing — (3,1), (4,1), (2,1) — is
    // covered, so the hunt degrades to its ordinary first landing, (3,1).
    const outcome = move('king', { file: 3, rank: 2 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['2,2', '3,1', '4,1', '2,1']))

    expect(outcome).toEqual({ kind: 'move', to: { file: 3, rank: 1 }, hunting: true })
  })

  it('a yellow slider does not reverse into a capped equal-distance landing after a skip', () => {
    // From (6,4) the Queen's first direction reaches (7,4) — its distance-1
    // phase target — in one step, but (7,4) is covered. The next direction's
    // slide is capped (maxSteps 1, closerRange 3) and would land on (5,4), an
    // equal-distance square: accepting it reverses the piece and, from (5,4),
    // the first direction pulls it back to (6,4) forever. The hunt must instead
    // keep scanning for a distance-decreasing landing, not take the capped one.
    const outcome = move('queen', { file: 6, rank: 4 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['7,4']))

    // (6,3) is the next distance-decreasing landing (distance 1) the scan finds
    // after (7,4) is skipped; taking it instead of (5,4) is what breaks the loop.
    expect(outcome).toEqual({ kind: 'move', to: { file: 6, rank: 3 }, hunting: true })
  })

  it('a repelled yellow slider reaches the Core instead of oscillating', () => {
    // From (5,4) the Queen's +file slide is capped to (6,4) (equal distance);
    // from (6,4) its only uncovered distance-decreasing landing is (6,3). Each
    // hop must make progress: (5,4) -> (6,4) -> (6,3) -> ... -> reachCore, never
    // (5,4) <-> (6,4). `move` is stateless, so drive nextMove directly.
    const field = queenDistanceField(BOARD, CORE_SQUARE)
    const own = field.get(squareKey({ file: 5, rank: 4 }))
    if (own === undefined) throw new Error('expected a queen field entry for (5,4)')
    expect(field.get(squareKey({ file: 6, rank: 4 }))).toBe(own)
    expect(field.get(squareKey({ file: 7, rank: 4 }))).toBe(own - 1)
    let square = { file: 5, rank: 4 }
    const seen = new Set<string>([squareKey(square)])

    for (let i = 0; i < 32; i += 1) {
      const outcome = move('queen', square, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['7,4']))
      if (outcome.kind === 'reachCore') return
      if (outcome.kind !== 'move') break
      square = outcome.to
      const key = squareKey(square)
      if (seen.has(key)) throw new Error(`oscillation: revisit ${key}`)
      seen.add(key)
    }

    throw new Error('did not reach the Core')
  })
})
