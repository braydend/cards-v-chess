import { describe, expect, it } from 'vitest'
import { BUILDABLE_RANKS } from './towerRanks'
import { DECK_CAP, STARTING_DECK } from './deck'
import { SUITS, supportMagnitude } from './cards'

describe('the starting Deck', () => {
  it('is within the Deck cap', () => {
    expect(STARTING_DECK.length).toBeLessThanOrEqual(DECK_CAP)
  })

  it('gives every card a unique id', () => {
    const ids = new Set(STARTING_DECK.map((card) => card.id))

    expect(ids.size).toBe(STARTING_DECK.length)
  })

  // Cards are gained from random packs, so duplicates are the normal case and
  // the code must handle them from day one.
  it('contains duplicates', () => {
    const signatures = STARTING_DECK.filter((card) => card.kind === 'standard').map((card) =>
      card.kind === 'standard' ? `${card.rank}${card.suit}` : '',
    )

    expect(new Set(signatures).size).toBeLessThan(signatures.length)
  })

  it('can build every rank on the ladder', () => {
    const ranks = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.rank] : [])),
    )

    for (const rank of BUILDABLE_RANKS) {
      expect(ranks).toContain(rank)
    }
  })

  it('covers all four suits', () => {
    const suits = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.suit] : [])),
    )

    for (const suit of SUITS) {
      expect(suits).toContain(suit)
    }
  })

  it('includes every face rank and at least one Joker', () => {
    const ranks = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.rank] : [])),
    )

    for (const face of ['J', 'Q', 'K', 'A']) {
      expect(ranks).toContain(face)
    }

    expect(STARTING_DECK.some((card) => card.kind === 'joker')).toBe(true)
  })
})

describe('supportMagnitude', () => {
  it('is the face value for numbered ranks', () => {
    expect(supportMagnitude(2)).toBe(2)
    expect(supportMagnitude(10)).toBe(10)
  })

  it('continues past 10 for the face ranks', () => {
    expect(supportMagnitude('J')).toBe(11)
    expect(supportMagnitude('Q')).toBe(12)
    expect(supportMagnitude('K')).toBe(13)
    expect(supportMagnitude('A')).toBe(14)
  })
})
