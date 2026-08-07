import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { allSquares, squareKey } from './board'
import {
  bishopDistanceField,
  kingDistanceField,
  knightDistanceField,
  queenDistanceField,
  rookDistanceField,
} from './distanceFields'

const CORE_COLOUR = (CORE_SQUARE.file + CORE_SQUARE.rank) % 2

describe('knight distance field', () => {
  it('seeds the Core at zero and covers every square on an 8x8 board', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey(CORE_SQUARE))).toBe(0)
    for (const square of allSquares(BOARD)) {
      expect(field.get(squareKey(square))).toBeDefined()
    }
  })

  it('keeps the distances the knight module always had', () => {
    // Regression guard for the module move: these values are pinned by the
    // Knight's existing hunt, which this task must not change.
    const field = knightDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 5, rank: 0 }))).toBe(2)
    expect(field.get(squareKey({ file: 4, rank: 2 }))).toBe(1)
    expect(field.get(squareKey({ file: 0, rank: 7 }))).toBeGreaterThanOrEqual(4)
  })
})

describe('rook distance field', () => {
  it('counts a slide of any length as one move', () => {
    const field = rookDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 3, rank: 7 }))).toBe(1)
    expect(field.get(squareKey({ file: 7, rank: 0 }))).toBe(1)
    expect(field.get(squareKey({ file: 7, rank: 7 }))).toBe(2)
  })

  it('covers every square', () => {
    const field = rookDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      expect(field.get(squareKey(square))).toBeDefined()
    }
  })
})

describe('bishop distance field', () => {
  it('covers exactly the seed colour', () => {
    const field = bishopDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      const onCoreColour = (square.file + square.rank) % 2 === CORE_COLOUR
      expect(field.has(squareKey(square))).toBe(onCoreColour)
    }
  })

  it('counts a diagonal of any length as one move', () => {
    const field = bishopDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 7, rank: 4 }))).toBe(1)
    expect(field.get(squareKey({ file: 1, rank: 2 }))).toBe(1)
    expect(field.get(squareKey({ file: 5, rank: 0 }))).toBe(2)
  })

  it('a seed behind the Core covers the opposite colour', () => {
    const behindCore = { file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 }
    const field = bishopDistanceField(BOARD, behindCore)

    expect(field.get(squareKey(behindCore))).toBe(0)
    expect(field.has(squareKey(CORE_SQUARE))).toBe(false)
    expect(field.has(squareKey({ file: 4, rank: 0 }))).toBe(true)
  })
})

describe('queen distance field', () => {
  it('counts a shared rank, file, or diagonal as one move, and never needs more than two', () => {
    const field = queenDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 7, rank: 0 }))).toBe(1)
    expect(field.get(squareKey({ file: 3, rank: 7 }))).toBe(1)
    expect(field.get(squareKey({ file: 7, rank: 4 }))).toBe(1)
    for (const square of allSquares(BOARD)) {
      const distance = field.get(squareKey(square))
      expect(distance).toBeDefined()
      expect(distance).toBeLessThanOrEqual(2)
    }
  })
})

describe('king distance field', () => {
  it('is Chebyshev distance', () => {
    const field = kingDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      const chebyshev = Math.max(
        Math.abs(square.file - CORE_SQUARE.file),
        Math.abs(square.rank - CORE_SQUARE.rank),
      )
      expect(field.get(squareKey(square))).toBe(chebyshev)
    }
  })
})

describe('the field cache', () => {
  it('returns the same field for the same board, seed, and type', () => {
    expect(rookDistanceField(BOARD, CORE_SQUARE)).toBe(rookDistanceField(BOARD, CORE_SQUARE))
  })

  it('keeps different seeds and different types apart', () => {
    const behindCore = { file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 }

    expect(bishopDistanceField(BOARD, CORE_SQUARE)).not.toBe(bishopDistanceField(BOARD, behindCore))
    expect(kingDistanceField(BOARD, CORE_SQUARE)).not.toBe(queenDistanceField(BOARD, CORE_SQUARE))
  })
})
