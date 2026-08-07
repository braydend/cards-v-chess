import type { PieceTier } from '../game'

/**
 * One colour per tier — now the PIECE BODY colour, since the tier is what a
 * piece's colour carries. Shape carries the type (the models are distinct per
 * type); colour carries the difficulty tier. Green is the baseline tier.
 *
 * Deliberately disjoint from `RANK_COLOURS`, and from the King-buff ring, so a
 * Piece never reads as a Tower and a buffed Piece's aura ring stays visible on
 * its own body. `tierColours.test.ts` guards all of it.
 */
export const TIER_COLOURS: Record<PieceTier, string> = {
  green: '#2ecc71',
  yellow: '#f4d03f',
  red: '#e74c3c',
  black: '#2c3e50',
}
