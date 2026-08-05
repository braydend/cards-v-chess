import type { TowerGeometry } from '../game'

/**
 * Player-facing description of each firing geometry.
 *
 * Keyed by `TowerGeometry` rather than `string`, so adding a geometry to the
 * union is a compile error here instead of a missing label at runtime.
 *
 * Shared by the HUD's rank picker and the Tower inspect panel. It lived in
 * `Hud.tsx` until both needed it.
 */
export const GEOMETRY_LABELS: Record<TowerGeometry, string> = {
  adjacent: 'Hits the eight squares around it',
  horizontal: 'Fires along its rank',
  vertical: 'Fires along its file',
  cross: 'Fires along rank and file',
  diagonal: 'Fires along diagonals — one colour only',
}
