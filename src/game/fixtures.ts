/**
 * Test-only builders. Imported by `*.test.ts` and never by production code.
 *
 * Tests go through the public command surface rather than constructing Towers
 * by hand, as CLAUDE.md requires — so building a Tower means seeding the one
 * Card it costs.
 */
import { SUITS } from '../data/cards'
import { PIECE_TYPES } from '../data/pieceTypes'
import type { TowerTypeId } from '../data/towerTypes'
import { squareKey } from './board'
import { createInitialState } from './state'
import { step } from './step'
import type {
  Card,
  CardRank,
  GameState,
  Piece,
  PieceTypeId,
  Square,
  Suit,
  Tower,
} from './types'

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
 * The minimal legal hand that purchases each Tower type, committed on build.
 *
 * A flush and a straight flush cannot be formed from mixed suits, so `star`
 * and `tollgate` get a uniform suit assignment in `withTower` while every
 * other hand keeps a cycling one:
 * - `star`: ranks `[2, 4, 6, 8, 10]` ALL hearts — a flush that is NOT a
 *   straight (consecutive ranks would evaluate as a straight flush).
 * - `tollgate`: ranks `[2, 3, 4, 5, 6]` ALL clubs — a straight flush.
 * - `cross`: ranks `[2, 3, 4, 5, 6]` across suits hearts, diamonds, spades,
 *   clubs, hearts — a straight that is not a flush.
 */
const HAND_FOR_TYPE: Record<TowerTypeId, CardRank[]> = {
  vertical: [5],
  wall: [5, 5],
  sniper: [5, 5, 9, 9],
  diagonal: [5, 5, 5],
  cross: [2, 3, 4, 5, 6], // straight
  star: [2, 4, 6, 8, 10], // flush — see suit note above
  splash: [5, 5, 5, 9, 9],
  ring: [5, 5, 5, 5],
  tollgate: [2, 3, 4, 5, 6], // straight flush — see suit note above
}

/**
 * A Tower of this TYPE on this square, built by committing the canonical hand
 * for the type and placing it.
 *
 * Throws if the build was refused instead of returning the unbuilt state:
 * this task and the four after it all build a Tower and then act on it, so a
 * broken arrangement (occupied square, out of bounds, ...) must fail loudly
 * here rather than silently producing a Tower-less state for a later
 * assertion to misdiagnose.
 */
export function withTower(
  type: TowerTypeId,
  square: Square,
  state: GameState = createInitialState(),
): GameState {
  const ranks = HAND_FOR_TYPE[type]

  // Uniform suits for the two flush-based hands; cycling for the rest.
  const cards = ranks.map((rank, index) => {
    const suit =
      type === 'star'
        ? 'hearts'
        : type === 'tollgate'
          ? 'clubs'
          : (SUITS[index % SUITS.length] as Suit)
    return standardCard(`seed-${type}-${index}`, rank, suit)
  })
  const seeded: GameState = { ...state, deck: [...state.deck, ...cards] }

  let after = step(seeded, {
    kind: 'playHand',
    cardIds: cards.map((card) => card.id),
  })
  if (after.pendingTower === null) throw new Error('withTower: hand refused, no pending Tower')

  after = step(after, { kind: 'placeTower', square })
  if (after.towers.length !== state.towers.length + 1 || after.pendingTower !== null) {
    throw new Error('withTower: placement refused')
  }

  return after
}

/**
 * A Tower on every one of these squares, built directly rather than through
 * `withTower` — a test walling a whole rank or board wants a `Map` it can
 * hand straight to movement code, not a Deck to seed one Card at a time.
 *
 * Only `id` is read by the movement code under test; the rest of the shape
 * exists so the map is a real `Map<string, Tower>` rather than a cast.
 */
export function towersAt(...squares: Square[]): Map<string, Tower> {
  return new Map(
    squares.map((square, index) => [
      squareKey(square),
      {
        id: `tower-${index}`,
        square,
        type: 'vertical' as const,
        range: 1,
        fireCooldownMs: 0,
        health: 8,
        maxHealth: 8,
        damage: 1,
        fireIntervalMs: 600,
        shield: 0,
        damageTaken: 0,
        shotsFired: 0,
        kills: 0,
        upgradeCounts: { damage: 0, fireRate: 0, health: 0 },
        fireIntervalBaseMs: 600,
      },
    ]),
  )
}

/**
 * A Piece of any type, placed directly — the spawn pipeline is bypassed, so a
 * test can arrange a Piece the current round would never produce.
 */
export function pieceAt(typeId: PieceTypeId, id: string, square: Square): Piece {
  return {
    id,
    typeId,
    tier: 'green',
    square,
    prevSquare: square,
    health: PIECE_TYPES[typeId].maxHealth,
    maxHealth: PIECE_TYPES[typeId].maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    kingAuraStacks: 0,
    kingAuraKings: [],
    hunting: false,
    promoted: false,
  }
}

export function pawnAt(id: string, square: Square): Piece {
  return pieceAt('pawn', id, square)
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
