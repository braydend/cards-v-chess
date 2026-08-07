import type { PieceTypeDef, PieceTypeId } from '../game/types'

/**
 * The Chess roster. Each Piece's threat comes from the design doc; the numbers
 * are PLACEHOLDER balance, not design decisions.
 *
 * Tower combat is settled by the universal combat rule: every Piece deals FULL
 * attack damage to a Tower on one of its attack tiles, and a Pawn blocked
 * straight ahead — whose blocker is not on an attack tile — is the one
 * carve-out still at `BLOCKED_ATTACK_MULTIPLIER`. See the chess-tiers spec.
 *
 * The Rook has no armour stat — high health *is* its armour. `coverage.ts` is
 * explicit that piercing is not part of the design, and flat reduction against
 * the low buildable ranks would make much of the pool useless against Rooks.
 */
export const PIECE_TYPES: Record<PieceTypeId, PieceTypeDef> = {
  pawn: { id: 'pawn', label: 'Pawn', moveIntervalMs: 900, maxHealth: 3, attackDamage: 2, slides: false, inkReward: 1 },
  knight: { id: 'knight', label: 'Knight', moveIntervalMs: 1100, maxHealth: 4, attackDamage: 2, slides: false, inkReward: 2 },
  bishop: { id: 'bishop', label: 'Bishop', moveIntervalMs: 1000, maxHealth: 5, attackDamage: 1, slides: true, inkReward: 3 },
  rook: { id: 'rook', label: 'Rook', moveIntervalMs: 1600, maxHealth: 14, attackDamage: 4, slides: true, inkReward: 5 },
  queen: { id: 'queen', label: 'Queen', moveIntervalMs: 1000, maxHealth: 9, attackDamage: 5, slides: true, inkReward: 8 },
  king: { id: 'king', label: 'King', moveIntervalMs: 1800, maxHealth: 12, attackDamage: 3, slides: false, inkReward: 10 },
}

/**
 * The Pawn-straight-ahead multiplier. The universal combat rule gives every
 * Piece full damage to a Tower on one of its attack tiles — a Pawn's attack
 * tiles are its forward diagonals, so a Pawn blocked STRAIGHT ahead is the one
 * case where a Tower blocks a Piece without standing on an attack tile. That
 * genuinely stuck attack stays at half. Every other Piece's blocking Tower
 * sits on an attack tile, so it deals full damage.
 *
 * Kept as a multiplier rather than baked into `attackDamage` so that the one
 * carve-out reads as what it is — an exception, not the rule.
 */
export const BLOCKED_ATTACK_MULTIPLIER = 0.5

export function pieceType(id: PieceTypeId): PieceTypeDef {
  return PIECE_TYPES[id]
}
