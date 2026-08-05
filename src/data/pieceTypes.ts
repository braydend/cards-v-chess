import type { PieceTypeDef, PieceTypeId } from '../game/types'

/**
 * PLACEHOLDER roster. Exactly one piece type exists so the scaffold has
 * something to render and test.
 *
 * The real roster and each type's characteristics — movement cadence, health,
 * armour, abilities, and how strictly each follows real chess movement — are
 * an open design decision. Do not extend this speculatively. See CLAUDE.md.
 */
export const PIECE_TYPES: Record<PieceTypeId, PieceTypeDef> = {
  pawn: {
    id: 'pawn',
    label: 'Pawn',
    moveIntervalMs: 900,
    maxHealth: 3,
  },
}

export function pieceType(id: PieceTypeId): PieceTypeDef {
  return PIECE_TYPES[id]
}
