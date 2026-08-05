import type { PieceTypeDef, PieceTypeId } from '../game/types'

/**
 * PLACEHOLDER roster. Exactly one piece type exists so the scaffold has
 * something to render and test.
 *
 * The six-piece roster and its threats ARE now designed — Pawn chaff with
 * promotion, colour-flicker Knight, healer Bishop, armoured Rook, elite Queen,
 * commander King. None of it is implemented here yet, and the stats below are
 * placeholders rather than balance decisions.
 *
 * Read the card system spec before extending this. What remains genuinely
 * undecided is which Pieces attack Towers. See CLAUDE.md.
 */
export const PIECE_TYPES: Record<PieceTypeId, PieceTypeDef> = {
  pawn: {
    id: 'pawn',
    label: 'Pawn',
    moveIntervalMs: 900,
    maxHealth: 3,
    attackDamage: 2,
  },
}

/**
 * A Piece blocked by a Tower attacks at half strength. Attacking is an
 * incidental action forced on it, not what it is for — which is what lets a
 * Tower function as an obstacle rather than a speed bump.
 *
 * Kept as a multiplier rather than baked into `attackDamage` so that a future
 * Piece designed to demolish Towers can attack at full effect.
 */
export const BLOCKED_ATTACK_MULTIPLIER = 0.5

export function pieceType(id: PieceTypeId): PieceTypeDef {
  return PIECE_TYPES[id]
}
