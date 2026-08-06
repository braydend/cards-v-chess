import type { Suit } from '../game/types'

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

/**
 * Balance values for the card actions. PLACEHOLDERS, not design decisions —
 * they live here so tuning never touches logic.
 */

/**
 * Health a ♠ adds, to both current and maximum.
 *
 * Flat, not rank-scaled: a 2♠ on a rank-2 Tower is worth exactly what a 10♠ is
 * on a rank-10 Tower, so a Tower's power grows at a predictable rate however it
 * was built. 6 is the midpoint of the 2–10 range rank scaling used to produce,
 * so a mid-ladder Tower behaves as it always did.
 */
export const SPADE_HEALTH = 6

/** Milliseconds a ♦ shaves off a Tower's fire interval. Midpoint of the old 20–100ms range. */
export const DIAMOND_SPEED_MS = 60

/** Damage a ♣ adds. Midpoint of the old +1–3 range. */
export const CLUB_DAMAGE = 2

/**
 * What a face card's support is worth relative to a matched numbered Card.
 *
 * Face cards are the only Cards that can support a Tower of any rank (see
 * `canSupport`), and they carry a premium on top of that reach. It is **flat
 * across J, Q, K and A** — a J♠ and an A♠ are identical as supports, and the
 * choice between them is which action you would rather give up.
 *
 * The three values above are even so that this premium lands on whole numbers.
 * Changing one without the other reintroduces rounding the design deliberately
 * has none of.
 */
export const FACE_SUPPORT_PREMIUM = 1.5

/**
 * The floor a fire interval can never go below, however many ♦ are stacked.
 *
 * Not a balance value — a guard, and load-bearing. `fireTowers` loops
 * `while (cooldown >= fireIntervalMs)`, so an interval of zero would never
 * terminate, and a flat per-♦ subtraction genuinely reaches zero. (A
 * proportional one would only ever approach it, which is part of why flat
 * values need this and the rejected proportional design did not.)
 */
export const MIN_FIRE_INTERVAL_MS = 100

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
