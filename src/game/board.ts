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
