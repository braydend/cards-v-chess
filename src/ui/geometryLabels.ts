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
 * here. `horizontal` is currently unreachable — rank 2 was moved off it — but it
 * is still in the union, and `Record` will not let it be dropped.
 */
export const GEOMETRY_LABELS: Record<TowerGeometry, string> = {
  // "the eight squares around it" until the ladder grew: ranks 7, 9 and 10 are
  // adjacent at range 3–4, which is a disc, not a ring of eight.
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
