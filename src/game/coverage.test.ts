import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { towerRank } from '../data/towerRanks'
import { allSquares, isInBounds } from './board'
import { coveredSquares, coversSquare, isOccluded, reachableSquares } from './coverage'
import { liveRound, pawnAt, withTower } from './fixtures'
import { tick } from './tick'
import type { Square } from './types'

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

describe('coveredSquares', () => {
  const board = { files: 8, ranks: 8 }

  it('never includes the origin', () => {
    expect(coveredSquares(board, 'adjacent', 1, ORIGIN)).not.toContainEqual(ORIGIN)
  })

  it('agrees with coversSquare on every square of the board', () => {
    // A characterisation guard, not a behavioural one: `coveredSquares` is
    // literally this expression today, so it cannot currently fail. It earns its
    // keep the moment someone rewrites the function to walk the pattern instead
    // of filtering the board — which is the obvious optimisation, and is exactly
    // what `src/scene/firePulse.ts` does in its frame loop. The pinned property
    // is that any such rewrite still answers identically.
    for (const geometry of [
      'adjacent',
      'horizontal',
      'vertical',
      'cross',
      'diagonal',
      'star',
    ] as const) {
      const covered = coveredSquares(board, geometry, 3, ORIGIN)
      const expected = allSquares(board).filter((square) =>
        coversSquare(geometry, 3, ORIGIN, square),
      )
      expect(covered).toEqual(expected)
    }
  })

  it('clips to the board rather than running off the edge', () => {
    const corner = { file: 0, rank: 0 }
    const covered = coveredSquares(board, 'star', 8, corner)

    expect(covered.every((square) => isInBounds(board, square))).toBe(true)
    expect(covered).toContainEqual({ file: 7, rank: 7 })
  })

  it('returns the eight neighbours for an adjacent Tower at range 1', () => {
    expect(coveredSquares(board, 'adjacent', 1, ORIGIN)).toHaveLength(8)
  })

  it('covers 7 squares for a vertical Tower of range 4, clipped at the far edge', () => {
    // Range is squares along the pattern, so this is not comparable to a disc.
    // ORIGIN sits on board rank 4 of 8, so range 4 reaches ranks 0-3 below it
    // but only 5-7 above: the eighth square would be rank 8, off the board.
    expect(coveredSquares(board, 'vertical', 4, ORIGIN)).toHaveLength(7)
  })

  it('reads the extent from the board it is given, so an Ace widens the footprint', () => {
    const grown = { files: 8, ranks: 9 }

    expect(coveredSquares(grown, 'vertical', 8, { file: 4, rank: 0 }).length).toBeGreaterThan(
      coveredSquares(board, 'vertical', 8, { file: 4, rank: 0 }).length,
    )
  })
})

describe('isOccluded', () => {
  it('blocks a Tower strictly between on the same file', () => {
    expect(isOccluded({ file: 4, rank: 2 }, { file: 4, rank: 6 }, [{ file: 4, rank: 4 }])).toBe(true)
  })

  it('blocks a Tower strictly between on the same rank', () => {
    expect(isOccluded({ file: 2, rank: 4 }, { file: 6, rank: 4 }, [{ file: 4, rank: 4 }])).toBe(true)
  })

  it('blocks a Tower strictly between on the same diagonal', () => {
    expect(isOccluded({ file: 2, rank: 2 }, { file: 6, rank: 6 }, [{ file: 4, rank: 4 }])).toBe(true)
  })

  it('does not block a Tower beyond the target', () => {
    expect(isOccluded({ file: 4, rank: 2 }, { file: 4, rank: 4 }, [{ file: 4, rank: 6 }])).toBe(false)
  })

  it('does not block a Tower on the anti-diagonal', () => {
    // The blocker is on the diagonal through the shooter that the target is
    // NOT on: both are "on a diagonal" but they are different diagonals.
    expect(isOccluded({ file: 2, rank: 2 }, { file: 6, rank: 6 }, [{ file: 4, rank: 0 }])).toBe(false)
  })

  it('does not block a Tower off the ray', () => {
    expect(isOccluded({ file: 4, rank: 2 }, { file: 4, rank: 6 }, [{ file: 5, rank: 4 }])).toBe(false)
  })

  it('never counts the shooter itself as a blocker', () => {
    const from = { file: 4, rank: 4 }
    expect(isOccluded(from, { file: 4, rank: 7 }, [from])).toBe(false)
  })

  it('never blocks a distance-1 target — no square is strictly between', () => {
    const from = { file: 4, rank: 4 }
    const target = { file: 5, rank: 4 }
    expect(isOccluded(from, target, [])).toBe(false)
    expect(isOccluded(from, target, [{ file: 4, rank: 4 }])).toBe(false)
    expect(isOccluded(from, target, [{ file: 5, rank: 5 }])).toBe(false)
    expect(isOccluded(from, target, [{ file: 6, rank: 4 }])).toBe(false)
  })

  it('keeps an off-ray ring square reachable through a Tower inside the ring', () => {
    // Rank 8's ring covers Chebyshev distance 3-4. The target at {7,5} is at
    // distance 3 — inside the ring — but not on any compass ray from {4,4}
    // (fileDelta 3, rankDelta 1), so no Tower can be "between" on a line that
    // does not exist. This is the hollow-core socket case.
    expect(isOccluded({ file: 4, rank: 4 }, { file: 7, rank: 5 }, [{ file: 4, rank: 5 }])).toBe(false)
  })
})

describe('reachableSquares', () => {
  const board = { files: 8, ranks: 8 }

  it('equals coveredSquares when nothing blocks', () => {
    expect(reachableSquares(board, 'vertical', 4, ORIGIN, [])).toEqual(
      coveredSquares(board, 'vertical', 4, ORIGIN),
    )
  })

  it('drops the squares a blocker hides and keeps the ones on its side', () => {
    const covered = coveredSquares(board, 'vertical', 4, ORIGIN)
    const reachable = reachableSquares(board, 'vertical', 4, ORIGIN, [{ file: 4, rank: 6 }])

    expect(reachable.length).toBeLessThan(covered.length)
    expect(reachable).toContainEqual({ file: 4, rank: 5 })
    expect(reachable).not.toContainEqual({ file: 4, rank: 7 })
  })

  it('ignores a blocker off the target line', () => {
    const withBlocker = reachableSquares(board, 'vertical', 4, ORIGIN, [{ file: 3, rank: 6 }])
    expect(withBlocker).toEqual(coveredSquares(board, 'vertical', 4, ORIGIN))
  })
})

/**
 * The claim the coverage overlay rests on: a lit square is a square the Tower
 * really shoots, and an unlit one is a square it really does not.
 *
 * Nothing else pins this. `coveredSquares` and `fireTowers` share the
 * `coversSquare` predicate but each look the geometry up for themselves from
 * `towerRank(cardRank)`, so a future support that moved range onto the Tower
 * instance could update firing alone and leave the overlay silently wrong. The
 * overlay's own tests could not catch it: they use `towerRank` as their oracle
 * too, so they would agree with the overlay and both would be wrong. This drives
 * the real engine instead and asks what actually took damage.
 */
describe('coveredSquares agrees with what a Tower shoots', () => {
  // Under a Pawn's 900ms move interval, so the Piece never moves or promotes
  // during the window, and over rank 3's 600ms fire interval, so the Tower
  // definitely gets a shot off.
  const WINDOW_MS = 704
  const DT_MS = 16

  function damagedAt(square: Square): boolean {
    const state = withTower(3, ORIGIN)
    let live = liveRound(state, [pawnAt('probe', square)])
    const before = PIECE_TYPES.pawn.maxHealth

    for (let elapsed = 0; elapsed < WINDOW_MS; elapsed += DT_MS) live = tick(live, DT_MS)

    const probe = live.pieces.find((piece) => piece.id === 'probe')

    // Destroyed counts as damaged: rank 3 deals 1 and a Pawn has 3, so this
    // should not happen in one shot, but reading it as "unharmed" would invert
    // the assertion if the balance numbers ever change.
    return probe === undefined || probe.health < before
  }

  it('damages a Piece on every covered square and spares one on every other square', () => {
    const board = { files: 8, ranks: 8 }
    const def = towerRank(3)
    const covered = coveredSquares(board, def.geometry, def.range, ORIGIN)
    const isCovered = (square: Square) =>
      covered.some((lit) => lit.file === square.file && lit.rank === square.rank)

    const probes = allSquares(board).filter(
      (square) =>
        // Not the Tower's own square, which cannot hold a Piece, and not board
        // rank 0, where a Pawn promotes into a Queen and changes health pool.
        !(square.file === ORIGIN.file && square.rank === ORIGIN.rank) && square.rank > 0,
    )

    expect(probes.length).toBeGreaterThan(0)

    for (const square of probes) {
      expect(damagedAt(square), `file ${square.file}, rank ${square.rank}`).toBe(isCovered(square))
    }
  })
})
