import { describe, expect, it } from 'vitest'
import { coversSquare } from '../game/coverage'
import { PIECE_TYPES } from './pieceTypes'
import { BUILDABLE_RANKS, TOWER_RANKS, towerRank } from './towerRanks'

/** Every rank that actually shoots — the ladder minus the Wall. */
const FIRING_RANKS = BUILDABLE_RANKS.filter((rank) => towerRank(rank).geometry !== 'none')

/** Damage per second against a single Piece. */
function singleTargetDps(rank: (typeof BUILDABLE_RANKS)[number]): number {
  const def = towerRank(rank)
  return def.damage / (def.fireIntervalMs / 1000)
}

describe('the rank ladder', () => {
  it('covers every rank from 2 to 10', () => {
    expect(BUILDABLE_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('defines every buildable rank', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(TOWER_RANKS[rank]).toBeDefined()
    }
  })

  it('has exactly one Tower that never fires — the Wall at rank 7', () => {
    const gunless = BUILDABLE_RANKS.filter((rank) => towerRank(rank).geometry === 'none')

    expect(gunless).toEqual([7])
  })

  it('gives the Wall no damage and no targets, so nothing can make it shoot', () => {
    expect(towerRank(7).damage).toBe(0)
    expect(towerRank(7).targetsPerShot).toBe(0)
  })

  it('gives the Wall a positive fire interval, so no loop can spin on it', () => {
    // Inert — `fireTowers` skips a gunless Tower before reading this. Asserted
    // anyway because a 0 here would be a live hazard the moment that guard
    // moved or a `while (cooldown >= interval)` condition was rewritten.
    expect(towerRank(7).fireIntervalMs).toBeGreaterThan(0)
  })

  it('never fires slower than a Pawn moves, so every firing Tower gets a shot', () => {
    for (const rank of FIRING_RANKS) {
      expect(towerRank(rank).fireIntervalMs).toBeLessThan(PIECE_TYPES.pawn.moveIntervalMs)
    }
  })

  it('rises in health with rank across the firing ranks', () => {
    const healths = FIRING_RANKS.map((rank) => towerRank(rank).maxHealth)

    // reduce, not indexed access, so this holds under noUncheckedIndexedAccess.
    healths.reduce((previous, current) => {
      expect(current).toBeGreaterThan(previous)
      return current
    })
  })

  it('gives the Wall more health than any Tower that shoots', () => {
    // The Wall sits outside the health curve rather than on it: soaking is the
    // only thing it does, so it must out-last everything that also has a gun.
    const firingHealths = FIRING_RANKS.map((rank) => towerRank(rank).maxHealth)

    for (const health of firingHealths) {
      expect(towerRank(7).maxHealth).toBeGreaterThan(health)
    }
  })

  it('NEVER raises single-target DPS as rank rises', () => {
    // THE CORE PROPERTY OF THIS LADDER, and the direct answer to issue #19.
    // Coverage rises with rank, so damage must fall — otherwise a high rank is
    // strictly better at everything and placement stops mattering. Ranks 4 and
    // 5 tie deliberately, hence "or equal".
    const dps = FIRING_RANKS.map(singleTargetDps)

    dps.reduce((previous, current) => {
      expect(current).toBeLessThanOrEqual(previous)
      return current
    })
  })

  it('makes rank 2 the best single-target killer in the game', () => {
    // The guarantee that a low rank is never landfill. If this fails, a Deck
    // full of 2s has become worthless and the pack economy has a hole in it.
    for (const rank of FIRING_RANKS.filter((candidate) => candidate !== 2)) {
      expect(singleTargetDps(2)).toBeGreaterThan(singleTargetDps(rank))
    }
  })

  it('never targets fewer Pieces as rank rises, across the firing ranks', () => {
    const targets = FIRING_RANKS.map((rank) => towerRank(rank).targetsPerShot)

    targets.reduce((previous, current) => {
      expect(current).toBeGreaterThanOrEqual(previous)
      return current
    })
  })

  it('hits at least one Piece at every firing rank', () => {
    for (const rank of FIRING_RANKS) {
      expect(towerRank(rank).targetsPerShot).toBeGreaterThanOrEqual(1)
    }
  })

  it('puts an amplify aura on rank 8 and a freeze aura on rank 9, and nowhere else', () => {
    const auras = BUILDABLE_RANKS.map((rank) => [rank, towerRank(rank).aura] as const)

    expect(auras.filter(([, aura]) => aura !== undefined)).toEqual([
      [8, 'amplify'],
      [9, 'freeze'],
    ])
  })
})

/**
 * The measured answer to issue #19: "towers 6-10 may be overpowered".
 *
 * Before the rebalance a rank-10 Tower on a central 8x8 square covered ALL 63
 * other squares and hit every Piece on them, and a single rank 6 carried
 * auto-rounds for 45+ rounds unattended. A ceiling on footprint is what keeps
 * placement a decision, so it is asserted rather than eyeballed.
 *
 * Board growth is NOT uniformly dilutive, and an earlier version of this test
 * claimed otherwise — that claim was false and has been corrected (see the
 * erratum on the frozen design spec). Files stay fixed at 8 for a run's whole
 * life; only board ranks grow, one at a time, from an Ace. `vertical`,
 * `cross`, `diagonal`, and `ring` are all bounded by Chebyshev distance along
 * the rank axis as well as the file axis, so on the literal 8x8 starting
 * board several of them are RANK-CLIPPED — a centrally-placed Tower's reach
 * along the ranks runs into the top or bottom edge before its shape is done.
 * Growth removes that clipping and each of those geometries grows to its
 * true, larger absolute size — permanently, since none of them shrink again.
 *
 * How fast varies BY GEOMETRY, and is measured rather than assumed for each
 * one (`ring`, `cross`, and `diagonal` finish growing by the first Ace at 9
 * board ranks; `vertical`'s range of 5 needs 11 to fully unclip — it still
 * reads 9 at board rank 10, one below its final 10 — so "the first Ace" is
 * not a single answer that covers every geometry). `band` alone was never
 * rank-clipped, because its reach along the file axis was always the full
 * board width; it is the only geometry whose absolute footprint is flat from
 * the start.
 *
 * Once each geometry has finished growing, further height only dilutes its
 * now-fixed absolute size as a SHARE of the board. There is no single
 * tightest board height for either the absolute or the share ceiling, so
 * both are measured directly across several heights below rather than
 * assumed from one.
 */
const FILES = 8

/**
 * The maximum peak coverage permitted AT EACH board height, not one flat
 * number shared by all of them. Height 8 is genuinely tighter than every
 * later height checked here: `ring`, `cross`, `diagonal`, and `vertical` are
 * all still rank-clipped there, so a regression that inflated the 8x8
 * footprint from 39 toward 47 would pass a single flat ceiling of 47 without
 * the taller heights ever having a chance to catch it. Pinning each height's
 * own bound makes that impossible structurally rather than by coincidence.
 *
 * `BOARD_HEIGHTS` (used by every other assertion below) is derived from this
 * table's own heights, so the two can never drift apart.
 */
const CEILING_BY_HEIGHT: ReadonlyArray<readonly [boardRanks: number, ceiling: number]> = [
  [8, 39],
  [9, 47],
  [16, 47],
  [24, 47],
]

/**
 * The heights actually swept: the starting board, one Ace in (the worst
 * absolute case for every rank-clipped geometry except `vertical`), and two
 * much taller boards to confirm the plateau holds rather than merely
 * appearing to at the first check past 8.
 */
const BOARD_HEIGHTS = CEILING_BY_HEIGHT.map(([boardRanks]) => boardRanks)

/** The most squares this rank can cover from any one square of an 8-file
 * board with the given number of board ranks. */
function peakCoverage(rank: (typeof BUILDABLE_RANKS)[number], boardRanks: number): number {
  const def = towerRank(rank)
  let peak = 0

  for (let file = 0; file < FILES; file += 1) {
    for (let boardRank = 0; boardRank < boardRanks; boardRank += 1) {
      let covered = 0

      for (let targetFile = 0; targetFile < FILES; targetFile += 1) {
        for (let targetRank = 0; targetRank < boardRanks; targetRank += 1) {
          const hit = coversSquare(
            def.geometry,
            def.range,
            { file, rank: boardRank },
            { file: targetFile, rank: targetRank },
          )
          if (hit) covered += 1
        }
      }

      peak = Math.max(peak, covered)
    }
  }

  return peak
}

describe('the coverage ceiling', () => {
  it("never lets any rank cover more than its own height's ceiling", () => {
    for (const [boardRanks, ceiling] of CEILING_BY_HEIGHT) {
      for (const rank of BUILDABLE_RANKS) {
        expect(peakCoverage(rank, boardRanks)).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  it('never lets any rank cover the whole board, at any height', () => {
    // The specific failure #19 reported, and the property that survives
    // growth without qualification: the ceiling above is an absolute count
    // that plateaus, but the board's own square count keeps growing past it,
    // so "not the whole board" holds more comfortably the taller it gets.
    for (const boardRanks of BOARD_HEIGHTS) {
      const otherSquares = FILES * boardRanks - 1
      for (const rank of BUILDABLE_RANKS) {
        expect(peakCoverage(rank, boardRanks)).toBeLessThan(otherSquares)
      }
    }
  })

  it('gives the Wall no footprint at all, at any height', () => {
    for (const boardRanks of BOARD_HEIGHTS) {
      expect(peakCoverage(7, boardRanks)).toBe(0)
    }
  })

  it('leaves every firing rank somewhere it is not, at any height', () => {
    for (const boardRanks of BOARD_HEIGHTS) {
      const otherSquares = FILES * boardRanks - 1
      for (const rank of FIRING_RANKS) {
        expect(peakCoverage(rank, boardRanks)).toBeGreaterThan(0)
        expect(peakCoverage(rank, boardRanks)).toBeLessThan(otherSquares)
      }
    }
  })

  it('makes the first Ace the worst share the board ever sees, diluting from there', () => {
    // The ladder's worst-covered-SHARE moment, not just its worst absolute
    // count: 47 of 71 squares (66.2%) at 9 board ranks beats the pre-Ace
    // 8x8's 39 of 63 (61.9%), because the ring only reaches its full size
    // once the first Ace removes its rank-clipping. Every height strictly
    // past 9 has strictly more squares while the absolute ceiling does not
    // grow, so the share falls every time after that — checked directly
    // rather than trusted, because a share could rise again if some future
    // geometry kept growing rank-for-rank with the board.
    const shareAt = (boardRanks: number): number => {
      const otherSquares = FILES * boardRanks - 1
      const peak = Math.max(...BUILDABLE_RANKS.map((rank) => peakCoverage(rank, boardRanks)))
      return peak / otherSquares
    }

    const worst = shareAt(9)

    for (const boardRanks of BOARD_HEIGHTS) {
      expect(shareAt(boardRanks)).toBeLessThanOrEqual(worst)
    }

    for (const boardRanks of BOARD_HEIGHTS.filter((height) => height > 9)) {
      expect(shareAt(boardRanks)).toBeLessThan(worst)
    }
  })
})
