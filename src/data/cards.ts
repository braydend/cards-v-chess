import type { CardRank, Suit } from '../game/types'

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

/**
 * How strong a suit's support action is when played from this rank.
 *
 * Support magnitude scales with rank, as Tower power does: a 9♠ is a large
 * buff, a 2♠ a small one. The face ranks continue the scale past 10, which is
 * why a K♠ is a top-of-scale buff.
 *
 * **♥ does not read this.** Repair restores to full whatever the rank — see
 * `applySupport` in `src/game/support.ts` for why — so a ♥'s rank matters only
 * when it is played to build.
 */
export function supportMagnitude(rank: CardRank): number {
  switch (rank) {
    case 'J':
      return 11
    case 'Q':
      return 12
    case 'K':
      return 13
    case 'A':
      return 14
    default:
      return rank
  }
}

/**
 * Balance values for the card actions. PLACEHOLDERS, not design decisions —
 * they live here so tuning never touches logic.
 */

/** Milliseconds shaved off a fire interval per point of magnitude (♦ Speed). */
export const SPEED_MS_PER_MAGNITUDE = 10

/**
 * The floor a fire interval can never go below, however many ♦ are stacked.
 *
 * Not a balance value — a guard. `fireTowers` loops `while (cooldown >=
 * fireIntervalMs)`, so an interval of zero would never terminate.
 */
export const MIN_FIRE_INTERVAL_MS = 100

/** Magnitude needed per point of added damage (♣ Damage). */
export const MAGNITUDE_PER_DAMAGE = 3

/**
 * A Jack's shield, flat rather than rank-scaled.
 *
 * A blocked Pawn deals 1 damage per 900ms hop, so 10 absorbs about 9 seconds of
 * grinding. Flat on purpose: it is worth proportionally more on a cheap Tower,
 * which gives low ranks a reason to matter once the player holds 9s and 10s.
 */
export const JACK_SHIELD = 10

/** Core health a King adds, to both current and maximum. */
export const KING_CORE_HEALTH = 1

/** Board ranks an Ace adds. Ranks only, never files. */
export const ACE_BOARD_RANKS = 1
