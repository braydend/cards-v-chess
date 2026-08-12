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
}

/**
 * Every tower type, in rarity order.
 *
 * `sniper` reuses the `vertical` geometry at a long range — one file, high
 * single-target damage, slow. `splash` reuses `adjacent` at range 1 — the
 * eight neighbours, hit in a small burst. Both are new TYPES; their shapes
 * are built from existing geometries so `coverage.ts` needs no new cases.
 * `ring` hits EVERYTHING its ring covers (the old Amplifier, now dealing
 * damage directly). `tollgate` is the full-width band.
 */
export const TOWER_TYPES: Record<TowerTypeId, TowerTypeDef> = {
  vertical: { geometry: 'vertical', range: 5, damage: 2, fireIntervalMs: 500, maxHealth: 14, targetsPerShot: 1 },
  wall: { geometry: 'none', range: 0, damage: 0, fireIntervalMs: 1000, maxHealth: 45, targetsPerShot: 0 },
  sniper: { geometry: 'vertical', range: 7, damage: 4, fireIntervalMs: 800, maxHealth: 18, targetsPerShot: 1 },
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
