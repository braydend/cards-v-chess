import { TOWER_TYPE_IDS, type TowerTypeId } from '../data/towerTypes'

/**
 * The tower cylinder's radii and radial segment count — the same geometry the
 * live Towers render, shared so the placement ghost matches them by
 * construction rather than by restating the numbers.
 *
 * Lives in a pure module, not in a component file: exporting a non-component
 * value from a `.tsx` breaks React Fast Refresh (see the note in
 * `rankColours.ts`), and `towerHeight` was already duplicated across
 * `Towers.tsx` and `UpgradeReady.tsx`.
 */
export const TOWER_RADIUS_TOP = 0.24
export const TOWER_RADIUS_BOTTOM = 0.32
export const TOWER_SEGMENTS = 6

/**
 * The tower's body height by type — size is a legibility signal, so it must
 * stay a single function both the live render and the ghost agree on.
 */
export function towerHeight(type: TowerTypeId): number {
  return 0.55 + TOWER_TYPE_IDS.indexOf(type) * 0.08
}