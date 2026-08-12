import type { Card, CardRank, Suit } from '../game'

/**
 * How the Deck view orders its cards. `'none'` is raw deal order — the
 * default. The active sort is view state (`uiStore.deckSort`), shared by the
 * desktop Deck and the mobile picker; it never reaches GameState.
 */
export type DeckSort = 'none' | 'suit' | 'value'

/** Fixed suit order: the SUITS array order from src/data/cards.ts. */
const SUIT_ORDER: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

/** Numeric value of a rank for ordering. A is high. */
function rankValue(rank: CardRank): number {
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') return 13
  if (rank === 'A') return 14
  return rank
}

/**
 * A Card's sort key, or `null` for a Joker.
 *
 * A Joker has neither rank nor suit, so it has no key under either sort; the
 * comparator places it last always. Returning `null` and treating it as
 * "greater than every keyed card" is what pins "Jokers last" in one place
 * rather than in both branches.
 */
function sortKey(card: Card): { rank: number; suit: number } | null {
  if (card.kind === 'joker') return null
  return { rank: rankValue(card.rank), suit: SUIT_ORDER.indexOf(card.suit) }
}

function compare(a: Card, b: Card, sort: DeckSort): number {
  const ka = sortKey(a)
  const kb = sortKey(b)

  // A Joker has no key, so it sorts last under every sort.
  if (ka === null && kb === null) return 0
  if (ka === null) return 1
  if (kb === null) return -1

  if (sort === 'suit') {
    if (ka.suit !== kb.suit) return ka.suit - kb.suit
    return ka.rank - kb.rank
  }

  if (ka.rank !== kb.rank) return ka.rank - kb.rank
  return ka.suit - kb.suit
}

/**
 * The Deck ordered by the given sort, or unchanged for `'none'`.
 *
 * Pure and deterministic. The comparator is total and stable (Array.prototype
 * sort is stable in modern JS), so equal cards keep their input order.
 */
export function sortDeck(cards: readonly Card[], sort: DeckSort): Card[] {
  if (sort === 'none') return [...cards]
  return [...cards].sort((a, b) => compare(a, b, sort))
}
