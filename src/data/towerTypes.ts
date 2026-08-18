import type { TowerGeometry } from '../game/types'

/**
 * What each poker hand's tower is. Keyed by tower type, NOT by card rank —
 * the hand ladder is the roster (see the poker-hands spec).
 *
 * PLACEHOLDER balance numbers; the shapes, the order, and the hand→tower
 * mapping are the design. Order here IS rarity order, weakest first:
 * high card, pair, two pair, three of a kind, straight, flush, full house,
 * four of a kind, straight flush.
 */
export type TowerTypeId =
  | 'vertical'
  | 'wall'
  | 'sniper'
  | 'diagonal'
  | 'cross'
  | 'star'
  | 'splash'
  | 'ring'
  | 'tollgate'

export interface TowerTypeDef {
  /** Squares along the pattern, not straight-line distance. */
  readonly geometry: TowerGeometry
  readonly range: number
  readonly damage: number
  readonly fireIntervalMs: number
  readonly maxHealth: number
  readonly targetsPerShot: number
  /**
   * Whether the Tower's shot passes through other Towers standing between it
   * and its target. `isOccluded` is skipped for it in every caller — the
   * targeting in `selectTargets`, the footprint in `reachableSquares`, and
   * the fire pulse in `firePulse.ts` — so its footprint and its shots always
   * agree. Only the Sniper carries it. The Staging-rank bounds check is a
   * separate rule and is NOT exempted.
   */
  readonly ignoresOcclusion?: boolean
}

/**
 * Every tower type, in rarity order.
 *
 * `sniper` is the two-pair Tower: a filled radius-6 disc (`adjacent`
 * geometry) that sees through friendly Towers — one target per shot, slow, so
 * its reach is bought at thin throughput. `splash` reuses `adjacent` at range
 * 1 — the eight neighbours, hit in a small burst. Both are new TYPES; their
 * shapes are built from existing geometries so `coverage.ts` needs no new
 * cases. `ring` hits EVERYTHING its ring covers (the old Amplifier, now
 * dealing damage directly). `tollgate` is the full-width band.
 */
export const TOWER_TYPES: Record<TowerTypeId, TowerTypeDef> = {
  vertical: { geometry: 'vertical', range: 5, damage: 2, fireIntervalMs: 700, maxHealth: 14, targetsPerShot: 1 },
  wall: { geometry: 'none', range: 0, damage: 0, fireIntervalMs: 1000, maxHealth: 45, targetsPerShot: 0 },
  sniper: { geometry: 'adjacent', range: 6, damage: 4, fireIntervalMs: 800, maxHealth: 18, targetsPerShot: 1, ignoresOcclusion: true },
  diagonal: { geometry: 'diagonal', range: 5, damage: 2, fireIntervalMs: 550, maxHealth: 22, targetsPerShot: 1 },
  cross: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 24, targetsPerShot: 1 },
  star: { geometry: 'star', range: 3, damage: 2, fireIntervalMs: 600, maxHealth: 26, targetsPerShot: 1 },
  splash: { geometry: 'adjacent', range: 1, damage: 2, fireIntervalMs: 600, maxHealth: 28, targetsPerShot: 5 },
  ring: { geometry: 'ring', range: 4, damage: 1, fireIntervalMs: 700, maxHealth: 30, targetsPerShot: Number.POSITIVE_INFINITY },
  tollgate: { geometry: 'band', range: 1, damage: 1, fireIntervalMs: 800, maxHealth: 38, targetsPerShot: Number.POSITIVE_INFINITY },
}

export function towerType(id: TowerTypeId): TowerTypeDef {
  return TOWER_TYPES[id]
}

/** Every tower type, in rarity order. */
export const TOWER_TYPE_IDS: readonly TowerTypeId[] = [
  'vertical', 'wall', 'sniper', 'diagonal', 'cross', 'star', 'splash', 'ring', 'tollgate',
]

/**
 * Tower experience upgrades (issue #67).
 *
 * PLACEHOLDER tuning numbers; the shape is the design. The first upgrade
 * banks at `UPGRADE_FIRST_THRESHOLD` kills, the second at
 * `UPGRADE_SECOND_THRESHOLD`, and each next threshold after that is the
 * previous one escalated by `UPGRADE_THRESHOLD_ESCALATION`, ceiled — so the
 * milestones run 10, 22, 27, 33, 40, ... The second milestone is its own
 * constant rather than derived, because `ceil(10 * 1.2)` is 12, not 22 — the
 * jump from the first to the second is deliberately larger than the steady
 * 20% climb that follows. Kills are the only XP source, so the Wall — which
 * never fires — can never earn one.
 */
export const UPGRADE_FIRST_THRESHOLD = 10
export const UPGRADE_SECOND_THRESHOLD = 22
export const UPGRADE_THRESHOLD_ESCALATION = 1.2

/**
 * Hard cap on total upgrades a single Tower can spend (issue #59).
 *
 * Uniform across types. A capped Tower keeps earning kills and keeps crossing
 * thresholds, but the derived pending balance is clamped to 0, so it stops
 * glowing and the panel reports "Upgrades maxed". PLACEHOLDER tuning number;
 * the cap is the design.
 */
export const MAX_UPGRADES_PER_TOWER = 10
