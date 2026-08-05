import type { PieceTypeDef, PieceTypeId } from '../game/types'

/**
 * The Chess roster. Each Piece's threat comes from the design doc; the numbers
 * are PLACEHOLDER balance, not design decisions.
 *
 * Tower targeting is settled: every Piece attacks a Tower that blocks it, at
 * `BLOCKED_ATTACK_MULTIPLIER`. There is no designated Tower-hunter.
 *
 * The Rook has no armour stat — high health *is* its armour. `coverage.ts` is
 * explicit that piercing is not part of the design, and flat reduction against
 * the low buildable ranks would make much of the pool useless against Rooks.
 */
export const PIECE_TYPES: Record<PieceTypeId, PieceTypeDef> = {
  pawn: { id: 'pawn', label: 'Pawn', moveIntervalMs: 900, maxHealth: 3, attackDamage: 2, slides: false },
  knight: { id: 'knight', label: 'Knight', moveIntervalMs: 1100, maxHealth: 4, attackDamage: 2, slides: false },
  bishop: { id: 'bishop', label: 'Bishop', moveIntervalMs: 1000, maxHealth: 5, attackDamage: 1, slides: true },
  rook: { id: 'rook', label: 'Rook', moveIntervalMs: 1600, maxHealth: 14, attackDamage: 4, slides: true },
  queen: { id: 'queen', label: 'Queen', moveIntervalMs: 1000, maxHealth: 9, attackDamage: 5, slides: true },
  king: { id: 'king', label: 'King', moveIntervalMs: 1800, maxHealth: 12, attackDamage: 3, slides: false },
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
