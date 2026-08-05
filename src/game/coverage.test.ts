import { describe, expect, it } from 'vitest'
import { coversSquare } from './coverage'

const ORIGIN = { file: 4, rank: 4 }

describe('coversSquare: horizontal', () => {
  it('covers a square on the same board rank within range', () => {
    expect(coversSquare('horizontal', 3, ORIGIN, { file: 6, rank: 4 })).toBe(true)
  })

  it('covers in both directions along the rank', () => {
    expect(coversSquare('horizontal', 3, ORIGIN, { file: 1, rank: 4 })).toBe(true)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('horizontal', 3, ORIGIN, ORIGIN)).toBe(false)
  })

  it('does not cover beyond its range', () => {
    expect(coversSquare('horizontal', 3, ORIGIN, { file: 0, rank: 4 })).toBe(false)
  })

  it('does not cover off its rank', () => {
    expect(coversSquare('horizontal', 3, ORIGIN, { file: 5, rank: 5 })).toBe(false)
  })
})

describe('coversSquare: vertical', () => {
  it('covers a square on the same file within range', () => {
    expect(coversSquare('vertical', 3, ORIGIN, { file: 4, rank: 6 })).toBe(true)
  })

  it('covers in both directions along the file', () => {
    expect(coversSquare('vertical', 3, ORIGIN, { file: 4, rank: 1 })).toBe(true)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('vertical', 3, ORIGIN, ORIGIN)).toBe(false)
  })

  it('does not cover beyond its range', () => {
    expect(coversSquare('vertical', 3, ORIGIN, { file: 4, rank: 0 })).toBe(false)
  })

  it('does not cover off its file', () => {
    expect(coversSquare('vertical', 3, ORIGIN, { file: 5, rank: 5 })).toBe(false)
  })
})

describe('coversSquare: cross', () => {
  it('covers along the rank', () => {
    expect(coversSquare('cross', 3, ORIGIN, { file: 6, rank: 4 })).toBe(true)
  })

  it('covers along the file', () => {
    expect(coversSquare('cross', 3, ORIGIN, { file: 4, rank: 6 })).toBe(true)
  })

  it('does not cover diagonals', () => {
    expect(coversSquare('cross', 3, ORIGIN, { file: 6, rank: 6 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('cross', 3, ORIGIN, ORIGIN)).toBe(false)
  })
})

describe('coversSquare: diagonal', () => {
  it('covers a true diagonal within range', () => {
    expect(coversSquare('diagonal', 3, ORIGIN, { file: 6, rank: 6 })).toBe(true)
  })

  it('covers all four diagonal directions', () => {
    expect(coversSquare('diagonal', 2, ORIGIN, { file: 2, rank: 6 })).toBe(true)
    expect(coversSquare('diagonal', 2, ORIGIN, { file: 6, rank: 2 })).toBe(true)
    expect(coversSquare('diagonal', 2, ORIGIN, { file: 2, rank: 2 })).toBe(true)
  })

  it('does not cover along a rank or file', () => {
    expect(coversSquare('diagonal', 3, ORIGIN, { file: 6, rank: 4 })).toBe(false)
    expect(coversSquare('diagonal', 3, ORIGIN, { file: 4, rank: 6 })).toBe(false)
  })

  it('does not cover an off-diagonal square', () => {
    expect(coversSquare('diagonal', 3, ORIGIN, { file: 6, rank: 5 })).toBe(false)
  })

  it('does not cover beyond its range', () => {
    expect(coversSquare('diagonal', 2, ORIGIN, { file: 7, rank: 7 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('diagonal', 3, ORIGIN, ORIGIN)).toBe(false)
  })
})

describe('coversSquare: colour, which the Knight depends on', () => {
  // Diagonals preserve square colour. This is why rank 5 is the diagonal:
  // a diagonal Tower on a light square only ever hits light squares, which is
  // exactly the Knight's damageable window.
  const isLight = (square: { file: number; rank: number }) => (square.file + square.rank) % 2 === 0

  it('only ever covers squares of its own colour when diagonal', () => {
    const from = { file: 3, rank: 3 }
    const covered: { file: number; rank: number }[] = []

    for (let file = 0; file < 8; file += 1) {
      for (let rank = 0; rank < 8; rank += 1) {
        if (coversSquare('diagonal', 8, from, { file, rank })) covered.push({ file, rank })
      }
    }

    expect(covered.length).toBeGreaterThan(0)
    expect(covered.every((square) => isLight(square) === isLight(from))).toBe(true)
  })

  it('covers both colours when cross, so it is the general-purpose shape', () => {
    const from = { file: 3, rank: 3 }
    const colours = new Set<boolean>()

    for (let file = 0; file < 8; file += 1) {
      for (let rank = 0; rank < 8; rank += 1) {
        if (coversSquare('cross', 8, from, { file, rank })) colours.add(isLight({ file, rank }))
      }
    }

    expect(colours.size).toBe(2)
  })
})
