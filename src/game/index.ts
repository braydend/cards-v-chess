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
export { isStuck, nextMove, type MoveOutcome } from './movement'
export { createInitialState } from './state'
export { step } from './step'
export { applySupport } from './support'
export { tick } from './tick'
export type {
  BoardSpec,
  BuildableRank,
  Card,
  CardRank,
  Command,
  FaceRank,
  GameState,
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
