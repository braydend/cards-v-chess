import { roundSpec } from '../data/rounds'
import { buildTower, clearPieces, echoTower, expandBoard, reinforceCore, shieldTower, supportTower } from './cardPlays'
import { devAddInk, devGrowBoard, devSetCoreHealth, devSetRound } from './dev'
import { buyPack } from './packs'
import type { Command, GameState } from './types'

/**
 * Applies a player command. Pure: returns new state, never mutates.
 *
 * Commands are valid both between rounds and mid-round — the player can build
 * during combat, Bloons-style. "Round in progress" is a flag on state, not a
 * separate code path, so there is nothing here that branches on game mode.
 *
 * `buyPack` is the one exception: it is refused while a round is live. That is
 * not a convenience — it is what keeps a repair-versus-the-wall grind bounded,
 * because the ♥ supply cannot grow mid-round. See `buyPack` in `./packs.ts`.
 *
 * Invalid commands return the state unchanged rather than throwing. The UI is
 * responsible for not offering illegal actions; the engine just refuses them.
 */
export function step(state: GameState, command: Command): GameState {
  switch (command.kind) {
    case 'startRound':
      return startRound(state)
    case 'continueToFreePlay':
      return continueToFreePlay(state)
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
    case 'clearPieces':
      return clearPieces(state, command.cardId)
    case 'buyPack':
      return buyPack(state, command.pack, command.suit, command.cullCardIds)
    case 'devAddInk':
      return devAddInk(state, command.amount)
    case 'devSetCoreHealth':
      return devSetCoreHealth(state, command.health, command.maxHealth)
    case 'devSetRound':
      return devSetRound(state, command.roundNumber)
    case 'devGrowBoard':
      return devGrowBoard(state, command.ranks)
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
 * The only command valid in the victory phase: moves the run into free play.
 *
 * Free play is the round-101 gap — a normal, startable round. The win is
 * already recorded (`won` latched at the victory transition) and stays true.
 * `roundElapsedMs` and `pendingSpawns` are reset so the gap reads as a fresh
 * round about to begin, exactly as a round completion leaves it.
 */
function continueToFreePlay(state: GameState): GameState {
  if (state.phase !== 'victory') return state

  return {
    ...state,
    phase: 'gap',
    roundNumber: state.roundNumber + 1,
    roundElapsedMs: 0,
    pendingSpawns: [],
  }
}
