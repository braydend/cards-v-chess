import { supportMagnitude } from '../data/cards'
import type { CardRank, Suit } from '../game'

const SUIT_ACTION = {
  hearts: 'Repair',
  diamonds: 'Speed',
  spades: 'Health',
  clubs: 'Damage',
} as const

/**
 * What playing this Card for its suit would do, as the Deck's mode button
 * shows it.
 *
 * ♥ is the one suit with no number: it restores to full and ignores magnitude
 * entirely, so printing the rank's magnitude beside it would promise a
 * rank-scaled repair that does not exist. Every other suit scales, and the
 * number is the whole reason to prefer a high card for support over a low one.
 *
 * Pure and separate from `Deck.tsx` because there is no jsdom here — a decision
 * left in a `.tsx` file cannot be tested at all. See CLAUDE.md.
 */
export function supportModeLabel(suit: Suit, rank: CardRank): string {
  if (suit === 'hearts') return 'Repair to full'

  return `${SUIT_ACTION[suit]} ${supportMagnitude(rank)}`
}
