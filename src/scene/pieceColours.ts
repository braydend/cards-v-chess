import type { PieceTypeId } from '../game'

export const CHESS_COLOUR = '#c0392b'

/**
 * One colour per Piece type. The Bishop and King are priority targets — the
 * healer and the commander — so they read differently from the rest of the
 * roster, which shares `CHESS_COLOUR`.
 *
 * Kept in its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows
 * up as a full reload on every edit instead of a hot update. Same precedent
 * `rankColours.ts` already sets for the Tower side.
 *
 * Deliberately disjoint from every `RANK_COLOURS` value: Pieces are the
 * invading faction and Towers are the defending one, and a Piece that reads
 * as a Tower at a glance is a legibility bug, not a palette nicety.
 * `pieceColours.test.ts` guards this.
 */
export const PIECE_COLOURS: Record<PieceTypeId, string> = {
  pawn: CHESS_COLOUR,
  knight: CHESS_COLOUR,
  bishop: '#f1948a',
  rook: CHESS_COLOUR,
  queen: CHESS_COLOUR,
  king: '#e67e22',
}
