# Poker Hands Build Towers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rank-builds-tower / suit-supports card system with poker hands that purchase towers, per spec `docs/superpowers/specs/2026-08-12-poker-hands-towers-design.md`.

**Architecture:** A new tower-type table keyed by the nine tower shapes replaces the rank-keyed `TOWER_RANKS`; a new pure hand-evaluation module maps a committed card set to a hand type and thus a tower type. Towers carry their `type` and instance `range` (Queen's action is now +1 range). Commands `buildTower`/`supportTower`/`echoTower` are deleted; `playHand` + `placeTower` (two-step) replace them; `rangeTower` replaces Echo. Suit support, the Amplifier aura, and the Freezer are deleted.

**Tech Stack:** TypeScript (strict), Vitest, zustand, React Three Fiber. `pnpm test:run`, `pnpm typecheck`, `pnpm lint` are the verification commands; `pnpm build` typechecks then builds.

## Global Constraints

- `Math.random` must never appear in `src/game/` or `src/data/` (ESLint-enforced; seeded PRNG only).
- `src/game/` must never import React or Three.js; `src/scene/`, `src/ui/`, `src/state/` must import `src/game/` only via `src/game/index.ts` (ESLint-enforced).
- No jsdom, no component tests: pull every non-trivial decision into a pure module beside the `.tsx` and test that.
- A Card's identity is its `id`, never its rank+suit. The Deck is a multiset.
- `nextEntityId`'s parity is load-bearing for Piece `handedness`; never spend it on cards or hands. Cards use `nextCardId` (packs already do).
- `step`'s switch is exhaustiveness-protected by its return type; keep it that way.
- Playing a hand is gap-only. Face actions and the Joker's Clear remain playable any time. Buying packs stays gap-only.
- Hand evaluation: a committed set must be **exactly one valid hand of its size** (no kickers). Sizes: high card 1, pair 2, three of a kind 3, two pair 4, four of a kind 4, straight 5, flush 5, full house 5, straight flush 5, royal flush 5.
- Poker rarity order (weakest→strongest): high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush, royal flush.
- Royal flush builds a Tower of the player's choice; every other hand builds exactly the mapped tower.
- Face cards (J/Q/K/A) may be played for their action (any time) **or** committed to a hand (gap only). The Joker is never hand material.
- All tower-stat numbers are PLACEHOLDERS; the rarity order and the hand→tower table are the design. Never assert balance numbers without referencing the table.

---

## Phase A — Additive pure modules (build stays green)

### Task 1: Tower type table

**Files:**
- Create: `src/data/towerTypes.ts`
- Create: `src/data/towerTypes.test.ts`

**Interfaces:**
- Produces: `TowerTypeId`, `TowerTypeDef`, `TOWER_TYPES: Record<TowerTypeId, TowerTypeDef>`, `towerType(id): TowerTypeDef`, `TOWER_TYPE_IDS: readonly TowerTypeId[]`.

- [ ] **Step 1: Write the failing test**

Create `src/data/towerTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from './pieceTypes'
import { TOWER_TYPES, TOWER_TYPE_IDS, towerType } from './towerTypes'

/** Every type that actually shoots — the ladder minus the Wall. */
const FIRING_TYPES = TOWER_TYPE_IDS.filter((id) => towerType(id).geometry !== 'none')

describe('the tower type table', () => {
  it('has exactly the nine types in rarity order', () => {
    expect(TOWER_TYPE_IDS).toEqual([
      'vertical', 'wall', 'sniper', 'diagonal', 'cross', 'star', 'splash', 'ring', 'tollgate',
    ])
  })

  it('defines every type', () => {
    for (const id of TOWER_TYPE_IDS) expect(TOWER_TYPES[id]).toBeDefined()
  })

  it('has exactly one tower that never fires — the Wall', () => {
    expect(FIRING_TYPES).toHaveLength(TOWER_TYPE_IDS.length - 1)
    expect(towerType('wall').geometry).toBe('none')
  })

  it('gives the Wall no damage and no targets, and a positive fire interval', () => {
    const wall = towerType('wall')
    expect(wall.damage).toBe(0)
    expect(wall.targetsPerShot).toBe(0)
    expect(wall.fireIntervalMs).toBeGreaterThan(0)
  })

  it('never fires slower than a Pawn moves, so every firing tower gets a shot', () => {
    for (const id of FIRING_TYPES) {
      expect(towerType(id).fireIntervalMs).toBeLessThan(PIECE_TYPES.pawn.moveIntervalMs)
    }
  })

  it('rises in health across the firing types, and the Wall out-tanks all of them', () => {
    const healths = FIRING_TYPES.map((id) => towerType(id).maxHealth)
    healths.reduce((previous, current) => {
      expect(current).toBeGreaterThan(previous)
      return current
    })
    for (const id of FIRING_TYPES) {
      expect(towerType('wall').maxHealth).toBeGreaterThan(towerType(id).maxHealth)
    }
  })

  it('puts no aura anywhere — auras are gone with the Amplifier and Freezer', () => {
    for (const id of TOWER_TYPE_IDS) expect('aura' in TOWER_TYPES[id]).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/data/towerTypes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/data/towerTypes.ts`:

```ts
import type { TowerGeometry } from '../game/types'

/**
 * What each poker hand's tower is. Keyed by tower type, NOT by card rank —
 * the hand ladder is the roster (see the poker-hands spec).
 *
 * PLACEHOLDER balance numbers; the shapes, the order, and the hand→tower
 * mapping are the design. Order here IS rarity order, weakest first:
 * high card, pair, two pair, three of a kind, straight, flush, full house,
 * four of a kind, straight flush.
 */
export type TowerTypeId =
  | 'vertical'
  | 'wall'
  | 'sniper'
  | 'diagonal'
  | 'cross'
  | 'star'
  | 'splash'
  | 'ring'
  | 'tollgate'

export interface TowerTypeDef {
  /** Squares along the pattern, not straight-line distance. */
  readonly geometry: TowerGeometry
  readonly range: number
  readonly damage: number
  readonly fireIntervalMs: number
  readonly maxHealth: number
  readonly targetsPerShot: number
}

/**
 * Every tower type, in rarity order.
 *
 * `sniper` reuses the `vertical` geometry at a long range — one file, high
 * single-target damage, slow. `splash` reuses `adjacent` at range 1 — the
 * eight neighbours, hit in a small burst. Both are new TYPES; their shapes
 * are built from existing geometries so `coverage.ts` needs no new cases.
 * `ring` hits EVERYTHING its ring covers (the old Amplifier, now dealing
 * damage directly). `tollgate` is the full-width band.
 */
export const TOWER_TYPES: Record<TowerTypeId, TowerTypeDef> = {
  vertical: { geometry: 'vertical', range: 5, damage: 2, fireIntervalMs: 500, maxHealth: 14, targetsPerShot: 1 },
  wall: { geometry: 'none', range: 0, damage: 0, fireIntervalMs: 1000, maxHealth: 45, targetsPerShot: 0 },
  sniper: { geometry: 'vertical', range: 7, damage: 4, fireIntervalMs: 800, maxHealth: 18, targetsPerShot: 1 },
  diagonal: { geometry: 'diagonal', range: 5, damage: 2, fireIntervalMs: 550, maxHealth: 22, targetsPerShot: 1 },
  cross: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 24, targetsPerShot: 1 },
  star: { geometry: 'star', range: 3, damage: 2, fireIntervalMs: 600, maxHealth: 26, targetsPerShot: 1 },
  splash: { geometry: 'adjacent', range: 1, damage: 2, fireIntervalMs: 600, maxHealth: 28, targetsPerShot: 5 },
  ring: { geometry: 'ring', range: 4, damage: 1, fireIntervalMs: 700, maxHealth: 30, targetsPerShot: Number.POSITIVE_INFINITY },
  tollgate: { geometry: 'band', range: 1, damage: 1, fireIntervalMs: 800, maxHealth: 38, targetsPerShot: Number.POSITIVE_INFINITY },
}

export function towerType(id: TowerTypeId): TowerTypeDef {
  return TOWER_TYPES[id]
}

/** Every tower type, in rarity order. */
export const TOWER_TYPE_IDS: readonly TowerTypeId[] = [
  'vertical', 'wall', 'sniper', 'diagonal', 'cross', 'star', 'splash', 'ring', 'tollgate',
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/data/towerTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/towerTypes.ts src/data/towerTypes.test.ts
git commit -m "feat(data): tower type table keyed by hand ladder"
```

### Task 2: Hand evaluation

**Files:**
- Create: `src/game/hands.ts`
- Create: `src/game/hands.test.ts`

**Interfaces:**
- Consumes: `Card`, `CardRank` from `./types`; `TowerTypeId` from `../data/towerTypes`.
- Produces:
  - `type HandType = 'highCard' | 'pair' | 'twoPair' | 'threeOfAKind' | 'straight' | 'flush' | 'fullHouse' | 'fourOfAKind' | 'straightFlush' | 'royalFlush'`
  - `HAND_SIZES: Record<HandType, number>`
  - `evaluateHand(cards: readonly Card[]): HandType | null` — the strongest hand the committed set forms exactly, or `null` when the set is not exactly one valid hand of its size.
  - `HAND_TOWER: Record<Exclude<HandType, 'royalFlush'>, TowerTypeId>` — every hand except royal flush maps to one tower; royal flush is a choice made at play time.

- [ ] **Step 1: Write the failing test**

Create `src/game/hands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateHand, HAND_SIZES, HAND_TOWER, type HandType } from './hands'
import { standardCard } from './fixtures'
import type { Card, CardRank, Suit } from './types'

const card = (id: string, rank: CardRank, suit: Suit = 'hearts'): Card => standardCard(id, rank, suit)

const c = (rank: CardRank): Card => card(String(rank), rank)

describe('evaluateHand', () => {
  it('evaluates a high card from a single card', () => {
    expect(evaluateHand([c(5)])).toBe('highCard')
  })

  it('evaluates a pair from exactly two equal ranks', () => {
    expect(evaluateHand([c(5), c(5)])).toBe('pair')
  })

  it('evaluates three of a kind from exactly three equal ranks', () => {
    expect(evaluateHand([c(5), c(5), c(5)])).toBe('threeOfAKind')
  })

  it('evaluates four of a kind from exactly four equal ranks', () => {
    expect(evaluateHand([c(5), c(5), c(5), c(5)])).toBe('fourOfAKind')
  })

  it('evaluates two pair from two distinct pairs', () => {
    expect(evaluateHand([c(5), c(5), c(9), c(9)])).toBe('twoPair')
  })

  it('evaluates a straight from five consecutive ranks', () => {
    expect(evaluateHand([c(2), c(3), c(4), c(5), c(6)])).toBe('straight')
  })

  it('accepts an Ace-low wheel as a straight', () => {
    expect(evaluateHand([c('A'), c(2), c(3), c(4), c(5)])).toBe('straight')
  })

  it('accepts a broadway (Ace-high) straight', () => {
    expect(evaluateHand([c(10), c('J'), c('Q'), c('K'), c('A')])).toBe('straight')
  })

  it('evaluates a flush from five same-suit cards', () => {
    expect(evaluateHand([card('a', 2, 'clubs'), card('b', 4, 'clubs'), card('c', 6, 'clubs'), card('d', 8, 'clubs'), card('e', 10, 'clubs')])).toBe('flush')
  })

  it('evaluates a full house from three of a kind plus a pair', () => {
    expect(evaluateHand([c(5), c(5), c(5), c(9), c(9)])).toBe('fullHouse')
  })

  it('evaluates a straight flush from five consecutive same-suit cards', () => {
    expect(evaluateHand([card('a', 2, 'clubs'), card('b', 3, 'clubs'), card('c', 4, 'clubs'), card('d', 5, 'clubs'), card('e', 6, 'clubs')])).toBe('straightFlush')
  })

  it('evaluates a royal flush from the 10-J-Q-K-A of one suit', () => {
    expect(evaluateHand([card('a', 10, 'clubs'), card('b', 'J', 'clubs'), card('c', 'Q', 'clubs'), card('d', 'K', 'clubs'), card('e', 'A', 'clubs')])).toBe('royalFlush')
  })

  it('returns null for a five-card set that is only a pair (no kickers)', () => {
    expect(evaluateHand([c(5), c(5), c(2), c(3), c(4)])).toBeNull()
  })

  it('returns null for a four-card set that is only a pair', () => {
    expect(evaluateHand([c(5), c(5), c(2), c(3)])).toBeNull()
  })

  it('returns null for a set of an invalid size', () => {
    expect(evaluateHand([])).toBeNull()
    expect(evaluateHand([c(5), c(5), c(5), c(5), c(5), c(5)])).toBeNull()
  })

  it('returns null when a Joker is in the set — it is never hand material', () => {
    expect(evaluateHand([{ id: 'j', kind: 'joker' }, c(5)])).toBeNull()
  })

  it('returns the strongest hand the set forms, so a straight flush beats a flush', () => {
    expect(evaluateHand([card('a', 2, 'clubs'), card('b', 3, 'clubs'), card('c', 4, 'clubs'), card('d', 5, 'clubs'), card('e', 6, 'clubs')])).toBe('straightFlush')
  })
})

describe('HAND_SIZES and HAND_TOWER', () => {
  it('declares the exact size of every hand', () => {
    expect(HAND_SIZES).toEqual({
      highCard: 1, pair: 2, twoPair: 4, threeOfAKind: 3, straight: 5,
      flush: 5, fullHouse: 5, fourOfAKind: 4, straightFlush: 5, royalFlush: 5,
    })
  })

  it('maps every non-royal hand to a tower, in rarity order', () => {
    expect(HAND_TOWER).toEqual({
      highCard: 'vertical', pair: 'wall', twoPair: 'sniper', threeOfAKind: 'diagonal',
      straight: 'cross', flush: 'star', fullHouse: 'splash', fourOfAKind: 'ring',
      straightFlush: 'tollgate',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/hands.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/game/hands.ts`:

```ts
import { towerType } from '../data/towerTypes'
import type { Card, CardRank } from './types'

/**
 * Poker hands, the new way Towers are purchased. A committed set of Cards must
 * be EXACTLY one valid hand of its size — no kickers, no downgrades. The hand
 * type decides the Tower; the ranks inside it never modulate the result.
 *
 * Face cards are hand material (a pair of Kings, the royal flush). The Joker
 * is never hand material — it has no rank or suit, so it cannot participate
 * in any hand.
 */
export type HandType =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush'
  | 'royalFlush'

/** Exactly how many Cards each hand commits. */
export const HAND_SIZES: Record<HandType, number> = {
  highCard: 1,
  pair: 2,
  twoPair: 4,
  threeOfAKind: 3,
  straight: 5,
  flush: 5,
  fullHouse: 5,
  fourOfAKind: 4,
  straightFlush: 5,
  royalFlush: 5,
}

/**
 * Which Tower each hand purchases. Royal flush is deliberately absent: it is
 * "tower of choice", so the choice is made at play time, not in a table.
 */
export const HAND_TOWER: Record<Exclude<HandType, 'royalFlush'>, import('../data/towerTypes').TowerTypeId> = {
  highCard: 'vertical',
  pair: 'wall',
  twoPair: 'sniper',
  threeOfAKind: 'diagonal',
  straight: 'cross',
  flush: 'star',
  fullHouse: 'splash',
  fourOfAKind: 'ring',
  straightFlush: 'tollgate',
}

/** Numeric value of a rank for ordering. A is 14 (also treated as 1 for wheels). */
function rankValue(rank: CardRank): number {
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') return 13
  if (rank === 'A') return 14
  return rank
}

/** A straight's ranks sorted ascending; A may be low (wheel) or high. */
function straightValues(values: number[]): number[] | null {
  const sorted = [...values].sort((a, b) => a - b)
  const unique = new Set(sorted)
  if (unique.size !== sorted.length) return null

  const isRun = (start: number): boolean =>
    sorted.every((value, index) => value === start + index)

  if (isRun(sorted[0] ?? 0)) return sorted

  // Wheel: A-2-3-4-5, where A reads as 1.
  const first = sorted[0]
  const last = sorted[4]
  if (first === 2 && last === 14 && isRun(2)) return [1, 2, 3, 4, 5]

  return null
}

/**
 * The strongest hand the committed set forms — or null when the set is not
 * exactly one valid hand of its size. Pure, deterministic, and the single
 * answer the engine and the Deck UI both call.
 */
export function evaluateHand(cards: readonly Card[]): HandType | null {
  if (cards.some((card) => card.kind !== 'standard')) return null

  const size = cards.length

  if (size === 1) return 'highCard'
  if (size === 2) {
    const [a, b] = cards
    return a !== undefined && b !== undefined && a.rank === b.rank ? 'pair' : null
  }
  if (size === 3) {
    const ranks = new Set(cards.map((card) => card.rank))
    return ranks.size === 1 ? 'threeOfAKind' : null
  }
  if (size === 4) {
    const counts = rankCounts(cards)
    const values = Object.values(counts)
    if (values.some((count) => count === 4)) return 'fourOfAKind'
    if (values.length === 2 && values.every((count) => count === 2)) return 'twoPair'
    return null
  }
  if (size === 5) {
    return evaluateFive(cards)
  }

  return null
}

function rankCounts(cards: readonly Card[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const card of cards) {
    if (card.kind === 'standard') counts[card.rank] = (counts[card.rank] ?? 0) + 1
  }
  return counts
}

function evaluateFive(cards: readonly Card[]): HandType | null {
  const standard = cards.filter((card): card is Extract<Card, { kind: 'standard' }> => card.kind === 'standard')
  if (standard.length !== 5) return null

  const suits = new Set(standard.map((card) => card.suit))
  const isFlush = suits.size === 1

  const values = standard.map((card) => rankValue(card.rank))
  const straight = straightValues(values)

  const counts = Object.values(rankCounts(standard))
  const isFullHouse = counts.includes(3) && counts.includes(2)

  if (straight) {
    const isRoyal = (straight[0] ?? 0) === 10 && isFlush
    if (isRoyal) return 'royalFlush'
    if (isFlush) return 'straightFlush'
    return 'straight'
  }
  if (isFlush) return 'flush'
  if (isFullHouse) return 'fullHouse'

  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/game/hands.test.ts`
Expected: PASS. (If `evaluateFive`'s leftover `suits` line offends lint, remove it — it is vestigial.)

- [ ] **Step 5: Commit**

```bash
git add src/game/hands.ts src/game/hands.test.ts
git commit -m "feat(game): poker hand evaluation"
```

---

## Phase B — Engine rework (breaks and rebuilds together; land as one sequence, then green)

> Phase B changes shared types, so the build is red until its last task. Execute the tasks in order without committing until each green checkpoint that says to.

### Task 3: Rework `types.ts`

**Files:**
- Modify: `src/game/types.ts`

**Interfaces:**
- Consumes: `TowerTypeId` from `../data/towerTypes`.
- Produces (changed shapes): `Tower.type: TowerTypeId`, `Tower.range: number` (instance field, seeded from the type, raised by a Queen), `GameState.pendingTower: TowerTypeId | null`, and the new `Command` union.

- [ ] **Step 1: Make the edits**

1. Add near the top: `import type { TowerTypeId } from '../data/towerTypes'`.

2. In the `Tower` interface:
   - Replace `readonly cardRank: BuildableRank` with `readonly type: TowerTypeId`.
   - Add `readonly range: number` beside `fireCooldownMs` with a doc comment: seeded from the tower's type at build, raised by a Queen's action (stackable, uncapped for now). Nothing else derives range from the type table any more.
   - Update the `damage`/`fireIntervalMs` doc comments: they are seeded from the type and no longer mutated by ♣/♦ supports (supports are gone), but the fields stay on the instance so `structuralKey` and `TowerPanel` can read them without a table lookup.

3. Replace the `Command` union members:
   - Delete `buildTower`, `supportTower`, `echoTower`.
   - Add:
     ```ts
     | {
         /**
          * Commit a hand of Cards to purchase a Tower. Two-step: this command
          * consumes the Cards and leaves a pending Tower awaiting placement;
          * `placeTower` puts it on a square.
          *
          * Gap-only. The card ids must form exactly one valid hand of its size
          * (`evaluateHand`), and a royal flush must name the chosen Tower type
          * (`chosenType`), which every other hand must omit.
          */
         readonly kind: 'playHand'
         readonly cardIds: readonly string[]
         readonly chosenType?: TowerTypeId
       }
     | { readonly kind: 'placeTower'; readonly square: Square }
     | { readonly kind: 'rangeTower'; readonly cardId: string; readonly towerId: string }
     ```
   - Keep `shieldTower`, `reinforceCore`, `expandBoard`, `clearPieces` unchanged.

4. Add to `GameState`, after `towers`:
   ```ts
   /**
    * A Tower purchased but not yet placed — the second half of a hand play.
    * Non-null only in the gap; `placeTower` consumes it and `startRound` is
    * refused while it stands. Kept on the state rather than in the UI so the
    * placement rule lives in the engine.
    */
   readonly pendingTower: TowerTypeId | null
   ```

5. `BuildableRank` stays (cards still carry 2–10, and `isBuildableRank` still distinguishes numbered ranks for straights), but its doc comment must drop every claim about building a Tower: rank no longer builds. Keep `CardRank` unchanged.

- [ ] **Step 2: Verify the file compiles in isolation**

Run: `pnpm typecheck`
Expected: FAIL — this is the middle of the big-bang; `cardPlays.ts` still imports the deleted commands. That is expected until Task 6. Do NOT commit yet.

### Task 4: Rework `cardPlays.ts`

**Files:**
- Modify: `src/game/cardPlays.ts`

**Interfaces:**
- Consumes: `evaluateHand`, `HAND_TOWER`, `HAND_SIZES` from `./hands`; `towerType` from `../data/towerTypes`; `canBuildOn` from `./placement`; `isTerminal` from `./phase`; `findCard`, `removeCard` from `./cards`.
- Produces:
  - `playHand(state, cardIds, chosenType): GameState` — gap-only; consumes cards; sets `pendingTower`.
  - `placeTower(state, square): GameState` — gap-only; requires `pendingTower`; checks `canBuildOn`; builds the Tower and clears `pendingTower`.
  - `rangeTower(state, cardId, towerId): GameState` — Queen; +1 range, any Tower, any time, stackable.
  - `shieldTower`, `reinforceCore`, `expandBoard`, `clearPieces` — unchanged.
  - Deletes `buildTower`, `supportTower`, `echoTower`.

- [ ] **Step 1: Make the edits**

Rewrite `src/game/cardPlays.ts`. Keep `newTower` but change it to take a `TowerTypeId`:

```ts
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
  }
}
```

Replace `buildTower` with the pair:

```ts
export function playHand(
  state: GameState,
  cardIds: readonly string[],
  chosenType?: TowerTypeId,
): GameState {
  if (isTerminal(state.phase)) return state
  if (state.phase !== 'gap') return state
  if (state.pendingTower !== null) return state

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
```

Add `rangeTower` (the Queen's new action), next to `shieldTower`:

```ts
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
```

Delete `supportTower` (the whole function) and `echoTower`. Remove now-unused imports (`applySupport`, `canSupport`, `isBuildableRank` if unused, `towerRank`, `ACE_BOARD_RANKS` still used by expandBoard).

`newTower`'s callers: only `playHand` now (Echo is gone). Confirm `clearPieces` is untouched.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: still FAIL — `step.ts` and others reference deleted commands. Continue; do not commit.

### Task 5: Rework `step.ts` and `startRound`

**Files:**
- Modify: `src/game/step.ts`

- [ ] **Step 1: Make the edits**

1. Update imports: drop `supportTower`, `echoTower`; add `playHand`, `placeTower`, `rangeTower`.

2. In the switch:
   - Replace `case 'buildTower'` with `case 'playHand': return playHand(state, command.cardIds, command.chosenType)`.
   - Add `case 'placeTower': return placeTower(state, command.square)`.
   - Add `case 'rangeTower': return rangeTower(state, command.cardId, command.towerId)`.
   - Delete `case 'supportTower'` and `case 'echoTower'`.

3. `startRound`: refuse while a pending Tower is unplaced:

```ts
function startRound(state: GameState): GameState {
  if (state.phase !== 'gap') return state
  if (state.pendingTower !== null) return state

  return {
    ...state,
    phase: 'inProgress',
    roundElapsedMs: 0,
    pendingSpawns: roundSpec(state.roundNumber).spawns,
  }
}
```

Update the `buyPack` doc comment reference to the gap-only exception: it is no longer the *only* exception — hand plays and placement are gap-only too, but `buyPack`'s gap-only rule is still what bounds round termination.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: still FAIL — `state.ts` (no `pendingTower`) and `coverage.ts`/`tick.ts` (read `cardRank`). Continue.

### Task 6: Rework `state.ts`, `coverage.ts`, `tick.ts`; delete `support.ts` and `towerAuras.ts`

**Files:**
- Modify: `src/game/state.ts`, `src/game/coverage.ts`, `src/game/tick.ts`, `src/game/index.ts`, `src/data/cards.ts`
- Delete: `src/game/support.ts`, `src/game/towerAuras.ts`

**Interfaces:**
- Consumes: `towerType` from `../data/towerTypes` everywhere `towerRank`/`cardRank` was used.
- Produces: `GameState.pendingTower` initialised to `null`; coverage/firing read `tower.type` and `tower.range`.

- [ ] **Step 1: `state.ts`**

Add `pendingTower: null` to the object returned by `createInitialState`, after `towers: []`.

- [ ] **Step 2: `coverage.ts`**

In `hittableSquares`:

```ts
for (const tower of towers) {
  const def = towerType(tower.type)
  for (const square of reachableSquares(board, def.geometry, tower.range, tower.square, blockers)) {
    covered.add(squareKey(square))
  }
}
```

Change the import from `../data/towerRanks` to `../data/towerTypes` and `towerRank` to `towerType`. Delete the block of `TowerRankDef` comments that reference rank numbers. Everything else in the file (geometries unchanged) stays.

- [ ] **Step 3: `tick.ts`**

1. Import `towerType` from `../data/towerTypes` instead of `towerRank, type TowerRankDef` from `../data/towerRanks`.
2. In `fireTowers`:
   - `const def = towerType(tower.type)`.
   - In `selectTargets`, `coversSquare(def.geometry, tower.range, tower.square, piece.square)` (pass the Tower's instance range).
   - Remove the amplifier logic entirely: delete `amplifierIdsByPiece`/`amplifiers`, delete `amplificationFor` from the damage loop, and change the damage application to `const after = before - tower.damage`.
3. Remove `FREEZE_MULTIPLIER`, `frozenPieceIds`, and the `frozen` param threading through `movePieces` and `movePieces`' interval computation: `const moveIntervalMs = buffedInterval` (no freeze multiplier).
4. Remove the `towerAuras` import entirely. The King aura (`buffed`) and Bishop heal in `auras.ts` are Chess-side and stay.

- [ ] **Step 4: Delete `support.ts` and `towerAuras.ts`**

```bash
git rm src/game/support.ts src/game/towerAuras.ts
```

- [ ] **Step 5: `data/cards.ts`**

Delete `SPADE_HEALTH`, `DIAMOND_SPEED_MS`, `CLUB_DAMAGE`, `FACE_SUPPORT_PREMIUM`, `MIN_FIRE_INTERVAL_MS`, and their doc comments. Keep `JACK_SHIELD`, `KING_CORE_HEALTH`, `ACE_BOARD_RANKS`, `ALL_CARD_RANKS`, `SUITS`. Update `JACK_SHIELD`'s comment to drop the "rank-scaled" contrast (there is no rank ladder any more).

- [ ] **Step 6: `game/index.ts`**

- Delete `export { applySupport, canSupport } from './support'`.
- Add `export { evaluateHand, HAND_SIZES, HAND_TOWER, type HandType } from './hands'`.
- Export `type TowerTypeId` and `type TowerTypeDef` from `../data/towerTypes` (a data-type re-export, mirroring how `PackType` flows through).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL still — `fixtures.ts` and every test/scene/ui file still reference `cardRank`, `buildTower`, etc. The engine module now typechecks internally (verify `pnpm typecheck 2>&1 | grep 'src/game'` shows only the known remaining files). Continue to Phase C; the next green checkpoint is the end of Task 11.

---

## Phase C — Fixtures and engine tests

### Task 7: Rework `fixtures.ts`

**Files:**
- Modify: `src/game/fixtures.ts`

**Interfaces:**
- Consumes: `towerType` from `../data/towerTypes`; `playHand`/`placeTower` via `step`; `evaluateHand`/`HAND_TOWER`.
- Produces:
  - `withTower(type: TowerTypeId, square, state?): GameState` — builds a Tower of `type` by committing a minimal legal hand and placing it. Throws if refused.
  - `towersAt(...squares): Map<string, Tower>` — Towers with `type: 'vertical'`.

- [ ] **Step 1: Rework `withTower`**

A Tower of a given type is built by committing a hand that maps to that type and placing it. The helper must be able to produce any of the nine types, so it carries a canonical hand per type:

```ts
const HAND_FOR_TYPE: Record<TowerTypeId, CardRank[]> = {
  vertical: [5],
  wall: [5, 5],
  sniper: [5, 5, 9, 9],
  diagonal: [5, 5, 5],
  cross: [2, 3, 4, 5, 6], // straight
  star: [2, 4, 6, 8, 10], // flush — see suit note below
  splash: [5, 5, 5, 9, 9],
  ring: [5, 5, 5, 5],
  tollgate: [2, 3, 4, 5, 6], // straight flush — see suit note below
}
```

> A flush and a straight flush cannot be formed from mixed suits, so `star`
> and `tollgate` get a uniform suit assignment while every other hand keeps
> the cycling assignment:
> - `star`: ranks `[2, 4, 6, 8, 10]` ALL hearts — a flush that is NOT a
>   straight (consecutive ranks would evaluate as a straight flush).
> - `tollgate`: ranks `[2, 3, 4, 5, 6]` ALL clubs — a straight flush.
> - `cross`: ranks `[2, 3, 4, 5, 6]` across suits hearts, diamonds, spades,
>   clubs, hearts — a straight that is not a flush.

```ts
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
```

> Import `SUITS` from `../data/cards`. Update the doc comment: "A Tower of this TYPE on this square, built by committing the canonical hand for the type and placing it."

- [ ] **Step 2: Rework `towersAt`**

Replace `cardRank: 2 as const` with `type: 'vertical' as const` and add `range: 1`.

- [ ] **Step 3: Run the fixtures' dependents once the engine tests are updated**

No standalone fixture test exists; verify in Task 8.

### Task 8: Update engine test files (mechanical)

**Files:**
- Modify: `src/game/blocking.test.ts`, `src/game/combat.test.ts`, `src/game/coverage.test.ts`, `src/game/dev.test.ts`, `src/game/faceCards.test.ts`, `src/game/firing.test.ts`, `src/game/miss.test.ts`, `src/game/roundTermination.test.ts`, `src/game/staging.test.ts`, `src/game/step.test.ts`, `src/game/tick.test.ts`, `src/data/deck.test.ts`, `src/game/cards.test.ts`
- Delete: `src/game/support.test.ts`, `src/game/towerAuras.test.ts`, `src/data/towerRanks.test.ts`

**Interfaces:**
- Consumes: `towerType` from `../data/towerTypes` (replacing `TOWER_RANKS[rank]`), `withTower(type, ...)` (replacing `withTower(rank, ...)`).

- [ ] **Step 1: Rank → type translation table**

Old rank usage maps to types as follows (placeholders; the translation only has to produce a tower with the right shape for the test):

| Old rank | Old meaning | New type |
| --- | --- | --- |
| 2 | adjacent, fast single shot | `vertical` (nearest firing shape) or `splash` when the test needs multi-target short range |
| 3 | vertical | `vertical` |
| 4 | cross | `cross` |
| 5 | diagonal | `diagonal` |
| 6 | star | `star` |
| 7 | wall | `wall` |
| 8 | amplifier ring | `ring` |
| 9 | freezer | deleted — rewrite the test to a firing tower (e.g. `splash` or `ring`) or drop it |
| 10 | toll gate band | `tollgate` |

For every `TOWER_RANKS[N].field` replace with `towerType('...').field` using the table; for every `withTower(N, ...)` replace with `withTower('...', ...)`; for every `.cardRank === N` assertion replace with `.type === '...'`.

Where a test names `cardRank` on a hand-built Tower object (e.g. `towerDiff.test`, `firePulse.test`, `towerFootprint.test`), set `type` and `range` fields instead (Phase D handles scene tests; engine tests here only).

- [ ] **Step 2: Behavioural changes per file**

- `blocking.test.ts`: references `♣`/`♦`-boosted Towers (`tower.damage`, `tower.fireIntervalMs` assertions after supports). Supports are gone — those tests are deleted or rewritten to assert the seeded instance values (a freshly placed Tower has `damage` and `fireIntervalMs` equal to its type's def). The blocked-Piece-grinds tests stay, using `withTower('wall', ...)` etc.
- `combat.test.ts`: Tower health assertions → `towerType(...).maxHealth`.
- `coverage.test.ts`: `hittableSquares` now reads instance range; tests using `withTower` still pass with translated types. Direct `coversSquare(...)` geometry tests are unchanged (geometries not renamed).
- `faceCards.test.ts`: delete the **Queen — Echo** describe block; replace with **Queen — Range**:
  ```ts
  it('adds +1 to a Tower's range, stackably', () => {
    const state = withDeck([standardCard('q', 'Q', 'diamonds')], withTower('diagonal', SQUARE))
    const towerId = firstTowerId(state)
    const one = step(state, { kind: 'rangeTower', cardId: 'q', towerId })
    expect(firstTower(one).range).toBe(towerType('diagonal').range + 1)
    const withTwo = withDeck([standardCard('q2', 'Q', 'spades')], one)
    const two = step(withTwo, { kind: 'rangeTower', cardId: 'q2', towerId })
    expect(firstTower(two).range).toBe(towerType('diagonal').range + 2)
  })
  ```
  Keep Jack/King/Ace/Joker blocks; update any `withTower(5, ...)` to `withTower('diagonal', ...)` and `TOWER_RANKS[5]` to `towerType('diagonal')`.
- `firing.test.ts`: translate ranks per table. The multi-target ring tests use `'ring'`. The Wall tests use `'wall'`. The toll gate tests use `'tollgate'`. Delete nothing else.
- `miss.test.ts`: `TOWER_RANKS[3]` → `towerType('vertical')`.
- `roundTermination.test.ts`: the ♥-repair grind tests are obsolete (no support). Keep the parts that survive: (1) a blocked Piece counts as acting and the round does not end while it grinds — rewrite using `withTower('wall', ...)` and a Pawn, asserting the phase stays `inProgress` across a long window; (2) the Wall still falls once its health runs out — assert `withTower('wall', TOWER_SQUARE)` grinded by a Pawn eventually dies and the round reaches `gap`; (3) the packs-gap-only tests stay verbatim (`buyPack` refused mid-round). Delete the `supportTower` calls and the HEAL_DEFICIT arithmetic.
- `staging.test.ts`: `TOWER_RANKS[7]` → `towerType('wall')`, `TOWER_RANKS[3]` → `towerType('vertical')`.
- `step.test.ts`: the `buildTower` describe block becomes a `playHand`/`placeTower` block:
  - legal hand on a square places a Tower; consumes the cards; refuses out-of-bounds/Core/occupied; refuses mid-round (`phase !== 'gap'`); refuses an invalid hand; refuses a hand while a pending Tower already stands; `placeTower` without a pending Tower returns unchanged; a royal flush without `chosenType` is refused and with a valid `chosenType` places that Tower.
  - the defeated/victory guard `it.each` list: swap `buildTower` for `playHand` (a valid single-card high-card hand) and `supportTower`/`echoTower` rows are deleted.
- `tick.test.ts`: translate ranks; the `cardRank: 2` inline object gets `type: 'vertical', range: towerType('vertical').range`.
- `dev.test.ts`: dev commands unchanged except any that reference `cardRank`-shaped Towers.
- `data/deck.test.ts`: delete the `FACE_SUPPORT_PREMIUM` integer test (constants gone); keep `DECK_CAP`.
- `game/cards.test.ts`: keep `findCard`/`removeCard`; `isBuildableRank` stays (still used for straights). If it becomes unused after the rework, delete the describe block and the function.
- Delete `support.test.ts` and `towerAuras.test.ts` and `towerRanks.test.ts`.

- [ ] **Step 3: Run engine tests**

Run: `pnpm test:run src/game src/data/towerTypes.test.ts`
Expected: PASS. Any failing assertion that references a specific old balance number (e.g. a health value) should be re-derived from `towerType(...)` rather than hand-tuned.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL — scene and UI still reference the old API. That is expected until Phase D/E. **Green checkpoint:** verify `pnpm typecheck 2>&1 | grep -E 'src/(game|data)/'` reports nothing. Commit:

```bash
git add -A src/game src/data
git commit -m "feat(game): poker hands purchase towers; delete supports and auras"
```

### Task 9: Rework `structuralKey.ts` and its test

**Files:**
- Modify: `src/state/structuralKey.ts`, `src/state/structuralKey.test.ts`

- [ ] **Step 1: Update the tower string**

In `structuralKey.ts`, the tower mapping becomes:

```ts
const towers = state.towers
  .map(
    (tower) =>
      `${tower.id}@${tower.square.file},${tower.square.rank}:${tower.type}:${tower.range}:${tower.health}:${tower.maxHealth}:${tower.shield}:${tower.damage}:${tower.fireIntervalMs}`,
  )
  .join('|')
```

Add `state.pendingTower` to the key array (a place that changes when a hand is committed or placed — a publish the UI needs).

- [ ] **Step 2: Update the test**

`structuralKey.test.ts` line ~123 uses `{ kind: 'buildTower', cardId: 'five', square }`. Replace with `{ kind: 'playHand', cardIds: ['five'] }` followed by `{ kind: 'placeTower', square }`, and assert the key changes on both steps.

- [ ] **Step 3: Run**

Run: `pnpm test:run src/state/structuralKey.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/state/structuralKey.ts src/state/structuralKey.test.ts
git commit -m "fix(state): key pending tower and tower type/range"
```

---

## Phase D — Scene rework

### Task 10: `rankColours` → tower type colours

**Files:**
- Modify: `src/scene/rankColours.ts`, `src/scene/towerColour.ts`, `src/scene/Towers.tsx`, `src/scene/firePulse.ts`, `src/scene/towerDiff.ts`
- Create: none.

- [ ] **Step 1: Rework `rankColours.ts`**

Rename `RANK_COLOURS` to `TOWER_COLOURS` keyed by `TowerTypeId`:

```ts
import type { TowerTypeId } from '../game'

export const TOWER_COLOURS: Record<TowerTypeId, string> = {
  vertical: '#16a085',
  wall: '#e67e22',
  sniper: '#2e86c1',
  diagonal: '#d4ac0d',
  cross: '#8e44ad',
  star: '#c0392b',
  splash: '#2980b9',
  ring: '#27ae60',
  tollgate: '#7f8c8d',
}
```

Update the module doc comment: one colour per TOWER TYPE; drop every "rank" phrase.

- [ ] **Step 2: `towerColour.ts`**

Change the `cardRank: BuildableRank` param to `type: TowerTypeId`; set `target.set(TOWER_COLOURS[type])`. Delete the `dimmed`/`OUT_OF_REACH` support-fade logic and its param (supports are gone). Update the doc comments.

- [ ] **Step 3: `Towers.tsx`**

- Import `TOWER_TYPE_IDS`, `towerType` from data, `TOWER_COLOURS` instead of `RANK_COLOURS`.
- Replace `towerHeight(cardRank: BuildableRank)` with `towerHeight(type: TowerTypeId)` using a type-based height (e.g. `0.55 + TOWER_TYPE_IDS.indexOf(type) * 0.08`).
- The render loop iterates `TOWER_TYPE_IDS` instead of `BUILDABLE_RANKS`; `live`/`dying` filter on `tower.type === type` and `ghost.type === type`.
- Delete the `supportCard`/`canSupport` logic and the `deck` subscription (supports are gone); remove the `dimmed` argument from `towerColour` calls.
- `Instance` `color={TOWER_COLOURS[type]}`.

- [ ] **Step 4: `firePulse.ts`**

- `FirePulse.cardRank: BuildableRank` → `FirePulse.type: TowerTypeId`, plus carry the range the shot fired at: add `range: number` to `FirePulse` (a Tower can be range-boosted by a Queen, and a destroyed Tower's pulse must still know its reach).
- `detectShots` pushes `{ type: tower.type, range: tower.range, file, boardRank, startedAt }`.
- `RANK_RGB` → `TOWER_RGB: Record<TowerTypeId, Color>`; `isPulseLive` and `accumulatePulses` read `towerType(pulse.type)` for geometry and use `pulse.range`.

- [ ] **Step 5: `towerDiff.ts`**

`Ghost.cardRank: BuildableRank` → `Ghost.type: TowerTypeId`; `TowerAnimation.cardRank` → `type`; `diffTowers` reads `tower.type`. (Range is not needed here — colouring a ghost uses its type, and the mesh scale/position use file/boardRank.)

- [ ] **Step 6: Typecheck and run scene tests**

Run: `pnpm typecheck`
Expected: FAIL — `towerFootprint.ts`, `TowerCoverage.tsx`, `CoveragePreview.tsx`, `Board.tsx`, `boardClick.ts`, and their tests still reference the old API. That is expected; Tasks 11–12 close them.

### Task 11: `towerFootprint.ts` and its overlays

**Files:**
- Modify: `src/scene/towerFootprint.ts`, `src/scene/TowerCoverage.tsx`, `src/scene/CoveragePreview.tsx`

- [ ] **Step 1: `towerFootprint.ts`**

- `CoverageSelection.cardRank: BuildableRank` → `type: TowerTypeId`; add `range: number`.
- `coverageSelection` returns `{ type: tower.type, range: tower.range, file, boardRank }`.
- `overlaySquares(board, type, range, from, blockers)` reads `towerType(type)` for geometry and uses the passed `range`. Since auras are gone, `aura` branching disappears — every tower draws `reachableSquares`.
- `selectedFootprint(board, type, range, file, boardRank, blockers)`.
- Update the long doc comments that explain range-on-the-instance reasoning (the Queen now moves range, so the "no support moves range" caveat is dead — range is a live instance field).

- [ ] **Step 2: `TowerCoverage.tsx`**

Read `selection?.type`/`selection?.range`, pass both to `selectedFootprint`. Update the doc comment that references "aura ranks" (none exist now).

- [ ] **Step 3: `CoveragePreview.tsx`**

The preview now shows the footprint of the PENDING hand tower (the tower about to be placed) rather than a picked card's rank. Gate on `state.pendingTower !== null`:

```ts
const pendingType = useGameStore((store) => store.snapshot.pendingTower)

const footprint = useMemo(() => {
  if (!activeSquare || !isInBounds(board, activeSquare)) return null
  if (pendingType === null) return null
  return {
    covered: overlaySquares(board, pendingType, towerType(pendingType).range, activeSquare, blockers),
    origin: activeSquare,
  }
}, [activeSquare, blockers, board, pendingType])
```

Drop the `selectedCardId`/`playMode`/`isBuildableRank`/`findCard` logic and the `deck` subscription. The red illegal marker stays (`canBuildOn`).

- [ ] **Step 4: Run**

Run: `pnpm test:run src/scene/towerFootprint.test.ts`
Expected: FAIL until Task 12 updates the scene tests. Move on.

### Task 12: `boardClick.ts` and `Board.tsx`

**Files:**
- Modify: `src/scene/boardClick.ts`, `src/scene/Board.tsx`

**Interfaces:**
- Consumes: `evaluateHand` for nothing (hands are committed from the Deck), `pendingTower` from state.
- Produces: new `BoardAction` kinds: `{ kind: 'place' }` when a pending Tower exists and the click is on a legal square; `{ kind: 'range', towerId }` when a Queen is selected and a Tower is clicked; `select`/`deselect`/`preview` as before.

- [ ] **Step 1: Rework `boardClick.ts`**

The new flow:
- No Card selected and no pending Tower: click a Tower selects it (panel), click empty space deselects — exactly as today.
- A pending Tower exists: clicking any square yields a `placeTower` command (illegal squares are refused by the engine; coarse pointers preview first, as today).
- A face card is selected (`J` or `Q`): clicking a Tower targets it — `J` → `shieldTower`, `Q` → `rangeTower`. `K`/`A`/Joker play from the Deck (no board target). Numbered cards are never selected alone for a board action — they exist only in hand selections handled by the Deck.

Rewrite `BoardClickContext`: remove `playMode` and `echoSourceTowerId`; add `pendingTower: TowerTypeId | null` and `selectedCard: Card | null`.

`resolveBoardAction` becomes:

```ts
export function resolveBoardAction(context: BoardClickContext): BoardAction {
  const { square, towers, selectedTowerId, card, pendingTower, pointer, previewedSquare } = context

  const inspect = resolveBoardClick(square, towers, selectedTowerId)
  const panel: BoardAction = inspect.kind === 'build' ? { kind: 'deselect' } : inspect

  if (pendingTower !== null) {
    if (pointer === 'coarse' && !(previewedSquare && squaresEqual(previewedSquare, square))) {
      return { kind: 'preview', square }
    }
    return { kind: 'play', command: { kind: 'placeTower', square } }
  }

  if (!card) return panel

  // A J or Q needs a Tower target; K/A/Joker have no board target.
  if (card.kind !== 'standard') return panel
  const clickedTower = towers.find((tower) => squaresEqual(tower.square, square))
  if (card.rank === 'J' && clickedTower) {
    return { kind: 'play', command: { kind: 'shieldTower', cardId: card.id, towerId: clickedTower.id } }
  }
  if (card.rank === 'Q' && clickedTower) {
    return { kind: 'play', command: { kind: 'rangeTower', cardId: card.id, towerId: clickedTower.id } }
  }

  return panel
}
```

Coarse-pointer preview for face plays: `J`/`Q` need a Tower click and have no footprint, so no preview gate applies to them (they play on tap, matching today's support behaviour). The preview gate above is only for placement.

- [ ] **Step 2: `Board.tsx`**

Update the `PlacementSurface` click handler:
- Read `pendingTower` from `getState()`.
- Pass `pendingTower` and `card` into `resolveBoardAction`.
- Remove the `echoSourceTowerId`/`pickEchoSource` branches; keep `preview`/`select`/`deselect`/`play`.
- After a `placeTower` play, clear the selected Card (if any) and the previewed square, as today.

- [ ] **Step 3: Run scene tests**

Run: `pnpm test:run src/scene`
Expected: FAIL — the scene test files below still reference the old shapes. Task 13 fixes them.

### Task 13: Update scene test files

**Files:**
- Modify: `src/scene/boardClick.test.ts`, `src/scene/firePulse.test.ts`, `src/scene/towerDiff.test.ts`, `src/scene/towerFootprint.test.ts`, `src/scene/pieceExit.test.ts`

- [ ] **Step 1: `boardClick.test.ts`**

Rewrite around the new `resolveBoardAction`:
- Hand-built Tower objects get `type` + `range` instead of `cardRank`.
- Delete every `playMode: 'support'` test and every Echo test.
- Add tests: a pending Tower turns any square click into `placeTower`; a `J` on a Tower → `shieldTower`; a `Q` on a Tower → `rangeTower`; a numbered card alone yields the panel (not a build).

- [ ] **Step 2: `firePulse.test.ts`, `towerDiff.test.ts`, `towerFootprint.test.ts`, `pieceExit.test.ts`**

Mechanical translation per the Task 8 rank→type table: hand-built Towers get `type` + `range`; `TOWER_RANKS[N]` → `towerType('...')`; `cardRank` → `type`; `FirePulse` gets a `range` field (see Task 10). `towerFootprint.test.ts`'s Amplifier/Freezer sections (rank 8/9 aura footprints) are deleted — those towers no longer exist as auras; replace with `ring` (hits all in ring, no aura branch) and drop the freezer cases.

- [ ] **Step 3: Run all scene + state tests**

Run: `pnpm test:run src/scene src/state`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A src/scene src/state
git commit -m "feat(scene): towers keyed by type; placement and Queen range flows"
```

---

## Phase E — UI rework

### Task 14: `uiStore.ts` and card selection model

**Files:**
- Modify: `src/state/uiStore.ts`, `src/ui/cardActions.ts`

**Interfaces:**
- Produces: `selectedCardIds: readonly string[]` (a hand being assembled), `toggleCard(cardId)`, `clearSelection()`. Deletes `selectedCardId`, `playMode`, `echoSourceTowerId`, `setEchoSourceTowerId`.

- [ ] **Step 1: Rework `uiStore.ts`**

Replace `selectedCardId: string | null` / `setSelectedCardId` with:

```ts
/** The Card ids the player has picked to assemble a hand, in pick order. */
selectedCardIds: readonly string[]
toggleCard: (cardId: string) => void
clearSelection: () => void
```

`toggleCard` adds or removes a single id. Delete `playMode` and `setPlayMode` (there is no build/support choice any more). Delete `echoSourceTowerId` and `setEchoSourceTowerId` (Echo is gone). Keep `hoveredSquare`, `previewedSquare`, `selectedTowerId`, `packShopOpen`, `creditsOpen`, `devPanelOpen`, `markedForCullIds`.

- [ ] **Step 2: Rework `cardActions.ts`**

- `selectCard` becomes `toggleCardForHand(cardId)` calling `ui.toggleCard(cardId)` and clearing `previewedSquare`. When a face card is selected ALONE (the only id), the Deck offers its action; when any selection exists, the Deck offers the hand commit (or a "not a hand" state). The "which is it" decision lives in the Deck's pure helper (Task 15).
- `resetRun` clears `selectedCardIds` instead of `selectedCardId`; drop the `echoSourceTowerId` clear.

### Task 15: Deck UI and hand labels

**Files:**
- Modify: `src/ui/Deck.tsx`, `src/ui/MobileHud.tsx`, `src/ui/DeckOverlay.tsx`
- Create: `src/ui/handSelection.ts` + `src/ui/handSelection.test.ts` (pure, testable)

**Interfaces:**
- Consumes: `evaluateHand`, `HAND_SIZES`, `HAND_TOWER`, `HandType` from `../game`; `towerType` from `../data/towerTypes`.
- Produces:
  - `selectionSummary(cards: readonly Card[]): { kind: 'hand'; hand: HandType; tower: TowerTypeId } | { kind: 'singleFace'; rank: FaceRank } | { kind: 'invalid' } | { kind: 'empty' }`
  - `commitCommand(selection): Command | null` — `playHand` for a valid hand, `null` for royal flush until a `chosenType` is picked.
  - `FACE_ACTION: Record<FaceRank, string>` — `J: 'Shield a Tower'`, `Q: 'Add +1 range to a Tower'`, `K: 'Reinforce the Core'`, `A: 'Expand the board'`.

- [ ] **Step 1: Write `handSelection.ts`**

```ts
import { evaluateHand, HAND_SIZES, HAND_TOWER, type FaceRank, type HandType, type Card, type TowerTypeId } from '../game'
import { towerType } from '../data/towerTypes'

export type SelectionSummary =
  | { readonly kind: 'empty' }
  | { readonly kind: 'hand'; readonly hand: HandType; readonly tower: TowerTypeId; readonly towerLabel: string }
  | { readonly kind: 'singleFace'; readonly rank: FaceRank }
  | { readonly kind: 'invalid' }

export const FACE_ACTION: Record<FaceRank, string> = {
  J: 'Shield a Tower',
  Q: 'Add +1 range to a Tower',
  K: 'Reinforce the Core',
  A: 'Expand the board',
}

export function selectionSummary(cards: readonly Card[]): SelectionSummary {
  if (cards.length === 0) return { kind: 'empty' }

  if (cards.length === 1) {
    const card = cards[0]
    if (card?.kind === 'standard' && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A')) {
      return { kind: 'singleFace', rank: card.rank }
    }
  }

  const hand = evaluateHand(cards)
  if (!hand) return { kind: 'invalid' }
  if (hand === 'royalFlush') {
    return { kind: 'hand', hand, tower: 'vertical', towerLabel: 'Tower of your choice' }
  }
  const tower = HAND_TOWER[hand]
  return { kind: 'hand', hand, tower, towerLabel: towerType(tower).geometry }
}

export function commitCommand(cards: readonly Card[], chosenType?: TowerTypeId) {
  const summary = selectionSummary(cards)
  if (summary.kind !== 'hand') return null
  if (summary.hand === 'royalFlush' && chosenType === undefined) return null
  return { kind: 'playHand' as const, cardIds: cards.map((card) => card.id), chosenType }
}
```

> Note: a single face card is ALSO a valid high-card hand. The Deck must offer BOTH: the face action (any time) and the high-card commit (gap only). `selectionSummary` returns `singleFace` for a lone face card; the Deck renders the action button AND, when in the gap, a "Commit as high card" button that commits the same single card. `commitCommand` must therefore accept a lone face card too — see Step 3.

- [ ] **Step 2: Write `handSelection.test.ts`**

Cover: empty, single numbered → hand (high card), single face → singleFace, pair of faces → hand (pair), royal flush summary labels "Tower of your choice", invalid five-card pair, `commitCommand` null for royal flush without `chosenType`, and a single face card committing as high card when the Deck asks it to.

- [ ] **Step 3: Adjust `commitCommand` for lone face cards**

Add an explicit parameter or branch: when `summary.kind === 'singleFace'`, `commitCommand` returns a `playHand` with that one card (a high-card hand). Update the test to pin it.

- [ ] **Step 4: Rework `Deck.tsx`**

- Render each card toggling membership in `selectedCardIds` (highlight active ones).
- Show a hand panel: `selectionSummary(selected)`:
  - `empty`: "Pick Cards to form a hand."
  - `hand`: label the hand and tower (e.g. "Pair — builds the Wall"); a "Commit hand" button (gap only; disabled mid-round), which dispatches `commitCommand(...)` then `clearSelection()` on success.
  - `singleFace`: show `FACE_ACTION[rank]`; if `J`/`Q`, a hint to click a Tower; if `K`/`A`, a Play button; PLUS, when in the gap, a "Commit as high card" button (dispatches `playHand` with the single card).
  - `invalid`: "These Cards are not one hand."
- Royal flush: after commit command resolves as pending (see Task 16), the Deck offers a 9-tower choice if the pending Tower came from a royal flush — simplified: the Deck always asks for `chosenType` before committing a royal flush via a small row of type buttons.
- Remove `rankModeLabel`, `targetHint`, `untargetedPlay`, `supportModeLabel` imports.

- [ ] **Step 5: Rework `MobileHud.tsx` and `DeckOverlay.tsx`**

Same hand-selection model: the mobile strip shows the selection summary + commit, and `DeckOverlay` toggles cards into `selectedCardIds` without closing on every pick.

- [ ] **Step 6: Run UI tests**

Run: `pnpm test:run src/ui/handSelection.test.ts`
Expected: PASS.

### Task 16: Hand commit → placement wiring in the HUD

**Files:**
- Modify: `src/ui/Deck.tsx`, `src/ui/DesktopHud.tsx`, `src/ui/MobileHud.tsx`

- [ ] **Step 1: Pending-placement hint**

When `state.pendingTower !== null`, the Deck shows "Place the <tower> on a square" and a Cancel button:

```tsx
{pendingTower !== null ? (
  <div className="deck__detail">
    <p className="hud__hint">Place this Tower on the board, or cancel.</p>
    <button type="button" className="deck__play" onClick={() => dispatch({ kind: 'placeCancel' as never })}>
      Cancel
    </button>
  </div>
) : null}
```

> There is no `placeCancel` command in the spec. Cancelling an unplaced hand play is the "play is cancelled" case from the spec, and the engine needs a command for it. Add it in Task 17.

- [ ] **Step 2: Keep the round buttons consistent**

`DesktopHud`/`MobileHud` start-round buttons disable when `phase !== 'gap'` already; they must ALSO disable when `pendingTower !== null` (the engine refuses anyway). Add `disabled={phase !== 'gap' || pendingTower !== null}`.

### Task 17: Add `cancelPlacement` command

**Files:**
- Modify: `src/game/types.ts`, `src/game/cardPlays.ts`, `src/game/step.ts`, `src/game/step.test.ts`

- [ ] **Step 1: Add the command**

In `types.ts` add `| { readonly kind: 'cancelPlacement' }`. In `cardPlays.ts`:

```ts
export function cancelPlacement(state: GameState): GameState {
  if (isTerminal(state.phase)) return state
  if (state.phase !== 'gap') return state
  if (state.pendingTower === null) return state

  return { ...state, pendingTower: null }
}
```

In `step.ts` add the case. Cards are NOT refunded — the spec says the play is cancelled, not the hand undone.

- [ ] **Step 2: Test it**

In `step.test.ts`, add: `cancelPlacement` clears a pending Tower and does not restore the deck; refuses with no pending Tower.

- [ ] **Step 3: Wire the Deck Cancel button**

Replace the `placeCancel as never` stub in Task 16 Step 1 with `dispatch({ kind: 'cancelPlacement' })`.

- [ ] **Step 4: Run**

Run: `pnpm test:run src/game/step.test.ts`
Expected: PASS.

### Task 18: TowerPanel, labels, DevPanel

**Files:**
- Modify: `src/ui/TowerPanel.tsx`, `src/ui/targetsLabel.ts`, `src/ui/geometryLabels.ts`, `src/ui/DevPanel.tsx`, `src/ui/supportLabel.ts` (delete)
- Delete: `src/ui/supportLabel.ts`

- [ ] **Step 1: `TowerPanel.tsx`**

- `const def = towerType(tower.type)`.
- Title: `Type {tower.type} Tower` (or a friendly label — reuse `TOWER_TYPE_IDS` order or add labels to `towerTypes.ts`).
- Show `tower.range` (instance) in the stat line instead of `def.range`.
- Remove the `targetsLabel` reference's rank comments only; `targetsLabel(def.targetsPerShot)` still works.
- DPS uses `tower.damage / (tower.fireIntervalMs / 1000)` — unchanged.

- [ ] **Step 2: `targetsLabel.ts`**

Update comments that name "the rank-7 Wall" / "rank 9" → the Wall / `towerType('wall')` etc. Logic unchanged.

- [ ] **Step 3: `geometryLabels.ts`**

Geometries are unchanged; only update the doc comment that references the "2–10 ladder" → "the tower types". No entries change.

- [ ] **Step 4: Delete `supportLabel.ts`**

```bash
git rm src/ui/supportLabel.ts
```

Remove its imports from `Deck.tsx`/`MobileHud.tsx` (done in Task 15).

- [ ] **Step 5: `DevPanel.tsx`**

The tower list shows `Rank {tower.cardRank}` → `{tower.type}`. Everything else (card picker, spawner, economy) is unchanged.

### Task 19: UI tests and full-suite green

**Files:**
- Modify: `src/ui/cardPlay.test.ts`, `src/ui/targetsLabel.test.ts`, `src/ui/cardRankSelect.test.ts`, `src/state/simulation.test.ts`, `src/state/structuralKey.test.ts`
- Delete: none.

- [ ] **Step 1: `cardPlay.ts` and `cardPlay.test.ts`**

`src/ui/cardPlay.ts` (`rankModeLabel`, `targetHint`, `untargetedPlay`) is replaced by `handSelection.ts` (Task 15). Delete `cardPlay.ts` and `cardPlay.test.ts`:

```bash
git rm src/ui/cardPlay.ts src/ui/cardPlay.test.ts
```

- [ ] **Step 2: `targetsLabel.test.ts`**

`Object.values(TOWER_RANKS)` → `TOWER_TYPE_IDS.map((id) => towerType(id))`; assert `>= 9` → `toBe(9)`. Update the Wall/rank comments.

- [ ] **Step 3: `cardRankSelect.test.ts`**

Unchanged (dev-only rank parsing). Verify only.

- [ ] **Step 4: `simulation.test.ts`**

Replace `{ kind: 'buildTower', cardId, square }` with `{ kind: 'playHand', cardIds: [cardId] }` + `{ kind: 'placeTower', square }` (using the fixture's `buildableCardId()`), asserting the structural-publish bounds still hold across both commands.

- [ ] **Step 5: Full suite**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm lint`
Run: `pnpm typecheck`
Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): poker hand selection, Queen range, pending placement"
```

---

## Phase F — Docs

### Task 20: Update the design docs

**Files:**
- Modify: `docs/design/game-design.md`, `CLAUDE.md`

- [ ] **Step 1: `game-design.md`**

Rewrite the card-mechanics and tower sections per the spec (dated 2026-08-12): the hand ladder table, card roles (2–10 hand material; J/Q/K/A action-or-hand; Joker Clear), the two-step hand play (gap-only), Queen = +1 range, suit support gone, Amplifier/Freezer gone, towers keyed by type. Move the retired invariants (suit supports, rank-match, Echo, Amplifier-never-self, the DPS/coverage rank ladder) to a "retired" note or delete them. Update the open-questions rows that reference supports or the rank ladder (e.g. "Repair versus the wall", "♦ Speed and ♣ Damage on a gunless Tower" — both now moot and deleted).

- [ ] **Step 2: `CLAUDE.md`**

- Update "Current state": describe the hand system, the new tower roster, Queen = +1 range, gap-only hand plays.
- Delete the invariants that are dead: "A numbered Card supports only a Tower of its own rank", "A support's value never depends on a rank", "An Amplifier never amplifies its own fire", and the rank-ladder DPS/coverage claims. Replace with the hand-ladder invariants: strict rarity order, exact-hand-no-kickers, hands gap-only, tower keyed by type.
- Add to "Domain vocabulary": **Hand** (a committed set of Cards that purchases a Tower), **Hand type**, update **Support** to "retired", update **Echo** → **Range**.
- Update the "rank" warning: `cardRank` is gone from Tower; towers carry `type`.

- [ ] **Step 3: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "docs: poker hands build towers"
```

### Task 21: Final verification

- [ ] **Step 1: Full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all pass.

- [ ] **Step 2: Coverage**

Run: `pnpm test:coverage`
Expected: passes the existing per-directory thresholds (they sit just under current coverage; the engine kept its coverage via the rewritten tests, the new `hands.ts` is well covered, and `src/game/` thresholds apply). If a threshold regresses, add the missing engine assertions before merging — do not lower thresholds.

---

## Self-review notes

- **Spec coverage:** hand ladder table (Tasks 1–2), card roles incl. Queen = +1 range and face-in-hand (Tasks 2, 4, 8, 15), two-step gap-only hand play (Tasks 4–5, 17), towers keyed by type (Task 3), delete support/aura/freezer/echo (Tasks 4–6), economy unchanged (no touches to packs/ink), docs (Task 20).
- **Known simplifications recorded in the spec's open follow-ups:** sniper/splash stat tuning (placeholders here), the Queen's uncapped +1 range.
- **Type consistency:** `Tower.type`, `Tower.range`, `GameState.pendingTower`, `playHand`/`placeTower`/`rangeTower`/`cancelPlacement` are used consistently across Tasks 3–19. `FirePulse` gained a `range` field in Task 10 and `firePulse.test.ts` in Task 13.
