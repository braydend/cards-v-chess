import { describe, expect, it } from 'vitest'
import { PACK_TYPES, PACKS } from '../data/packs'
import { canAfford, cullCountFor, dealPack } from './packs'
import { streamFor, type Rng } from './rng'

const RNG: Rng = streamFor('deal-test', 'packs')

/** Every card a run of `deals` packs of this type produces, ids and all. */
function dealMany(pack: Parameters<typeof dealPack>[0], deals: number, suit?: 'hearts') {
  let rng = RNG
  let nextCardId = 1
  const cards = []

  for (let i = 0; i < deals; i += 1) {
    const dealt = dealPack(pack, suit, rng, nextCardId)
    cards.push(...dealt.cards)
    rng = dealt.rng
    nextCardId = dealt.nextCardId
  }

  return cards
}

describe('dealPack', () => {
  it('deals exactly the pack size', () => {
    for (const pack of PACK_TYPES) {
      const suit = PACKS[pack].suited ? 'hearts' : undefined
      expect(dealPack(pack, suit, RNG, 1).cards).toHaveLength(PACKS[pack].size)
    }
  })

  it('is reproducible from the same generator', () => {
    expect(dealPack('base', undefined, RNG, 1).cards).toEqual(
      dealPack('base', undefined, RNG, 1).cards,
    )
  })

  it('advances the generator, so consecutive packs differ', () => {
    const first = dealPack('base', undefined, RNG, 1)
    const second = dealPack('base', undefined, first.rng, first.nextCardId)

    expect(second.cards.map((card) => card.kind === 'standard' && card.rank)).not.toEqual(
      first.cards.map((card) => card.kind === 'standard' && card.rank),
    )
  })

  it('does not mutate the generator it was given', () => {
    const stateBefore = RNG.state

    dealPack('base', undefined, RNG, 1)

    expect(RNG.state).toBe(stateBefore)
  })

  it('gives every card a unique id and reports the counter it consumed', () => {
    const dealt = dealPack('base', undefined, RNG, 7)

    expect(new Set(dealt.cards.map((card) => card.id)).size).toBe(10)
    expect(dealt.nextCardId).toBe(17)
  })

  it('numbers card ids from the counter it was given', () => {
    expect(dealPack('scrap', undefined, RNG, 7).cards.map((card) => card.id)).toEqual([
      'card-7',
      'card-8',
      'card-9',
    ])
  })

  describe('Suited', () => {
    it('deals every card in the chosen suit', () => {
      for (const card of dealPack('suited', 'spades', RNG, 1).cards) {
        expect(card.kind).toBe('standard')
        expect(card.kind === 'standard' && card.suit).toBe('spades')
      }
    })

    // A Joker has no suit, so it cannot be part of "10 cards all of one suit".
    it('never deals a Joker', () => {
      expect(dealMany('suited', 40, 'hearts').some((card) => card.kind === 'joker')).toBe(false)
    })
  })

  describe('weighting', () => {
    it('deals 2-10 flat, with no rank markedly scarcer than another', () => {
      const counts = new Map<number, number>()

      for (const card of dealMany('base', 400)) {
        if (card.kind !== 'standard' || typeof card.rank !== 'number') continue
        counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
      }

      const seen = [...counts.values()]
      expect(counts.size).toBe(9)
      // Ordering, not exact counts, so a weight tweak cannot break this.
      expect(Math.min(...seen) * 2).toBeGreaterThan(Math.max(...seen))
    })

    it('deals commons more often than scarce, and scarce more often than Aces', () => {
      let common = 0
      let scarce = 0
      let aces = 0

      for (const card of dealMany('base', 400)) {
        if (card.kind === 'joker') scarce += 1
        else if (card.rank === 'A') aces += 1
        else if (typeof card.rank === 'number') common += 1
        else scarce += 1
      }

      expect(common).toBeGreaterThan(scarce)
      expect(scarce).toBeGreaterThan(aces)
    })

    it('deals a Court more scarce-tier cards than a Base does', () => {
      const scarceIn = (cards: ReturnType<typeof dealMany>) =>
        cards.filter(
          (card) =>
            card.kind === 'joker' || (card.kind === 'standard' && typeof card.rank !== 'number' && card.rank !== 'A'),
        ).length

      expect(scarceIn(dealMany('court', 200))).toBeGreaterThan(scarceIn(dealMany('base', 200)))
    })

    it('still deals commons in a Court — better odds, never a guarantee', () => {
      const commons = dealMany('court', 200).filter(
        (card) => card.kind === 'standard' && typeof card.rank === 'number',
      )

      expect(commons.length).toBeGreaterThan(0)
    })

    it('does not improve Ace odds in a Court', () => {
      const aces = (cards: ReturnType<typeof dealMany>) =>
        cards.filter((card) => card.kind === 'standard' && card.rank === 'A').length

      // Court boosts the scarce tier only, so its larger denominator makes Aces
      // slightly RARER than in a Base — expected ratio ≈0.75. A 1.5x ceiling
      // passes that comfortably while failing the bug this guards: boosting
      // `rarest` 3x would put the ratio near 2.2. Ace scarcity is the only
      // restraint on board growth, so this needs to be a real guard rather than
      // a smoke test.
      const court = aces(dealMany('court', 300))
      const base = aces(dealMany('base', 300))

      expect(court).toBeLessThan(base * 1.5)
    })
  })
})

describe('cullCountFor', () => {
  it('is zero when the pack fits', () => {
    expect(cullCountFor(0, 'base')).toBe(0)
    expect(cullCountFor(20, 'base')).toBe(0)
  })

  it('is the overflow past the cap', () => {
    expect(cullCountFor(25, 'base')).toBe(5)
    expect(cullCountFor(29, 'scrap')).toBe(2)
  })

  // The most common cull case, and the one that broke structuralKey: at the cap
  // you destroy exactly as many cards as the pack deals, so the Deck's length
  // never moves.
  it('is the whole pack size at the cap', () => {
    expect(cullCountFor(30, 'base')).toBe(10)
    expect(cullCountFor(30, 'scrap')).toBe(3)
  })

  it('never demands more cards than the Deck holds', () => {
    for (const pack of PACK_TYPES) {
      for (let deckSize = 0; deckSize <= 30; deckSize += 1) {
        expect(cullCountFor(deckSize, pack)).toBeLessThanOrEqual(deckSize)
      }
    }
  })
})

describe('canAfford', () => {
  it('needs the full price', () => {
    expect(canAfford(PACKS.base.price - 1, 'base')).toBe(false)
    expect(canAfford(PACKS.base.price, 'base')).toBe(true)
    expect(canAfford(PACKS.base.price + 1, 'base')).toBe(true)
  })
})
