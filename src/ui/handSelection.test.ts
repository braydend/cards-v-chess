import { describe, expect, it } from 'vitest'
import { jokerCard, standardCard } from '../game/fixtures'
import type { Card, CardRank, Suit } from '../game'
import {
  commitCommand,
  faceActionCommand,
  selectedCards,
  selectionSummary,
} from './handSelection'

const card = (id: string, rank: CardRank, suit: Suit = 'hearts'): Card => standardCard(id, rank, suit)

const royalFlush = [
  card('r10', 10, 'hearts'),
  card('rJ', 'J', 'hearts'),
  card('rQ', 'Q', 'hearts'),
  card('rK', 'K', 'hearts'),
  card('rA', 'A', 'hearts'),
]

describe('selectionSummary', () => {
  it('reports empty for no selection', () => {
    expect(selectionSummary([])).toEqual({ kind: 'empty' })
  })

  it('sees a single numbered Card as a high-card hand', () => {
    expect(selectionSummary([card('c5', 5)])).toEqual({
      kind: 'hand',
      hand: 'highCard',
      tower: 'vertical',
      towerLabel: 'Vertical',
    })
  })

  it('sees a single face Card as a face action, not a hand', () => {
    expect(selectionSummary([card('cJ', 'J')])).toEqual({ kind: 'singleFace', rank: 'J' })
    expect(selectionSummary([card('cA', 'A')])).toEqual({ kind: 'singleFace', rank: 'A' })
  })

  it('sees a lone Joker as its own play, not a hand', () => {
    expect(selectionSummary([jokerCard('jk1')])).toEqual({ kind: 'singleJoker' })
  })

  it('refuses a Joker mixed into a selection — Jokers are never hand material', () => {
    expect(selectionSummary([jokerCard('jk1'), card('c5', 5)])).toEqual({ kind: 'invalid' })
    expect(selectionSummary([jokerCard('jk1'), card('c5', 5), card('c6', 6), card('c7', 7)])).toEqual({
      kind: 'invalid',
    })
  })

  it('sees a pair of face Cards as a pair hand', () => {
    expect(selectionSummary([card('k1', 'K'), card('k2', 'K')])).toEqual({
      kind: 'hand',
      hand: 'pair',
      tower: 'wall',
      towerLabel: 'Wall',
    })
  })

  it('labels a royal flush as a Tower of your choice', () => {
    expect(selectionSummary(royalFlush)).toEqual({
      kind: 'hand',
      hand: 'royalFlush',
      tower: 'vertical',
      towerLabel: 'Tower of your choice',
    })
  })

  it('refuses five cards that are not exactly one hand', () => {
    // A pair plus three kickers, mixed suits so it is neither a flush nor a
    // straight — no five-card pattern, no downgrade to the pair inside it.
    const notAHand = [
      card('a', 2, 'hearts'),
      card('b', 2, 'diamonds'),
      card('c', 3, 'spades'),
      card('d', 4, 'clubs'),
      card('e', 6, 'hearts'),
    ]
    expect(selectionSummary(notAHand)).toEqual({ kind: 'invalid' })
  })
})

describe('commitCommand', () => {
  it('commits a hand as a playHand command', () => {
    expect(commitCommand([card('k1', 'K'), card('k2', 'K')])).toEqual({
      kind: 'playHand',
      cardIds: ['k1', 'k2'],
    })
  })

  it('commits a lone face Card as a high-card hand when the Deck asks', () => {
    expect(commitCommand([card('cJ', 'J')])).toEqual({ kind: 'playHand', cardIds: ['cJ'] })
  })

  it('returns null for a royal flush until a Tower type is chosen', () => {
    expect(commitCommand(royalFlush)).toBeNull()
  })

  it('names the chosen Tower type for a royal flush', () => {
    expect(commitCommand(royalFlush, 'wall')).toEqual({
      kind: 'playHand',
      cardIds: royalFlush.map((c) => c.id),
      chosenType: 'wall',
    })
  })

  it('returns null for a selection that is not a hand', () => {
    const notAHand = [card('a', 2, 'hearts'), card('b', 3, 'diamonds')]
    expect(commitCommand(notAHand)).toBeNull()
    expect(commitCommand([])).toBeNull()
  })

  it('refuses to commit a lone Joker as a hand', () => {
    expect(commitCommand([jokerCard('jk1')])).toBeNull()
  })
})

describe('faceActionCommand', () => {
  it('builds the untargeted play for a King, an Ace, and a Joker', () => {
    expect(faceActionCommand(card('k1', 'K'))).toEqual({ kind: 'reinforceCore', cardId: 'k1' })
    expect(faceActionCommand(card('a1', 'A'))).toEqual({ kind: 'expandBoard', cardId: 'a1' })
    expect(faceActionCommand(jokerCard('jk1'))).toEqual({ kind: 'clearPieces', cardId: 'jk1' })
  })

  it('returns null for a Jack or Queen, which need a Tower target', () => {
    expect(faceActionCommand(card('j1', 'J'))).toBeNull()
    expect(faceActionCommand(card('q1', 'Q'))).toBeNull()
  })

  it('returns null for a numbered Card — it is hand material, not a solo play', () => {
    expect(faceActionCommand(card('n1', 5))).toBeNull()
  })
})

describe('selectedCards', () => {
  it('resolves the selected ids to their Cards, in pick order', () => {
    const deck = [card('a', 5), card('b', 'J'), jokerCard('jk')]

    expect(selectedCards(deck, ['b', 'a'])).toEqual([card('b', 'J'), card('a', 5)])
  })

  it('drops an id with no Card behind it', () => {
    const deck = [card('a', 5)]

    expect(selectedCards(deck, ['a', 'ghost'])).toEqual([card('a', 5)])
  })

  it('returns an empty list for an empty selection', () => {
    expect(selectedCards([card('a', 5)], [])).toEqual([])
  })
})
