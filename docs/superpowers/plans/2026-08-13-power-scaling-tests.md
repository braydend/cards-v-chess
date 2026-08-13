# Power Scaling Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic, pure-TypeScript harness in `src/balance/` that drives full honest runs through the real engine with three scripted bots, measures balance metrics, and gates CI on ratchet thresholds.

**Architecture:** `driver.ts` owns the honest loop — `tick` at the engine's fixed timestep, `step` for bot commands, refused commands skipped by identity — and records per-round traces. `bots.ts` are stateless `(state) => Command | null` policies built from shared strategy helpers (hand-picking, placement, pack/cull choice). `metrics.ts` aggregates RunResults; `thresholds.ts` holds the ratchet; `balance.test.ts` is the CI gate.

**Tech Stack:** TypeScript strict, Vitest, the existing engine at `src/game/` (pure, seeded, no React). No new dependencies.

## Global Constraints

- **No `Math.random` in `src/balance/`** — extend the existing ESLint determinism block to cover it. Runs must be reproducible.
- **Full honest sim only.** `tick` at the real `1000 / 60` fixed dt; bot commands through `step`. No dev commands, no time-compression.
- **Bots are scripted policies, not search.** `(state: GameState) => Command | null`.
- **Fixed seed list**, pinned in `seeds.ts`. Deterministic forever.
- **Thresholds are a ratchet, not targets** — measured from the current game during the bootstrap task, set with slack, raised by hand later.
- **No balance changes to the game itself** in this plan. The suite measures.
- **No report file artifact** — the report prints to test stdout.
- **`src/game/` never imports from `src/balance/`** — the direction is one-way, balance consumes the engine barrel.
- Bots use face cards in the gap only; the Joker is the single mid-round emergency card.

---

### Task 1: Scaffold `src/balance/` — types, seeds, lint and coverage config

**Files:**
- Create: `src/balance/types.ts`
- Create: `src/balance/seeds.ts`
- Modify: `eslint.config.js:42` (add `src/balance` to the determinism/renderer block's `files`)
- Modify: `vite.config.ts:63` (add `src/balance/**` coverage threshold)

**Interfaces:**
- Produces: `Bot`, `RoundTrace`, `RunOutcome`, `RunResult`, `PlacementStrategy`, `BotParams` in `src/balance/types.ts`; `SEEDS` in `src/balance/seeds.ts`. Later tasks import these exact names.

- [ ] **Step 1: Write `src/balance/types.ts`**

```ts
import type { PackType } from '../data/packs'
import type { TowerTypeId } from '../data/towerTypes'
import type { Command, GameState, HandType } from '../game'

/** A scripted player. Pure policy: decides a Command from the current state. */
export interface Bot {
  readonly name: string
  readonly decide: (state: GameState) => Command | null
}

/** One round's outcome, recorded by the driver. */
export interface RoundTrace {
  readonly roundNumber: number
  readonly spawned: number
  readonly killed: number
  readonly leaked: number
  readonly clearTimeMs: number
}

export type RunOutcome = 'won' | 'defeated' | 'stopped'

/** Everything the driver learns from one bot × seed run. */
export interface RunResult {
  readonly seed: string
  readonly botName: string
  readonly outcome: RunOutcome
  readonly finalRound: number
  readonly coreHealth: number
  readonly coreMaxHealth: number
  readonly ink: number
  readonly leaks: number
  readonly clears: number
  readonly totalKills: number
  readonly starved: boolean
  readonly starvationRounds: readonly number[]
  readonly rounds: readonly RoundTrace[]
}

/** Where a bot prefers to build. */
export type PlacementStrategy = 'maxCoverage' | 'spawnSide' | 'coreSide'

/** The knobs that turn one `makeBot` into three play styles. */
export interface BotParams {
  readonly name: string
  readonly placement: PlacementStrategy
  readonly packPreference: readonly PackType[]
  readonly inkReserve: number
  readonly minHand: HandType
  readonly royalChoice: TowerTypeId
  readonly emergencyClearThreshold: number
  readonly useExpand: boolean
}
```

- [ ] **Step 2: Write `src/balance/seeds.ts`**

```ts
/**
 * The pinned run seeds the balance matrix exercises.
 *
 * Deterministic forever: a win-rate change across these seeds is a real balance
 * change, never sampling noise. Extend this list when wider coverage is wanted;
 * do not replace it wholesale, or every threshold drifts in one commit.
 */
export const SEEDS: readonly string[] = ['alpha', 'bravo', 'charlie', 'delta', 'echo']
```

- [ ] **Step 3: Extend ESLint's determinism block to `src/balance/`**

In `eslint.config.js`, change the `files` of the block at line 42 (the one with `no-restricted-properties` / `Math.random` and the renderer `no-restricted-imports`):

```js
files: ['src/game/**/*.{ts,tsx}', 'src/data/**/*.{ts,tsx}', 'src/balance/**/*.{ts,tsx}'],
```

This bans `Math.random` and renderer imports in `src/balance/`, exactly as it does in `src/game/` and `src/data/`.

- [ ] **Step 4: Add the coverage threshold for `src/balance/`**

In `vite.config.ts`, add an entry to `coverage.thresholds`:

```ts
'src/balance/**': { statements: 85, branches: 85, functions: 85, lines: 90 },
```

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test:run src/balance` — expected: lint passes (empty `src/balance` has no violations), typecheck passes, vitest reports "No test files found" for `src/balance` (fine at this stage).

- [ ] **Step 6: Commit**

```bash
git add src/balance/types.ts src/balance/seeds.ts eslint.config.js vite.config.ts
git commit -m "feat(balance): scaffold power scaling suite types, seeds, config"
```

---

### Task 2: Strategy helpers — hand-picking, placement, packs

**Files:**
- Create: `src/balance/strategy.ts`
- Test: `src/balance/strategy.test.ts`

**Interfaces:**
- Consumes: `PlacementStrategy` from `./types`; engine barrel (`allSquares`, `canBuildOn`, `coveredSquares`, `cullCountFor`, `packPrice`); `towerType` from `../data/towerTypes`; `PackType` from `../data/packs`.
- Produces:
  - `HAND_STRENGTH: Record<HandType, number>` — rarity order, highCard 1 … royalFlush 10.
  - `bestHandInDeck(deck: readonly Card[]): HandPick | null` where `HandPick = { hand: HandType; cardIds: string[] }`.
  - `bestBuildSquare(state: GameState, pendingType: TowerTypeId, strategy: PlacementStrategy): Square | null`.
  - `preferredPack(state: GameState, preference: readonly PackType[], reserve: number): PackType | null`.
  - `cullIdsFor(deck: readonly Card[], pack: PackType): string[]`.

- [ ] **Step 1: Write the failing tests** — `src/balance/strategy.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { allSquares, canBuildOn, createInitialState, evaluateHand } from '../game'
import type { Card, CardRank, GameState, Suit } from '../game'
import { bestBuildSquare, bestHandInDeck, cullIdsFor, preferredPack } from './strategy'

function standard(id: string, rank: CardRank, suit: Suit): Card {
  return { id, kind: 'standard', rank, suit }
}

function deck(...cards: Card[]): Card[] {
  return cards
}

/** The cards a pick names, resolved back out of the deck. */
function cardsOf(deck: readonly Card[], pick: { hand: unknown; cardIds: readonly string[] }): Card[] {
  return pick.cardIds.map((id) => {
    const card = deck.find((candidate) => candidate.id === id)
    if (!card) throw new Error(`pick named missing card ${id}`)
    return card
  })
}

describe('bestHandInDeck', () => {
  it('returns null for an empty deck', () => {
    expect(bestHandInDeck([])).toBeNull()
  })

  it('returns null when the deck holds only Jokers', () => {
    expect(bestHandInDeck([{ id: 'j1', kind: 'joker' }])).toBeNull()
  })

  it('finds a high card from a single card', () => {
    const cards = deck(standard('a', 5, 'hearts'))
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('highCard')
    expect(cardsOf(cards, pick)).toHaveLength(1)
    expect(evaluateHand(cardsOf(cards, pick))).toBe('highCard')
  })

  it('finds a pair and only commits two cards', () => {
    const cards = deck(standard('a', 5, 'hearts'), standard('b', 5, 'clubs'), standard('c', 3, 'spades'))
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('pair')
    expect(cardsOf(cards, pick)).toHaveLength(2)
    expect(evaluateHand(cardsOf(cards, pick))).toBe('pair')
  })

  it('finds two pair', () => {
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 3, 'spades'),
      standard('d', 3, 'diamonds'),
    )
    expect(bestHandInDeck(cards)?.hand).toBe('twoPair')
  })

  it('finds three of a kind', () => {
    const cards = deck(standard('a', 5, 'hearts'), standard('b', 5, 'clubs'), standard('c', 5, 'spades'))
    expect(bestHandInDeck(cards)?.hand).toBe('threeOfAKind')
  })

  it('finds a straight of mixed suits', () => {
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 3, 'clubs'),
      standard('c', 4, 'spades'),
      standard('d', 5, 'diamonds'),
      standard('e', 6, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('straight')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('straight')
  })

  it('finds a wheel (A-2-3-4-5)', () => {
    const cards = deck(
      standard('a', 'A', 'hearts'),
      standard('b', 2, 'clubs'),
      standard('c', 3, 'spades'),
      standard('d', 4, 'diamonds'),
      standard('e', 5, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('straight')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('straight')
  })

  it('finds a flush', () => {
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 4, 'hearts'),
      standard('c', 6, 'hearts'),
      standard('d', 8, 'hearts'),
      standard('e', 10, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('flush')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('flush')
  })

  it('finds a full house', () => {
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 5, 'spades'),
      standard('d', 3, 'diamonds'),
      standard('e', 3, 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('fullHouse')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('fullHouse')
  })

  it('finds four of a kind', () => {
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 5, 'spades'),
      standard('d', 5, 'diamonds'),
    )
    expect(bestHandInDeck(cards)?.hand).toBe('fourOfAKind')
  })

  it('finds a straight flush', () => {
    const cards = deck(
      standard('a', 2, 'clubs'),
      standard('b', 3, 'clubs'),
      standard('c', 4, 'clubs'),
      standard('d', 5, 'clubs'),
      standard('e', 6, 'clubs'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('straightFlush')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('straightFlush')
  })

  it('finds a royal flush', () => {
    const cards = deck(
      standard('a', 10, 'spades'),
      standard('b', 'J', 'spades'),
      standard('c', 'Q', 'spades'),
      standard('d', 'K', 'spades'),
      standard('e', 'A', 'spades'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(pick.hand).toBe('royalFlush')
    expect(evaluateHand(cardsOf(cards, pick))).toBe('royalFlush')
  })

  it('returns the strongest hand in the deck, not the first found', () => {
    // A pair AND a flush: the flush wins.
    const cards = deck(
      standard('a', 5, 'hearts'),
      standard('b', 5, 'clubs'),
      standard('c', 2, 'hearts'),
      standard('d', 4, 'hearts'),
      standard('e', 6, 'hearts'),
      standard('f', 8, 'hearts'),
    )
    expect(bestHandInDeck(cards)?.hand).toBe('flush')
  })

  it('every pick evaluates as a valid hand in the engine', () => {
    // A spread deck with several patterns: whatever it picks must be legal.
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 3, 'clubs'),
      standard('c', 4, 'spades'),
      standard('d', 5, 'diamonds'),
      standard('e', 6, 'hearts'),
      standard('f', 6, 'clubs'),
      standard('g', 'J', 'spades'),
      standard('h', 'Q', 'hearts'),
    )
    const pick = bestHandInDeck(cards)
    if (pick === null) throw new Error('expected a pick')
    expect(evaluateHand(cardsOf(cards, pick))).not.toBeNull()
  })
})

describe('bestBuildSquare', () => {
  function fresh(): GameState {
    return createInitialState('alpha')
  }

  it('returns a square the engine accepts for building', () => {
    const state = fresh()
    const square = bestBuildSquare(state, 'vertical', 'maxCoverage')
    if (square === null) throw new Error('expected a square')
    expect(canBuildOn(state, square)).toBe(true)
  })

  it('prefers the far rank under spawnSide', () => {
    const state = fresh()
    const spawnSide = bestBuildSquare(state, 'vertical', 'spawnSide')
    const coreSide = bestBuildSquare(state, 'vertical', 'coreSide')
    if (spawnSide === null || coreSide === null) throw new Error('expected squares')
    expect(spawnSide.rank).toBeGreaterThan(coreSide.rank)
  })

  it('returns a square inside the board', () => {
    const state = fresh()
    const square = bestBuildSquare(state, 'cross', 'maxCoverage')
    if (square === null) throw new Error('expected a square')
    expect(allSquares(state.board)).toContainEqual(square)
  })
})

describe('preferredPack and cullIdsFor', () => {
  it('picks the first affordable pack in preference order', () => {
    const state = { ...createInitialState('alpha'), ink: 100 }
    expect(preferredPack(state, ['scrap', 'base', 'suited', 'court'], 0)).toBe('scrap')
  })

  it('respects an ink reserve', () => {
    const state = { ...createInitialState('alpha'), ink: 100 }
    expect(preferredPack(state, ['scrap', 'base', 'suited', 'court'], 60)).toBeNull()
  })

  it('culls the lowest-value cards to fit a pack', () => {
    const cards = deck(
      standard('a', 2, 'hearts'),
      standard('b', 10, 'clubs'),
      standard('c', 'A', 'spades'),
      { id: 'd', kind: 'joker' },
    )
    // 26 numbered twos + these 4 = 30 cards, already at the cap. A Base pack
    // (size 10) pushes past it by 10, so exactly 10 must be culled — and the
    // ten lowest-value cards are all twos, so the Joker and Ace survive.
    const big: Card[] = []
    for (let i = 0; i < 26; i += 1) {
      big.push(standard(`s${i}`, 2, 'hearts'))
    }
    big.push(...cards)
    const ids = cullIdsFor(big, 'base')
    expect(ids).toHaveLength(10)
    // The Joker (value 15) and the Ace (14) must survive any cull.
    expect(ids).not.toContain('d')
    expect(ids).not.toContain('c')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/balance/strategy.test.ts`
Expected: FAIL — module `./strategy` has no exports (`bestHandInDeck` is not exported).

- [ ] **Step 3: Write the minimal implementation** — `src/balance/strategy.ts`

```ts
import type { PackType } from '../data/packs'
import { towerType } from '../data/towerTypes'
import { allSquares, canBuildOn, coveredSquares, cullCountFor, packPrice } from '../game'
import type { Card, CardRank, GameState, HandType, Square, Suit, TowerTypeId } from '../game'
import type { PlacementStrategy } from './types'

type StandardCard = Extract<Card, { kind: 'standard' }>

export interface HandPick {
  readonly hand: HandType
  readonly cardIds: readonly string[]
}

/** Rarity order — highCard weakest, royalFlush strongest. */
export const HAND_STRENGTH: Record<HandType, number> = {
  highCard: 1,
  pair: 2,
  twoPair: 3,
  threeOfAKind: 4,
  straight: 5,
  flush: 6,
  fullHouse: 7,
  fourOfAKind: 8,
  straightFlush: 9,
  royalFlush: 10,
}

function rankValue(rank: CardRank): number {
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') return 13
  if (rank === 'A') return 14
  return rank
}

function group(standard: readonly StandardCard[]): {
  byRank: Map<number, StandardCard[]>
  bySuit: Map<Suit, StandardCard[]>
} {
  const byRank = new Map<number, StandardCard[]>()
  const bySuit = new Map<Suit, StandardCard[]>()
  for (const card of standard) {
    const value = rankValue(card.rank)
    byRank.set(value, [...(byRank.get(value) ?? []), card])
    bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card])
  }
  return { byRank, bySuit }
}

/** One card of each value, or null when any is missing. 1 means Ace-low. */
function idsForValues(cards: readonly StandardCard[], values: readonly number[]): string[] | null {
  const ids: string[] = []
  for (const value of values) {
    const target = value === 1 ? 14 : value
    const card = cards.find((candidate) => rankValue(candidate.rank) === target)
    if (!card) return null
    ids.push(card.id)
  }
  return ids
}

/** The first 5-consecutive window these values contain, wheel-aware, or null. */
function straightValues(values: readonly number[]): number[] | null {
  const present = new Set(values)
  if (present.has(14)) present.add(1)
  for (let low = 1; low <= 10; low += 1) {
    const window = [low, low + 1, low + 2, low + 3, low + 4]
    if (window.every((value) => present.has(value))) return window
  }
  return null
}

/**
 * The strongest hand the Deck can commit as exactly one hand, or null when it
 * holds no standard card. Scans strongest to weakest and returns the first
 * pattern found, so a Deck holding both a pair and a flush commits the flush.
 */
export function bestHandInDeck(deck: readonly Card[]): HandPick | null {
  const standard = deck.filter((card): card is StandardCard => card.kind === 'standard')
  if (standard.length === 0) return null
  const { byRank, bySuit } = group(standard)

  for (const suit of bySuit.keys()) {
    const cards = bySuit.get(suit) ?? []
    const ids = idsForValues(cards, [10, 11, 12, 13, 14])
    if (ids) return { hand: 'royalFlush', cardIds: ids }
  }

  for (const suit of bySuit.keys()) {
    const cards = bySuit.get(suit) ?? []
    const window = straightValues(cards.map((card) => rankValue(card.rank)))
    if (window) {
      const ids = idsForValues(cards, window)
      if (ids) return { hand: 'straightFlush', cardIds: ids }
    }
  }

  for (const cards of byRank.values()) {
    if (cards.length >= 4) {
      return { hand: 'fourOfAKind', cardIds: cards.slice(0, 4).map((card) => card.id) }
    }
  }

  const triples = [...byRank.entries()].filter(([, cards]) => cards.length >= 3)
  for (const [tripleValue, triple] of triples) {
    const pair = [...byRank.entries()].find(
      ([value, cards]) => value !== tripleValue && cards.length >= 2,
    )
    if (pair) {
      return {
        hand: 'fullHouse',
        cardIds: [...triple.slice(0, 3), ...pair[1].slice(0, 2)].map((card) => card.id),
      }
    }
  }

  for (const cards of bySuit.values()) {
    if (cards.length >= 5) {
      return { hand: 'flush', cardIds: cards.slice(0, 5).map((card) => card.id) }
    }
  }

  const window = straightValues([...byRank.keys()])
  if (window) {
    const ids = idsForValues(standard, window)
    if (ids) return { hand: 'straight', cardIds: ids }
  }

  for (const cards of byRank.values()) {
    if (cards.length >= 3) {
      return { hand: 'threeOfAKind', cardIds: cards.slice(0, 3).map((card) => card.id) }
    }
  }

  const pairs = [...byRank.entries()].filter(([, cards]) => cards.length >= 2)
  if (pairs.length >= 2) {
    return {
      hand: 'twoPair',
      cardIds: pairs
        .slice(0, 2)
        .flatMap(([, cards]) => cards.slice(0, 2).map((card) => card.id)),
    }
  }

  for (const cards of byRank.values()) {
    if (cards.length >= 2) {
      return { hand: 'pair', cardIds: cards.slice(0, 2).map((card) => card.id) }
    }
  }

  const best = standard.reduce((a, b) => (rankValue(b.rank) > rankValue(a.rank) ? b : a))
  return { hand: 'highCard', cardIds: [best.id] }
}

/**
 * The buildable square a Tower of this type prefers under this strategy.
 *
 * `maxCoverage` maximises covered squares; `spawnSide` maximises rank (blocks
 * incoming Pieces early); `coreSide` minimises rank (defends the Core). The
 * Wall — geometry 'none', zero coverage — always takes the spawnSide treatment,
 * since it blocks rather than shoots. Ties break on `allSquares` order, so the
 * choice is deterministic.
 */
export function bestBuildSquare(
  state: GameState,
  pendingType: TowerTypeId,
  strategy: PlacementStrategy,
): Square | null {
  const def = towerType(pendingType)
  const squares = allSquares(state.board).filter((square) => canBuildOn(state, square))
  let best: Square | null = null
  let bestScore = -1

  for (const square of squares) {
    const coverage =
      def.geometry === 'none'
        ? 0
        : coveredSquares(state.board, def.geometry, def.range, square).length
    const score =
      strategy === 'spawnSide' || def.geometry === 'none'
        ? square.rank * 1000 + coverage
        : strategy === 'coreSide'
          ? (state.board.ranks - square.rank) * 1000 + coverage
          : coverage
    if (score > bestScore) {
      best = square
      bestScore = score
    }
  }

  return best
}

/** The first pack in `preference` the player can afford after holding `reserve`. */
export function preferredPack(
  state: GameState,
  preference: readonly PackType[],
  reserve: number,
): PackType | null {
  for (const pack of preference) {
    if (state.ink - reserve >= packPrice(pack, state.packPurchases[pack])) return pack
  }
  return null
}

/** The lowest-value card ids to destroy so a pack of this type fits the cap. */
export function cullIdsFor(deck: readonly Card[], pack: PackType): string[] {
  const count = cullCountFor(deck.length, pack)
  if (count === 0) return []

  const value = (card: Card): number => (card.kind === 'joker' ? 15 : rankValue(card.rank))
  const sorted = [...deck].sort((a, b) => value(b) - value(a))
  return sorted.slice(-count).map((card) => card.id)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/balance/strategy.test.ts`
Expected: all green.

- [ ] **Step 5: Verify lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/balance/strategy.ts src/balance/strategy.test.ts
git commit -m "feat(balance): strategy helpers for hand picking, placement, packs"
```

---

### Task 3: The driver — the honest full loop

**Files:**
- Create: `src/balance/driver.ts`
- Test: `src/balance/driver.test.ts`

**Interfaces:**
- Consumes: `Bot`, `RoundTrace`, `RunResult` from `./types`; engine barrel (`canAfford`, `createInitialState`, `step`, `tick`); `PACK_TYPES` from `../data/packs`; `VICTORY_ROUND`, `roundSpec` from `../data/rounds`.
- Produces:
  - `FIXED_DT_MS = 1000 / 60`
  - `isStarved(state: GameState): boolean`
  - `runSimulation(seed: string, bot: Bot, options?: { maxRounds?: number }): RunResult`

- [ ] **Step 1: Write the failing tests** — `src/balance/driver.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { createInitialState, DEV_SEED } from '../game'
import type { GameState } from '../game'
import { isStarved, runSimulation } from './driver'
import type { Bot } from './types'

const NOOP: Bot = { name: 'noop', decide: () => null }

/** A bot that only ever issues one invalid command — must not hang the driver. */
const BAD: Bot = {
  name: 'bad',
  decide: () => ({ kind: 'buyPack', pack: 'court', cullCardIds: [] }),
}

describe('isStarved', () => {
  it('flags an empty deck with nothing affordable', () => {
    const state = { ...createInitialState(DEV_SEED), deck: [], ink: 0 }
    expect(isStarved(state)).toBe(true)
  })

  it('does not flag an empty deck when a pack is affordable', () => {
    const state = { ...createInitialState(DEV_SEED), deck: [], ink: 500 }
    expect(isStarved(state)).toBe(false)
  })

  it('does not flag a deck with cards', () => {
    expect(isStarved(createInitialState(DEV_SEED))).toBe(false)
  })
})

describe('runSimulation', () => {
  it('a no-op bot loses deterministically', () => {
    const first = runSimulation(DEV_SEED, NOOP)
    const second = runSimulation(DEV_SEED, NOOP)

    expect(first.outcome).toBe('defeated')
    expect(second.outcome).toBe('defeated')
    expect(first.finalRound).toBe(second.finalRound)
    expect(first.coreHealth).toBe(0)
    // One trace per round played, including the round that ended the run.
    expect(first.rounds).toHaveLength(first.finalRound)
  })

  it('records leaks and clear time per round', () => {
    const result = runSimulation(DEV_SEED, NOOP)
    const last = result.rounds[result.rounds.length - 1]
    expect(result.leaks).toBeGreaterThan(0)
    expect(last.clearTimeMs).toBeGreaterThan(0)
    expect(result.totalKills).toBe(0)
  })

  it('skips refused commands without hanging', () => {
    const result = runSimulation(DEV_SEED, BAD)
    expect(result.outcome).toBe('defeated')
    expect(result.finalRound).toBeGreaterThan(0)
  })

  it('stops at maxRounds with outcome stopped', () => {
    const result = runSimulation(DEV_SEED, NOOP, { maxRounds: 2 })
    expect(result.outcome).toBe('stopped')
    expect(result.finalRound).toBe(3)
    expect(result.rounds).toHaveLength(2)
  })

  it('does not flag starvation when the opening deck is playable', () => {
    const result = runSimulation(DEV_SEED, NOOP, { maxRounds: 2 })
    expect(result.starved).toBe(false)
    expect(result.starvationRounds).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/balance/driver.test.ts`
Expected: FAIL — `./driver` has no exports.

- [ ] **Step 3: Write the minimal implementation** — `src/balance/driver.ts`

```ts
import { PACK_TYPES } from '../data/packs'
import { VICTORY_ROUND, roundSpec } from '../data/rounds'
import { canAfford, createInitialState, step, tick } from '../game'
import type { Command, GameState } from '../game'
import type { Bot, RoundTrace, RunResult } from './types'

export const FIXED_DT_MS = 1000 / 60

/**
 * How many commands the driver will accept from a bot within one gap.
 *
 * Defensive only: a well-behaved bot is bounded by the deck cap and its Ink,
 * both finite. The bound exists so a runaway bot cannot spin the gap forever.
 */
const MAX_GAP_COMMANDS = 10_000

/**
 * Whether a player in this gap is permanently stuck: no cards left to commit
 * and no pack they can afford. The "running out of cards" open question.
 */
export function isStarved(state: GameState): boolean {
  if (state.deck.length > 0) return false
  return !PACK_TYPES.some((pack) => canAfford(state.ink, pack, state.packPurchases[pack]))
}

export interface RunOptions {
  /** Stop the run once `roundNumber` exceeds this. Defaults to `VICTORY_ROUND`. */
  readonly maxRounds?: number
}

/**
 * Drives one full run: the real engine, nothing else.
 *
 * `tick` at the engine's fixed timestep, `step` for every bot command, refused
 * commands detected by identity (a refusal returns the same state object) and
 * skipped. Ends on `defeated`, `victory`, or `maxRounds`.
 */
export function runSimulation(seed: string, bot: Bot, options: RunOptions = {}): RunResult {
  const maxRounds = options.maxRounds ?? VICTORY_ROUND
  let state = createInitialState(seed)
  const rounds: RoundTrace[] = []
  const starvationRounds: number[] = []

  while (state.phase === 'gap' || state.phase === 'inProgress') {
    if (state.phase !== 'gap') break // defence: never reached by the loop shape below

    if (state.roundNumber > maxRounds) break
    if (isStarved(state)) starvationRounds.push(state.roundNumber)

    const roundNumber = state.roundNumber
    const startPieces = state.pieces.length
    const startLeaks = state.leaks
    const spawned = roundSpec(roundNumber).spawns.length

    state = resolveGap(state, bot)
    const started = step(state, { kind: 'startRound' })
    if (started === state) break // startRound refused — a bot left a Tower pending; do not hang

    const result = runRound(started, bot)
    state = result.state
    const leaked = state.leaks - startLeaks
    // Every Piece that entered the round — carried over plus spawned — either
    // leaked, died, or is still standing. Kills is the middle term.
    const killed = Math.max(0, startPieces + spawned - state.pieces.length - leaked)
    rounds.push({ roundNumber, spawned, killed, leaked, clearTimeMs: result.clearTimeMs })
  }

  return {
    seed,
    botName: bot.name,
    outcome: state.phase === 'victory' ? 'won' : state.phase === 'defeated' ? 'defeated' : 'stopped',
    finalRound: state.roundNumber,
    coreHealth: state.core.health,
    coreMaxHealth: state.core.maxHealth,
    ink: state.ink,
    leaks: state.leaks,
    clears: state.clears,
    totalKills: rounds.reduce((sum, trace) => sum + trace.killed, 0),
    starved: starvationRounds.length > 0,
    starvationRounds,
    rounds,
  }
}

/** Polls the bot for commands until it is done, then returns the settled state. */
function resolveGap(state: GameState, bot: Bot): GameState {
  let current = state
  for (let i = 0; i < MAX_GAP_COMMANDS; i += 1) {
    const command = bot.decide(current)
    if (!command) return current
    const next = step(current, command)
    if (next === current) return current // refused — a stateless bot would repeat it forever
    current = next
  }
  return current
}

/** Advances one round until it leaves `inProgress`, polling the bot once per tick. */
function runRound(state: GameState, bot: Bot): { state: GameState; clearTimeMs: number } {
  let current = state
  let clearTimeMs = 0
  while (current.phase === 'inProgress') {
    const command = bot.decide(current)
    if (command) {
      const next = step(current, command)
      if (next !== current) {
        current = next
        continue
      }
    }
    clearTimeMs = current.roundElapsedMs
    current = tick(current, FIXED_DT_MS)
  }
  return { state: current, clearTimeMs }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/balance/driver.test.ts`
Expected: all green.

- [ ] **Step 5: Verify lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/balance/driver.ts src/balance/driver.test.ts
git commit -m "feat(balance): honest run driver for the power scaling suite"
```

---

### Task 4: The three bots

**Files:**
- Create: `src/balance/bots.ts`
- Test: `src/balance/bots.test.ts`

**Interfaces:**
- Consumes: `Bot`, `BotParams` from `./types`; `HAND_STRENGTH`, `bestBuildSquare`, `bestHandInDeck`, `cullIdsFor`, `preferredPack` from `./strategy`; `pendingUpgrades` from the engine barrel.
- Produces: `makeBot(params: BotParams): Bot`, `VALUE_BOT`, `AGGRO_BOT`, `CONSERVATIVE_BOT`, `BOTS: readonly Bot[]`.

- [ ] **Step 1: Write the failing tests** — `src/balance/bots.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../game'
import type { Card, CardRank, Suit } from '../game'
import { runSimulation } from './driver'
import { AGGRO_BOT, BOTS, CONSERVATIVE_BOT, VALUE_BOT } from './bots'

function standard(id: string, rank: CardRank, suit: Suit): Card {
  return { id, kind: 'standard', rank, suit }
}

describe('bots', () => {
  it('each bot drives two rounds without hanging', () => {
    for (const bot of BOTS) {
      const result = runSimulation('alpha', bot, { maxRounds: 2 })
      expect(result.outcome).toBe('stopped')
      expect(result.finalRound).toBe(3)
      expect(result.rounds).toHaveLength(2)
    }
  })

  it('each bot spends ink over two rounds', () => {
    for (const bot of BOTS) {
      const result = runSimulation('alpha', bot, { maxRounds: 2 })
      expect(result.ink).toBeGreaterThanOrEqual(0)
    }
  })

  it('a bot places a pending Tower it bought', () => {
    const state = { ...createInitialState('alpha'), pendingTower: 'wall' }
    const command = VALUE_BOT.decide(state)
    expect(command?.kind).toBe('placeTower')
    if (command && command.kind === 'placeTower') {
      expect(command.square.rank).toBeGreaterThan(0)
    }
  })

  it('a bot plays the strongest hand in its Deck', () => {
    const state = {
      ...createInitialState('alpha'),
      deck: [standard('a', 5, 'hearts'), standard('b', 5, 'clubs')],
    }
    const command = VALUE_BOT.decide(state)
    expect(command?.kind).toBe('playHand')
    if (command && command.kind === 'playHand') {
      expect(command.cardIds).toHaveLength(2)
    }
  })

  it('the conservative bot refuses a lone high card', () => {
    const state = { ...createInitialState('alpha'), deck: [standard('a', 5, 'hearts')] }
    expect(CONSERVATIVE_BOT.decide(state)).toBeNull()
  })

  it('the aggro bot still runs to the same bound as the others', () => {
    const result = runSimulation('bravo', AGGRO_BOT, { maxRounds: 2 })
    expect(result.rounds).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/balance/bots.test.ts`
Expected: FAIL — `./bots` has no exports.

- [ ] **Step 3: Write the minimal implementation** — `src/balance/bots.ts`

```ts
import { pendingUpgrades } from '../game'
import type { Command, GameState, Tower } from '../game'
import { HAND_STRENGTH, bestBuildSquare, bestHandInDeck, cullIdsFor, preferredPack } from './strategy'
import type { Bot, BotParams } from './types'

function decide(state: GameState, params: BotParams): Command | null {
  return state.phase === 'inProgress' ? decideMidRound(state, params) : decideGap(state, params)
}

function decideGap(state: GameState, params: BotParams): Command | null {
  if (state.pendingTower !== null) {
    const square = bestBuildSquare(state, state.pendingTower, params.placement)
    return square ? { kind: 'placeTower', square } : { kind: 'cancelPlacement' }
  }

  const upgrade = nextUpgrade(state)
  if (upgrade) return upgrade

  const face = nextFace(state, params)
  if (face) return face

  const pack = preferredPack(state, params.packPreference, params.inkReserve)
  if (pack) return { kind: 'buyPack', pack, cullCardIds: cullIdsFor(state.deck, pack) }

  const pick = bestHandInDeck(state.deck)
  if (pick && HAND_STRENGTH[pick.hand] >= HAND_STRENGTH[params.minHand]) {
    if (pick.hand === 'royalFlush') {
      return { kind: 'playHand', cardIds: pick.cardIds, chosenType: params.royalChoice }
    }
    return { kind: 'playHand', cardIds: pick.cardIds }
  }

  return null
}

function decideMidRound(state: GameState, params: BotParams): Command | null {
  const upgrade = nextUpgrade(state)
  if (upgrade) return upgrade

  // The one deliberate mid-round card: the Joker as an emergency board wipe.
  if (state.pieces.length >= params.emergencyClearThreshold) {
    const joker = state.deck.find((card) => card.kind === 'joker')
    if (joker) return { kind: 'clearPieces', cardId: joker.id }
  }

  return null
}

function nextUpgrade(state: GameState): Command | null {
  for (const tower of state.towers) {
    if (tower.type === 'wall') continue
    if (pendingUpgrades(tower.kills, tower.upgradesSpent) > 0) {
      const stat = tower.health < tower.maxHealth * 0.5 ? 'health' : 'damage'
      return { kind: 'upgradeTower', towerId: tower.id, stat }
    }
  }
  return null
}

function nextFace(state: GameState, params: BotParams): Command | null {
  const tower = strongestTower(state)

  const jack = state.deck.find((card) => card.kind === 'standard' && card.rank === 'J')
  if (tower && jack) return { kind: 'shieldTower', cardId: jack.id, towerId: tower.id }

  const queen = state.deck.find((card) => card.kind === 'standard' && card.rank === 'Q')
  if (tower && queen) return { kind: 'rangeTower', cardId: queen.id, towerId: tower.id }

  const king = state.deck.find((card) => card.kind === 'standard' && card.rank === 'K')
  if (king) return { kind: 'reinforceCore', cardId: king.id }

  const ace = state.deck.find((card) => card.kind === 'standard' && card.rank === 'A')
  if (params.useExpand && ace) return { kind: 'expandBoard', cardId: ace.id }

  return null
}

function strongestTower(state: GameState): Tower | null {
  let best: Tower | null = null
  for (const tower of state.towers) {
    if (!best || tower.damage > best.damage) best = tower
  }
  return best
}

/** One parameterised bot policy. See `BotParams` for the knobs. */
export function makeBot(params: BotParams): Bot {
  return { name: params.name, decide: (state) => decide(state, params) }
}

/** The sensible-player baseline: strongest hand, coverage-max placement, steady packs. */
export const VALUE_BOT = makeBot({
  name: 'value',
  placement: 'maxCoverage',
  packPreference: ['base', 'scrap', 'suited', 'court'],
  inkReserve: 0,
  minHand: 'highCard',
  royalChoice: 'tollgate',
  emergencyClearThreshold: 15,
  useExpand: true,
})

/** Spend-early: cheap packs, Towers pushed to the spawn side, low clear threshold. */
export const AGGRO_BOT = makeBot({
  name: 'aggro',
  placement: 'spawnSide',
  packPreference: ['scrap', 'base', 'suited', 'court'],
  inkReserve: 0,
  minHand: 'highCard',
  royalChoice: 'tollgate',
  emergencyClearThreshold: 10,
  useExpand: true,
})

/** Hoard: Court packs, only pair-and-better hands, Core-side placement, save the Aces. */
export const CONSERVATIVE_BOT = makeBot({
  name: 'conservative',
  placement: 'coreSide',
  packPreference: ['court', 'suited', 'base', 'scrap'],
  inkReserve: 50,
  minHand: 'pair',
  royalChoice: 'ring',
  emergencyClearThreshold: 20,
  useExpand: false,
})

/** The full matrix roster, in the order the gate runs them. */
export const BOTS: readonly Bot[] = [VALUE_BOT, AGGRO_BOT, CONSERVATIVE_BOT]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/balance/bots.test.ts`
Expected: all green.

- [ ] **Step 5: Verify lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/balance/bots.ts src/balance/bots.test.ts
git commit -m "feat(balance): value, aggro and conservative scripted bots"
```

---

### Task 5: Metrics and aggregation

**Files:**
- Create: `src/balance/metrics.ts`
- Test: `src/balance/metrics.test.ts`

**Interfaces:**
- Consumes: `RunResult`, `RoundTrace` from `./types`.
- Produces:
  - `interface RoundMean { roundNumber; meanKilled; meanLeaked; meanClearTimeMs }`
  - `interface BalanceMetrics { runs; wins; winRate; medianCoreHealthAtWin; meanInkAtWin; meanInkAtLoss; medianFailureRound: number | null; starvedRuns: string[]; perRound: RoundMean[] }`
  - `aggregateMetrics(results: readonly RunResult[]): BalanceMetrics`
  - `formatReport(metrics: BalanceMetrics): string`

- [ ] **Step 1: Write the failing tests** — `src/balance/metrics.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { aggregateMetrics, formatReport } from './metrics'
import type { RunResult } from './types'

function result(partial: Partial<RunResult> & { seed: string; botName: string }): RunResult {
  return {
    outcome: 'stopped',
    finalRound: 1,
    coreHealth: 0,
    coreMaxHealth: 100,
    ink: 0,
    leaks: 0,
    clears: 0,
    totalKills: 0,
    starved: false,
    starvationRounds: [],
    rounds: [],
    ...partial,
  }
}

describe('aggregateMetrics', () => {
  it('computes win rate and margin across the matrix', () => {
    const results = [
      result({ seed: 'a', botName: 'v', outcome: 'won', coreHealth: 80, ink: 120 }),
      result({ seed: 'b', botName: 'v', outcome: 'won', coreHealth: 40, ink: 60 }),
      result({ seed: 'c', botName: 'v', outcome: 'defeated', finalRound: 60, ink: 30 }),
    ]
    const metrics = aggregateMetrics(results)

    expect(metrics.runs).toBe(3)
    expect(metrics.wins).toBe(2)
    expect(metrics.winRate).toBeCloseTo(2 / 3)
    expect(metrics.medianCoreHealthAtWin).toBe(60)
    expect(metrics.meanInkAtWin).toBeCloseTo(90)
    expect(metrics.meanInkAtLoss).toBeCloseTo(30)
    expect(metrics.medianFailureRound).toBe(60)
  })

  it('reports no failure round when nothing was lost', () => {
    const results = [result({ seed: 'a', botName: 'v', outcome: 'won' })]
    expect(aggregateMetrics(results).medianFailureRound).toBeNull()
  })

  it('lists starved runs as bot:seed', () => {
    const results = [
      result({ seed: 'a', botName: 'value', starved: true, starvationRounds: [4, 5] }),
      result({ seed: 'b', botName: 'aggro', starved: false }),
    ]
    expect(aggregateMetrics(results).starvedRuns).toEqual(['value:a'])
  })

  it('averages per-round traces across runs', () => {
    const results = [
      result({
        seed: 'a',
        botName: 'v',
        rounds: [{ roundNumber: 1, spawned: 3, killed: 2, leaked: 1, clearTimeMs: 10_000 }],
      }),
      result({
        seed: 'b',
        botName: 'v',
        rounds: [{ roundNumber: 1, spawned: 3, killed: 3, leaked: 0, clearTimeMs: 12_000 }],
      }),
    ]
    const perRound = aggregateMetrics(results).perRound
    const first = perRound[0]
    if (first === undefined) throw new Error('expected a per-round mean')

    expect(perRound).toHaveLength(1)
    expect(first).toEqual({
      roundNumber: 1,
      meanKilled: 2.5,
      meanLeaked: 0.5,
      meanClearTimeMs: 11_000,
    })
  })

  it('returns zero win rate for an empty matrix', () => {
    const metrics = aggregateMetrics([])
    expect(metrics.runs).toBe(0)
    expect(metrics.winRate).toBe(0)
  })
})

describe('formatReport', () => {
  it('renders the headline numbers as text', () => {
    const metrics = aggregateMetrics([result({ seed: 'a', botName: 'v', outcome: 'won' })])
    const report = formatReport(metrics)
    expect(report).toContain('winRate=100.0%')
    expect(report).toContain('medianFailureRound=n/a')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/balance/metrics.test.ts`
Expected: FAIL — `./metrics` has no exports.

- [ ] **Step 3: Write the minimal implementation** — `src/balance/metrics.ts`

```ts
import type { RoundTrace, RunResult } from './types'

export interface RoundMean {
  readonly roundNumber: number
  readonly meanKilled: number
  readonly meanLeaked: number
  readonly meanClearTimeMs: number
}

export interface BalanceMetrics {
  readonly runs: number
  readonly wins: number
  readonly winRate: number
  readonly medianCoreHealthAtWin: number
  readonly meanInkAtWin: number
  readonly meanInkAtLoss: number
  readonly medianFailureRound: number | null
  readonly starvedRuns: readonly string[]
  readonly perRound: readonly RoundMean[]
}

export function aggregateMetrics(results: readonly RunResult[]): BalanceMetrics {
  const runs = results.length
  const wins = results.filter((result) => result.outcome === 'won')
  const losses = results.filter((result) => result.outcome === 'defeated')

  return {
    runs,
    wins: wins.length,
    winRate: runs === 0 ? 0 : wins.length / runs,
    medianCoreHealthAtWin: median(wins.map((result) => result.coreHealth)) ?? 0,
    meanInkAtWin: mean(wins.map((result) => result.ink)),
    meanInkAtLoss: mean(losses.map((result) => result.ink)),
    medianFailureRound: median(losses.map((result) => result.finalRound)),
    starvedRuns: results
      .filter((result) => result.starved)
      .map((result) => `${result.botName}:${result.seed}`),
    perRound: meanPerRound(results),
  }
}

function meanPerRound(results: readonly RunResult[]): RoundMean[] {
  const maxRound = Math.max(0, ...results.map((result) => result.finalRound))
  const perRound: RoundMean[] = []

  for (let roundNumber = 1; roundNumber <= maxRound; roundNumber += 1) {
    const traces = results.flatMap((result) =>
      result.rounds.filter((trace) => trace.roundNumber === roundNumber),
    )
    if (traces.length === 0) continue
    perRound.push({
      roundNumber,
      meanKilled: mean(traces.map((trace) => trace.killed)),
      meanLeaked: mean(traces.map((trace) => trace.leaked)),
      meanClearTimeMs: mean(traces.map((trace) => trace.clearTimeMs)),
    })
  }

  return perRound
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** The human-readable report the gate prints. No file artifact. */
export function formatReport(metrics: BalanceMetrics): string {
  return [
    `runs=${metrics.runs} wins=${metrics.wins} winRate=${(metrics.winRate * 100).toFixed(1)}%`,
    `medianCoreHealthAtWin=${metrics.medianCoreHealthAtWin}`,
    `meanInkAtWin=${metrics.meanInkAtWin.toFixed(1)} meanInkAtLoss=${metrics.meanInkAtLoss.toFixed(1)}`,
    `medianFailureRound=${metrics.medianFailureRound ?? 'n/a'}`,
    `starvedRuns=${metrics.starvedRuns.length > 0 ? metrics.starvedRuns.join(',') : 'none'}`,
  ].join('\n')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/balance/metrics.test.ts`
Expected: all green.

- [ ] **Step 5: Verify lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/balance/metrics.ts src/balance/metrics.test.ts
git commit -m "feat(balance): metric aggregation and report for the balance suite"
```

---

### Task 6: Thresholds

**Files:**
- Create: `src/balance/thresholds.ts`
- Test: `src/balance/thresholds.test.ts`

**Interfaces:**
- Consumes: `BalanceMetrics` from `./metrics`.
- Produces:
  - `interface BalanceThresholds { minWinRate; maxStarvedRuns; minMedianCoreHealthAtWin; minMedianFailureRound: number | null }`
  - `interface ThresholdResult { label; actual; limit; pass }`
  - `BALANCE_THRESHOLDS: BalanceThresholds` (placeholder values)
  - `checkThresholds(metrics: BalanceMetrics, thresholds?: BalanceThresholds): ThresholdResult[]`

- **Step 1: Write the failing tests** — `src/balance/thresholds.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { aggregateMetrics } from './metrics'
import { checkThresholds } from './thresholds'
import type { RunResult } from './types'

function result(partial: Partial<RunResult> & { seed: string; botName: string }): RunResult {
  return {
    outcome: 'stopped',
    finalRound: 1,
    coreHealth: 0,
    coreMaxHealth: 100,
    ink: 0,
    leaks: 0,
    clears: 0,
    totalKills: 0,
    starved: false,
    starvationRounds: [],
    rounds: [],
    ...partial,
  }
}

const PASSING = [
  { seed: 'a', botName: 'v', outcome: 'won' as const, coreHealth: 90, starved: false },
  { seed: 'b', botName: 'v', outcome: 'won' as const, coreHealth: 70, starved: false },
]

const lenient = {
  minWinRate: 0,
  maxStarvedRuns: 99,
  minMedianCoreHealthAtWin: 0,
  minMedianFailureRound: null,
}

describe('checkThresholds', () => {
  it('passes every check under a lenient ratchet', () => {
    const metrics = aggregateMetrics(PASSING.map((p) => result(p)))
    const checks = checkThresholds(metrics, lenient)
    expect(checks.every((check) => check.pass)).toBe(true)
  })

  it('fails on a win rate below the floor', () => {
    const metrics = aggregateMetrics(PASSING.map((p) => result(p)))
    const checks = checkThresholds(metrics, { ...lenient, minWinRate: 0.9 })
    const winRate = checks.find((check) => check.label === 'win rate')
    expect(winRate?.pass).toBe(false)
    expect(winRate?.actual).toBe(1)
    expect(winRate?.limit).toBe(0.9)
  })

  it('fails on a starved run', () => {
    const metrics = aggregateMetrics([
      result({ seed: 'a', botName: 'v', starved: true, starvationRounds: [2] }),
    ])
    const checks = checkThresholds(metrics, { ...lenient, maxStarvedRuns: 0 })
    const starved = checks.find((check) => check.label === 'starved runs')
    expect(starved?.pass).toBe(false)
  })

  it('omits the failure-round check while minMedianFailureRound is null', () => {
    const metrics = aggregateMetrics(PASSING.map((p) => result(p)))
    const checks = checkThresholds(metrics, lenient)
    expect(checks.some((check) => check.label === 'median failure round')).toBe(false)
  })

  it('flags a difficulty cliff when runs fail before the floor', () => {
    const metrics = aggregateMetrics([
      result({ seed: 'a', botName: 'v', outcome: 'defeated', finalRound: 30 }),
    ])
    const checks = checkThresholds(metrics, { ...lenient, minMedianFailureRound: 40 })
    const failure = checks.find((check) => check.label === 'median failure round')
    expect(failure?.pass).toBe(false)
    expect(failure?.actual).toBe(30)
    expect(failure?.limit).toBe(40)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/balance/thresholds.test.ts`
Expected: FAIL — `./thresholds` has no exports.

- [ ] **Step 3: Write the minimal implementation** — `src/balance/thresholds.ts`

```ts
import type { BalanceMetrics } from './metrics'

export interface BalanceThresholds {
  readonly minWinRate: number
  readonly maxStarvedRuns: number
  readonly minMedianCoreHealthAtWin: number
  /**
   * A floor on the median round defeated runs die on — the difficulty-cliff
   * guard. Runs failing much earlier than today's game did is a regression.
   * `null` disables the check while the ratchet is being bootstrapped.
   */
  readonly minMedianFailureRound: number | null
}

export interface ThresholdResult {
  readonly label: string
  readonly actual: number
  readonly limit: number
  readonly pass: boolean
}

/**
 * The ratchet. PLACEHOLDER values measured from the game during the bootstrap
 * task and committed there; raised by hand as tuning lands. Not a statement of
 * what a balanced game should be — a floor under today's reality.
 */
export const BALANCE_THRESHOLDS: BalanceThresholds = {
  minWinRate: 0,
  maxStarvedRuns: 0,
  minMedianCoreHealthAtWin: 0,
  minMedianFailureRound: null,
}

export function checkThresholds(
  metrics: BalanceMetrics,
  thresholds: BalanceThresholds = BALANCE_THRESHOLDS,
): ThresholdResult[] {
  const results: ThresholdResult[] = [
    {
      label: 'win rate',
      actual: metrics.winRate,
      limit: thresholds.minWinRate,
      pass: metrics.winRate >= thresholds.minWinRate,
    },
    {
      label: 'starved runs',
      actual: metrics.starvedRuns.length,
      limit: thresholds.maxStarvedRuns,
      pass: metrics.starvedRuns.length <= thresholds.maxStarvedRuns,
    },
    {
      label: 'median core health at win',
      actual: metrics.medianCoreHealthAtWin,
      limit: thresholds.minMedianCoreHealthAtWin,
      pass: metrics.medianCoreHealthAtWin >= thresholds.minMedianCoreHealthAtWin,
    },
  ]

  if (thresholds.minMedianFailureRound !== null) {
    results.push({
      label: 'median failure round',
      actual: metrics.medianFailureRound ?? 0,
      limit: thresholds.minMedianFailureRound,
      pass: (metrics.medianFailureRound ?? 0) >= thresholds.minMedianFailureRound,
    })
  }

  return results
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/balance/thresholds.test.ts`
Expected: all green.

- [ ] **Step 5: Verify lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/balance/thresholds.ts src/balance/thresholds.test.ts
git commit -m "feat(balance): ratchet thresholds with pass/fail checks"
```

---

### Task 7: The CI gate

**Files:**
- Create: `src/balance/balance.test.ts`

**Interfaces:**
- Consumes: `BOTS` from `./bots`; `runSimulation` from `./driver`; `aggregateMetrics`, `formatReport` from `./metrics`; `SEEDS` from `./seeds`; `BALANCE_THRESHOLDS`, `checkThresholds` from `./thresholds`.
- Produces: the CI gate itself — no exports.

- [ ] **Step 1: Write the gate test** — `src/balance/balance.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { BOTS } from './bots'
import { runSimulation } from './driver'
import { aggregateMetrics, formatReport } from './metrics'
import { SEEDS } from './seeds'
import { BALANCE_THRESHOLDS, checkThresholds } from './thresholds'

/**
 * The power balance gate (issue #72).
 *
 * Runs every bot × every pinned seed to round 100 through the real engine and
 * asserts the aggregated metrics stay inside the ratchet. A full run is slow —
 * the fixed timestep is 16.7ms — hence the generous per-file timeout.
 */
describe('power balance gate', () => {
  it('keeps the game inside the ratchet thresholds', () => {
    const results = []
    for (const bot of BOTS) {
      for (const seed of SEEDS) {
        results.push(runSimulation(seed, bot))
      }
    }

    const metrics = aggregateMetrics(results)
    // The report prints on every run — a failure should show the numbers,
    // not just a threshold crossed.
    console.log(formatReport(metrics))

    const failures = checkThresholds(metrics, BALANCE_THRESHOLDS).filter(
      (threshold) => !threshold.pass,
    )
    expect(
      failures.map((threshold) => `${threshold.label}: ${threshold.actual} vs ${threshold.limit}`),
    ).toEqual([])
  })
}, 600_000)
```

- [ ] **Step 2: Run the gate**

Run: `pnpm test:run src/balance/balance.test.ts`
Expected: PASS (placeholder thresholds all lenient) and the report printed to stdout.

- [ ] **Step 3: Verify the whole suite**

Run: `pnpm test:run && pnpm lint && pnpm typecheck`
Expected: all green (existing suite plus balance).

- [ ] **Step 4: Commit**

```bash
git add src/balance/balance.test.ts
git commit -m "test(balance): CI gate runs the bot x seed matrix against the ratchet"
```

---

### Task 7.5: Fix the yellow slider oscillation engine bug

**Files:**
- Modify: `src/game/movement.ts` — `huntByField`
- Test: `src/game/movement.test.ts` — new cases in the `yellow coverage avoidance` describe block

**Context — the bug the gate found:** While executing Task 7, the balance gate hung forever on `value/bravo` round 51. Root cause (independently reproduced with a temporary test): `huntByField` lets a yellow slider oscillate forever between two equal-distance squares when repelled by fire.

**The mechanism, precisely:**
- From `(5,4)` (field distance 2), dir `+file` passes a distance-1 square at `closerRange=2`, but `maxSteps=1` (no King aura) caps the slide to 1 step → lands `(6,4)`, still distance 2. Not covered → move there.
- From `(6,4)`, dir `+file` reaches `(7,4)` (distance 1) in 1 step — the phase target — but `(7,4)` is covered, so yellow skips it (fallback) and takes the next direction `-file`, whose capped slide lands `(5,4)` — again equal distance.
- Cycle `(5,4) ↔ (6,4)` forever. Same setup with green (ignores avoid): `5,4 → 6,4 → 7,4 → … → reachCore`.

**The fix:** once a covered full-slide (distance-decreasing) landing has been skipped (`fallback` set), a later capped-slide landing on an **equal-distance** square must NOT be accepted — it reverses the piece. Only a full-slide (distance-decreasing) landing may be returned after a skip; if none exists, the fallback (the covered distance-decreasing landing) is returned. Capped-slide landings are still fine BEFORE any skip (a piece advancing toward a closer square mid-phase must land short of it — that's the ordinary convergence path, and green relies on it).

**The change in `huntByField` (movement.ts:372-439):** the current loop returns `{ kind: 'move', to: square, ...stamp }` for ANY resolved landing that isn't covered. It must instead distinguish a **full-slide landing** (the slide's `steps === closerRange`, i.e. the piece reached a distance-`ownDistance-1` square) from a **capped-slide landing** (`steps < closerRange`, i.e. landed short on an equal-distance square). Only the former may be returned after a skip. Concretely, the `if (avoid.has(squareKey(square)))` block currently sets `fallback` and `continue`s; after it, the return must be gated: return the landing only when `steps === closerRange`. When `steps < closerRange`:
- if `fallback` is already set → `continue` (keep scanning for a distance-decreasing landing),
- if `fallback` is not yet set → return it (the ordinary mid-phase advance toward a closer square, which the no-skip path also relies on).

This preserves: green's path unchanged (green passes `EMPTY_AVOID`, never skips, so `steps < closerRange` returns immediately as before), and every pinned yellow test (they all exercise full-slide landings, where behavior is unchanged). It only changes the skip-then-capped path, which was the cycle.

**Why this is in scope:** the plan's spec forbids *balance* changes to `src/game/`, but this is a **correctness** bug — a round that never terminates violates the engine's own "nothing strands" invariant (CLAUDE.md: "Every Piece type has a designed way off stuck" / "a round ends when nothing can still act"). The gate found a game-hanging bug, not a tuning number. The human approved fixing it.

- [ ] **Step 1: Write the failing tests** — in `src/game/movement.test.ts`, inside the `yellow coverage avoidance` describe block (after the existing `never dodges the Core` / `colour-locked Bishop` / slider tests):

```ts
it('a yellow slider does not reverse into a capped equal-distance landing after a skip', () => {
  // From (6,4) the Queen's first direction reaches (7,4) — its distance-1
  // phase target — in one step, but (7,4) is covered. The next direction's
  // slide is capped (maxSteps 1, closerRange 3) and would land on (5,4), an
  // equal-distance square: accepting it reverses the piece and, from (5,4),
  // the first direction pulls it back to (6,4) forever. The hunt must instead
  // keep scanning for a distance-decreasing landing, not take the capped one.
  const outcome = move('queen', { file: 6, rank: 4 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['7,4']))

  // (6,3) is the next distance-decreasing landing (distance 1) the scan finds
  // after (7,4) is skipped; taking it instead of (5,4) is what breaks the loop.
  expect(outcome).toEqual({ kind: 'move', to: { file: 6, rank: 3 }, hunting: true })
})
```

Then a termination test that walks the piece from `(5,4)` and asserts it reaches the Core rather than cycling:

```ts
it('a repelled yellow slider reaches the Core instead of oscillating', () => {
  // From (5,4) the Queen's +file slide is capped to (6,4) (equal distance);
  // from (6,4) its only uncovered distance-decreasing landing is (6,3). Each
  // hop must make progress: (5,4) -> (6,4) -> (6,3) -> ... -> reachCore, never
  // (5,4) <-> (6,4). `move` is stateless, so drive nextMove directly.
  const field = queenDistanceField(BOARD, CORE_SQUARE)
  let square = { file: 5, rank: 4 }
  const seen = new Set<string>([squareKey(square)])

  for (let i = 0; i < 32; i += 1) {
    const outcome = move('queen', square, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['7,4']))
    if (outcome.kind === 'reachCore') return
    if (outcome.kind !== 'move') break
    square = outcome.to
    const key = squareKey(square)
    if (seen.has(key)) throw new Error(`oscillation: revisit ${key}`)
    seen.add(key)
  }

  throw new Error('did not reach the Core')
})
```

Both tests must import `queenDistanceField` from `./distanceFields` and `squareKey` (already imported) at the top of `movement.test.ts`. Existing top imports: `BOARD, CORE_SQUARE` from `../data/board`, `allSquares, isInBounds, squareKey, squaresEqual` from `./board`, `kingDistanceField, knightDistanceField, rookDistanceField, KNIGHT_OFFSETS` from `./distanceFields` — add `queenDistanceField` to that line. The `move()` helper (line 14) already accepts an `avoid` set as its 5th argument.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: FAIL — the first test gets `to: {file: 5, rank: 4}` (the capped landing) instead of `{file: 6, rank: 3}`; the second throws `oscillation: revisit`.

- [ ] **Step 3: Implement the fix** in `huntByField` (movement.ts:372-439)

In the direction loop, replace the tail of the loop body — currently:

```ts
    if (avoid.has(squareKey(square))) {
      if (fallback === undefined) fallback = square
      continue
    }

    return { kind: 'move', to: square, ...stamp }
```

with:

```ts
    if (avoid.has(squareKey(square))) {
      if (fallback === undefined) fallback = square
      continue
    }

    // A full slide reaches a distance-`ownDistance - 1` square — real progress
    // toward the Core. A capped slide (steps < closerRange, maxSteps cut it
    // short) lands on an EQUAL-distance square: mid-phase, that is the
    // ordinary advance and is taken; but once a covered full-slide landing has
    // been skipped above, accepting a capped landing would pull the piece back
    // to a square it came from — an oscillation (a yellow slider repelled from
    // its phase target bouncing forever between two equal-distance squares).
    // After a skip, only a full-slide landing may be returned; the fallback
    // covers the case where every remaining full-slide landing is also covered.
    if (steps < closerRange && fallback !== undefined) continue

    return { kind: 'move', to: square, ...stamp }
```

`closerRange` is in scope (computed at the top of the loop body, movement.ts:400). `steps` is also in scope (movement.ts:403).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: all green, including the two new tests.

- [ ] **Step 5: Run the whole suite**

Run: `pnpm test:run && pnpm lint && pnpm typecheck`
Expected: all green — the fix must not change green's path or any pinned yellow test.

- [ ] **Step 6: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts
git commit -m "fix(engine): yellow slider no longer oscillates when repelled from its phase target"
```

---

### Task 8: Bootstrap the thresholds

**Files:**
- Modify: `src/balance/thresholds.ts` — replace the placeholder `BALANCE_THRESHOLDS`.

**Interfaces:**
- Consumes: the measured report from Task 7's step 2.

**Goal:** Turn the always-passing placeholders into a real ratchet measured from today's game.

- [ ] **Step 1: Run the gate and capture the report**

Run: `pnpm test:run src/balance/balance.test.ts 2>&1 | tee /tmp/opencode/balance-bootstrap.txt`

Expected: PASS with a report line like `runs=15 wins=N winRate=…%`.

- [ ] **Step 2: Record the measured numbers**

Read `/tmp/opencode/balance-bootstrap.txt`. Record:
- `winRate` (as a fraction, e.g. `0.53`)
- `starvedRuns` count
- `medianCoreHealthAtWin`
- `medianFailureRound` (the number, not `n/a`, if any run was defeated)

- [ ] **Step 3: Set the thresholds with slack**

In `src/balance/thresholds.ts`, replace `BALANCE_THRESHOLDS` with values measured in step 2, set just under the measured reality so CI is green but tight enough to catch drift:

```ts
export const BALANCE_THRESHOLDS: BalanceThresholds = {
  // Measured from the game on <today's date> (issue #72 bootstrap). A ratchet,
  // not a target — raise by hand as tuning lands. minWinRate is a fraction
  // (0.5 = 50%), not a percentage.
  minWinRate: <measured winRate, e.g. 0.5>,
  maxStarvedRuns: <measured starved count, e.g. 0>,
  minMedianCoreHealthAtWin: <measured, e.g. 20>,
  minMedianFailureRound: <measured, or null when every run won>,
}
```

Rules of thumb for slack: `minWinRate` = measured − 0.1 (never below 0); `maxStarvedRuns` = measured (any starvation is a defect, keep it at the measured count); `minMedianCoreHealthAtWin` = measured × 0.5; `minMedianFailureRound` = measured × 0.8.

- [ ] **Step 4: Re-run the gate**

Run: `pnpm test:run src/balance/balance.test.ts`
Expected: PASS. If a threshold is still too tight, relax it toward the measured value and re-run.

- [ ] **Step 5: Verify the whole suite**

Run: `pnpm test:run && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green, including the coverage threshold for `src/balance/` (the gate plus the four unit test files exercise it heavily — if a threshold trips, the reporting in step 4's run names the file and branch; add the missing test case rather than loosening the coverage floor).

- [ ] **Step 6: Commit**

```bash
git add src/balance/thresholds.ts
git commit -m "chore(balance): bootstrap ratchet thresholds from measured play"
```
