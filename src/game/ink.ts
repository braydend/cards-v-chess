/**
 * Every Ink calculation, in one pure place.
 *
 * `tick.ts` and `cardPlays.ts` call these and apply the result; neither does
 * the arithmetic itself. Ink is an integer — the player reads it, and a
 * currency shown with decimals is noise — so anything that could produce a
 * fraction floors here rather than at the call site.
 *
 * Income is event-driven by construction: nothing in this file takes a time
 * delta. The gap between rounds is untimed, so time-based income would be
 * unbounded and the player would simply wait.
 */
import { JOKER_CLEAR_SHARE, ROUND_INCOME_BASE, ROUND_INCOME_PER_ROUND } from '../data/ink'
import { pieceType } from '../data/pieceTypes'
import type { Piece } from './types'

/** Ink paid for destroying one Piece. */
export function killReward(piece: Piece): number {
  return pieceType(piece.typeId).inkReward
}

/** Ink paid for destroying all of these Pieces. */
export function totalKillReward(pieces: readonly Piece[]): number {
  return pieces.reduce((total, piece) => total + killReward(piece), 0)
}

/**
 * The lump sum for completing a round.
 *
 * Pass the round just PLAYED, never the one about to start. `tick` increments
 * `roundNumber` in the same branch that pays this, so reading the incremented
 * value is the easiest mistake available here.
 */
export function roundIncome(roundNumber: number): number {
  return ROUND_INCOME_BASE + roundNumber * ROUND_INCOME_PER_ROUND
}

/**
 * Ink paid by a Joker's Clear for the Pieces it destroyed.
 *
 * THE FLOOR APPLIES TO THE TOTAL, NEVER PER PIECE. At a quarter share a Pawn
 * is worth 0.25, so flooring each Piece would pay nothing at all for a swarm
 * of twenty — nothing for exactly the chaff a Clear is used on. Flooring the
 * total pays 5 for those twenty. `ink.test.ts` pins this.
 */
export function clearReward(pieces: readonly Piece[]): number {
  return Math.floor(totalKillReward(pieces) * JOKER_CLEAR_SHARE)
}
