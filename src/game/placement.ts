/**
 * Where a Tower may stand.
 *
 * One rule, in one place, because it has two very different callers: the play
 * handlers in `cardPlays.ts` refuse an illegal build, and `CoveragePreview`
 * marks an illegal square before the player clicks it. A predicate with a
 * second, narrower copy in the renderer would disagree with the engine and
 * have to be kept in sync by hand.
 */
import { isInBounds, squaresEqual } from './board'
import type { GameState, Square } from './types'

/**
 * Whether a square is free to build on.
 *
 * The Piece clause is not cosmetic. Towers block movement, and a blocked Piece
 * attacks the Tower instead of advancing — so a Piece sharing a Tower's square
 * is one that walked through what should have stopped it. Building underneath a
 * Piece manufactures exactly that state, which is why it is refused.
 *
 * Occupancy reads `piece.square` and nothing else. `prevSquare` exists only so
 * the renderer can interpolate a hop, and the engine does not read it: a Piece
 * that has just hopped frees its old square immediately, even though the
 * renderer is still animating it leaving. See the spec for why the alternative
 * loses.
 */
export function canBuildOn(state: GameState, square: Square): boolean {
  if (!isInBounds(state.board, square)) return false
  if (squaresEqual(square, state.core.square)) return false
  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return false

  return !state.pieces.some((piece) => squaresEqual(piece.square, square))
}
