import {
  CLUB_DAMAGE,
  DIAMOND_SPEED_MS,
  MIN_FIRE_INTERVAL_MS,
  SPADE_HEALTH,
} from '../data/cards'
import { isBuildableRank } from './cards'
import type { Card, Suit, Tower } from './types'

/**
 * Whether this Card may be played for its suit onto this Tower.
 *
 * A numbered Card supports only a Tower of its own rank: a 5♥ repairs a rank-5
 * Tower and nothing else. That is what makes the ranks in a Deck mean something
 * after build time — without it, rank is inert the moment a Tower exists.
 *
 * **Face cards are exempt** and support any Tower. A Tower's `cardRank` is
 * always a `BuildableRank`, so strict equality would make J♠, Q♦, K♣ and A♥
 * unplayable for their suit entirely, and a face card is meant to be worth
 * weighing for its suit as well as for its action.
 *
 * A Joker has no suit, so support was never available to it.
 */
export function canSupport(card: Card, tower: Tower): boolean {
  if (card.kind !== 'standard') return false
  if (!isBuildableRank(card.rank)) return true

  return card.rank === tower.cardRank
}

/**
 * Applies one suit's support action to a Tower.
 *
 * Supports stack additively with no cap — capping them is known future work and
 * deliberately out of scope here.
 *
 * **Nothing scales with rank.** Not the Card's, not the Tower's: every ♠ adds
 * `SPADE_HEALTH` wherever it lands. `multiplier` is 1 for a matched numbered
 * Card and `FACE_SUPPORT_PREMIUM` for a face card, which is the only reason two
 * plays of the same suit ever differ. ♥ ignores it entirely — see below.
 */
export function applySupport(tower: Tower, suit: Suit, multiplier: number): Tower {
  switch (suit) {
    // A FULL restore, deliberately ignoring the multiplier. Rank-scaled repair
    // made ♥ strictly worse than ♠, which heals by the same amount AND raises
    // the ceiling. Healing to full instead gives each suit a job no other suit
    // does: ♥ is the emergency restore, ♠ the incremental growth.
    case 'hearts':
      return { ...tower, health: tower.maxHealth }

    // Floored, and not for balance: `fireTowers` loops
    // `while (cooldown >= fireIntervalMs)`, so zero would never terminate — and
    // a flat subtraction really does reach zero if enough ♦ are stacked.
    case 'diamonds':
      return {
        ...tower,
        fireIntervalMs: Math.max(
          MIN_FIRE_INTERVAL_MS,
          tower.fireIntervalMs - DIAMOND_SPEED_MS * multiplier,
        ),
      }

    // Raises current and maximum health together, as a King does for the Core.
    // Moving the ceiling alone left `health / maxHealth` lower than it started,
    // and that ratio is the renderer's only signal for damage — so a ♠ darkened
    // the Tower exactly as a hit does, and stacking two could trip the critical
    // pulse on a Tower that had never been touched. That was issue #14.
    case 'spades': {
      const gain = SPADE_HEALTH * multiplier

      return { ...tower, health: tower.health + gain, maxHealth: tower.maxHealth + gain }
    }

    // No rounding and no floor: the values in data/cards.ts are chosen so the
    // face premium lands on a whole number.
    case 'clubs':
      return { ...tower, damage: tower.damage + CLUB_DAMAGE * multiplier }
  }
}
