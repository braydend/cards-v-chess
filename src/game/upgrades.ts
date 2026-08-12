import { UPGRADE_FIRST_THRESHOLD, UPGRADE_THRESHOLD_ESCALATION } from '../data/towerTypes'

/**
 * Kills needed to bank the `n`th upgrade.
 *
 * The first banks at `UPGRADE_FIRST_THRESHOLD` (10); each next threshold is
 * the previous one escalated by `UPGRADE_THRESHOLD_ESCALATION` (20%), ceiled —
 * 10, 12, 15, 18, 22, ... `ceil` keeps a fractional threshold from ever
 * demanding a fractional kill count.
 */
export function upgradeThreshold(n: number): number {
  let threshold = UPGRADE_FIRST_THRESHOLD
  for (let i = 1; i < n; i += 1) {
    threshold = Math.ceil(threshold * UPGRADE_THRESHOLD_ESCALATION)
  }
  return threshold
}

/**
 * How many upgrade thresholds a kill count clears.
 *
 * A Tower at 23 kills has cleared 10, 12, 15, 18 and 22 — five upgrades owed
 * before any are spent. Iterates the threshold sequence rather than deriving
 * a closed form, so the escalation stays in the data file and this stays the
 * single place that walks it.
 */
export function thresholdsCleared(kills: number): number {
  let cleared = 0
  let next = UPGRADE_FIRST_THRESHOLD
  while (kills >= next) {
    cleared += 1
    next = Math.ceil(next * UPGRADE_THRESHOLD_ESCALATION)
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
