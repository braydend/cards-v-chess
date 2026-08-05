import { describe, expect, it } from 'vitest'
import { findCard, isBuildableRank, removeCard } from './cards'
import type { Card } from './types'

const FIVE_A: Card = { id: 'a', kind: 'standard', rank: 5, suit: 'diamonds' }
const FIVE_B: Card = { id: 'b', kind: 'standard', rank: 5, suit: 'diamonds' }
const FIVE_C: Card = { id: 'c', kind: 'standard', rank: 5, suit: 'diamonds' }
const DECK = [FIVE_A, FIVE_B, FIVE_C]

describe('findCard', () => {
  it('finds a card by id', () => {
    expect(findCard(DECK, 'b')).toBe(FIVE_B)
  })

  it('returns undefined for an unknown id', () => {
    expect(findCard(DECK, 'nope')).toBeUndefined()
  })
})

describe('removeCard', () => {
  // The Deck is a multiset: cards come from random packs, so three identical
  // 5♦ is normal. Identity must be the id, never rank+suit.
  it('removes only the named instance and leaves its duplicates', () => {
    const after = removeCard(DECK, 'b')

    expect(after).toHaveLength(2)
    expect(after.map((card) => card.id)).toEqual(['a', 'c'])
  })

  it('leaves the deck alone when the id is unknown', () => {
    expect(removeCard(DECK, 'nope')).toEqual(DECK)
  })

  it('does not mutate the input', () => {
    removeCard(DECK, 'b')

    expect(DECK).toHaveLength(3)
  })
})

describe('isBuildableRank', () => {
  it('accepts numeric ranks', () => {
    expect(isBuildableRank(2)).toBe(true)
    expect(isBuildableRank(10)).toBe(true)
  })

  it('rejects the face ranks', () => {
    expect(isBuildableRank('J')).toBe(false)
    expect(isBuildableRank('A')).toBe(false)
  })
})
