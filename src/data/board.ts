import type { BoardSpec, Square } from '../game/types'

/**
 * Board geometry remains an open design decision — whether the board is a
 * literal 8x8 chessboard or something larger is unresolved.
 *
 * Note when revisiting: square colour is now mechanically load-bearing (the
 * Knight is only damageable on light squares), which is an argument for keeping
 * a true chessboard rather than an arbitrary grid. See CLAUDE.md.
 */
export const BOARD: BoardSpec = { files: 8, ranks: 8 }

/** The Core sits on the player's back rank. Pieces spawn on the far rank. */
export const CORE_SQUARE: Square = { file: 3, rank: 0 }

/** PLACEHOLDER value, not a balance decision. */
export const CORE_MAX_HEALTH = 20

/** The rank invading pieces enter from. */
export const SPAWN_RANK = BOARD.ranks - 1
