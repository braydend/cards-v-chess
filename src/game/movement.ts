import { isInBounds, squareKey, squaresEqual } from './board'
import type { BoardSpec, Piece, PieceTypeId, Square, Tower } from './types'

/**
 * What a Piece does when its move interval elapses.
 *
 * `stuck` means the Piece has no legal move. That is a real chess outcome — a
 * pawn that reaches the far rank has nowhere left to go — and it is why round
 * completion cannot simply wait for the board to empty.
 */
export type MoveOutcome =
  | { readonly kind: 'move'; readonly to: Square }
  | { readonly kind: 'attackTower'; readonly towerId: string }
  | { readonly kind: 'reachCore' }
  | { readonly kind: 'stuck' }

/**
 * Pieces advance from the far rank toward rank 0, so "forward" is one rank down.
 */
const FORWARD = -1

/**
 * Resolves one move for a Piece using **chess movement**, not a walk toward the
 * Core.
 *
 * The consequence is deliberate and significant: a Piece can only threaten the
 * Core if chess movement can actually bring it there. A pawn is confined to its
 * file, so only the Core's own file and the two diagonally adjacent to it are
 * dangerous. Every other pawn marches to the back rank and stops.
 */
export function nextMove(
  typeId: PieceTypeId,
  from: Square,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  switch (typeId) {
    case 'pawn':
      return pawnMove(from, board, coreSquare, towerBySquare)
  }
}

/**
 * A pawn advances one square down its file, and captures diagonally forward.
 *
 * Only the Core is captured diagonally. A Tower off the diagonal is ignored
 * while the path ahead is clear, because the pawn's job is to advance — it has
 * no reason to detour.
 */
function pawnMove(
  from: Square,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  const forwardRank = from.rank + FORWARD

  // Diagonal capture of the Core, exactly as a pawn takes in chess.
  for (const fileOffset of [-1, 1]) {
    if (squaresEqual({ file: from.file + fileOffset, rank: forwardRank }, coreSquare)) {
      return { kind: 'reachCore' }
    }
  }

  const ahead: Square = { file: from.file, rank: forwardRank }

  if (squaresEqual(ahead, coreSquare)) return { kind: 'reachCore' }
  if (!isInBounds(board, ahead)) return { kind: 'stuck' }

  // A Tower in the way stops the pawn, which attacks it instead of advancing.
  const blocker = towerBySquare.get(squareKey(ahead))
  if (blocker) return { kind: 'attackTower', towerId: blocker.id }

  return { kind: 'move', to: ahead }
}

/** Whether a Piece has no legal move and so can never act again. */
export function isStuck(
  piece: Piece,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): boolean {
  return nextMove(piece.typeId, piece.square, board, coreSquare, towerBySquare).kind === 'stuck'
}
