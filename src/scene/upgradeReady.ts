import { pendingUpgrades, totalUpgrades, type Tower } from '../game'

/**
 * Whether a Tower has banked, unspent upgrades — the "ready to upgrade"
 * signal issue #67 asks the scene to draw.
 *
 * Kept out of the component so the decision is testable: the `.tsx` filters
 * with this predicate and is pure plumbing.
 */
export function isUpgradeReady(tower: Tower): boolean {
  return pendingUpgrades(tower.kills, totalUpgrades(tower.upgradeCounts)) > 0
}
