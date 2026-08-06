import { CLUB_DAMAGE, DIAMOND_SPEED_MS, FACE_SUPPORT_PREMIUM, SPADE_HEALTH } from '../data/cards'
import { isBuildableRank, type CardRank, type Suit } from '../game'

/**
 * What playing this Card for its suit would do, as the Deck's mode button
 * shows it.
 *
 * Two facts have to fit on one line of a narrow panel: what the support is
 * worth, and which Towers it can reach. Reach is the half a player cannot infer
 * — a numbered Card supports only its own rank, and a face card supports any
 * Tower — so it is always stated, ♥ included.
 *
 * ♥ is the one suit with no number: it restores to full and ignores the
 * multiplier entirely, so printing a value beside it would promise a scaled
 * repair that does not exist.
 *
 * Pure and separate from `Deck.tsx` because there is no jsdom here — a decision
 * left in a `.tsx` file cannot be tested at all. See CLAUDE.md.
 */
export function supportModeLabel(suit: Suit, rank: CardRank): string {
  const numbered = isBuildableRank(rank)
  const reach = numbered ? `rank-${rank} Towers only` : 'any Tower'
  const multiplier = numbered ? 1 : FACE_SUPPORT_PREMIUM

  return `${effect(suit, multiplier)} — ${reach}`
}

function effect(suit: Suit, multiplier: number): string {
  switch (suit) {
    case 'hearts':
      return 'Repair to full'
    case 'diamonds':
      return `Speed ${DIAMOND_SPEED_MS * multiplier}ms faster`
    case 'spades':
      return `Health +${SPADE_HEALTH * multiplier}`
    case 'clubs':
      return `Damage +${CLUB_DAMAGE * multiplier}`
  }
}
