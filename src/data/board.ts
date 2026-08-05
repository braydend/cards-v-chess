import type { BoardSpec, Square } from '../game/types'

/**
 * Board geometry is settled as *growable*, starting at 8x8. An Ace grows the
 * board by a rank, so the board size is not fixed for the run.
 *
 * Note when revisiting: square colour is now mechanically load-bearing (the
 * Knight is only damageable on light squares), which is an argument for
 * preserving a checkerboard as the board grows rather than an arbitrary grid.
 * See CLAUDE.md.
 */
export const BOARD: BoardSpec = { files: 8, ranks: 8 }

/**
 * The Core sits on the player's back rank, and stays there. Pieces spawn from
 * whatever the far rank currently is — an Ace grows the board, so the spawn rank
 * is read from state rather than fixed here.
 */
export const CORE_SQUARE: Square = { file: 3, rank: 0 }

/** PLACEHOLDER value, not a balance decision. */
export const CORE_MAX_HEALTH = 20
