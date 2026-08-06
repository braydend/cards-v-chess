import {
  MAGNITUDE_PER_DAMAGE,
  MIN_FIRE_INTERVAL_MS,
  SPEED_MS_PER_MAGNITUDE,
} from '../data/cards'
import type { Suit, Tower } from './types'

/**
 * Applies one suit's support action to a Tower.
 *
 * Supports stack additively with no cap. Magnitude scales with the Card's rank
 * for ♦ ♠ ♣ — so a 9♠ is a large buff and a 2♠ a small one — but ♥ is a full
 * restore and ignores it entirely. See the ♥ case for why.
 */
export function applySupport(tower: Tower, suit: Suit, magnitude: number): Tower {
  switch (suit) {
    // A FULL restore, deliberately ignoring magnitude. Rank-scaled repair made
    // ♥ strictly worse than ♠, which heals by the same magnitude AND raises the
    // ceiling. Healing to full instead gives each suit a job no other suit
    // does: ♥ is the emergency restore, ♠ the incremental growth. It also makes
    // rank matter in the other direction — a low ♥ repairs exactly as well as a
    // high one, so the high card is better spent building.
    case 'hearts':
      return { ...tower, health: tower.maxHealth }

    // Floored, and not for balance: `fireTowers` loops
    // `while (cooldown >= fireIntervalMs)`, so zero would never terminate.
    case 'diamonds':
      return {
        ...tower,
        fireIntervalMs: Math.max(
          MIN_FIRE_INTERVAL_MS,
          tower.fireIntervalMs - magnitude * SPEED_MS_PER_MAGNITUDE,
        ),
      }

    // Raises current and maximum health together, as a King does for the Core.
    // Moving the ceiling alone left `health / maxHealth` lower than it started,
    // and that ratio is the renderer's only signal for damage — so a ♠ darkened
    // the Tower exactly as a hit does, and stacking two could trip the critical
    // pulse on a Tower that had never been touched. That was issue #14.
    case 'spades':
      return {
        ...tower,
        health: tower.health + magnitude,
        maxHealth: tower.maxHealth + magnitude,
      }

    // Divided down because raw magnitude would be enormous against a rank-2
    // Tower's damage of 1. Always at least 1, so no ♣ is ever wasted.
    case 'clubs':
      return {
        ...tower,
        damage: tower.damage + Math.max(1, Math.round(magnitude / MAGNITUDE_PER_DAMAGE)),
      }
  }
}
