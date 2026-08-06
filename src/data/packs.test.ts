import { describe, expect, it } from 'vitest'
import { ALL_CARD_RANKS } from './cards'
import { PACK_TYPES, PACKS, TIER_WEIGHTS, tierOf } from './packs'

describe('ALL_CARD_RANKS', () => {
  it('holds all thirteen ranks a Card can carry', () => {
    expect(ALL_CARD_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'])
  })
})

describe('tierOf', () => {
  // 2-10 are FLAT. The rank ladder already differentiates those nine by
  // geometry, range and damage, so pricing them by scarcity too would
  // double-count. See the design doc's rarity table.
  it('puts every buildable rank in the common tier', () => {
    for (const rank of [2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
      expect(tierOf(rank)).toBe('common')
    }
  })

  it('puts the Jack, Queen, King and Joker in the scarce tier', () => {
    expect(tierOf('J')).toBe('scarce')
    expect(tierOf('Q')).toBe('scarce')
    expect(tierOf('K')).toBe('scarce')
    expect(tierOf('joker')).toBe('scarce')
  })

  // Alone, because caps on board growth were deliberately deferred, which
  // leaves scarcity the only thing restraining an Ace.
  it('puts the Ace alone in the rarest tier', () => {
    expect(tierOf('A')).toBe('rarest')
  })
})

describe('TIER_WEIGHTS', () => {
  it('orders the tiers common > scarce > rarest', () => {
    expect(TIER_WEIGHTS.common).toBeGreaterThan(TIER_WEIGHTS.scarce)
    expect(TIER_WEIGHTS.scarce).toBeGreaterThan(TIER_WEIGHTS.rarest)
  })
})

describe('PACKS', () => {
  it('covers every pack type exactly once', () => {
    expect(PACK_TYPES).toEqual(['scrap', 'base', 'court', 'suited'])
    expect(Object.keys(PACKS).sort()).toEqual([...PACK_TYPES].sort())
  })

  it('sizes the packs as the design specifies', () => {
    expect(PACKS.scrap.size).toBe(3)
    expect(PACKS.base.size).toBe(10)
    expect(PACKS.court.size).toBe(10)
    expect(PACKS.suited.size).toBe(10)
  })

  it('prices Scrap cheapest and Court dearest', () => {
    expect(PACKS.scrap.price).toBeLessThan(PACKS.base.price)
    expect(PACKS.base.price).toBeLessThan(PACKS.suited.price)
    expect(PACKS.suited.price).toBeLessThan(PACKS.court.price)
  })

  it('marks only Suited as needing a suit', () => {
    expect(PACKS.suited.suited).toBe(true)
    expect(PACKS.scrap.suited).toBe(false)
    expect(PACKS.base.suited).toBe(false)
    expect(PACKS.court.suited).toBe(false)
  })

  it('is the only pack that boosts the scarce tier: Court', () => {
    expect(PACKS.court.tierBoost.scarce).toBeGreaterThan(1)

    for (const pack of ['scrap', 'base', 'suited'] as const) {
      expect(PACKS[pack].tierBoost.scarce).toBe(1)
    }
  })

  // Court is "weighted toward high ranks", which must not become "better Ace
  // odds" — Ace scarcity is the only restraint on board growth.
  it('never boosts the Ace, in any pack', () => {
    for (const pack of PACK_TYPES) {
      expect(PACKS[pack].tierBoost.rarest).toBe(1)
    }
  })

  it('never deals a pack larger than the Deck cap', () => {
    for (const pack of PACK_TYPES) {
      expect(PACKS[pack].size).toBeLessThanOrEqual(30)
    }
  })
})
