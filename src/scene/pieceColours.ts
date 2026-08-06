import type { PieceTypeId } from '../game'

export const CHESS_COLOUR = '#7b241c'

/**
 * One colour per Piece type. The Bishop and King are priority targets — the
 * healer and the commander — so they read differently from the rest of the
 * roster, which shares `CHESS_COLOUR`.
 *
 * The Queen also gets her own. Promotion — a Pawn becoming a Queen — is the
 * single most important state change a player needs to read at a glance, and
 * before this the two shared `CHESS_COLOUR` and differed only by a taller,
 * higher-segment `ConeGeometry` (see `Pieces.tsx`) — the least distinguishable
 * pair on the board for the one transition that most needs to read instantly.
 * `#a93226` is a deeper, darker crimson than the Pawn's `#c0392b`: still
 * unmistakably warm — every Chess Piece is — but far enough from the Pawn,
 * and from the Bishop's and King's own colours below, to read as a change of
 * state rather than a shade of the same one.
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
  queen: '#a93226',
  king: '#af601a',
}
