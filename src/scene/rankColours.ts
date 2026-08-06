import type { BuildableRank } from '../game'

/**
 * One colour per Card rank, so a Tower's firing geometry is readable at a
 * glance.
 *
 * Kept in its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows up
 * as a full reload on every edit instead of a hot update.
 *
 * `Towers.tsx` and `firePulse.ts` are the consumers so far, and nothing
 * duplicates these values in `index.css` — the Deck identifies a Card by suit
 * and rank, not by tower colour. Any future UI wanting a rank's colour must
 * import it from here rather than restating the hex.
 */
export const RANK_COLOURS: Record<BuildableRank, string> = {
  2: '#2e86c1',
  3: '#16a085',
  4: '#8e44ad',
  5: '#d4ac0d',
  6: '#c0392b',
  7: '#e67e22',
  8: '#2980b9',
  9: '#27ae60',
  10: '#7f8c8d',
}
