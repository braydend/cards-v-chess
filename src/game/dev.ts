import { pieceType } from '../data/pieceTypes'
import { tierDef } from '../data/tiers'
import { isInBounds, squaresEqual, stagingRank } from './board'
import { spawnHealth } from './spawnScaling'
import type { Card, CardRank, GameState, Piece, PieceTier, PieceTypeId, Square, Suit } from './types'

/**
 * Developer-mode commands: the engine half of issue #60's testing panel.
 *
 * Deliberately NOT part of the game rules — a dev panel is the only caller.
 * Each command refuses an invalid input by returning the same state object,
 * exactly like every other command, so `simulation.dispatch` tells a refusal
 * from a success by identity. None of them draws from `state.rng`, so using
 * dev mode never shifts later seeded outcomes. The panel UI is compiled out
 * of production builds (`import.meta.env.DEV`), which is the only gate.
 */

export function devAddInk(state: GameState, amount: number): GameState {
  if (amount < 1) return state

  return { ...state, ink: state.ink + amount }
}

export function devSetCoreHealth(
  state: GameState,
  health: number,
  maxHealth: number,
): GameState {
  // Refused once defeated: phase 'defeated' plus a full Core would contradict
  // each other. Every other dev command is deliberately phase-agnostic.
  if (state.phase === 'defeated') return state
  if (health < 1 || maxHealth < health) return state

  return { ...state, core: { ...state.core, health, maxHealth } }
}

export function devSetRound(state: GameState, roundNumber: number): GameState {
  // Gap only, like buyPack. Mid-round it would be silently skipped: round
  // completion sets roundNumber = state.roundNumber + 1, so a mid-round set to
  // N would complete straight past N to N + 1.
  if (state.phase !== 'gap') return state
  if (roundNumber < 1) return state

  return { ...state, roundNumber }
}

export function devGrowBoard(state: GameState, ranks: number): GameState {
  if (ranks < 1) return state

  // Ranks only, mirroring the Ace: files are fixed so spawn-file math in
  // data/rounds.ts stays correct and the staging rank stays out of bounds.
  return { ...state, board: { ...state.board, ranks: state.board.ranks + ranks } }
}

export function devSpawnPiece(
  state: GameState,
  typeId: PieceTypeId,
  tier: PieceTier,
  square: Square,
): GameState {
  // On the board, or on the Staging rank. Both are refused by a Tower/Piece
  // occupancy check below, and the Staging rank can never hold a Tower, so the
  // no-shared-square invariant holds for a dev spawn exactly as for a real one.
  const onBoard = isInBounds(state.board, square)
  const onStaging =
    square.rank === stagingRank(state.board) &&
    square.file >= 0 &&
    square.file < state.board.files
  if (!onBoard && !onStaging) return state

  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return state
  if (state.pieces.some((piece) => squaresEqual(piece.square, square))) return state

  // Identical to a normal spawn (drainDueSpawns in tick.ts): round-scaled
  // health and handedness from entity-id parity, so a dev-spawned Piece weaves
  // exactly like one the round would have produced.
  const health = spawnHealth(pieceType(typeId).maxHealth, state.roundNumber)
  const piece: Piece = {
    id: `piece-${state.nextEntityId}`,
    typeId,
    tier,
    square,
    prevSquare: square,
    health,
    maxHealth: health,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: state.nextEntityId % 2 === 0 ? 1 : -1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: tierDef(tier).huntsFromSpawn && typeId !== 'pawn',
    promoted: false,
  }

  return {
    ...state,
    pieces: [...state.pieces, piece],
    nextEntityId: state.nextEntityId + 1,
  }
}

export function devRemoveTower(state: GameState, towerId: string): GameState {
  if (!state.towers.some((tower) => tower.id === towerId)) return state

  return { ...state, towers: state.towers.filter((tower) => tower.id !== towerId) }
}

export function devClearPieces(state: GameState): GameState {
  if (state.pieces.length === 0) return state

  // A testing utility, not the Joker: no ink, no clears bump, and pending
  // spawns untouched so a live round keeps its schedule.
  return { ...state, pieces: [] }
}

export function devAddCard(
  state: GameState,
  rank: CardRank | undefined,
  suit: Suit | undefined,
): GameState {
  // A standard Card needs a suit and a Joker must not carry one — the same
  // either-or validation buyPack uses, so a mistaken command is refused rather
  // than silently coerced.
  let card: Card
  if (rank === undefined) {
    if (suit !== undefined) return state
    card = { id: `card-${state.nextCardId}`, kind: 'joker' }
  } else {
    if (suit === undefined) return state
    card = { id: `card-${state.nextCardId}`, kind: 'standard', rank, suit }
  }

  // nextCardId, never nextEntityId: the entity counter's parity drives Piece
  // handedness and must not move on a card deal. The deck cap is deliberately
  // bypassed — the picker is the point of dev mode.
  return {
    ...state,
    deck: [...state.deck, card],
    nextCardId: state.nextCardId + 1,
  }
}
