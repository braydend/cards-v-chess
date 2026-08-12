import type { TowerGeometry } from '../game'

/**
 * Player-facing description of each firing geometry.
 *
 * Keyed by `TowerGeometry` rather than `string`, so adding a geometry to the
 * union is a compile error here instead of a missing label at runtime.
 *
 * It lived inline in `Hud.tsx`, beside the rank picker that has since been
 * replaced by the Deck. The Tower inspect panel is the consumer now.
 *
 * Every geometry on the tower types in `src/data/towerTypes.ts` must appear
 * here. `horizontal` is currently unreachable — no tower type builds it — and
 * the toll gate's band is a `band` rather than a `horizontal` because it is
 * bounded in board ranks but not in files. It is still in the union, and
 * `Record` will not let it be dropped.
 */
export const GEOMETRY_LABELS: Record<TowerGeometry, string> = {
  // "the eight squares around it" is only literally true at range 1 — splash
  // covers exactly the ring of eight. No other tower type builds `adjacent`,
  // so it cannot be reached at a wider spread.
  adjacent: 'Hits every square around it',
  horizontal: 'Fires along its rank',
  vertical: 'Fires along its file',
  cross: 'Fires along rank and file',
  diagonal: 'Fires along diagonals — one colour only',
  star: 'Fires along rank, file and diagonals',
  none: 'Never fires — it blocks and soaks',
  ring: 'Hits at a distance, blind at its feet',
  band: 'Fires across the full width of the board',
}
