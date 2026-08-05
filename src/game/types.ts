/**
 * Core types for the Cards V Chess rules engine.
 *
 * Everything here is plain data. No React, no three.js — see CLAUDE.md.
 * State is deeply readonly: `step` and `tick` return new state rather than
 * mutating, which is what keeps the simulation deterministic and testable.
 */

export interface Square {
  readonly file: number
  readonly rank: number
}

export interface BoardSpec {
  readonly files: number
  readonly ranks: number
}

/**
 * Only the placeholder Pawn is implemented. The full roster is designed —
 * pawn, knight, bishop, rook, queen, king — with a distinct threat each.
 * See the card system spec before widening this union.
 */
export type PieceTypeId = 'pawn'

export interface PieceTypeDef {
  readonly id: PieceTypeId
  readonly label: string
  /** Milliseconds between hops. Lower is faster. Placeholder value. */
  readonly moveIntervalMs: number
  readonly maxHealth: number
  /**
   * Damage dealt to a Tower. A Piece blocked by a Tower attacks it instead of
   * moving, at `BLOCKED_ATTACK_MULTIPLIER` of this value — Pieces are poor at
   * demolition, which is what makes a Tower a real obstacle.
   */
  readonly attackDamage: number
}

export interface Piece {
  readonly id: string
  readonly typeId: PieceTypeId
  readonly square: Square
  /**
   * The square this piece hopped from. Exists purely so the renderer can
   * interpolate between squares; the engine never reads it.
   */
  readonly prevSquare: Square
  readonly health: number
  /** Milliseconds accumulated toward this piece's next hop. */
  readonly moveCooldownMs: number
}

/**
 * A Tower's firing geometry, set by the rank of the Card that built it.
 * Towers are generic — this is NOT chess-piece movement.
 */
export type TowerGeometry =
  | 'adjacent'
  | 'horizontal'
  | 'vertical'
  | 'cross'
  | 'diagonal'
  | 'star'

/**
 * Ranks that build a Tower. 2–10 carry the geometry ladder.
 *
 * The face ranks (J, Q, K, A) act instead of building, so they are deliberately
 * absent here — passing `'K'` where geometry is expected is a type error rather
 * than a runtime surprise. See `CardRank` for every rank a Card can carry.
 */
export type BuildableRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs'

/** Ranks that act instead of building. See the card mechanics spec. */
export type FaceRank = 'J' | 'Q' | 'K' | 'A'

export type CardRank = BuildableRank | FaceRank

/**
 * One unplayed item in the Deck.
 *
 * A Joker is a separate variant because it has neither rank nor suit, so
 * "play a Joker for its suit" is not expressible. That is the point.
 *
 * `id` is independent of rank and suit. The Deck is a MULTISET — cards are
 * gained from random packs, so holding three 5♦ is normal, and playing one must
 * consume that instance and leave the others. Identifying a card by rank+suit
 * would be a bug the moment a duplicate exists.
 */
export type Card =
  | {
      readonly id: string
      readonly kind: 'standard'
      readonly rank: CardRank
      readonly suit: Suit
    }
  | { readonly id: string; readonly kind: 'joker' }

export interface Tower {
  readonly id: string
  readonly square: Square
  readonly cardRank: BuildableRank
  /** Milliseconds accumulated toward this Tower's next shot. */
  readonly fireCooldownMs: number
  readonly health: number
  /** Separate from the rank's base value so ♠ can raise it. */
  readonly maxHealth: number
  /** Seeded from the rank, raised by ♣ Damage. */
  readonly damage: number
  /** Seeded from the rank, lowered by ♦ Speed, floored at MIN_FIRE_INTERVAL_MS. */
  readonly fireIntervalMs: number
  /**
   * Granted by a Jack. Absorbed before health, with overflow carrying into it.
   * Never regenerates.
   */
  readonly shield: number
}

/**
 * `gap` is the untimed window between rounds — the player plans and builds.
 * `inProgress` is live combat. `defeated` is terminal.
 */
export type RoundPhase = 'gap' | 'inProgress' | 'defeated'

export interface Spawn {
  /** Milliseconds into the round at which this piece appears. */
  readonly atMs: number
  readonly typeId: PieceTypeId
  readonly file: number
}

export interface RoundSpec {
  readonly number: number
  readonly spawns: readonly Spawn[]
}

export interface GameState {
  readonly board: BoardSpec
  readonly core: {
    readonly square: Square
    readonly health: number
    /**
     * Raised by a King, the only card that touches the Core and the only Core
     * recovery in the game. Split from `health` so the HUD can show a ceiling
     * that grows.
     */
    readonly maxHealth: number
  }
  readonly phase: RoundPhase
  readonly roundNumber: number
  /** When true, the next round starts on its own from the `gap` phase. */
  readonly autoStart: boolean
  /** Milliseconds elapsed within the current round. Never wall-clock time. */
  readonly roundElapsedMs: number
  readonly pieces: readonly Piece[]
  readonly towers: readonly Tower[]
  /** Count of pieces that have reached the Core. */
  readonly leaks: number
  readonly pendingSpawns: readonly Spawn[]
  /** Monotonic counter so entity ids are deterministic, never random. */
  readonly nextEntityId: number
  /**
   * Every Card held for this run, always fully visible and playable. Capped at
   * `DECK_CAP`. There is no hand and no draw pile — playing consumes a card and
   * nothing returns.
   */
  readonly deck: readonly Card[]
}

export type Command =
  | { readonly kind: 'startRound' }
  | { readonly kind: 'setAutoStart'; readonly enabled: boolean }
  | { readonly kind: 'placeTower'; readonly square: Square; readonly cardRank: BuildableRank }
