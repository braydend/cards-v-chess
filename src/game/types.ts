/**
 * Core types for the Cards V Chess rules engine.
 *
 * Everything here is plain data. No React, no three.js — see CLAUDE.md.
 * State is deeply readonly: `step` and `tick` return new state rather than
 * mutating, which is what keeps the simulation deterministic and testable.
 */

import type { PackType } from '../data/packs'
import type { Rng } from './rng'

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
   * moving. Under the universal combat rule a blocking Tower sits on one of
   * the Piece's attack tiles, so it deals this FULL value — the one carve-out
   * is a Pawn blocked straight ahead, whose blocker is not on an attack tile,
   * at `BLOCKED_ATTACK_MULTIPLIER` of this value. See the chess-tiers spec.
   */
  readonly attackDamage: number
  /**
   * Whether this Piece slides along a line. Sliders move one square per hop
   * and gain +1 from a King aura; everything else has a fixed hop.
   */
  readonly slides: boolean
  /**
   * Ink paid when a Tower destroys this Piece.
   *
   * Threat and scarcity, not durability — a Rook has the most health on the
   * roster and is still a wall rather than an event, so it pays less than a
   * Queen. Authored rather than derived from `maxHealth` for exactly that
   * reason, and so that retuning a Piece's durability does not silently
   * retune the economy.
   *
   * PLACEHOLDER balance. Ink's worth is set by what it buys, and packs do not
   * exist yet — see "Ink income values" in the design doc's open questions.
   */
  readonly inkReward: number
}

/** The four difficulty tiers a spawn can be assigned. Green is the baseline. */
export type PieceTier = 'green' | 'yellow' | 'red' | 'black'

export interface TierDef {
  readonly id: PieceTier
  readonly label: string
  /**
   * Whether the Piece hunts the Core from its first on-board hop. Yellow.
   * Pawns never read it — they promote — so a yellow Pawn marches and the
   * promoted Queen inherits the flag.
   */
  readonly huntsFromSpawn: boolean
  /** Whether the Piece detours to attack Towers within reach. Red only. */
  readonly seeksTowers: boolean
  /** Chance in [0, 1) a Tower shot at this Piece is negated. 0 = never. */
  readonly dodgeChance: number
  /**
   * How many moves away a red Piece considers a Tower worth seeking.
   * PLACEHOLDER tuning. 0 for every non-red tier (never read).
   */
  readonly reachInMoves: number
}

/**
 * Which way sideways. Drives the Knight's zig-zag, the Bishop's and Queen's
 * diagonal side, and the reflection off a file edge during the forward march.
 */
export type Handedness = 1 | -1

/**
 * Why a Piece left `state.pieces`, recorded for the renderer.
 *
 * A KILL IS THE ABSENCE OF A RECORD. Kills are unbounded within a round, so
 * logging them would be the wrong shape; leaks and promotions are both rare, so
 * recording those two and inferring the rest is exhaustive rather than a guess —
 * `reset()` and a Joker's Clear are the only other ways a Piece leaves, and the
 * renderer detects both separately. See `src/scene/pieceExit.ts`.
 */
export interface ExitRecord {
  /** The DEPARTING Piece's id — for a promotion, the Pawn's, not the Queen's. */
  readonly pieceId: string
  readonly typeId: PieceTypeId
  readonly reason: 'leak' | 'promotion'
  /**
   * The square it left FROM.
   *
   * For a leak this is NEVER the Core's square: a leaking Piece never occupies
   * it. `nextMove` returns `reachCore` for the square it would step to, and
   * `movePieces` drops the Piece without ever assigning it — so this is the
   * only record of where the impact should start.
   */
  readonly from: Square
}

export interface Piece {
  readonly id: string
  readonly typeId: PieceTypeId
  /** Set at spawn and inherited through promotion. Behavioural only — never stats or Ink. */
  readonly tier: PieceTier
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
   * Whether this Piece has started hunting the Core — direction from a
   * distance field over its own movement — instead of its forward march.
   * Knights hunt once their forward hops run out; the King and the sliders
   * hunt once their forward move would leave the board; Pawns promote instead
   * and never hunt. See `huntByOffsets` and `huntByField` in movement.ts.
   *
   * Latches true and never reverts. A same-colour Bishop's first hunting hop
   * goes *away* from rank 0, up to the diagonal intersection that routes it
   * back down to the Core; there it would have a legal forward diagonal
   * again. Without the latch it would revert to marching, reach rank 0
   * elsewhere, hunt again, and oscillate forever; the round would never end.
   * The latch is what breaks that cycle. (The Knight's version of the same
   * argument: its first hunting hop goes backwards.)
   *
   * Always false for Pawns and for a Pawn promoted into a Queen — a promoted
   * Queen is a fresh Piece — kept false rather than omitted so every Piece
   * has the same shape.
   */
  readonly hunting: boolean
  /**
   * Whether this Piece is a Queen minted by Pawn promotion.
   *
   * Renderer-facing and never read by the engine — the same category `buffed`
   * occupies. `Pieces.tsx` pops a Queen's mesh once, on the first frame it sees
   * one, which needs no diff: a promoted Queen gets a fresh entity id, so React
   * mounts a fresh mesh for it.
   *
   * False for every spawned Piece and every type that is not a promoted Queen,
   * kept false rather than omitted so every Piece has the same shape, exactly
   * as `hunting` is.
   */
  readonly promoted: boolean
}

/**
 * A Tower's firing geometry, set by the rank of the Card that built it.
 * Towers are generic — this is NOT chess-piece movement.
 *
 * `none` is a Tower that never fires. Rank 7 is the Wall: its whole identity
 * is blocking and soaking, so it has no firing geometry at all rather than a
 * geometry that happens to be empty.
 */
export type TowerGeometry =
  | 'none'
  | 'adjacent'
  | 'horizontal'
  | 'vertical'
  | 'cross'
  | 'diagonal'
  | 'star'
  | 'ring'
  | 'band'

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
  /** The difficulty tier this Piece is born with. */
  readonly tier: PieceTier
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
  /**
   * The most recent leaks and promotions, for the renderer to animate. Kills
   * are deliberately absent — see `ExitRecord`.
   *
   * NEVER CLEARED. Capped at `EXIT_RING_SIZE` in `tick.ts` instead, because
   * clearing it at `startRound` loses records: `tick` auto-starts by calling
   * `step` from inside itself, and `advance` runs up to five ticks before
   * emitting once, so a leak, the round ending and the auto-start can all land
   * inside a single frame — wiping the record before the renderer's only
   * publish. That is the last-Piece-leaks-and-ends-the-round case, the most
   * important leak in a round.
   *
   * Lookup is by `pieceId`, unique within a run because `nextEntityId` only
   * rises, so a stale record can never match a live Piece. Deliberately
   * duplicates part of what `leaks` counts: a count cannot say WHICH Piece or
   * FROM WHERE.
   */
  readonly recentExits: readonly ExitRecord[]
  /**
   * How many Joker Clears have resolved this run. Monotonic.
   *
   * The renderer's signal to flash the whole board rather than burst every
   * Piece it just saw vanish, and it cannot be inferred from an empty `pieces`
   * array — killing the last Piece on the board also empties it, and that one
   * SHOULD burst.
   *
   * A counter rather than a flag deliberately: `advance` runs up to five ticks
   * per emit, so anything written and cleared per tick can be lost, while a
   * monotonic count read per frame cannot.
   */
  readonly clears: number
  /**
   * The run currency.
   *
   * Earned three ways: destroying a Piece with Tower fire, completing a round,
   * and a quarter share when a Joker's Clear destroys the board. NEVER from
   * elapsed time — the gap between rounds is untimed, so time-based income
   * would be unbounded and the player would simply wait for it. It is spent on
   * packs alone, and never to play a Card.
   *
   * An integer. Every calculation that could produce a fraction floors in
   * `src/game/ink.ts`.
   */
  readonly ink: number
  /**
   * How many packs of each type have been bought this run.
   *
   * The price of a pack escalates with this — `packPrice(pack, count)` in
   * `src/game/packs.ts` — so it must live on the same object as the Ink it is
   * spent with. Per run: reset with the run, no persistence. The opening deal
   * is free and never goes through `buyPack`, so it never increments this.
   */
  readonly packPurchases: Record<PackType, number>
  readonly pendingSpawns: readonly Spawn[]
  /**
   * Monotonic counter so entity ids are deterministic, never random.
   *
   * Its **parity is load-bearing**: `tick.ts` reads it for a spawned Piece's
   * `handedness`. Do not spend it on anything that is not a Piece or a Tower —
   * Cards have `nextCardId` for this reason.
   */
  readonly nextEntityId: number
  /**
   * This run's seed. Runs are reproducible and shareable: same seed, same pack
   * contents, same opening deal.
   *
   * Supplied from outside the engine — `Math.random` is banned in this
   * directory, which is exactly why the engine cannot mint its own.
   */
  readonly seed: string
  /**
   * The run's PRNG streams, each derived from `seed` and independent of the
   * others. Packs are the only consumer today; a second random consumer takes a
   * new named stream rather than sharing this one, so adding it cannot shift
   * what an existing seed deals. See `src/game/rng.ts`.
   */
  readonly rng: {
    readonly packs: Rng
  }
  /**
   * Monotonic counter for Card ids.
   *
   * Deliberately NOT `nextEntityId`. That counter's **parity is load-bearing** —
   * `tick.ts` derives a spawned Piece's `handedness` from it, so consecutively
   * spawned Pieces weave opposite ways. Dealing a 10-card pack from it would
   * shift the parity and silently reverse Piece movement for the rest of the
   * run. Cards therefore count on their own.
   */
  readonly nextCardId: number
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
  | {
      /**
       * Buy a pack, culling to the cap in the same step.
       *
       * Atomic on purpose: cull and open commit together, so `GameState` never
       * holds a half-finished purchase and Cancel needs no rollback. The
       * in-progress cull selection is view state — see `src/state/uiStore.ts`.
       *
       * Valid only in the `gap` phase. That is the one exception to "commands
       * are valid both between rounds and mid-round", and it is what keeps round
       * termination bounded — see `src/game/roundTermination.test.ts`.
       */
      readonly kind: 'buyPack'
      readonly pack: PackType
      /** Required for a Suited pack, and forbidden for every other type. */
      readonly suit?: Suit
      /** Exactly `cullCountFor(deck.length, pack)` ids, no more and no fewer. */
      readonly cullCardIds: readonly string[]
    }
