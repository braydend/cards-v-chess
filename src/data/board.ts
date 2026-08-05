import type { BoardSpec, Square } from '../game/types'

/**
 * Board geometry is settled as *growable*, starting at 8x8. An Ace grows the
 * board by a rank, so the board size is not fixed for the run.
 *
 * Note when revisiting: square colour is decoration, not mechanically
 * load-bearing — the Knight is damageable on every square. The checkerboard is
 * preserved as the board grows for chess-authenticity alone; whether that
 * argument carries enough weight on its own is exactly what is still open.
 * See game-design.md, "Board geometry".
 */
export const BOARD: BoardSpec = { files: 8, ranks: 8 }

/**
 * The Core sits on the player's back rank, and stays there. Pieces spawn from
 * whatever the far rank currently is — an Ace grows the board, so the spawn rank
 * is read from state rather than fixed here.
 */
export const CORE_SQUARE: Square = { file: 3, rank: 0 }

/**
 * PLACEHOLDER value, not a balance decision — but no longer an arbitrary one.
 *
 * Raised from 20 once the full roster landed. Pawn promotion and the lateral
 * sweep together mean almost every Piece now reaches the Core unless something
 * kills it first, so 20 was spent within a handful of rounds and the run ended
 * before the roster had finished introducing itself.
 */
export const CORE_MAX_HEALTH = 100
