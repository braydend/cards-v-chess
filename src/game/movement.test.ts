import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { squareKey } from './board'
import { nextMove } from './movement'
import type { Square, Tower } from './types'

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

describe('pawn movement', () => {
  it('advances one square down its file', () => {
    expect(nextMove('pawn', { file: 5, rank: 6 }, BOARD, CORE_SQUARE, NO_TOWERS)).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
    })
  })

  it('never moves sideways, even when the Core is on another file', () => {
    // The Core is on file 3. A chess pawn cannot approach it laterally.
    const outcome = nextMove('pawn', { file: 0, rank: 4 }, BOARD, CORE_SQUARE, NO_TOWERS)

    expect(outcome).toEqual({ kind: 'move', to: { file: 0, rank: 3 } })
  })

  it('never moves backwards', () => {
    const outcome = nextMove('pawn', { file: 5, rank: 6 }, BOARD, CORE_SQUARE, NO_TOWERS)

    expect(outcome.kind).toBe('move')
    if (outcome.kind === 'move') expect(outcome.to.rank).toBeLessThan(6)
  })

  it('reaches the Core when it lies straight ahead', () => {
    const justAbove = { file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 }

    expect(nextMove('pawn', justAbove, BOARD, CORE_SQUARE, NO_TOWERS)).toEqual({
      kind: 'reachCore',
    })
  })

  it('captures the Core diagonally, as a pawn does', () => {
    const diagonal = { file: CORE_SQUARE.file - 1, rank: CORE_SQUARE.rank + 1 }

    expect(nextMove('pawn', diagonal, BOARD, CORE_SQUARE, NO_TOWERS)).toEqual({
      kind: 'reachCore',
    })
  })

  it('captures the Core from the other diagonal too', () => {
    const diagonal = { file: CORE_SQUARE.file + 1, rank: CORE_SQUARE.rank + 1 }

    expect(nextMove('pawn', diagonal, BOARD, CORE_SQUARE, NO_TOWERS)).toEqual({
      kind: 'reachCore',
    })
  })

  it('attacks a Tower standing directly in its path', () => {
    const towers = towersAt({ file: 5, rank: 5 })

    const outcome = nextMove('pawn', { file: 5, rank: 6 }, BOARD, CORE_SQUARE, towers)

    expect(outcome).toEqual({ kind: 'attackTower', towerId: 'tower-0' })
  })

  it('ignores a Tower off to the diagonal when its path ahead is clear', () => {
    const towers = towersAt({ file: 4, rank: 5 })

    expect(nextMove('pawn', { file: 5, rank: 6 }, BOARD, CORE_SQUARE, towers)).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
    })
  })

  it('is stuck on the back rank when the Core is not within reach', () => {
    // File 0, rank 0 — nowhere forward to go, and the Core is on file 3.
    expect(nextMove('pawn', { file: 0, rank: 0 }, BOARD, CORE_SQUARE, NO_TOWERS)).toEqual({
      kind: 'stuck',
    })
  })

  it('is stuck rather than sliding along the back rank toward the Core', () => {
    const outcome = nextMove('pawn', { file: 2, rank: 0 }, BOARD, CORE_SQUARE, NO_TOWERS)

    expect(outcome.kind).toBe('stuck')
  })
})
