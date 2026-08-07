import type { PieceTier } from '../game'

/**
 * One colour per tier, for the base ring that marks a Piece's tier. Green is
 * the baseline and gets no ring, so it has no colour here.
 *
 * The marker is INTERIM — the issue anticipates real per-tier assets later.
 * Deliberately disjoint from `PIECE_COLOURS`, `RANK_COLOURS`, and the King-buff
 * ring, so the marker never reads as a Piece type, a Tower, or a buff. The
 * buff ring and a tier ring can sit on the same Piece at once; they must read
 * as different things.
 */
export const TIER_COLOURS: Record<Exclude<PieceTier, 'green'>, string> = {
  yellow: '#f4d03f',
  red: '#e74c3c',
  black: '#2c3e50',
}
