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
 * Measured on a literal 8x8 even though an Ace grows the board. Growth only
 * ever DILUTES a footprint's share — a `band` covers the same absolute squares
 * on a taller board, and no other geometry gains reach — so 8x8 is the tightest
 * case and passing it here means passing it everywhere.
 */
const FILES = 8
const RANKS = 8
const OTHER_SQUARES = FILES * RANKS - 1

/** The most squares this rank can cover from any one square of an 8x8 board. */
function peakCoverage(rank: (typeof BUILDABLE_RANKS)[number]): number {
  const def = towerRank(rank)
  let peak = 0

  for (let file = 0; file < FILES; file += 1) {
    for (let boardRank = 0; boardRank < RANKS; boardRank += 1) {
      let covered = 0

      for (let targetFile = 0; targetFile < FILES; targetFile += 1) {
        for (let targetRank = 0; targetRank < RANKS; targetRank += 1) {
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
  /**
   * 39 of 63 squares — 61.9% — is the ring at rank 8 placed centrally, and it
   * is the widest footprint on the ladder. Asserted as a SQUARE COUNT rather
   * than a percentage so the threshold is exact rather than a rounded float.
   */
  const CEILING = 39

  it('never lets any rank cover more than 39 of the other 63 squares', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(peakCoverage(rank)).toBeLessThanOrEqual(CEILING)
    }
  })

  it('never lets any rank cover the whole board', () => {
    // The specific failure #19 reported. Kept separate from the ceiling above
    // because it is the property that matters even if the ceiling is retuned.
    for (const rank of BUILDABLE_RANKS) {
      expect(peakCoverage(rank)).toBeLessThan(OTHER_SQUARES)
    }
  })

  it('gives the Wall no footprint at all', () => {
    expect(peakCoverage(7)).toBe(0)
  })

  it('leaves every firing rank somewhere it is not', () => {
    for (const rank of FIRING_RANKS) {
      expect(peakCoverage(rank)).toBeGreaterThan(0)
      expect(peakCoverage(rank)).toBeLessThan(OTHER_SQUARES)
    }
  })
})
