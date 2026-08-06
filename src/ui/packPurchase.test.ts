import { describe, expect, it } from 'vitest'
import { PACKS } from '../data/packs'
import { commitState } from './packPurchase'

const BASE = PACKS.base.price

describe('commitState', () => {
  it('asks for a pack when none is picked', () => {
    const state = commitState({ deckSize: 5, ink: 999, pack: null, suit: null, markedIds: [] })

    expect(state.enabled).toBe(false)
    expect(state.label).toBe('Open pack')
    expect(state.reason).toBe('Pick a pack.')
  })

  it('names the shortfall when Ink is short', () => {
    const state = commitState({ deckSize: 5, ink: BASE - 10, pack: 'base', suit: null, markedIds: [] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe(`Base costs ${BASE} Ink — you have ${BASE - 10}.`)
  })

  it('asks for a suit on a Suited pack', () => {
    const state = commitState({ deckSize: 5, ink: 999, pack: 'suited', suit: null, markedIds: [] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Pick a suit.')
  })

  it('accepts a Suited pack once a suit is chosen', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      pack: 'suited',
      suit: 'hearts',
      markedIds: [],
    })

    expect(state.enabled).toBe(true)
  })

  it('asks for more marks when too few cards are marked', () => {
    const state = commitState({ deckSize: 30, ink: 999, pack: 'scrap', suit: null, markedIds: ['a'] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Mark 2 more cards in the Deck to destroy.')
  })

  it('uses the singular for one remaining mark', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b'],
    })

    expect(state.reason).toBe('Mark 1 more card in the Deck to destroy.')
  })

  it('asks for fewer marks when too many are marked', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b', 'c', 'd'],
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Unmark 1 card — a Cull only makes room, it never thins the Deck.')
  })

  it('uses the plural for several excess marks', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b', 'c', 'd', 'e'],
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Unmark 2 cards — a Cull only makes room, it never thins the Deck.')
  })

  it('enables a purchase that needs no cull, and prices it in the label', () => {
    const state = commitState({ deckSize: 5, ink: 999, pack: 'base', suit: null, markedIds: [] })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe(`Open Base — ${BASE} Ink`)
    expect(state.reason).toBe(null)
  })

  it('says what it will destroy when a cull is required', () => {
    const marked = Array.from({ length: 10 }, (_, i) => `m${i}`)
    const state = commitState({ deckSize: 30, ink: 999, pack: 'base', suit: null, markedIds: marked })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe(`Destroy 10 & open Base — ${BASE} Ink`)
  })

  it('reports affordability before marks, so the player is not asked to cull for a pack they cannot buy', () => {
    const state = commitState({ deckSize: 30, ink: 0, pack: 'base', suit: null, markedIds: [] })

    expect(state.reason).toContain('Ink')
  })
})
