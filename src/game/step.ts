import { roundSpec } from '../data/rounds'
import { isInBounds, squaresEqual } from './board'
import type { Command, GameState, Square } from './types'

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
    case 'placeTower':
      return placeTower(state, command.square)
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

/**
 * Placing a Tower currently costs nothing, and is triggered by clicking the
 * board rather than by playing a card.
 *
 * The intended design exists and is not implemented here: a Tower is built by
 * playing a Card for its **rank**, paid for in **Ink**. Towers will also carry
 * health, since they are destructible. See the card system spec.
 */
function placeTower(state: GameState, square: Square): GameState {
  if (state.phase === 'defeated') return state
  if (!isInBounds(state.board, square)) return state
  if (squaresEqual(square, state.core.square)) return state
  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return state

  return {
    ...state,
    towers: [...state.towers, { id: `tower-${state.nextEntityId}`, square }],
    nextEntityId: state.nextEntityId + 1,
  }
}
