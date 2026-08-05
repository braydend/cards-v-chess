import { roundSpec } from '../data/rounds'
import { buildTower, echoTower, expandBoard, reinforceCore, shieldTower, supportTower } from './cardPlays'
import type { Command, GameState } from './types'

/**
 * Applies a player command. Pure: returns new state, never mutates.
 *
 * Commands are valid both between rounds and mid-round — the player can build
 * during combat, Bloons-style. "Round in progress" is a flag on state, not a
 * separate code path, so there is nothing here that branches on game mode.
 *
 * Invalid commands return the state unchanged rather than throwing. The UI is
 * responsible for not offering illegal actions; the engine just refuses them.
 */
export function step(state: GameState, command: Command): GameState {
  switch (command.kind) {
    case 'startRound':
      return startRound(state)
    case 'setAutoStart':
      return { ...state, autoStart: command.enabled }
    case 'buildTower':
      return buildTower(state, command.cardId, command.square)
    case 'supportTower':
      return supportTower(state, command.cardId, command.towerId)
    case 'shieldTower':
      return shieldTower(state, command.cardId, command.towerId)
    case 'echoTower':
      return echoTower(state, command.cardId, command.sourceTowerId, command.square)
    case 'reinforceCore':
      return reinforceCore(state, command.cardId)
    case 'expandBoard':
      return expandBoard(state, command.cardId)
  }
}

function startRound(state: GameState): GameState {
  if (state.phase !== 'gap') return state

  return {
    ...state,
    phase: 'inProgress',
    roundElapsedMs: 0,
    pendingSpawns: roundSpec(state.roundNumber).spawns,
  }
}
