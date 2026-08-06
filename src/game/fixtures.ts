/**
 * Test-only builders. Imported by `*.test.ts` and never by production code.
 *
 * Tests go through the public command surface rather than constructing Towers
 * by hand, as CLAUDE.md requires — so building a Tower means seeding the one
 * Card it costs.
 */
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState } from './state'
import { step } from './step'
import type { BuildableRank, Card, CardRank, GameState, Piece, Square, Suit, Tower } from './types'

export function standardCard(id: string, rank: CardRank, suit: Suit = 'hearts'): Card {
  return { id, kind: 'standard', rank, suit }
}

export function jokerCard(id: string): Card {
  return { id, kind: 'joker' }
}

/** State holding exactly these cards, so a test's Deck is never a surprise. */
export function withDeck(cards: readonly Card[], state: GameState = createInitialState()): GameState {
  return { ...state, deck: cards }
}

/**
 * A Tower of this rank on this square, built by spending a seeded Card.
 *
 * The seeded card's suit is irrelevant — it is played for its rank.
 *
 * Throws if the build was refused instead of returning the unbuilt state:
 * this task and the four after it all build a Tower and then act on it, so a
 * broken arrangement (occupied square, out of bounds, ...) must fail loudly
 * here rather than silently producing a Tower-less state for a later
 * assertion to misdiagnose.
 */
export function withTower(
  cardRank: BuildableRank,
  square: Square,
  state: GameState = createInitialState(),
): GameState {
  const cardId = `seed-${cardRank}-${square.file}-${square.rank}`
  const seeded: GameState = { ...state, deck: [...state.deck, standardCard(cardId, cardRank)] }
  const built = step(seeded, { kind: 'buildTower', cardId, square })

  if (built === seeded) throw new Error('withTower: build was refused, no Tower was added')

  return built
}

export function pawnAt(id: string, square: Square): Piece {
  return {
    id,
    typeId: 'pawn',
    square,
    prevSquare: square,
    health: PIECE_TYPES.pawn.maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
  }
}

/** A live round with these Pieces and nothing left to spawn. */
export function liveRound(state: GameState, pieces: readonly Piece[]): GameState {
  return { ...state, phase: 'inProgress', pendingSpawns: [], pieces }
}

/**
 * The first Tower in state, for tests that need to read or target one.
 *
 * Throws rather than returning undefined: a test that reaches here without a
 * Tower has a broken arrangement, and failing loudly beats asserting against
 * `undefined`. `noUncheckedIndexedAccess` is on and this codebase has no
 * non-null assertions, so indexing needs a guard somewhere — it belongs here,
 * once, not in every test.
 */
export function firstTower(state: GameState): Tower {
  const tower = state.towers[0]
  if (!tower) throw new Error('expected at least one Tower in state')

  return tower
}

/** The id of the first Tower in state. See `firstTower` for why this throws. */
export function firstTowerId(state: GameState): string {
  return firstTower(state).id
}
