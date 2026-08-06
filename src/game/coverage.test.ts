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

describe('coversSquare: adjacent', () => {
  it('covers all eight neighbours at range 1', () => {
    const neighbours = [
      { file: 3, rank: 3 },
      { file: 4, rank: 3 },
      { file: 5, rank: 3 },
      { file: 3, rank: 4 },
      { file: 5, rank: 4 },
      { file: 3, rank: 5 },
      { file: 4, rank: 5 },
      { file: 5, rank: 5 },
    ]

    for (const neighbour of neighbours) {
      expect(coversSquare('adjacent', 1, ORIGIN, neighbour)).toBe(true)
    }
  })

  it('does not cover two squares away at range 1', () => {
    expect(coversSquare('adjacent', 1, ORIGIN, { file: 6, rank: 4 })).toBe(false)
    expect(coversSquare('adjacent', 1, ORIGIN, { file: 6, rank: 6 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('adjacent', 1, ORIGIN, ORIGIN)).toBe(false)
  })

  it('covers both square colours, unlike diagonal', () => {
    const isLight = (square: { file: number; rank: number }) => (square.file + square.rank) % 2 === 0
    const colours = new Set<boolean>()

    for (let file = 0; file < 8; file += 1) {
      for (let rank = 0; rank < 8; rank += 1) {
        if (coversSquare('adjacent', 1, ORIGIN, { file, rank })) colours.add(isLight({ file, rank }))
      }
    }

    expect(colours.size).toBe(2)
  })
})

describe('coversSquare: diagonal coverage preserves square colour', () => {
  // Diagonals preserve square colour: a diagonal Tower on a light square only
  // ever hits light squares. Pure geometry, verified for its own sake — no
  // mechanic currently keys off it (the Knight is damageable on every square).
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

describe('coversSquare: star', () => {
  it('covers along the file, like cross', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 4, rank: 6 })).toBe(true)
  })

  it('covers along the rank, like cross', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 6, rank: 4 })).toBe(true)
  })

  it('covers the diagonals too', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 6, rank: 6 })).toBe(true)
  })

  it('does not cover an off-ray square', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 6, rank: 5 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('star', 3, ORIGIN, ORIGIN)).toBe(false)
  })

  it('respects range', () => {
    expect(coversSquare('star', 2, ORIGIN, { file: 7, rank: 4 })).toBe(false)
  })
})

describe('coversSquare: adjacent as a disc', () => {
  it('covers the whole square block at range 3, not just the eight neighbours', () => {
    expect(coversSquare('adjacent', 3, ORIGIN, { file: 7, rank: 7 })).toBe(true)
    expect(coversSquare('adjacent', 3, ORIGIN, { file: 5, rank: 7 })).toBe(true)
  })

  it('still excludes anything past its range', () => {
    expect(coversSquare('adjacent', 3, ORIGIN, { file: 0, rank: 4 })).toBe(false)
  })
})

describe('coversSquare: none', () => {
  it('covers nothing at any range', () => {
    expect(coversSquare('none', 0, ORIGIN, { file: 4, rank: 5 })).toBe(false)
    expect(coversSquare('none', 8, ORIGIN, { file: 4, rank: 5 })).toBe(false)
    expect(coversSquare('none', 8, ORIGIN, { file: 5, rank: 5 })).toBe(false)
  })

  it('does not cover its own square either', () => {
    expect(coversSquare('none', 8, ORIGIN, ORIGIN)).toBe(false)
  })
})

describe('coversSquare: ring', () => {
  it('covers the outer band at exactly its range', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 7, rank: 4 })).toBe(true)
  })

  it('covers one square inside its range, so the band is two deep', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 6, rank: 4 })).toBe(true)
  })

  it('is blind at its own feet', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 5, rank: 4 })).toBe(false)
    expect(coversSquare('ring', 3, ORIGIN, { file: 5, rank: 5 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('ring', 3, ORIGIN, ORIGIN)).toBe(false)
  })

  it('does not cover beyond its range', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 0, rank: 4 })).toBe(false)
  })

  it('measures the band by Chebyshev distance, so corners are in it', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 7, rank: 7 })).toBe(true)
  })
})

describe('coversSquare: band', () => {
  it('covers the full file width at its own board rank', () => {
    expect(coversSquare('band', 1, ORIGIN, { file: 0, rank: 4 })).toBe(true)
    expect(coversSquare('band', 1, ORIGIN, { file: 15, rank: 4 })).toBe(true)
  })

  it('covers the board ranks either side, within range', () => {
    expect(coversSquare('band', 1, ORIGIN, { file: 0, rank: 3 })).toBe(true)
    expect(coversSquare('band', 1, ORIGIN, { file: 0, rank: 5 })).toBe(true)
  })

  it('does not cover beyond its range in board ranks', () => {
    expect(coversSquare('band', 1, ORIGIN, { file: 4, rank: 6 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('band', 1, ORIGIN, ORIGIN)).toBe(false)
  })

  it('ignores file distance entirely — a Piece can never flank it', () => {
    // The whole point of the rank-10 toll gate. A file distance of 40 is
    // still covered; only the board-rank distance is bounded.
    expect(coversSquare('band', 1, ORIGIN, { file: 44, rank: 4 })).toBe(true)
  })
})
