import type { BoardSpec, Square } from './types'

export function squaresEqual(a: Square, b: Square): boolean {
  return a.file === b.file && a.rank === b.rank
}

/** Stable string form of a square, for map keys and React keys. */
export function squareKey(square: Square): string {
  return `${square.file},${square.rank}`
}

export function isInBounds(board: BoardSpec, square: Square): boolean {
  return (
    square.file >= 0 && square.file < board.files && square.rank >= 0 && square.rank < board.ranks
  )
}

/** Every square on the board, in rank-major order (rank outer, file inner). */
export function allSquares(board: BoardSpec): Square[] {
  const squares: Square[] = []
  for (let rank = 0; rank < board.ranks; rank += 1) {
    for (let file = 0; file < board.files; file += 1) {
      squares.push({ file, rank })
    }
  }
  return squares
}

/**
 * The off-board rank Pieces spawn onto, one past the board's last rank.
 *
 * **Never a board square**, and that is the whole point: `isInBounds` is false
 * here, so `canBuildOn` refuses it without needing a clause of its own and a
 * Tower can never stand where a Piece appears. Entry to the board is then an
 * ordinary hop, which the existing rule already covers — a Piece whose next
 * square holds a Tower grinds it rather than advancing.
 *
 * Derived from `board` rather than a constant, like every other board extent:
 * an Ace grows the board and the Staging rank moves up with it.
 */
export function stagingRank(board: BoardSpec): number {
  return board.ranks
}
