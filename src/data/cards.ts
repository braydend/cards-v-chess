import type { CardRank, Suit } from '../game/types'

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

/**
 * Every rank a Card can carry, in ladder order.
 *
 * This is the whole draw set — the rank ladder is gone and numbered ranks no
 * longer build Towers (hands do), so there is no buildable subset to call out.
 * Packs draw from this full set.
 */
export const ALL_CARD_RANKS: readonly CardRank[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A',
]

/**
 * Balance values for the card actions. PLACEHOLDERS, not design decisions —
 * they live here so tuning never touches logic.
 *
 * A Jack's shield, flat.
 *
 * A blocked Pawn deals 1 damage per 900ms hop, so 10 absorbs about 9 seconds of
 * grinding. Flat on purpose: it is worth proportionally more on a cheap Tower,
 * which gives low towers a reason to matter.
 */
export const JACK_SHIELD = 10

/** Core health a King adds, to both current and maximum. */
export const KING_CORE_HEALTH = 1

/** Board ranks an Ace adds. Ranks only, never files. */
export const ACE_BOARD_RANKS = 1
