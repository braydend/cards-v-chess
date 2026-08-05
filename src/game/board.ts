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

/**
 * One step from `from` toward `to`, moving along whichever axis has further to
 * travel.
 *
 * Placeholder pathing, applied uniformly to every Piece. The designed roster
 * gives each Piece type its own movement character — the Knight changing square
 * colour on every hop is load-bearing, since that is when it can be damaged.
 * None of that is implemented here. See CLAUDE.md.
 */
export function stepToward(from: Square, to: Square): Square {
  const fileDelta = to.file - from.file
  const rankDelta = to.rank - from.rank

  if (Math.abs(rankDelta) >= Math.abs(fileDelta)) {
    return { file: from.file, rank: from.rank + Math.sign(rankDelta) }
  }
  return { file: from.file + Math.sign(fileDelta), rank: from.rank }
}

/** Every square on the board, in file-major order. */
export function allSquares(board: BoardSpec): Square[] {
  const squares: Square[] = []
  for (let rank = 0; rank < board.ranks; rank += 1) {
    for (let file = 0; file < board.files; file += 1) {
      squares.push({ file, rank })
    }
  }
  return squares
}
