import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { squareKey } from './board'
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

  it('is stuck on the back rank when the Core is not within reach', () => {
    // File 0, rank 0 — nowhere forward to go, and the Core is on file 3.
    expect(move('pawn', { file: 0, rank: 0 })).toEqual({
      kind: 'stuck',
    })
  })

  it('is stuck rather than sliding along the back rank toward the Core', () => {
    const outcome = move('pawn', { file: 2, rank: 0 })

    expect(outcome.kind).toBe('stuck')
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

  it('strands on the back rank, because every hop from there goes backwards', () => {
    expect(move('knight', { file: 5, rank: 0 })).toEqual({ kind: 'stuck' })
  })
})
