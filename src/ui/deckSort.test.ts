import { describe, expect, it } from 'vitest'
import { sortDeck } from './deckSort'
import type { Card, CardRank, Suit } from '../game'

function card(id: string, rank: CardRank, suit: Suit = 'hearts'): Card {
  return { id, kind: 'standard', rank, suit }
}

const JOKER: Card = { id: 'joker', kind: 'joker' }

const DECK: Card[] = [
  card('k1', 'K', 'hearts'),
  card('a2', 'A', 'spades'),
  card('c3', 3, 'clubs'),
  card('d4', 'J', 'diamonds'),
  card('a5', 2, 'spades'),
  card('h6', 10, 'hearts'),
  JOKER,
]

describe('sortDeck', () => {
  it("returns the deck unchanged for 'none'", () => {
    expect(sortDeck(DECK, 'none')).toEqual(DECK)
  })

  it('returns a new array, never mutating the input', () => {
    const before = DECK.map((c) => c.id)
    sortDeck(DECK, 'suit')
    expect(DECK.map((c) => c.id)).toEqual(before)
  })

  it('sorts by suit in the fixed order hearts, diamonds, spades, clubs, value ascending within a suit', () => {
    const sorted = sortDeck(DECK, 'suit').map((c) => c.id)

    // hearts first: 10 (h6) then K (k1) — value ascending within a suit;
    // then diamonds J (d4); spades 2 (a5) then A (a2); clubs 3 (c3);
    // Joker last.
    expect(sorted).toEqual(['h6', 'k1', 'd4', 'a5', 'a2', 'c3', 'joker'])
  })

  it('sorts by value ascending with suits in fixed order breaking ties, Jokers last', () => {
    const sorted = sortDeck(DECK, 'value').map((c) => c.id)

    // values: 2 (a5), 3 (c3), 10 (h6), J (d4), K (k1), A (a2), then Joker.
    expect(sorted).toEqual(['a5', 'c3', 'h6', 'd4', 'k1', 'a2', 'joker'])
  })

  it('preserves every card id — sorting never loses a card', () => {
    for (const sort of ['none', 'suit', 'value'] as const) {
      const ids = sortDeck(DECK, sort).map((c) => c.id)
      expect([...ids].sort()).toEqual(DECK.map((c) => c.id).sort())
    }
  })

  it('puts Jokers last even when only Jokers are present, and at the end of a same-value tie', () => {
    const twoJokers = [JOKER, card('a', 5), JOKER]
    const sorted = sortDeck(twoJokers, 'value')
    expect(sorted.slice(0, 1).map((c) => c.id)).toEqual(['a'])
    expect(sorted.slice(1).map((c) => c.kind)).toEqual(['joker', 'joker'])
  })

  it('is stable within equal sort keys — equal cards keep their input relative order', () => {
    const a = card('a', 7, 'spades')
    const b = card('b', 7, 'spades')
    const deck = [b, a]
    expect(sortDeck(deck, 'value').map((c) => c.id)).toEqual(['b', 'a'])
    expect(sortDeck(deck, 'suit').map((c) => c.id)).toEqual(['b', 'a'])
  })
})
