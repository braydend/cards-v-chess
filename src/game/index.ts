/**
 * Public surface of the rules engine.
 *
 * The renderer and UI import from here only. Anything not exported is an
 * internal detail — tests should exercise behaviour through `step`, `tick`, and
 * state inspection rather than reaching into modules directly.
 */
export { allSquares, isInBounds, squareKey, squaresEqual, stagingRank } from './board'
export { findCard, isBuildableRank, removeCard } from './cards'
export { coveredSquares, coversSquare, isOccluded, reachableSquares } from './coverage'
export { evaluateHand, HAND_SIZES, HAND_TOWER, type HandType } from './hands'
export { isStuck, nextMove, type MoveOutcome, type MoveRequest } from './movement'
export { canAfford, cullCountFor, packPrice } from './packs'
export { canBuildOn } from './placement'
export { createInitialState, DEV_SEED } from './state'
export { step } from './step'
export { tick } from './tick'
export type { Rng } from './rng'
export type { TowerTypeDef, TowerTypeId } from '../data/towerTypes'
export type {
  BoardSpec,
  BuildableRank,
  Card,
  CardRank,
  Command,
  MissRecord,
  ExitRecord,
  FaceRank,
  GameState,
  Handedness,
  Piece,
  PieceTier,
  PieceTypeDef,
  PieceTypeId,
  RoundPhase,
  RoundSpec,
  Spawn,
  Square,
  Suit,
  TierDef,
  Tower,
  TowerGeometry,
} from './types'
