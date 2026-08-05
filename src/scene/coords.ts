import type { BoardSpec } from '../game'

export const SQUARE_SIZE = 1

/**
 * Scalar converters rather than tuple-returning helpers, specifically so the
 * frame loop can call them without allocating. Returning `[x, y, z]` here would
 * mean a fresh array per piece per frame — the exact garbage-collection
 * pressure CLAUDE.md warns about.
 */
export function fileToWorldX(board: BoardSpec, file: number): number {
  return (file - (board.files - 1) / 2) * SQUARE_SIZE
}

export function rankToWorldZ(board: BoardSpec, rank: number): number {
  return (rank - (board.ranks - 1) / 2) * SQUARE_SIZE
}

export function worldXToFile(board: BoardSpec, x: number): number {
  return Math.round(x / SQUARE_SIZE + (board.files - 1) / 2)
}

export function worldZToRank(board: BoardSpec, z: number): number {
  return Math.round(z / SQUARE_SIZE + (board.ranks - 1) / 2)
}
