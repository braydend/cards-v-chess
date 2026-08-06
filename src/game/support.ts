import {
  MAGNITUDE_PER_DAMAGE,
  MIN_FIRE_INTERVAL_MS,
  SPEED_MS_PER_MAGNITUDE,
} from '../data/cards'
import type { Suit, Tower } from './types'

/**
 * Applies one suit's support action to a Tower.
 *
 * Supports stack additively with no cap. Magnitude scales with the Card's rank,
 * so a 9♥ is a large repair and a 2♥ a small one.
 */
export function applySupport(tower: Tower, suit: Suit, magnitude: number): Tower {
  switch (suit) {
    // Restores lost health, never past the ceiling.
    case 'hearts':
      return { ...tower, health: Math.min(tower.maxHealth, tower.health + magnitude) }

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

    // Raises the ceiling WITHOUT healing. That is what keeps ♠ distinct from ♥:
    // ♠ grows the ceiling, ♥ fills it. A ♠ on a damaged Tower gives headroom
    // for a later ♥.
    case 'spades':
      return { ...tower, maxHealth: tower.maxHealth + magnitude }

    // Divided down because raw magnitude would be enormous against a rank-2
    // Tower's damage of 1. Always at least 1, so no ♣ is ever wasted.
    case 'clubs':
      return {
        ...tower,
        damage: tower.damage + Math.max(1, Math.round(magnitude / MAGNITUDE_PER_DAMAGE)),
      }
  }
}
