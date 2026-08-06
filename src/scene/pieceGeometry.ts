import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import type { PieceTypeId } from '../game'

/**
 * One silhouette factory per Piece type.
 *
 * Shared by `Pieces.tsx` and `PieceExits.tsx`, which each call these and dispose
 * their own instances. Six low-poly geometries is not worth a sharing
 * mechanism, and a ghost's material differs from a live Piece's regardless.
 *
 * In its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows up
 * as a full reload on every edit instead of a hot update. Same precedent
 * `pieceColours.ts` and `rankColours.ts` already set.
 */
export const GEOMETRY_BY_TYPE: Record<PieceTypeId, () => BufferGeometry> = {
  pawn: () => new ConeGeometry(0.28, 0.55, 6),
  knight: () => new BoxGeometry(0.4, 0.6, 0.3),
  bishop: () => new ConeGeometry(0.2, 0.8, 6),
  rook: () => new CylinderGeometry(0.32, 0.32, 0.45, 6),
  queen: () => new ConeGeometry(0.3, 0.9, 8),
  king: () => new CylinderGeometry(0.26, 0.3, 0.85, 8),
}

/**
 * Where each silhouette's origin sits so the Piece rests on the board rather
 * than in it — half its height, rounded to the nearest hundredth. The Pawn is
 * the exception: it keeps the existing hand-tuned 0.35 (not a half-height value
 * at all) so it looks unchanged from before that task.
 */
export const REST_Y_BY_TYPE: Record<PieceTypeId, number> = {
  pawn: 0.35,
  knight: 0.3,
  bishop: 0.4,
  rook: 0.23,
  queen: 0.45,
  king: 0.43,
}

export const PIECE_TYPE_IDS = Object.keys(GEOMETRY_BY_TYPE) as PieceTypeId[]
