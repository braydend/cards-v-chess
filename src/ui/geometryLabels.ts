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
 * Every geometry on the 2–10 ladder in `src/data/towerRanks.ts` must appear
 * here. `horizontal` is currently unreachable — rank 2 was moved off it, and
 * rank 10's toll gate is a `band` rather than a `horizontal` because it is
 * bounded in board ranks but not in files. It is still in the union, and
 * `Record` will not let it be dropped.
 */
export const GEOMETRY_LABELS: Record<TowerGeometry, string> = {
  // "the eight squares around it" is only literally true at range 1: rank 2
  // covers exactly the ring of eight. Rank 9 also builds `adjacent`, but at
  // range 2 — a 5x5 disc of 24 squares, not a ring of eight.
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
