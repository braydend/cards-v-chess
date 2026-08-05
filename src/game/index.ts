/**
 * Public surface of the rules engine.
 *
 * The renderer and UI import from here only. Anything not exported is an
 * internal detail — tests should exercise behaviour through `step`, `tick`, and
 * state inspection rather than reaching into modules directly.
 */
export { allSquares, isInBounds, squareKey, squaresEqual, stepToward } from './board'
export { coversSquare } from './coverage'
export { createInitialState } from './state'
export { step } from './step'
export { tick } from './tick'
export type {
  BoardSpec,
  CardRank,
  Command,
  GameState,
  Piece,
  PieceTypeDef,
  PieceTypeId,
  RoundPhase,
  RoundSpec,
  Spawn,
  Square,
  Tower,
  TowerGeometry,
} from './types'
