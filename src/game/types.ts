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

/** The full Chess roster. Each type maps a real chess trait onto a threat. */
export type PieceTypeId = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

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
  /**
   * Whether this Piece slides along a line. Sliders move one square per hop
   * and gain +1 from a King aura; everything else has a fixed hop.
   */
  readonly slides: boolean
}

/**
 * Which way sideways. Drives the Knight's zig-zag, the Bishop's and Queen's
 * diagonal side, and the direction of a lateral sweep along a rank.
 */
export type Handedness = 1 | -1

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
  /** Hops completed. Drives the Knight's zig-zag and the Queen's alternation. */
  readonly moveCount: number
  /**
   * Which way sideways. Set at spawn from entity-id parity so consecutively
   * spawned Pieces weave opposite ways, and flipped when a Piece reflects off
   * a file edge.
   */
  readonly handedness: Handedness
  /** Milliseconds toward this Piece's next aura pulse. Bishops only. */
  readonly auraCooldownMs: number
  /** Whether a King aura reached this Piece on the last tick. Renderer-facing. */
  readonly buffed: boolean
  /**
   * Whether this Knight has started hunting the Core with knight moves aimed
   * at a distance field, instead of its forward zig-zag. See `knightMove` in
   * movement.ts.
   *
   * Latches true and never reverts. A hunting Knight's first hop necessarily
   * goes backwards — every knight move off rank 0 does — and landing further
   * up the board it would have a legal forward hop again. Without the latch
   * it would revert to zig-zagging, march back down to rank 0, strand there,
   * start hunting backwards again, and repeat forever; the round would never
   * end. The latch is what breaks that cycle.
   *
   * Always false for every other Piece type, and for a Pawn promoted into a
   * Queen — a Queen's movement never reads this field — kept false rather
   * than omitted so every Piece has the same shape.
   */
  readonly hunting: boolean
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
  /**
   * Lifetime damage this Tower has absorbed. Never reduced.
   *
   * Deliberately NOT derived as `maxHealth - health`. ♥ repair breaks that
   * identity: a Tower repaired to full must still report what it has weathered.
   * (♠ no longer breaks it — it moves health and maxHealth by the same
   * magnitude, so their difference is unchanged. ♥ alone is reason enough.)
   * A Jack's shield breaks it in the other direction —
   * damage a shield soaked never touched health at all, and it still counts
   * here, because absorbing a hit is still weathering it.
   *
   * Kept out of `structuralKey` on purpose — it only ever changes in the same
   * breath as `health` or `shield`, both of which are already in the key.
   */
  readonly damageTaken: number
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
  | { readonly kind: 'buildTower'; readonly cardId: string; readonly square: Square }
  | { readonly kind: 'supportTower'; readonly cardId: string; readonly towerId: string }
  | { readonly kind: 'shieldTower'; readonly cardId: string; readonly towerId: string }
  | {
      readonly kind: 'echoTower'
      readonly cardId: string
      readonly sourceTowerId: string
      readonly square: Square
    }
  | { readonly kind: 'reinforceCore'; readonly cardId: string }
  | { readonly kind: 'expandBoard'; readonly cardId: string }
  | { readonly kind: 'clearPieces'; readonly cardId: string }
