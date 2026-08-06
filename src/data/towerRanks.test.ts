import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from './pieceTypes'
import { BUILDABLE_RANKS, TOWER_RANKS, towerRank } from './towerRanks'

describe('the rank ladder', () => {
  it('covers every rank from 2 to 10', () => {
    expect(BUILDABLE_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('defines every buildable rank', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(TOWER_RANKS[rank]).toBeDefined()
    }
  })

  it('never fires slower than a Pawn moves, so every Tower gets a shot', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(towerRank(rank).fireIntervalMs).toBeLessThan(PIECE_TYPES.pawn.moveIntervalMs)
    }
  })

  it('rises in health with rank', () => {
    const healths = BUILDABLE_RANKS.map((rank) => towerRank(rank).maxHealth)

    // reduce, not indexed access, so this holds under noUncheckedIndexedAccess.
    healths.reduce((previous, current) => {
      expect(current).toBeGreaterThan(previous)
      return current
    })
  })

  it('never fires slower as rank rises', () => {
    const intervals = BUILDABLE_RANKS.map((rank) => towerRank(rank).fireIntervalMs)

    intervals.reduce((previous, current) => {
      expect(current).toBeLessThanOrEqual(previous)
      return current
    })
  })

  it('never targets fewer Pieces as rank rises', () => {
    const targets = BUILDABLE_RANKS.map((rank) => towerRank(rank).targetsPerShot)

    // reduce, not indexed access, so this holds under noUncheckedIndexedAccess.
    targets.reduce((previous, current) => {
      expect(current).toBeGreaterThanOrEqual(previous)
      return current
    })
  })

  it('hits at least one Piece at every rank', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(towerRank(rank).targetsPerShot).toBeGreaterThanOrEqual(1)
    }
  })
})
