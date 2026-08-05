import { pieceType } from '../data/pieceTypes'
import type { Piece, Square } from './types'

/**
 * Aura effects, derived from Piece positions.
 *
 * Every function here reads the Piece list as it stood at the start of a tick
 * and returns a result, so nothing depends on the order Pieces are processed
 * in — the same discipline `tick.ts` applies to its Tower map.
 */

/** Move interval multiplier for a Piece standing beside a King. Lower is faster. */
export const KING_SPEED_MULTIPLIER = 0.7

/** Extra squares per hop a King grants an adjacent slider. */
export const KING_SLIDE_BONUS = 1

export const BISHOP_HEAL_INTERVAL_MS = 1500
export const BISHOP_HEAL_AMOUNT = 2
export const BISHOP_HEAL_RADIUS = 2

const NONE: ReadonlySet<string> = new Set()

/** Squares of king-move distance between two squares. */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank))
}

/**
 * Every Piece currently standing beside a King.
 *
 * Membership, not a count: the aura deliberately does **not** stack, so two
 * Kings buff exactly as much as one. A King never buffs itself.
 */
export function buffedPieceIds(pieces: readonly Piece[]): ReadonlySet<string> {
  const kings = pieces.filter((piece) => piece.typeId === 'king')
  if (kings.length === 0) return NONE

  const buffed = new Set<string>()

  for (const piece of pieces) {
    if (piece.typeId === 'king') continue
    if (kings.some((king) => chebyshev(king.square, piece.square) === 1)) buffed.add(piece.id)
  }

  return buffed
}

/** Whether a Piece type gains slide distance from a King. */
export function slideBonusFor(piece: Piece, buffed: ReadonlySet<string>): number {
  if (!buffed.has(piece.id)) return 0
  return pieceType(piece.typeId).slides ? KING_SLIDE_BONUS : 0
}
