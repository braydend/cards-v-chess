import { describe, expect, it } from 'vitest'
import { DECK_CAP } from '../data/deck'
import { PACKS } from '../data/packs'
import { standardCard, withDeck } from './fixtures'
import { createInitialState, step } from './index'
import type { Card, GameState } from './types'

/** State in the gap with this Deck and this much Ink. */
function ready(deck: readonly Card[], ink: number): GameState {
  return { ...withDeck(deck, createInitialState('buy-test')), ink }
}

/** A Deck of `size` distinct 2♥, so ids are unambiguous. */
function filler(size: number): Card[] {
  return Array.from({ length: size }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
}

const BASE_PRICE = PACKS.base.price

describe('buyPack: refusals', () => {
  it('is refused while a round is live', () => {
    const live: GameState = { ...ready(filler(5), 999), phase: 'inProgress' }

    expect(step(live, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(live)
  })

  it('is refused once defeated', () => {
    const defeated: GameState = { ...ready(filler(5), 999), phase: 'defeated' }

    expect(step(defeated, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(defeated)
  })

  it('is refused without enough Ink', () => {
    const poor = ready(filler(5), BASE_PRICE - 1)

    expect(step(poor, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(poor)
  })

  it('is refused when a Suited pack names no suit', () => {
    const state = ready(filler(5), 999)

    expect(step(state, { kind: 'buyPack', pack: 'suited', cullCardIds: [] })).toBe(state)
  })

  it('is refused when a non-Suited pack names a suit', () => {
    const state = ready(filler(5), 999)

    expect(step(state, { kind: 'buyPack', pack: 'base', suit: 'hearts', cullCardIds: [] })).toBe(
      state,
    )
  })

  it('is refused when a culled id is not in the Deck', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = [...filler(9).map((card) => card.id), 'ghost']

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  it('is refused when a culled id is listed twice', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = ['f0', 'f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  it('is refused when too few cards are culled', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = filler(9).map((card) => card.id)

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  // Over-culling would hand the player Deck thinning, which the design does not
  // grant: a Cull exists to stay within the cap and for nothing else.
  it('is refused when more cards are culled than the cap demands', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = filler(11).map((card) => card.id)

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  it('is refused when cards are culled but none are needed', () => {
    const state = ready(filler(5), 999)

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ['f0'] })).toBe(state)
  })

  it('refuses by identity, so a refusal cannot be mistaken for a no-op purchase', () => {
    const state = ready(filler(5), 0)
    const after = step(state, { kind: 'buyPack', pack: 'base', cullCardIds: [] })

    // `simulation.dispatch` compares with ===. A shallow copy here would report
    // every refused purchase as a successful one.
    expect(after).toBe(state)
  })
})

describe('buyPack: a purchase that needs no cull', () => {
  const before = ready(filler(5), 100)
  const after = step(before, { kind: 'buyPack', pack: 'base', cullCardIds: [] })

  it('adds the pack to the Deck', () => {
    expect(after.deck).toHaveLength(5 + PACKS.base.size)
  })

  it('spends exactly the price', () => {
    expect(after.ink).toBe(100 - BASE_PRICE)
  })

  it('keeps every card already held', () => {
    for (const card of before.deck) {
      expect(after.deck.map((held) => held.id)).toContain(card.id)
    }
  })

  it('gives the new cards fresh ids', () => {
    expect(new Set(after.deck.map((card) => card.id)).size).toBe(after.deck.length)
  })

  it('advances the card counter, not the entity counter', () => {
    expect(after.nextCardId).toBe(before.nextCardId + PACKS.base.size)
    expect(after.nextEntityId).toBe(before.nextEntityId)
  })

  it('advances the packs stream, so the next pack differs', () => {
    expect(after.rng.packs).not.toEqual(before.rng.packs)

    const third = step({ ...after, ink: 100 }, { kind: 'buyPack', pack: 'base', cullCardIds: [] })
    const firstRanks = after.deck.slice(5).map((card) => card.kind === 'standard' && card.rank)
    const secondRanks = third.deck.slice(15).map((card) => card.kind === 'standard' && card.rank)

    expect(secondRanks).not.toEqual(firstRanks)
  })

  it('is reproducible — the same state buys the same pack', () => {
    expect(step(before, { kind: 'buyPack', pack: 'base', cullCardIds: [] }).deck).toEqual(
      after.deck,
    )
  })
})

describe('buyPack: a purchase that forces a cull', () => {
  it('destroys exactly the named cards and lands on the cap', () => {
    const before = ready(filler(DECK_CAP), 999)
    const doomed = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9']

    const after = step(before, { kind: 'buyPack', pack: 'base', cullCardIds: doomed })

    expect(after.deck).toHaveLength(DECK_CAP)
    for (const id of doomed) {
      expect(after.deck.map((card) => card.id)).not.toContain(id)
    }
  })

  it('never exceeds the cap', () => {
    const before = ready(filler(28), 999)
    const after = step(before, { kind: 'buyPack', pack: 'scrap', cullCardIds: ['f0'] })

    expect(after.deck.length).toBeLessThanOrEqual(DECK_CAP)
  })

  // The Deck is a multiset. Culling must remove the instance named, not every
  // card that happens to share a rank and suit.
  it('culls the instance named, leaving its duplicates', () => {
    const deck = [
      standardCard('keep-a', 5, 'diamonds'),
      standardCard('doomed', 5, 'diamonds'),
      standardCard('keep-b', 5, 'diamonds'),
      ...filler(27),
    ]
    const after = step({ ...ready(deck, 999) }, {
      kind: 'buyPack',
      pack: 'scrap',
      cullCardIds: ['doomed', 'f0', 'f1'],
    })

    expect(after.deck.map((card) => card.id)).toContain('keep-a')
    expect(after.deck.map((card) => card.id)).toContain('keep-b')
    expect(after.deck.map((card) => card.id)).not.toContain('doomed')
  })
})

describe('buyPack: Suited', () => {
  it('deals the chosen suit', () => {
    const before = ready([], 999)
    const after = step(before, { kind: 'buyPack', pack: 'suited', suit: 'clubs', cullCardIds: [] })

    expect(after.deck).toHaveLength(PACKS.suited.size)
    for (const card of after.deck) {
      expect(card.kind === 'standard' && card.suit).toBe('clubs')
    }
  })
})
