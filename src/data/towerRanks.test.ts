import { describe, expect, it } from 'vitest'
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
