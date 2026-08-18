/**
 * The card-play command handlers.
 *
 * Every one of these is pure and returns new state. An illegal play returns the
 * state unchanged — never throws, and never consumes the Card. The UI is
 * responsible for not offering illegal actions; the engine just refuses them.
 */
import { ACE_BOARD_RANKS, JACK_SHIELD, KING_CORE_HEALTH } from '../data/cards'
import { towerType, TOWER_TYPE_IDS, type TowerTypeId } from '../data/towerTypes'
import { findCard, removeCard } from './cards'
import { evaluateHand, HAND_TOWER } from './hands'
import { clearReward } from './ink'
import { canBuildOn } from './placement'
import { isTerminal } from './phase'
import type { Card, GameState, Square, Tower } from './types'

/**
 * A fresh Tower of this type, at full health with no shield and nothing weathered.
 *
 * Shared by every play that puts a Tower on the board — a hand played in the
 * gap is the only one that still does. Seeded from the type's table so the
 * instance stats can never drift from the table.
 */
function newTower(id: string, square: Square, type: TowerTypeId): Tower {
  const def = towerType(type)

  return {
    id,
    square,
    type,
    range: def.range,
    fireCooldownMs: 0,
    health: def.maxHealth,
    maxHealth: def.maxHealth,
    damage: def.damage,
    fireIntervalMs: def.fireIntervalMs,
    shield: 0,
    damageTaken: 0,
    shotsFired: 0,
    kills: 0,
    upgradeCounts: { damage: 0, fireRate: 0, health: 0 },
    fireIntervalBaseMs: def.fireIntervalMs,
  }
}

/**
 * Plays a set of Cards as a poker hand, purchasing the hand's Tower.
 *
 * The first step of Tower building: consumes the committed Cards and sets
 * `pendingTower`; the second step, `placeTower`, puts it on a chosen square.
 * Legal only in the gap — a hand purchase is a build-phase action, and a round
 * must not be interrupted to shop. The hand must be EXACTLY one valid hand of
 * its size, decided by `evaluateHand`; the ranks inside it never modulate the
 * result. A royal flush is "Tower of choice", so `chosenType` supplies it; any
 * other hand may not be given a `chosenType`.
 */
export function playHand(
  state: GameState,
  cardIds: readonly string[],
  chosenType?: TowerTypeId,
): GameState {
  if (isTerminal(state.phase)) return state
  if (state.phase !== 'gap') return state
  if (state.pendingTower !== null) return state

  // Each Card is named once. The Deck is a multiset, so `['five', 'five']`
  // on a one-Card Deck would otherwise read as a pair of fives and buy a Wall
  // for the price of one Card.
  if (new Set(cardIds).size !== cardIds.length) return state

  const cards = cardIds
    .map((id) => findCard(state.deck, id))
    .filter((card): card is Card => card !== undefined)
  if (cards.length !== cardIds.length) return state

  const hand = evaluateHand(cards)
  if (!hand) return state

  const type =
    hand === 'royalFlush'
      ? chosenType
      : HAND_TOWER[hand]

  if (type === undefined || !TOWER_TYPE_IDS.includes(type)) return state
  if (hand !== 'royalFlush' && chosenType !== undefined) return state

  return {
    ...state,
    pendingTower: type,
    deck: cardIds.reduce((deck, id) => removeCard(deck, id), state.deck),
  }
}

/**
 * Builds the pending Tower on a square.
 *
 * The second step of Tower building: `playHand` set `pendingTower`, and this
 * consumes it into an actual Tower. Refuses an occupied or out-of-bounds square
 * via `canBuildOn`, and requires `pendingTower` to be set — no Tower appears
 * without a hand having purchased it.
 */
export function placeTower(state: GameState, square: Square): GameState {
  if (isTerminal(state.phase)) return state
  if (state.phase !== 'gap') return state
  if (state.pendingTower === null) return state
  if (!canBuildOn(state, square)) return state

  return {
    ...state,
    towers: [...state.towers, newTower(`tower-${state.nextEntityId}`, square, state.pendingTower)],
    nextEntityId: state.nextEntityId + 1,
    pendingTower: null,
  }
}

/**
 * Cancels an unplaced hand play, dropping the pending Tower.
 *
 * The player may change their mind about where — or whether — to build, but the
 * Cards committed to the hand are NOT refunded: the play is cancelled, not the
 * hand undone. Refuses in every phase but the gap, and with no pending Tower to
 * drop.
 */
export function cancelPlacement(state: GameState): GameState {
  if (isTerminal(state.phase)) return state
  if (state.phase !== 'gap') return state
  if (state.pendingTower === null) return state

  return { ...state, pendingTower: null }
}

/**
 * Jack: grants a Tower a shield, absorbed before health.
 *
 * A shield differs from ♥ repair in kind, not magnitude: repair is reactive and
 * can be out-paced, a shield is pre-emptive and cannot.
 */
export function shieldTower(state: GameState, cardId: string, towerId: string): GameState {
  if (isTerminal(state.phase)) return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'J') return state

  if (!state.towers.some((tower) => tower.id === towerId)) return state

  return {
    ...state,
    towers: state.towers.map((tower) =>
      tower.id === towerId ? { ...tower, shield: tower.shield + JACK_SHIELD } : tower,
    ),
    deck: removeCard(state.deck, cardId),
  }
}

/**
 * Queen: grants a Tower +1 range.
 *
 * Stackable and uncapped, on any Tower, at any time — a Queen is spent to widen
 * coverage, and the Tower's range grows from its instance field, so every Queen
 * stacks onto whatever the type seeded and earlier Queens already added.
 */
export function rangeTower(state: GameState, cardId: string, towerId: string): GameState {
  if (isTerminal(state.phase)) return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'Q') return state

  if (!state.towers.some((tower) => tower.id === towerId)) return state

  return {
    ...state,
    towers: state.towers.map((tower) =>
      tower.id === towerId ? { ...tower, range: tower.range + 1 } : tower,
    ),
    deck: removeCard(state.deck, cardId),
  }
}

/**
 * King: raises Core health, current and maximum together.
 *
 * The only card in the game that touches the Core, and the only Core recovery
 * that exists — `tick` otherwise only ever subtracts from it. Each leak costs
 * exactly 1 Core health, so this buys exactly one extra leak.
 */
export function reinforceCore(state: GameState, cardId: string): GameState {
  if (isTerminal(state.phase)) return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'K') return state

  return {
    ...state,
    core: {
      ...state.core,
      health: state.core.health + KING_CORE_HEALTH,
      maxHealth: state.core.maxHealth + KING_CORE_HEALTH,
    },
    deck: removeCard(state.deck, cardId),
  }
}

/**
 * Ace: grows the board by a rank, lengthening the run to the Core.
 *
 * Ranks only, never files — `data/rounds.ts` derives spawn files from
 * `BOARD.files`, and leaving files fixed keeps that correct.
 *
 * Growth is uncapped, which is safe only because this slice's Deck is authored
 * and holds a known number of Aces. Once packs land, unlimited copies mean an
 * arbitrarily long board — a rendering and camera problem as much as a balance
 * one. It will want a cap then.
 */
export function expandBoard(state: GameState, cardId: string): GameState {
  if (isTerminal(state.phase)) return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'A') return state

  return {
    ...state,
    board: { ...state.board, ranks: state.board.ranks + ACE_BOARD_RANKS },
    deck: removeCard(state.deck, cardId),
  }
}

/**
 * Joker: destroys every Piece standing on the board.
 *
 * Towers are untouched — they are permanent once placed and only ever destroyed
 * by Pieces. `pendingSpawns` is untouched too, so a round still spawning
 * continues rather than ending early.
 *
 * Being suitless, this is a Joker's only play.
 *
 * It is also the one card that can always break a grind, which makes it the
 * safety valve for the repair-versus-the-wall stall. See the spec.
 *
 * It pays a QUARTER share of the kill rewards for what it destroyed, not the
 * full amount. Paying full would make holding a Joker while the board fills
 * the best way to earn, turning the safety valve into an income exploit. The
 * share floors on the total rather than per Piece — see `clearReward`.
 */
export function clearPieces(state: GameState, cardId: string): GameState {
  if (isTerminal(state.phase)) return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'joker') return state

  return {
    ...state,
    ink: state.ink + clearReward(state.pieces),
    pieces: [],
    clears: state.clears + 1,
    deck: removeCard(state.deck, cardId),
  }
}
