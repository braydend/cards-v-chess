import type { TowerTypeId } from '../game'

/**
 * One colour per Tower TYPE, so a Tower's firing geometry is readable at a
 * glance.
 *
 * Kept in its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows up
 * as a full reload on every edit instead of a hot update.
 *
 * `Towers.tsx` and `firePulse.ts` are the consumers so far, and nothing
 * duplicates these values in `index.css`. Any future UI wanting a tower type's
 * colour must import it from here rather than restating the hex.
 */
export const TOWER_COLOURS: Record<TowerTypeId, string> = {
  vertical: '#16a085',
  wall: '#e67e22',
  sniper: '#2e86c1',
  diagonal: '#d4ac0d',
  cross: '#8e44ad',
  star: '#c0392b',
  splash: '#2980b9',
  ring: '#27ae60',
  tollgate: '#7f8c8d',
}
