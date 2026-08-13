import { describe, expect, it } from 'vitest'
import { allSquares, canBuildOn, createInitialState, evaluateHand } from '../game'
import type { Card, CardRank, GameState, Suit } from '../game'
import { bestBuildSquare, bestHandInDeck, cullIdsFor, preferredPack } from './strategy'

function standard(id: string, rank: CardRank, suit: Suit): Card {
  return { id, kind: 'standard', rank, suit }
}

function deck(...cards: Card[]): Card[] {
  return cards
}

/** The cards a pick names, resolved back out of the deck. */
function cardsOf(deck: readonly Card[], pick: { hand: unknown; cardIds: readonly string[] }): Card[] {
  return pick.cardIds.map((id) => {
    const card = deck.find((candidate) => candidate.id === id)
    if (!card) throw new Error(`pick named missing card ${id}`)
    return card
  })
}

describe('bestHandInDeck', () => {
  it('returns null for an empty deck', () => {
    expect(bestHandInDeck([])).toBeNull()
  })

  it('returns null when the deck holds only Jokers', () => {
    expect(bestHandInDeck([{ id: 'j1', kind: 'joker' }])).toBeNull()
  })

  it('finds a high card from a single card', () => {
    const cards = deck(standard('a', 5, 'hearts'))
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('highCard')
    expect(cardsOf(cards, pick)).toHaveLength(1)
    expect(evaluateHand(cardsOf(cards, pick))).toBe('highCard')
  })

  it('finds a pair and only commits two cards', () => {
    const cards = deck(standard('a', 5, 'hearts'), standard('b', 5, 'clubs'), standard('c', 3, 'spades'))
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('pair')
    expect(cardsOf(cards, pick)).toHaveLength(2)
    expect(evaluateHand(cardsOf(cards, pick))).toBe('pair')
  })

  it('finds two pair', () => {
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 3, 'spades'),
      standard('d', 3, 'diamonds'),
    )
    expect(bestHandInDeck(cards)?.hand).toBe('twoPair')
  })

  it('finds three of a kind', () => {
    const cards = deck(standard('a', 5, 'hearts'), standard('b', 5, 'clubs'), standard('c', 5, 'spades'))
    expect(bestHandInDeck(cards)?.hand).toBe('threeOfAKind')
  })

  it('finds a straight of mixed suits', () => {
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 3, 'clubs'),
      standard('c', 4, 'spades'),
      standard('d', 5, 'diamonds'),
      standard('e', 6, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('straight')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('straight')
  })

  it('finds a wheel (A-2-3-4-5)', () => {
    const cards = deck(
      standard('a', 'A', 'hearts'),
      standard('b', 2, 'clubs'),
      standard('c', 3, 'spades'),
      standard('d', 4, 'diamonds'),
      standard('e', 5, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('straight')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('straight')
  })

  it('finds a flush', () => {
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 4, 'hearts'),
      standard('c', 6, 'hearts'),
      standard('d', 8, 'hearts'),
      standard('e', 10, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('flush')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('flush')
  })

  it('finds a full house', () => {
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 5, 'spades'),
      standard('d', 3, 'diamonds'),
      standard('e', 3, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('fullHouse')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('fullHouse')
  })

  it('finds four of a kind', () => {
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 5, 'spades'),
      standard('d', 5, 'diamonds'),
    )
    expect(bestHandInDeck(cards)?.hand).toBe('fourOfAKind')
  })

  it('finds a straight flush', () => {
    const cards = deck(
      standard('a', 2, 'clubs'),
      standard('b', 3, 'clubs'),
      standard('c', 4, 'clubs'),
      standard('d', 5, 'clubs'),
      standard('e', 6, 'clubs'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('straightFlush')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('straightFlush')
  })

  it('finds a royal flush', () => {
    const cards = deck(
      standard('a', 10, 'spades'),
      standard('b', 'J', 'spades'),
      standard('c', 'Q', 'spades'),
      standard('d', 'K', 'spades'),
      standard('e', 'A', 'spades'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('royalFlush')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('royalFlush')
  })

  it('returns the strongest hand in the deck, not the first found', () => {
    // A pair AND a flush: the flush wins.
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 2, 'hearts'),
      standard('d', 4, 'hearts'),
      standard('e', 6, 'hearts'),
      standard('f', 8, 'hearts'),
    )
    expect(bestHandInDeck(cards)?.hand).toBe('flush')
  })

  it('every pick evaluates as a valid hand in the engine', () => {
    // A spread deck with several patterns: whatever it picks must be legal.
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 3, 'clubs'),
      standard('c', 4, 'spades'),
      standard('d', 5, 'diamonds'),
      standard('e', 6, 'hearts'),
      standard('f', 6, 'clubs'),
      standard('g', 'J', 'spades'),
      standard('h', 'Q', 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(evaluateHand(cardsOf(cards, pick))).not.toBeNull()
  })
})

describe('bestBuildSquare', () => {
  function fresh(): GameState {
    return createInitialState('alpha')
  }

  it('returns a square the engine accepts for building', () => {
    const state = fresh()
    const square = bestBuildSquare(state, 'vertical', 'maxCoverage')
    if (square === null) throw new Error('expected a square')
    expect(canBuildOn(state, square)).toBe(true)
  })

  it('prefers the far rank under spawnSide', () => {
    const state = fresh()
    const spawnSide = bestBuildSquare(state, 'vertical', 'spawnSide')
    const coreSide = bestBuildSquare(state, 'vertical', 'coreSide')
    if (spawnSide === null || coreSide === null) throw new Error('expected squares')
    expect(spawnSide.rank).toBeGreaterThan(coreSide.rank)
  })

  it('returns a square inside the board', () => {
    const state = fresh()
    const square = bestBuildSquare(state, 'cross', 'maxCoverage')
    if (square === null) throw new Error('expected a square')
    expect(allSquares(state.board)).toContainEqual(square)
  })
})

describe('preferredPack and cullIdsFor', () => {
  it('picks the first affordable pack in preference order', () => {
    const state = { ...createInitialState('alpha'), ink: 100 }
    expect(preferredPack(state, ['scrap', 'base', 'suited', 'court'], 0)).toBe('scrap')
  })

  it('respects an ink reserve', () => {
    const state = { ...createInitialState('alpha'), ink: 100 }
    expect(preferredPack(state, ['scrap', 'base', 'suited', 'court'], 60)).toBeNull()
  })

  it('culls the lowest-value cards to fit a pack', () => {
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 10, 'clubs'),
      standard('c', 'A', 'spades'),
      { id: 'd', kind: 'joker' },
    )
    // 26 numbered twos + these 4 = 30 cards, already at the cap. A Base pack
    // (size 10) pushes past it by 10, so exactly 10 must be culled — and the
    // ten lowest-value cards are all twos, so the Joker and Ace survive.
    const big: Card[] = []
    for (let i = 0; i < 26; i += 1) {
      big.push(standard(`s${i}`, 2, 'hearts'))
    }
    big.push(...cards)
    const ids = cullIdsFor(big, 'base')
    expect(ids).toHaveLength(10)
    // The Joker (value 15) and the Ace (14) must survive any cull.
    expect(ids).not.toContain('d')
    expect(ids).not.toContain('c')
  })
})
