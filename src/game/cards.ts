import type { BuildableRank, Card, CardRank } from './types'

export function findCard(deck: readonly Card[], cardId: string): Card | undefined {
  return deck.find((card) => card.id === cardId)
}

/**
 * The Deck without the named card.
 *
 * Filtering on `id` and not on rank+suit is load-bearing: the Deck is a
 * multiset, so three identical 5♦ must lose exactly the one that was played.
 */
export function removeCard(deck: readonly Card[], cardId: string): Card[] {
  return deck.filter((card) => card.id !== cardId)
}

/** Whether this rank builds a Tower, as opposed to acting. */
export function isBuildableRank(rank: CardRank): rank is BuildableRank {
  return typeof rank === 'number'
}
