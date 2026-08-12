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

/**
 * Whether this rank is a numbered rank (2–10).
 *
 * No rank "builds" a Tower any more — hands do. The name survives from the old
 * build-by-rank mechanic, but what this now distinguishes is the numbered ranks
 * from the face ranks and the Joker for straight ordering and the like.
 */
export function isBuildableRank(rank: CardRank): rank is BuildableRank {
  return typeof rank === 'number'
}
