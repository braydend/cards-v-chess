/**
 * Public surface of the rules engine.
 *
 * The renderer and UI import from here only. Anything not exported is an
 * internal detail — tests should exercise behaviour through `step`, `tick`, and
 * state inspection rather than reaching into modules directly.
 */
export { allSquares, isInBounds, squareKey, squaresEqual } from './board'
export { findCard, isBuildableRank, removeCard } from './cards'
export { commandFor, type PlayMode, type PlayTarget } from './commandFor'
export { coversSquare } from './coverage'
export { isStuck, nextMove, type MoveOutcome, type MoveRequest } from './movement'
export { canAfford, cullCountFor } from './packs'
export { canBuildOn } from './placement'
export { createInitialState, DEV_SEED } from './state'
export { step } from './step'
export { applySupport, canSupport } from './support'
export { tick } from './tick'
export type { Rng } from './rng'
export type {
  BoardSpec,
  BuildableRank,
  Card,
  CardRank,
  Command,
  ExitRecord,
  FaceRank,
  GameState,
  Handedness,
  Piece,
  PieceTypeDef,
  PieceTypeId,
  RoundPhase,
  RoundSpec,
  Spawn,
  Square,
  Suit,
  Tower,
  TowerGeometry,
} from './types'
