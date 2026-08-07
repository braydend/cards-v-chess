import { describe, expect, it } from 'vitest'
import { PACKS } from '../data/packs'
import { commitState, newCards } from './packPurchase'

const BASE = PACKS.base.price

describe('commitState', () => {
  it('asks for a pack when none is picked', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: null,
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.label).toBe('Open pack')
    expect(state.reason).toBe('Pick a pack.')
  })

  it('names the shortfall when Ink is short', () => {
    const state = commitState({
      deckSize: 5,
      ink: BASE - 10,
      phase: 'gap',
      pack: 'base',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe(`Base costs ${BASE} Ink — you have ${BASE - 10}.`)
  })

  it('asks for a suit on a Suited pack', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: 'suited',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Pick a suit.')
  })

  it('accepts a Suited pack once a suit is chosen', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: 'suited',
      suit: 'hearts',
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(true)
  })

  it('asks for more marks when too few cards are marked', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      phase: 'gap',
      pack: 'scrap',
      suit: null,
      markedIds: ['a'],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Mark 2 more cards in the Deck to destroy.')
  })

  it('uses the singular for one remaining mark', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      phase: 'gap',
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b'],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.reason).toBe('Mark 1 more card in the Deck to destroy.')
  })

  it('asks for fewer marks when too many are marked', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      phase: 'gap',
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b', 'c', 'd'],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Unmark 1 card — a Cull only makes room, it never thins the Deck.')
  })

  it('uses the plural for several excess marks', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      phase: 'gap',
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b', 'c', 'd', 'e'],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Unmark 2 cards — a Cull only makes room, it never thins the Deck.')
  })

  it('enables a purchase that needs no cull, and prices it in the label', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: 'base',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe(`Open Base — ${BASE} Ink`)
    expect(state.reason).toBe(null)
  })

  it('prices the label at the escalated price once a type has been bought', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: 'scrap',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 2, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe('Open Scrap — 61 Ink')
  })

  it('says what it will destroy when a cull is required', () => {
    const marked = Array.from({ length: 10 }, (_, i) => `m${i}`)
    const state = commitState({
      deckSize: 30,
      ink: 999,
      phase: 'gap',
      pack: 'base',
      suit: null,
      markedIds: marked,
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe(`Destroy 10 & open Base — ${BASE} Ink`)
  })

  it('reports affordability before marks, so the player is not asked to cull for a pack they cannot buy', () => {
    const state = commitState({
      deckSize: 30,
      ink: 0,
      phase: 'gap',
      pack: 'base',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.reason).toContain('Ink')
  })

  it('refuses while a round is in progress, and says why', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'inProgress',
      pack: 'base',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('A round is in progress — packs are bought between rounds.')
  })

  it('refuses once defeated', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'defeated',
      pack: 'base',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(false)
  })

  // Phase outranks every other reason: a round starting while the shop is open
  // must not be reported as "pick a pack".
  it('reports the phase even before a pack is picked', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'inProgress',
      pack: null,
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })

    expect(state.reason).toBe('A round is in progress — packs are bought between rounds.')
  })
})

describe('newCards', () => {
  const a = { id: 'a', kind: 'standard', rank: 2, suit: 'hearts' } as const
  const b = { id: 'b', kind: 'standard', rank: 3, suit: 'spades' } as const
  const c = { id: 'c', kind: 'joker' } as const

  it('returns only the cards absent before', () => {
    expect(newCards(new Set(['a']), [a, b, c])).toEqual([b, c])
  })

  it('returns nothing when the Deck did not grow', () => {
    expect(newCards(new Set(['a', 'b']), [a, b])).toEqual([])
  })

  // The Deck is a multiset, so identical rank+suit pairs are distinct Cards.
  // Diffing must key on id alone.
  it('distinguishes duplicates by id', () => {
    const dupe = { id: 'a2', kind: 'standard', rank: 2, suit: 'hearts' } as const

    expect(newCards(new Set(['a']), [a, dupe])).toEqual([dupe])
  })
})
