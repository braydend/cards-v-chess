import {
  UPGRADE_FIRST_THRESHOLD,
  UPGRADE_SECOND_THRESHOLD,
  UPGRADE_THRESHOLD_ESCALATION,
} from '../data/towerTypes'
import { isTerminal } from './phase'
import type { GameState, Tower, UpgradeStat } from './types'

/**
 * Kills needed to bank the `n`th upgrade.
 *
 * The first banks at `UPGRADE_FIRST_THRESHOLD` (10), the second at
 * `UPGRADE_SECOND_THRESHOLD` (22), and each next threshold after that is the
 * previous one escalated by `UPGRADE_THRESHOLD_ESCALATION` (20%), ceiled —
 * 10, 22, 27, 33, 40, ... `ceil` keeps a fractional threshold from ever
 * demanding a fractional kill count.
 */
export function upgradeThreshold(n: number): number {
  let threshold = n === 1 ? UPGRADE_FIRST_THRESHOLD : UPGRADE_SECOND_THRESHOLD
  for (let i = 2; i < n; i += 1) {
    threshold = Math.ceil(threshold * UPGRADE_THRESHOLD_ESCALATION)
  }
  return threshold
}

/**
 * How many upgrade thresholds a kill count clears.
 *
 * A Tower at 33 kills has cleared 10, 22 and 27 — three upgrades owed before
 * any are spent. Iterates the threshold sequence rather than deriving a
 * closed form, so the escalation stays in the data file and this stays the
 * single place that walks it.
 */
export function thresholdsCleared(kills: number): number {
  let cleared = 0
  while (kills >= upgradeThreshold(cleared + 1)) {
    cleared += 1
  }
  return cleared
}

/**
 * Upgrades banked but unspent.
 *
 * Derived, never stored: kills are the XP source, `upgradesSpent` the only
 * bookkeeping, and the count is `thresholdsCleared(kills) - upgradesSpent`,
 * clamped at 0 so an over-spent Tower (impossible through the engine, possible
 * through a hand-built test state) never reports a negative balance.
 */
export function pendingUpgrades(kills: number, upgradesSpent: number): number {
  return Math.max(0, thresholdsCleared(kills) - upgradesSpent)
}

/**
 * Spends one pending upgrade on a Tower stat.
 *
 * Refuses (returns the state unchanged) on a terminal phase, a missing Tower,
 * the Wall — which can never earn an upgrade, checked explicitly so a
 * hand-built test state cannot slip one through — an empty pending balance, or
 * a `fireRate` spend whose result would drive the interval to 0 or below (a
 * 0ms interval would hang the engine's firing loop in `tick.ts`). A refused
 * fire-rate spend leaves the upgrade pending, so the player can still spend it
 * on `damage` or `health`.
 *
 * The three spends:
 * - `damage`: +1, flat and stackable.
 * - `fireRate`: `fireIntervalMs - 0.1 * fireIntervalBaseMs`, additive off the
 *   base so every pick is a true 10% of the type's original interval.
 * - `health`: +10% of the CURRENT maxHealth added to BOTH maxHealth and
 *   health, so the heal is exactly the ceiling's rise (10/14 -> 15.4/11.4),
 *   never more and never less.
 *
 * Every spend increments `upgradesSpent`, so the next `pendingUpgrades` call
 * sees one fewer upgrade banked.
 */
export function upgradeTower(state: GameState, towerId: string, stat: UpgradeStat): GameState {
  if (isTerminal(state.phase)) return state

  const tower = state.towers.find((candidate) => candidate.id === towerId)
  if (!tower) return state
  if (tower.type === 'wall') return state
  if (pendingUpgrades(tower.kills, tower.upgradesSpent) < 1) return state
  if (stat === 'fireRate' && tower.fireIntervalMs - 0.1 * tower.fireIntervalBaseMs <= 0) return state

  return {
    ...state,
    towers: state.towers.map((candidate) =>
      candidate.id === towerId ? applyUpgrade(candidate, stat) : candidate,
    ),
  }
}

/** The stat change for one spend, on the old Tower's values. */
function applyUpgrade(tower: Tower, stat: UpgradeStat): Tower {
  const spent = { ...tower, upgradesSpent: tower.upgradesSpent + 1 }
  switch (stat) {
    case 'damage':
      return { ...spent, damage: tower.damage + 1 }
    case 'fireRate':
      return { ...spent, fireIntervalMs: tower.fireIntervalMs - 0.1 * tower.fireIntervalBaseMs }
    case 'health': {
      const gained = 0.1 * tower.maxHealth
      return { ...spent, maxHealth: tower.maxHealth + gained, health: tower.health + gained }
    }
  }
}
