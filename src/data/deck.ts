import type { Card, CardRank, Suit } from '../game/types'

/**
 * The hard Deck cap. Acquiring cards beyond it forces culling — which cannot
 * happen yet, because packs are not in scope and this Deck is authored. The cap
 * is asserted by a test so it cannot be quietly exceeded later.
 */
export const DECK_CAP = 30

/** Shorthand so the deck below reads like a list of cards. */
function card(index: number, rank: CardRank, suit: Suit): Card {
  return { id: `card-${index}`, kind: 'standard', rank, suit }
}

function joker(index: number): Card {
  return { id: `card-${index}`, kind: 'joker' }
}

/**
 * The Deck a run opens with, for this slice only.
 *
 * This is NOT a standard 54-card deck and must not become one — the cap is 30,
 * and cards are gained from random packs, so the real Deck is a multiset with
 * duplicates. This list is authored to exercise every mechanic: all nine
 * buildable ranks, all four suits, each face rank, both Jokers, and deliberate
 * duplicates including a triple.
 *
 * When packs land, this is replaced by a pack opening. Nothing else should need
 * to change.
 */
export const STARTING_DECK: readonly Card[] = [
  card(1, 2, 'hearts'),
  card(2, 2, 'hearts'),
  card(3, 2, 'diamonds'),
  card(4, 3, 'diamonds'),
  card(5, 3, 'diamonds'),
  card(6, 3, 'spades'),
  card(7, 4, 'spades'),
  card(8, 4, 'hearts'),
  card(9, 5, 'clubs'),
  card(10, 5, 'clubs'),
  card(11, 5, 'clubs'),
  card(12, 6, 'hearts'),
  card(13, 6, 'diamonds'),
  card(14, 7, 'diamonds'),
  card(15, 7, 'clubs'),
  card(16, 8, 'spades'),
  card(17, 8, 'clubs'),
  card(18, 9, 'clubs'),
  card(19, 9, 'spades'),
  card(20, 10, 'hearts'),
  card(21, 10, 'diamonds'),
  card(22, 'J', 'hearts'),
  card(23, 'J', 'spades'),
  card(24, 'Q', 'diamonds'),
  card(25, 'K', 'clubs'),
  card(26, 'A', 'hearts'),
  joker(27),
  joker(28),
]
