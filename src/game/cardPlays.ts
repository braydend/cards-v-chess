/**
 * The card-play command handlers.
 *
 * Every one of these is pure and returns new state. An illegal play returns the
 * state unchanged — never throws, and never consumes the Card. The UI is
 * responsible for not offering illegal actions; the engine just refuses them.
 */
import { towerRank } from '../data/towerRanks'
import { isInBounds, squaresEqual } from './board'
import { findCard, isBuildableRank, removeCard } from './cards'
import type { BuildableRank, GameState, Square, Tower } from './types'

/**
 * A fresh Tower of this rank, at full health with no shield.
 *
 * Shared by every play that puts a Tower on the board — a Card played for its
 * rank, and a Queen's Echo. Both must seed identical stats from the rank, so
 * this exists to make drift impossible rather than merely unlikely.
 */
function newTower(id: string, square: Square, cardRank: BuildableRank): Tower {
  const def = towerRank(cardRank)

  return {
    id,
    square,
    cardRank,
    fireCooldownMs: 0,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    damage: def.damage,
    fireIntervalMs: def.fireIntervalMs,
    shield: 0,
  }
}

/** Whether a square is free to build on. */
function canBuildOn(state: GameState, square: Square): boolean {
  if (!isInBounds(state.board, square)) return false
  if (squaresEqual(square, state.core.square)) return false

  return !state.towers.some((tower) => squaresEqual(tower.square, square))
}

/**
 * Plays a Card for its RANK, converting it into a Tower.
 *
 * Playing costs nothing but the Card itself. There is no Ink cost — Ink buys
 * packs and is never spent to play.
 */
export function buildTower(state: GameState, cardId: string, square: Square): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard') return state
  if (!isBuildableRank(card.rank)) return state
  if (!canBuildOn(state, square)) return state

  return {
    ...state,
    towers: [...state.towers, newTower(`tower-${state.nextEntityId}`, square, card.rank)],
    nextEntityId: state.nextEntityId + 1,
    deck: removeCard(state.deck, cardId),
  }
}
