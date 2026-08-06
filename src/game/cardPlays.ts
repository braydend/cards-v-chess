/**
 * The card-play command handlers.
 *
 * Every one of these is pure and returns new state. An illegal play returns the
 * state unchanged — never throws, and never consumes the Card. The UI is
 * responsible for not offering illegal actions; the engine just refuses them.
 */
import { ACE_BOARD_RANKS, JACK_SHIELD, KING_CORE_HEALTH, supportMagnitude } from '../data/cards'
import { towerRank } from '../data/towerRanks'
import { findCard, isBuildableRank, removeCard } from './cards'
import { canBuildOn } from './placement'
import { applySupport } from './support'
import type { BuildableRank, GameState, Square, Tower } from './types'

/**
 * A fresh Tower of this rank, at full health with no shield and nothing weathered.
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
    damageTaken: 0,
  }
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

/**
 * Plays a Card for its SUIT, applying a support action to one existing Tower.
 *
 * A Joker is refused: it has no suit, so this play is not available to it.
 */
export function supportTower(state: GameState, cardId: string, towerId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard') return state

  const target = state.towers.find((tower) => tower.id === towerId)
  if (!target) return state

  const magnitude = supportMagnitude(card.rank)

  return {
    ...state,
    towers: state.towers.map((tower) =>
      tower.id === towerId ? applySupport(tower, card.suit, magnitude) : tower,
    ),
    deck: removeCard(state.deck, cardId),
  }
}

/**
 * Jack: grants a Tower a shield, absorbed before health.
 *
 * A shield differs from ♥ repair in kind, not magnitude: repair is reactive and
 * can be out-paced, a shield is pre-emptive and cannot.
 */
export function shieldTower(state: GameState, cardId: string, towerId: string): GameState {
  if (state.phase === 'defeated') return state

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
 * Queen: builds a copy of an existing Tower's RANK on an empty square.
 *
 * Accumulated ♦ ♠ ♣ supports and any shield are deliberately NOT copied —
 * otherwise Echo becomes the strongest support multiplier in the game rather
 * than a second Tower.
 */
export function echoTower(
  state: GameState,
  cardId: string,
  sourceTowerId: string,
  square: Square,
): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'Q') return state

  const source = state.towers.find((tower) => tower.id === sourceTowerId)
  if (!source) return state
  if (!canBuildOn(state, square)) return state

  // `newTower` seeds from the rank alone, which is exactly why the source's
  // accumulated supports and shield do not carry across.
  return {
    ...state,
    towers: [...state.towers, newTower(`tower-${state.nextEntityId}`, square, source.cardRank)],
    nextEntityId: state.nextEntityId + 1,
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
  if (state.phase === 'defeated') return state

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
  if (state.phase === 'defeated') return state

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
 * NOTE for when Ink lands: clearing twenty Pawns must not pay twenty kill
 * rewards, or this becomes an income exploit.
 */
export function clearPieces(state: GameState, cardId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'joker') return state

  return {
    ...state,
    pieces: [],
    deck: removeCard(state.deck, cardId),
  }
}
