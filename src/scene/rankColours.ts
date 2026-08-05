import type { CardRank } from '../game'

/**
 * One colour per Card rank, so a Tower's firing geometry is readable at a
 * glance.
 *
 * Kept in its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows up
 * as a full reload on every edit instead of a hot update.
 *
 * The HUD's rank buttons currently repeat these values in `index.css`. If they
 * drift, move the buttons to inline styles fed from here.
 */
export const RANK_COLOURS: Record<CardRank, string> = {
  2: '#2e86c1',
  3: '#16a085',
  4: '#8e44ad',
  5: '#d4ac0d',
}
