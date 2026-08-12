import { describe, expect, it } from 'vitest'
import { evaluateHand, HAND_SIZES, HAND_TOWER } from './hands'
import { standardCard } from './fixtures'
import type { Card, CardRank, Suit } from './types'

const card = (id: string, rank: CardRank, suit: Suit = 'hearts'): Card => standardCard(id, rank, suit)

const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

let suitIndex = 0

const c = (rank: CardRank): Card => {
  const suit = SUITS[suitIndex % SUITS.length] ?? 'hearts'
  suitIndex += 1
  return card(String(rank), rank, suit)
}

describe('evaluateHand', () => {
  it('evaluates a high card from a single card', () => {
    expect(evaluateHand([c(5)])).toBe('highCard')
  })

  it('evaluates a pair from exactly two equal ranks', () => {
    expect(evaluateHand([c(5), c(5)])).toBe('pair')
  })

  it('evaluates three of a kind from exactly three equal ranks', () => {
    expect(evaluateHand([c(5), c(5), c(5)])).toBe('threeOfAKind')
  })

  it('evaluates four of a kind from exactly four equal ranks', () => {
    expect(evaluateHand([c(5), c(5), c(5), c(5)])).toBe('fourOfAKind')
  })

  it('evaluates two pair from two distinct pairs', () => {
    expect(evaluateHand([c(5), c(5), c(9), c(9)])).toBe('twoPair')
  })

  it('evaluates a straight from five consecutive ranks', () => {
    expect(evaluateHand([c(2), c(3), c(4), c(5), c(6)])).toBe('straight')
  })

  it('accepts an Ace-low wheel as a straight', () => {
    expect(evaluateHand([c('A'), c(2), c(3), c(4), c(5)])).toBe('straight')
  })

  it('accepts a broadway (Ace-high) straight', () => {
    expect(evaluateHand([c(10), c('J'), c('Q'), c('K'), c('A')])).toBe('straight')
  })

  it('evaluates a flush from five same-suit cards', () => {
    expect(evaluateHand([card('a', 2, 'clubs'), card('b', 4, 'clubs'), card('c', 6, 'clubs'), card('d', 8, 'clubs'), card('e', 10, 'clubs')])).toBe('flush')
  })

  it('evaluates a full house from three of a kind plus a pair', () => {
    expect(evaluateHand([c(5), c(5), c(5), c(9), c(9)])).toBe('fullHouse')
  })

  it('evaluates a straight flush from five consecutive same-suit cards', () => {
    expect(evaluateHand([card('a', 2, 'clubs'), card('b', 3, 'clubs'), card('c', 4, 'clubs'), card('d', 5, 'clubs'), card('e', 6, 'clubs')])).toBe('straightFlush')
  })

  it('evaluates a royal flush from the 10-J-Q-K-A of one suit', () => {
    expect(evaluateHand([card('a', 10, 'clubs'), card('b', 'J', 'clubs'), card('c', 'Q', 'clubs'), card('d', 'K', 'clubs'), card('e', 'A', 'clubs')])).toBe('royalFlush')
  })

  it('returns null for a five-card set that is only a pair (no kickers)', () => {
    expect(evaluateHand([c(5), c(5), c(2), c(3), c(4)])).toBeNull()
  })

  it('returns null for a four-card set that is only a pair', () => {
    expect(evaluateHand([c(5), c(5), c(2), c(3)])).toBeNull()
  })

  it('returns null for a set of an invalid size', () => {
    expect(evaluateHand([])).toBeNull()
    expect(evaluateHand([c(5), c(5), c(5), c(5), c(5), c(5)])).toBeNull()
  })

  it('returns null when a Joker is in the set — it is never hand material', () => {
    expect(evaluateHand([{ id: 'j', kind: 'joker' }, c(5)])).toBeNull()
  })

  it('returns the strongest hand the set forms, so a straight flush beats a flush', () => {
    expect(evaluateHand([card('a', 2, 'clubs'), card('b', 3, 'clubs'), card('c', 4, 'clubs'), card('d', 5, 'clubs'), card('e', 6, 'clubs')])).toBe('straightFlush')
  })
})

describe('HAND_SIZES and HAND_TOWER', () => {
  it('declares the exact size of every hand', () => {
    expect(HAND_SIZES).toEqual({
      highCard: 1, pair: 2, twoPair: 4, threeOfAKind: 3, straight: 5,
      flush: 5, fullHouse: 5, fourOfAKind: 4, straightFlush: 5, royalFlush: 5,
    })
  })

  it('maps every non-royal hand to a tower, in rarity order', () => {
    expect(HAND_TOWER).toEqual({
      highCard: 'vertical', pair: 'wall', twoPair: 'sniper', threeOfAKind: 'diagonal',
      straight: 'cross', flush: 'star', fullHouse: 'splash', fourOfAKind: 'ring',
      straightFlush: 'tollgate',
    })
  })
})
