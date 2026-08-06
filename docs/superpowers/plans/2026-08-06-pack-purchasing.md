# Pack Purchasing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the player spend Ink on one of four pack types between rounds, culling down to the 30-card Deck cap first, and open a run by dealing a Base pack.

**Architecture:** A seeded PRNG with named streams lands first (`src/game/rng.ts`), then pack tables in `src/data/packs.ts` and pure dealing in `src/game/packs.ts`. Purchase is a single atomic `buyPack` command — cull and open commit together, so `GameState` never holds a half-finished transaction and the in-progress cull selection stays in `uiStore.ts`. The UI is a modal that owns pick → cull → reveal.

**Tech Stack:** TypeScript (strict), Vitest, zustand, React. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-06-pack-purchasing-design.md`](../specs/2026-08-06-pack-purchasing-design.md)

## Global Constraints

- **`src/game/` and `src/data/` must never import React or Three.js.** Enforced by ESLint; a violation fails `pnpm lint` and CI.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** Enforced by ESLint. It is legal in `src/state/`.
- **`step` must return the *same object* on a refusal.** `simulation.dispatch` compares by identity (`next === current`) to tell a refused command from a successful one. Returning a shallow copy silently breaks every caller.
- **A Card's identity is its `id`, never its rank and suit.** Go through `findCard` / `removeCard` in `src/game/cards.ts`.
- **`deck.length <= DECK_CAP` (30) at every observable moment.**
- **Packs are bought only in the `gap` phase.** This is what keeps round termination bounded.
- **Never add a per-tick value to `structuralKey`.** It would push a React render every frame.
- Coverage thresholds in `vite.config.ts`: `src/game/**` at 85/85/85/90, `src/state/**` at 90/95/85/90. Everything new in `src/game/` is measured. `src/data/**` and `src/ui/**` are excluded but still get tests.
- Run `pnpm test:run` in automation, never `pnpm test` (watch mode).

## Spec amendment — card ids need their own counter

**Spec decision 2 says new card ids come from `nextEntityId`, "the counter Pieces and Towers already share". Do not do this.**

`src/game/tick.ts:303` reads:

```ts
// Entity-id parity, so consecutively spawned Pieces weave opposite ways.
handedness: nextEntityId % 2 === 0 ? 1 : -1,
```

`nextEntityId`'s **parity is load-bearing for Piece movement**. Dealing a 10-card opening pack from it would start `nextEntityId` at 11 instead of 1, flipping the handedness of every Piece spawned for the rest of the run — a silent gameplay change, not an id cosmetic.

So cards get their own counter, `nextCardId`, added in Task 2. Task 11 records this in the spec and in `types.ts` beside `nextEntityId`, because the next person to reach for that counter deserves the warning.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/rng.ts` | **Create.** Seeded PRNG: derive a named stream from a run seed, draw floats, ints, and weighted picks. Immutable. |
| `src/game/rng.test.ts` | **Create.** Determinism and stream independence. |
| `src/data/packs.ts` | **Create.** Pack sizes, placeholder prices, rarity tiers and placeholder weights. Data only. |
| `src/game/packs.ts` | **Create.** Pure dealing from a stream; the cull-requirement rule; the `buyPack` resolution. |
| `src/game/packs.test.ts` | **Create.** Dealing, weighting, and the opening deal. |
| `src/game/buyPack.test.ts` | **Create.** The command: every refusal branch and the successful path. |
| `src/game/types.ts` | **Modify.** `seed`, `rng`, `nextCardId` on `GameState`; the `buyPack` Command variant. |
| `src/game/state.ts` | **Modify.** `createInitialState(seed?)`; deals the opening Base pack. |
| `src/game/step.ts` | **Modify.** Dispatch `buyPack`. |
| `src/game/index.ts` | **Modify.** Export the new public surface. |
| `src/data/cards.ts` | **Modify.** Add `ALL_CARD_RANKS`. |
| `src/data/deck.ts` | **Modify.** Delete `STARTING_DECK`; keep `DECK_CAP`. |
| `src/data/deck.test.ts` | **Modify.** Drop the authored-list assertions; keep `DECK_CAP` and `supportMagnitude`. |
| `src/state/simulation.ts` | **Modify.** Generate the run seed; `reset(seed?)`. |
| `src/state/simulation.test.ts` | **Modify.** Seed deterministically. |
| `src/state/structuralKey.ts` | **Modify.** Key the Deck on card ids, not length. |
| `src/state/structuralKey.test.ts` | **Modify.** Pin the equal-size cull-and-open case. |
| `src/ui/CardFace.tsx` | **Create.** The mini card face, extracted from `Deck.tsx` so the modal reuses it. |
| `src/ui/packPurchase.ts` | **Create.** Pure: the commit button's enabled state, label, and reason. |
| `src/ui/packPurchase.test.ts` | **Create.** |
| `src/ui/PackShop.tsx` | **Create.** The modal. |
| `src/ui/Deck.tsx` | **Modify.** Use `CardFace`; support cull-marking. |
| `src/ui/Hud.tsx` | **Modify.** The `Buy a pack` button; mount `PackShop`. |
| `src/state/uiStore.ts` | **Modify.** `packShopOpen` and the marked-for-cull set. |
| `src/index.css` | **Modify.** Modal and pack-tile styles. |

---

### Task 1: Seeded PRNG with named streams

**Files:**
- Create: `src/game/rng.ts`
- Test: `src/game/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Rng { readonly state: number }`; `streamFor(seed: string, name: string): Rng`; `next(rng: Rng): [number, Rng]`; `nextWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): [T, Rng]`.

Deliberately no `nextInt`. Dealing needs only weighted picks, and an untouched helper is an untested branch fighting the coverage ratchet. Add it when something needs it.

- [ ] **Step 1: Write the failing tests**

Create `src/game/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { next, nextWeighted, streamFor, type Rng } from './rng'

function draw(rng: Rng, count: number): number[] {
  const values: number[] = []
  let current = rng
  for (let i = 0; i < count; i += 1) {
    const [value, advanced] = next(current)
    values.push(value)
    current = advanced
  }
  return values
}

describe('streamFor', () => {
  it('gives the same sequence for the same seed and stream', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).toEqual(draw(streamFor('run-a', 'packs'), 8))
  })

  it('gives different sequences for different seeds', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).not.toEqual(draw(streamFor('run-b', 'packs'), 8))
  })

  /**
   * The property named streams exist for. A second random consumer added later
   * draws from its own stream, so it cannot shift what a shared seed deals to
   * packs — which is what makes a seed survive code changes.
   */
  it('gives independent sequences to different streams of one seed', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).not.toEqual(draw(streamFor('run-a', 'rounds'), 8))
  })

  it('is unaffected by how much another stream has been drawn', () => {
    const packs = streamFor('run-a', 'packs')
    const before = draw(packs, 4)

    draw(streamFor('run-a', 'rounds'), 500)

    expect(draw(packs, 4)).toEqual(before)
  })
})

describe('next', () => {
  it('returns values in [0, 1)', () => {
    for (const value of draw(streamFor('run-a', 'packs'), 500)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('does not mutate the rng it was given', () => {
    const rng = streamFor('run-a', 'packs')
    const stateBefore = rng.state

    next(rng)

    expect(rng.state).toBe(stateBefore)
  })

  it('advances, so consecutive draws differ', () => {
    const values = draw(streamFor('run-a', 'packs'), 20)

    expect(new Set(values).size).toBeGreaterThan(15)
  })
})

describe('nextWeighted', () => {
  it('never returns a zero-weight entry', () => {
    let rng = streamFor('run-a', 'packs')
    for (let i = 0; i < 300; i += 1) {
      const [picked, advanced] = nextWeighted(rng, [
        ['yes', 1],
        ['never', 0],
      ] as const)
      expect(picked).toBe('yes')
      rng = advanced
    }
  })

  it('favours the heavier entry in rough proportion', () => {
    let rng = streamFor('run-a', 'packs')
    let heavy = 0
    const rounds = 4000

    for (let i = 0; i < rounds; i += 1) {
      const [picked, advanced] = nextWeighted(rng, [
        ['heavy', 9],
        ['light', 1],
      ] as const)
      if (picked === 'heavy') heavy += 1
      rng = advanced
    }

    // Expected 0.9. A wide band on purpose: this asserts the weighting works,
    // not that the generator has any particular statistical quality.
    expect(heavy / rounds).toBeGreaterThan(0.85)
    expect(heavy / rounds).toBeLessThan(0.95)
  })

  it('returns the only entry when there is one', () => {
    const [picked] = nextWeighted(streamFor('run-a', 'packs'), [['only', 3]] as const)

    expect(picked).toBe('only')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/rng.test.ts`
Expected: FAIL — `Failed to resolve import "./rng"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/rng.ts`:

```ts
/**
 * The run's seeded randomness.
 *
 * Runs are reproducible and shareable — same seed, same packs — so `Math.random`
 * is banned in this directory and every draw comes from here. ESLint enforces
 * that; this module is the reason it can.
 *
 * Two properties make the rest of the engine simple:
 *
 * **Immutable.** `next` returns the drawn value *and* an advanced generator,
 * leaving its argument untouched, so an `Rng` can live in `GameState` like any
 * other value and a refused command cannot half-advance it.
 *
 * **Named streams.** A stream is derived from the run seed hashed with a name,
 * so streams are independent by construction. Packs are the only consumer today.
 * When a second one arrives it takes its own name, and adding it cannot shift
 * what any existing seed deals to packs — which is the whole point of a seed
 * being worth sharing. See "PRNG streams" in the design doc.
 *
 * The algorithm is FNV-1a to hash the stream name and mulberry32 to generate.
 * Both are deliberately unremarkable: this deals cards, so what matters is that
 * it is deterministic, holds its whole state in one number, and needs no
 * dependency. Statistical quality beyond "the distribution looks flat" is not a
 * requirement, and nothing here should be mistaken for a claim of it.
 */

/** A generator's whole state. Serialisable, so it sits in `GameState` freely. */
export interface Rng {
  readonly state: number
}

/** FNV-1a. Turns a seed and stream name into a 32-bit starting state. */
function hash(text: string): number {
  let h = 2166136261 >>> 0

  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  return h >>> 0
}

/**
 * The generator this run draws from for `name`.
 *
 * `name` is a plain string rather than a union so tests can derive a second
 * stream to prove independence without a dead union member. The streams a run
 * actually carries are pinned by `GameState.rng`.
 */
export function streamFor(seed: string, name: string): Rng {
  return { state: hash(`${seed}:${name}`) }
}

/** A value in [0, 1), and the advanced generator. Never mutates its argument. */
export function next(rng: Rng): [number, Rng] {
  const state = (rng.state + 0x6d2b79f5) >>> 0

  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, { state }]
}

/**
 * One entry picked in proportion to its weight, and the advanced generator.
 *
 * Zero-weight entries can never be picked, which is what lets a caller build one
 * table for every pack type and zero out what a given pack excludes. `entries`
 * must be non-empty and hold at least one positive weight.
 */
export function nextWeighted<T>(
  rng: Rng,
  entries: readonly (readonly [T, number])[],
): [T, Rng] {
  let total = 0
  for (const [, weight] of entries) total += weight

  const [value, advanced] = next(rng)
  let target = value * total

  for (const [item, weight] of entries) {
    target -= weight
    if (target < 0) return [item, advanced]
  }

  // Floating-point drift only — the loop above consumes the whole total. Fall
  // back to the last positive-weight entry rather than returning a zero-weight
  // one, which would violate this function's one hard promise.
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry && entry[1] > 0) return [entry[0], advanced]
  }

  throw new Error('nextWeighted: no entry with a positive weight')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/rng.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Verify lint and types**

Run: `pnpm lint && pnpm typecheck`
Expected: both clean. (`Math.imul` is not `Math.random`, so the ESLint rule is satisfied.)

- [ ] **Step 6: Commit**

```bash
git add src/game/rng.ts src/game/rng.test.ts
git commit -m "Add the run's seeded PRNG with named streams"
```

---

### Task 2: Seed, generator and card counter on GameState

Adds the state fields with no consumer yet, so this task changes no behaviour and every existing test must still pass untouched.

**Files:**
- Modify: `src/game/types.ts` (the `GameState` interface)
- Modify: `src/game/state.ts`
- Modify: `src/game/index.ts`
- Modify: `src/state/simulation.ts`
- Modify: `src/state/simulation.test.ts`
- Test: `src/game/state.test.ts` (create)

**Interfaces:**
- Consumes: `Rng`, `streamFor` from Task 1.
- Produces: `GameState.seed: string`, `GameState.rng: { readonly packs: Rng }`, `GameState.nextCardId: number`; `createInitialState(seed?: string): GameState`; `DEV_SEED`; `simulation.reset(seed?: string)`.

- [ ] **Step 1: Write the failing test**

Create `src/game/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createInitialState } from './state'

describe('createInitialState', () => {
  it('carries the seed it was given', () => {
    expect(createInitialState('run-a').seed).toBe('run-a')
  })

  it('derives the packs stream from the seed, so two seeds differ', () => {
    expect(createInitialState('run-a').rng.packs).not.toEqual(
      createInitialState('run-b').rng.packs,
    )
  })

  it('is fully reproducible from a seed', () => {
    expect(createInitialState('run-a')).toEqual(createInitialState('run-a'))
  })

  it('defaults to a fixed seed, so a test that does not care gets determinism', () => {
    expect(createInitialState()).toEqual(createInitialState())
  })

  /**
   * Card ids come from their own counter, NOT from `nextEntityId`. Piece
   * handedness is derived from `nextEntityId`'s parity in tick.ts, so spending
   * that counter on cards would silently reverse Piece movement.
   */
  it('counts card ids separately from entity ids', () => {
    const state = createInitialState('run-a')

    expect(state.nextEntityId).toBe(1)
    expect(state.nextCardId).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/game/state.test.ts`
Expected: FAIL — `createInitialState` takes no argument, and `seed` / `rng` / `nextCardId` do not exist.

- [ ] **Step 3: Add the fields to `GameState`**

In `src/game/types.ts`, add an import at the top:

```ts
import type { Rng } from './rng'
```

Then inside the `GameState` interface, after `nextEntityId`, add:

```ts
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
```

Also add the warning to `nextEntityId`'s own doc comment, since that is where someone will look:

```ts
  /**
   * Monotonic counter so entity ids are deterministic, never random.
   *
   * Its **parity is load-bearing**: `tick.ts` reads it for a spawned Piece's
   * `handedness`. Do not spend it on anything that is not a Piece or a Tower —
   * Cards have `nextCardId` for this reason.
   */
  readonly nextEntityId: number
```

- [ ] **Step 4: Give `createInitialState` a seed**

Rewrite `src/game/state.ts`:

```ts
import { BOARD, CORE_MAX_HEALTH, CORE_SQUARE } from '../data/board'
import { STARTING_DECK } from '../data/deck'
import { streamFor } from './rng'
import type { GameState } from './types'

/**
 * The seed used when a caller does not supply one.
 *
 * Tests get determinism for free from this — `createInitialState()` with no
 * argument is the same run every time. Production must NOT rely on it:
 * `src/state/simulation.ts` mints a real seed per run, because a fixed default
 * there would deal every player the same cards forever.
 */
export const DEV_SEED = 'cards-v-chess'

export function createInitialState(seed: string = DEV_SEED): GameState {
  return {
    board: BOARD,
    core: { square: CORE_SQUARE, health: CORE_MAX_HEALTH, maxHealth: CORE_MAX_HEALTH },
    phase: 'gap',
    roundNumber: 1,
    autoStart: false,
    roundElapsedMs: 0,
    pieces: [],
    towers: [],
    leaks: 0,
    ink: 0,
    pendingSpawns: [],
    nextEntityId: 1,
    seed,
    rng: { packs: streamFor(seed, 'packs') },
    nextCardId: 1,
    deck: STARTING_DECK,
  }
}
```

- [ ] **Step 5: Export the new surface**

In `src/game/index.ts`, change the `state` export line and add the rng types:

```ts
export { createInitialState, DEV_SEED } from './state'
export type { Rng } from './rng'
```

- [ ] **Step 6: Mint a real seed in the simulation**

In `src/state/simulation.ts`, replace the `let current = createInitialState()` line and the `reset` function.

Add below the `MAX_CATCHUP_STEPS` constant:

```ts
/**
 * A fresh run seed.
 *
 * `Math.random` is legal here and banned in `src/game/` — that boundary is the
 * whole reason the engine takes a seed rather than minting one. Base 36 keeps it
 * short enough to read aloud, for when a seed becomes shareable.
 */
function newSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}
```

Change the state initialiser:

```ts
let current = createInitialState(newSeed())
```

And `reset`:

```ts
/**
 * Starts a fresh run.
 *
 * Takes an optional seed so tests can pin the run they are exercising — without
 * one, a fresh seed means a fresh pack, and a test asserting anything about the
 * opening Deck would be flaky.
 */
export function reset(seed: string = newSeed()): void {
  current = createInitialState(seed)
  accumulatorMs = 0
  emit()
}
```

- [ ] **Step 7: Pin the simulation tests to a seed**

In `src/state/simulation.test.ts`, change the `beforeEach`:

```ts
const TEST_SEED = 'simulation-test'

beforeEach(() => {
  reset(TEST_SEED)
})
```

Also update `buildableCardId`'s doc comment, whose "starting Deck" wording is about to stop being true:

```ts
/**
 * A Card in the live Deck that will build a Tower.
 *
 * Found in state rather than hardcoded, so what the run opens with does not
 * break a test that is about dispatch rather than about deck contents. The run
 * is seeded from `TEST_SEED`, so what it finds is deterministic.
 */
```

- [ ] **Step 8: Run the whole suite**

Run: `pnpm test:run`
Expected: PASS. Every pre-existing test is unchanged in behaviour — `createInitialState()` still returns `STARTING_DECK`, and the new fields have no consumer.

- [ ] **Step 9: Verify lint, types and coverage**

Run: `pnpm lint && pnpm typecheck && pnpm test:coverage`
Expected: all clean, thresholds met.

- [ ] **Step 10: Commit**

```bash
git add src/game/types.ts src/game/state.ts src/game/state.test.ts src/game/index.ts src/state/simulation.ts src/state/simulation.test.ts
git commit -m "Carry a run seed, its PRNG streams, and a Card id counter

Card ids get their own counter rather than sharing nextEntityId:
tick.ts derives a spawned Piece's handedness from that counter's
parity, so spending 10 of it on an opening pack would silently
reverse Piece movement for the whole run."
```

---

### Task 3: Pack tables

Data only — sizes, placeholder prices, rarity tiers, placeholder weights.

**Files:**
- Create: `src/data/packs.ts`
- Modify: `src/data/cards.ts` (add `ALL_CARD_RANKS`)
- Test: `src/data/packs.test.ts` (create)

**Interfaces:**
- Consumes: `CardRank` from `src/game/types`.
- Produces: `type PackType = 'scrap' | 'base' | 'court' | 'suited'`; `type RarityTier = 'common' | 'scarce' | 'rarest'`; `PACKS: Record<PackType, PackDef>` where `PackDef = { label: string; size: number; price: number; suited: boolean; tierBoost: Record<RarityTier, number> }`; `PACK_TYPES: readonly PackType[]`; `TIER_WEIGHTS: Record<RarityTier, number>`; `tierOf(rank: CardRank | 'joker'): RarityTier`; `ALL_CARD_RANKS: readonly CardRank[]`.

- [ ] **Step 1: Write the failing test**

Create `src/data/packs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ALL_CARD_RANKS } from './cards'
import { PACK_TYPES, PACKS, TIER_WEIGHTS, tierOf } from './packs'

describe('ALL_CARD_RANKS', () => {
  it('holds all thirteen ranks a Card can carry', () => {
    expect(ALL_CARD_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'])
  })
})

describe('tierOf', () => {
  // 2-10 are FLAT. The rank ladder already differentiates those nine by
  // geometry, range and damage, so pricing them by scarcity too would
  // double-count. See the design doc's rarity table.
  it('puts every buildable rank in the common tier', () => {
    for (const rank of [2, 3, 4, 5, 6, 7, 8, 9, 10] as const) {
      expect(tierOf(rank)).toBe('common')
    }
  })

  it('puts the Jack, Queen, King and Joker in the scarce tier', () => {
    expect(tierOf('J')).toBe('scarce')
    expect(tierOf('Q')).toBe('scarce')
    expect(tierOf('K')).toBe('scarce')
    expect(tierOf('joker')).toBe('scarce')
  })

  // Alone, because caps on board growth were deliberately deferred, which
  // leaves scarcity the only thing restraining an Ace.
  it('puts the Ace alone in the rarest tier', () => {
    expect(tierOf('A')).toBe('rarest')
  })
})

describe('TIER_WEIGHTS', () => {
  it('orders the tiers common > scarce > rarest', () => {
    expect(TIER_WEIGHTS.common).toBeGreaterThan(TIER_WEIGHTS.scarce)
    expect(TIER_WEIGHTS.scarce).toBeGreaterThan(TIER_WEIGHTS.rarest)
  })
})

describe('PACKS', () => {
  it('covers every pack type exactly once', () => {
    expect(PACK_TYPES).toEqual(['scrap', 'base', 'court', 'suited'])
    expect(Object.keys(PACKS).sort()).toEqual([...PACK_TYPES].sort())
  })

  it('sizes the packs as the design specifies', () => {
    expect(PACKS.scrap.size).toBe(3)
    expect(PACKS.base.size).toBe(10)
    expect(PACKS.court.size).toBe(10)
    expect(PACKS.suited.size).toBe(10)
  })

  it('prices Scrap cheapest and Court dearest', () => {
    expect(PACKS.scrap.price).toBeLessThan(PACKS.base.price)
    expect(PACKS.base.price).toBeLessThan(PACKS.suited.price)
    expect(PACKS.suited.price).toBeLessThan(PACKS.court.price)
  })

  it('marks only Suited as needing a suit', () => {
    expect(PACKS.suited.suited).toBe(true)
    expect(PACKS.scrap.suited).toBe(false)
    expect(PACKS.base.suited).toBe(false)
    expect(PACKS.court.suited).toBe(false)
  })

  it('is the only pack that boosts the scarce tier: Court', () => {
    expect(PACKS.court.tierBoost.scarce).toBeGreaterThan(1)

    for (const pack of ['scrap', 'base', 'suited'] as const) {
      expect(PACKS[pack].tierBoost.scarce).toBe(1)
    }
  })

  // Court is "weighted toward high ranks", which must not become "better Ace
  // odds" — Ace scarcity is the only restraint on board growth.
  it('never boosts the Ace, in any pack', () => {
    for (const pack of PACK_TYPES) {
      expect(PACKS[pack].tierBoost.rarest).toBe(1)
    }
  })

  it('never deals a pack larger than the Deck cap', () => {
    for (const pack of PACK_TYPES) {
      expect(PACKS[pack].size).toBeLessThanOrEqual(30)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/data/packs.test.ts`
Expected: FAIL — `Failed to resolve import "./packs"`.

- [ ] **Step 3: Add `ALL_CARD_RANKS`**

In `src/data/cards.ts`, after the `SUITS` export:

```ts
/**
 * Every rank a Card can carry, in ladder order.
 *
 * The nine buildable ranks then the four that act. `BUILDABLE_RANKS` in
 * `towerRanks.ts` is the 2-10 subset — this is the whole set, which is what a
 * pack draws from.
 */
export const ALL_CARD_RANKS: readonly CardRank[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A',
]
```

- [ ] **Step 4: Write the pack tables**

Create `src/data/packs.ts`:

```ts
import type { CardRank } from '../game/types'

/**
 * Pack balance.
 *
 * **Every price and weight here is a PLACEHOLDER**, in exactly the sense
 * `src/data/ink.ts` means it. Ink's worth is set by what it buys and packs are
 * what buy it, so prices and Ink income have to be tuned against each other in
 * one pass — see "Pack weighting and prices" and "Ink income values" in the
 * design doc's open questions. Both remain open. Numbers exist here because a
 * purchase cannot happen without them, not because they are right.
 *
 * The **sizes** are not placeholders. They come from the design doc's pack table
 * and the cull arithmetic depends on them.
 */

export type PackType = 'scrap' | 'base' | 'court' | 'suited'

/** Display order, and the only list of pack types anything should iterate. */
export const PACK_TYPES: readonly PackType[] = ['scrap', 'base', 'court', 'suited']

/**
 * Rarity is rank, in three tiers.
 *
 * `common` is FLAT across 2-10: a 10 is no scarcer than a 2. The rank ladder
 * already separates those nine cards by geometry, range and damage, so charging
 * scarcity for them as well would double-count the same difference.
 */
export type RarityTier = 'common' | 'scarce' | 'rarest'

/** PLACEHOLDER. The pull weight of one card in each tier. */
export const TIER_WEIGHTS: Record<RarityTier, number> = {
  common: 12,
  scarce: 3,
  rarest: 1,
}

/**
 * Which tier a rank sits in.
 *
 * The Ace is alone in `rarest` because caps on the King and Ace hazards were
 * deliberately deferred, which leaves scarcity as the only restraint on board
 * growth.
 *
 * The Joker sits with the face cards rather than below them. It is the only
 * answer to a repair-versus-the-wall stall, and making the escape hatch the
 * hardest card in the game to obtain would be a trap.
 */
export function tierOf(rank: CardRank | 'joker'): RarityTier {
  if (rank === 'A') return 'rarest'
  if (rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'joker') return 'scarce'

  return 'common'
}

export interface PackDef {
  readonly label: string
  /** How many cards it deals. Not a placeholder — the cull maths reads it. */
  readonly size: number
  /** PLACEHOLDER price, in Ink. */
  readonly price: number
  /** Whether it deals a single suit of the player's choosing. */
  readonly suited: boolean
  /**
   * Multipliers on `TIER_WEIGHTS`, per tier. 1 leaves the base table alone.
   *
   * `rarest` is 1 in every pack, on purpose. Court is "weighted toward high
   * ranks", and it must not become "buy this for better Ace odds" — see
   * `tierOf` for why Ace scarcity is load-bearing rather than cosmetic.
   */
  readonly tierBoost: Record<RarityTier, number>
}

const FLAT: Record<RarityTier, number> = { common: 1, scarce: 1, rarest: 1 }

export const PACKS: Record<PackType, PackDef> = {
  scrap: {
    label: 'Scrap',
    size: 3,
    price: 15,
    suited: false,
    tierBoost: FLAT,
  },
  base: {
    label: 'Base',
    size: 10,
    price: 40,
    suited: false,
    tierBoost: FLAT,
  },
  court: {
    label: 'Court',
    size: 10,
    price: 85,
    suited: false,
    // Shifts mass into the scarce tier — it does not exclude 2-10, so a Court
    // is better odds and never a guarantee.
    tierBoost: { common: 1, scarce: 5, rarest: 1 },
  },
  suited: {
    label: 'Suited',
    size: 10,
    price: 60,
    // The only pack that lets a player commit to a strategy rather than simply
    // get better numbers.
    suited: true,
    tierBoost: FLAT,
  },
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:run src/data/packs.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Verify lint and types**

Run: `pnpm lint && pnpm typecheck`
Expected: clean. `src/data/` may not import React or Three.js — it imports only a type from `../game/types`, which is allowed and already the pattern in `src/data/cards.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/data/packs.ts src/data/packs.test.ts src/data/cards.ts
git commit -m "Add the pack tables and the three rarity tiers

Sizes come from the design doc. Prices and weights are placeholders,
labelled as such: they cannot be tuned apart from Ink income, and that
joint pass is still open."
```

---

### Task 4: Pure dealing and the cull rule

**Files:**
- Create: `src/game/packs.ts`
- Test: `src/game/packs.test.ts` (create)

**Interfaces:**
- Consumes: `Rng`, `nextWeighted` (Task 1); `PACKS`, `TIER_WEIGHTS`, `tierOf`, `PackType`, `RarityTier` (Task 3); `ALL_CARD_RANKS`, `SUITS`; `DECK_CAP`.
- Produces: `interface PackDeal { cards: readonly Card[]; rng: Rng; nextCardId: number }`; `dealPack(pack: PackType, suit: Suit | undefined, rng: Rng, nextCardId: number): PackDeal`; `cullCountFor(deckSize: number, pack: PackType): number`; `canAfford(ink: number, pack: PackType): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/game/packs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PACK_TYPES, PACKS } from '../data/packs'
import { canAfford, cullCountFor, dealPack } from './packs'
import { streamFor, type Rng } from './rng'

const RNG: Rng = streamFor('deal-test', 'packs')

/** Every card a run of `deals` packs of this type produces, ids and all. */
function dealMany(pack: Parameters<typeof dealPack>[0], deals: number, suit?: 'hearts') {
  let rng = RNG
  let nextCardId = 1
  const cards = []

  for (let i = 0; i < deals; i += 1) {
    const dealt = dealPack(pack, suit, rng, nextCardId)
    cards.push(...dealt.cards)
    rng = dealt.rng
    nextCardId = dealt.nextCardId
  }

  return cards
}

describe('dealPack', () => {
  it('deals exactly the pack size', () => {
    for (const pack of PACK_TYPES) {
      const suit = PACKS[pack].suited ? 'hearts' : undefined
      expect(dealPack(pack, suit, RNG, 1).cards).toHaveLength(PACKS[pack].size)
    }
  })

  it('is reproducible from the same generator', () => {
    expect(dealPack('base', undefined, RNG, 1).cards).toEqual(
      dealPack('base', undefined, RNG, 1).cards,
    )
  })

  it('advances the generator, so consecutive packs differ', () => {
    const first = dealPack('base', undefined, RNG, 1)
    const second = dealPack('base', undefined, first.rng, first.nextCardId)

    expect(second.cards.map((card) => card.kind === 'standard' && card.rank)).not.toEqual(
      first.cards.map((card) => card.kind === 'standard' && card.rank),
    )
  })

  it('does not mutate the generator it was given', () => {
    const stateBefore = RNG.state

    dealPack('base', undefined, RNG, 1)

    expect(RNG.state).toBe(stateBefore)
  })

  it('gives every card a unique id and reports the counter it consumed', () => {
    const dealt = dealPack('base', undefined, RNG, 7)

    expect(new Set(dealt.cards.map((card) => card.id)).size).toBe(10)
    expect(dealt.nextCardId).toBe(17)
  })

  it('numbers card ids from the counter it was given', () => {
    expect(dealPack('scrap', undefined, RNG, 7).cards.map((card) => card.id)).toEqual([
      'card-7',
      'card-8',
      'card-9',
    ])
  })

  describe('Suited', () => {
    it('deals every card in the chosen suit', () => {
      for (const card of dealPack('suited', 'spades', RNG, 1).cards) {
        expect(card.kind).toBe('standard')
        expect(card.kind === 'standard' && card.suit).toBe('spades')
      }
    })

    // A Joker has no suit, so it cannot be part of "10 cards all of one suit".
    it('never deals a Joker', () => {
      expect(dealMany('suited', 40, 'hearts').some((card) => card.kind === 'joker')).toBe(false)
    })
  })

  describe('weighting', () => {
    it('deals 2-10 flat, with no rank markedly scarcer than another', () => {
      const counts = new Map<number, number>()

      for (const card of dealMany('base', 400)) {
        if (card.kind !== 'standard' || typeof card.rank !== 'number') continue
        counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
      }

      const seen = [...counts.values()]
      expect(counts.size).toBe(9)
      // Ordering, not exact counts, so a weight tweak cannot break this.
      expect(Math.min(...seen) * 2).toBeGreaterThan(Math.max(...seen))
    })

    it('deals commons more often than scarce, and scarce more often than Aces', () => {
      let common = 0
      let scarce = 0
      let aces = 0

      for (const card of dealMany('base', 400)) {
        if (card.kind === 'joker') scarce += 1
        else if (card.rank === 'A') aces += 1
        else if (typeof card.rank === 'number') common += 1
        else scarce += 1
      }

      expect(common).toBeGreaterThan(scarce)
      expect(scarce).toBeGreaterThan(aces)
    })

    it('deals a Court more scarce-tier cards than a Base does', () => {
      const scarceIn = (cards: ReturnType<typeof dealMany>) =>
        cards.filter(
          (card) =>
            card.kind === 'joker' || (card.kind === 'standard' && typeof card.rank !== 'number' && card.rank !== 'A'),
        ).length

      expect(scarceIn(dealMany('court', 200))).toBeGreaterThan(scarceIn(dealMany('base', 200)))
    })

    it('still deals commons in a Court — better odds, never a guarantee', () => {
      const commons = dealMany('court', 200).filter(
        (card) => card.kind === 'standard' && typeof card.rank === 'number',
      )

      expect(commons.length).toBeGreaterThan(0)
    })

    it('does not improve Ace odds in a Court', () => {
      const aces = (cards: ReturnType<typeof dealMany>) =>
        cards.filter((card) => card.kind === 'standard' && card.rank === 'A').length

      // Same weight in both, so neither should run away from the other. A loose
      // band: this pins the intent, not the sample.
      const court = aces(dealMany('court', 300))
      const base = aces(dealMany('base', 300))

      expect(court).toBeLessThan(base * 2 + 10)
    })
  })
})

describe('cullCountFor', () => {
  it('is zero when the pack fits', () => {
    expect(cullCountFor(0, 'base')).toBe(0)
    expect(cullCountFor(20, 'base')).toBe(0)
  })

  it('is the overflow past the cap', () => {
    expect(cullCountFor(25, 'base')).toBe(5)
    expect(cullCountFor(29, 'scrap')).toBe(2)
  })

  // The most common cull case, and the one that broke structuralKey: at the cap
  // you destroy exactly as many cards as the pack deals, so the Deck's length
  // never moves.
  it('is the whole pack size at the cap', () => {
    expect(cullCountFor(30, 'base')).toBe(10)
    expect(cullCountFor(30, 'scrap')).toBe(3)
  })

  it('never demands more cards than the Deck holds', () => {
    for (const pack of PACK_TYPES) {
      for (let deckSize = 0; deckSize <= 30; deckSize += 1) {
        expect(cullCountFor(deckSize, pack)).toBeLessThanOrEqual(deckSize)
      }
    }
  })
})

describe('canAfford', () => {
  it('needs the full price', () => {
    expect(canAfford(PACKS.base.price - 1, 'base')).toBe(false)
    expect(canAfford(PACKS.base.price, 'base')).toBe(true)
    expect(canAfford(PACKS.base.price + 1, 'base')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/game/packs.test.ts`
Expected: FAIL — `Failed to resolve import "./packs"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/packs.ts`:

```ts
import { ALL_CARD_RANKS, SUITS } from '../data/cards'
import { DECK_CAP } from '../data/deck'
import { PACKS, TIER_WEIGHTS, tierOf, type PackType, type RarityTier } from '../data/packs'
import { nextWeighted, type Rng } from './rng'
import type { Card, CardRank, Suit } from './types'

/**
 * Dealing packs, and the rules that decide whether one can be bought.
 *
 * Pure and seeded: every card comes from a generator carried in `GameState`, so
 * the same seed deals the same run. No `Math.random` — see `src/game/rng.ts`.
 */

/**
 * What a draw can produce, before it is given an id.
 *
 * `null` is the Joker — it carries neither rank nor suit, so there is nothing to
 * describe. Deliberately not a `Card`: a Card needs an id, and inventing a
 * placeholder one here would put an invalid Card in a table.
 */
type Template = readonly [{ readonly rank: CardRank; readonly suit: Suit } | null, number]

/**
 * The weighted table a pack draws from, built once per deal.
 *
 * Every rank crossed with every suit the pack allows, plus a Joker.
 *
 * Copies are unlimited by design, so draws are with replacement: the table is
 * not consumed and a pack can legitimately deal three identical 5♦.
 */
function templatesFor(pack: PackType, suit: Suit | undefined): Template[] {
  const def = PACKS[pack]
  const suits: readonly Suit[] = def.suited && suit ? [suit] : SUITS
  const templates: Template[] = []

  for (const rank of ALL_CARD_RANKS) {
    for (const cardSuit of suits) {
      templates.push([{ rank, suit: cardSuit }, weightFor(tierOf(rank), def.tierBoost)])
    }
  }

  // A Joker has no suit, so it cannot appear in "10 cards all of one suit".
  if (!def.suited) {
    templates.push([null, weightFor(tierOf('joker'), def.tierBoost)])
  }

  return templates
}

function weightFor(tier: RarityTier, boost: Record<RarityTier, number>): number {
  return TIER_WEIGHTS[tier] * boost[tier]
}

function cardFrom(template: Template[0], id: string): Card {
  if (!template) return { id, kind: 'joker' }

  return { id, kind: 'standard', rank: template.rank, suit: template.suit }
}

export interface PackDeal {
  readonly cards: readonly Card[]
  /** The generator, advanced past every draw this deal made. */
  readonly rng: Rng
  /** The card counter, advanced past every id this deal issued. */
  readonly nextCardId: number
}

/**
 * The cards a pack deals.
 *
 * `suit` is required for a Suited pack and ignored by every other type. Card ids
 * come from `nextCardId` — never from `nextEntityId`, whose parity `tick.ts`
 * reads for Piece handedness.
 */
export function dealPack(
  pack: PackType,
  suit: Suit | undefined,
  rng: Rng,
  nextCardId: number,
): PackDeal {
  const templates = templatesFor(pack, suit)
  const cards: Card[] = []
  let current = rng
  let id = nextCardId

  for (let i = 0; i < PACKS[pack].size; i += 1) {
    const [template, advanced] = nextWeighted(current, templates)
    cards.push(cardFrom(template, `card-${id}`))
    current = advanced
    id += 1
  }

  return { cards, rng: current, nextCardId: id }
}

/**
 * How many cards must be destroyed for this pack to fit.
 *
 * The single source of this rule: `step` validates against it and the UI renders
 * from it, so neither re-derives it.
 *
 * Never exceeds the Deck's size, because no pack is larger than the cap.
 */
export function cullCountFor(deckSize: number, pack: PackType): number {
  return Math.max(0, deckSize + PACKS[pack].size - DECK_CAP)
}

export function canAfford(ink: number, pack: PackType): boolean {
  return ink >= PACKS[pack].price
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/game/packs.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Verify lint and types**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/packs.ts src/game/packs.test.ts
git commit -m "Deal packs from a seeded stream, and own the cull rule

cullCountFor is the one place the cap arithmetic lives, so step and the
UI cannot drift apart on it."
```

---

### Task 5: A run opens by dealing a Base pack

Deletes `STARTING_DECK`. This is the task most likely to surface an incidental dependency on the authored Deck, so run the whole suite, not just the new tests.

**Files:**
- Modify: `src/game/state.ts`
- Modify: `src/data/deck.ts`
- Modify: `src/data/deck.test.ts`
- Modify: `src/game/packs.test.ts` (add the opening-deal assertions)

**Interfaces:**
- Consumes: `dealPack` (Task 4); `DEV_SEED`, `createInitialState` (Task 2).
- Produces: `createInitialState(seed?)` now returns a 10-card Deck and `nextCardId: 11`. `STARTING_DECK` no longer exists.

- [ ] **Step 1: Write the failing test**

Append to `src/game/packs.test.ts`:

```ts
describe('the run opening', () => {
  it('opens with a Base pack', () => {
    expect(createInitialState('run-a').deck).toHaveLength(PACKS.base.size)
  })

  it('is free — Ink starts at zero and the opening deal does not charge', () => {
    expect(createInitialState('run-a').ink).toBe(0)
  })

  it('gives every opening card a unique id', () => {
    const deck = createInitialState('run-a').deck

    expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length)
  })

  it('advances the card counter past the opening deal', () => {
    expect(createInitialState('run-a').nextCardId).toBe(PACKS.base.size + 1)
  })

  // The counter Piece handedness is derived from must be untouched by the deal.
  it('leaves the entity counter at one', () => {
    expect(createInitialState('run-a').nextEntityId).toBe(1)
  })

  it('deals a different opening to a different seed', () => {
    expect(createInitialState('run-a').deck).not.toEqual(createInitialState('run-b').deck)
  })

  it('deals the same opening to the same seed', () => {
    expect(createInitialState('run-a').deck).toEqual(createInitialState('run-a').deck)
  })

  it('opens within the Deck cap', () => {
    expect(createInitialState('run-a').deck.length).toBeLessThanOrEqual(DECK_CAP)
  })

  it('leaves the packs stream advanced, so the first purchase is not the opening deal again', () => {
    const state = createInitialState('run-a')

    expect(state.rng.packs).not.toEqual(streamFor('run-a', 'packs'))
  })
})
```

Add to that file's imports:

```ts
import { DECK_CAP } from '../data/deck'
import { createInitialState } from './state'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/game/packs.test.ts`
Expected: FAIL — the opening Deck is the 28-card `STARTING_DECK`, so the length, counter and stream assertions all fail.

- [ ] **Step 3: Deal the opening pack**

Rewrite the body of `src/game/state.ts`:

```ts
import { BOARD, CORE_MAX_HEALTH, CORE_SQUARE } from '../data/board'
import { dealPack } from './packs'
import { streamFor } from './rng'
import type { GameState } from './types'

/**
 * The seed used when a caller does not supply one.
 *
 * Tests get determinism for free from this — `createInitialState()` with no
 * argument is the same run every time. Production must NOT rely on it:
 * `src/state/simulation.ts` mints a real seed per run, because a fixed default
 * there would deal every player the same cards forever.
 */
export const DEV_SEED = 'cards-v-chess'

/**
 * The pack a run opens with.
 *
 * There is no authored starting Deck: the opening position is whatever this
 * deals, and reading it is the first real decision of the run. It is free — Ink
 * starts at zero — and an empty Deck plus ten cards cannot breach the cap, so
 * the opening deal has no cull step.
 */
const OPENING_PACK = 'base'

export function createInitialState(seed: string = DEV_SEED): GameState {
  const opening = dealPack(OPENING_PACK, undefined, streamFor(seed, 'packs'), 1)

  return {
    board: BOARD,
    core: { square: CORE_SQUARE, health: CORE_MAX_HEALTH, maxHealth: CORE_MAX_HEALTH },
    phase: 'gap',
    roundNumber: 1,
    autoStart: false,
    roundElapsedMs: 0,
    pieces: [],
    towers: [],
    leaks: 0,
    ink: 0,
    pendingSpawns: [],
    nextEntityId: 1,
    seed,
    rng: { packs: opening.rng },
    nextCardId: opening.nextCardId,
    deck: opening.cards,
  }
}
```

- [ ] **Step 4: Delete `STARTING_DECK`**

In `src/data/deck.ts`, delete everything except the cap, leaving the file as:

```ts
/**
 * The Deck cap.
 *
 * Hard: acquiring cards beyond it forces culling, and that decision is the point
 * of the cap. `cullCountFor` in `src/game/packs.ts` owns the arithmetic.
 *
 * There is no authored starting Deck any more — a run opens by dealing a Base
 * pack, so the opening position is seeded rather than written down. See
 * `createInitialState` in `src/game/state.ts`.
 */
export const DECK_CAP = 30
```

- [ ] **Step 5: Rewrite `deck.test.ts`**

`src/data/deck.test.ts` also holds the `supportMagnitude` suite, which is unrelated to the authored Deck and must survive. Replace the file with:

```ts
import { describe, expect, it } from 'vitest'
import { DECK_CAP } from './deck'
import { supportMagnitude } from './cards'

describe('DECK_CAP', () => {
  it('is thirty', () => {
    expect(DECK_CAP).toBe(30)
  })
})

describe('supportMagnitude', () => {
  it('is the face value for numbered ranks', () => {
    expect(supportMagnitude(2)).toBe(2)
    expect(supportMagnitude(10)).toBe(10)
  })

  it('continues past 10 for the face ranks', () => {
    expect(supportMagnitude('J')).toBe(11)
    expect(supportMagnitude('Q')).toBe(12)
    expect(supportMagnitude('K')).toBe(13)
    expect(supportMagnitude('A')).toBe(14)
  })
})
```

The deleted assertions covered the authored list: unique ids, duplicates present, every buildable rank, all four suits, every face rank and a Joker. The ones that still mean something now apply to the **opening deal** and were added to `packs.test.ts` in Step 1 — unique ids and within-cap. The rest were properties of a hand-authored list and have no successor: a seeded Base pack does not promise every rank, and asserting it would be asserting a coincidence of `DEV_SEED`.

- [ ] **Step 6: Run the whole suite and fix what the deletion broke**

Run: `pnpm test:run`

Expected: PASS. If anything fails, it is a test that leaned on the authored Deck's contents. Two known-safe spots to check first:

- `src/state/simulation.test.ts`'s `buildableCardId()` finds a buildable Card in the live Deck. Task 2 pinned that file to `TEST_SEED`, so what it finds is deterministic — but if this throws, `TEST_SEED`'s Base pack genuinely dealt no buildable card. Change `TEST_SEED` to a value whose pack does, and note why in a comment.
- `src/game/fixtures.ts`'s `withTower` spreads `state.deck` before appending its seeded Card, so it now starts from ten cards instead of twenty-eight. Callers that then pass through `withDeck` replace the Deck wholesale and are unaffected.

- [ ] **Step 7: Verify lint, types and coverage**

Run: `pnpm lint && pnpm typecheck && pnpm test:coverage`
Expected: all clean, thresholds met.

- [ ] **Step 8: Commit**

```bash
git add src/game/state.ts src/game/packs.test.ts src/data/deck.ts src/data/deck.test.ts
git commit -m "Open a run by dealing a Base pack

Deletes STARTING_DECK, which deck.ts has anticipated since it was
written. Closes the design doc's 'which pack opens a run' as Base.

The cost is real: that authored list deliberately held every buildable
rank, all four suits, each face rank and both Jokers, which made manual
testing of unrelated features reliable. A seeded deal does not."
```

---

### Task 6: The `buyPack` command

**Files:**
- Modify: `src/game/types.ts` (the `Command` union)
- Modify: `src/game/packs.ts` (add `buyPack`)
- Modify: `src/game/step.ts`
- Modify: `src/game/index.ts`
- Test: `src/game/buyPack.test.ts` (create)
- Test: `src/game/roundTermination.test.ts` (add the gap-only test)

**Interfaces:**
- Consumes: `dealPack`, `cullCountFor`, `canAfford` (Task 4); `removeCard`, `findCard`.
- Produces: `Command` variant `{ kind: 'buyPack'; pack: PackType; suit?: Suit; cullCardIds: readonly string[] }`; `buyPack(state, pack, suit, cullCardIds): GameState`.

- [ ] **Step 1: Write the failing test**

Create `src/game/buyPack.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DECK_CAP } from '../data/deck'
import { PACKS } from '../data/packs'
import { standardCard, withDeck } from './fixtures'
import { createInitialState, step } from './index'
import type { Card, GameState } from './types'

/** State in the gap with this Deck and this much Ink. */
function ready(deck: readonly Card[], ink: number): GameState {
  return { ...withDeck(deck, createInitialState('buy-test')), ink }
}

/** A Deck of `size` distinct 2♥, so ids are unambiguous. */
function filler(size: number): Card[] {
  return Array.from({ length: size }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
}

const BASE_PRICE = PACKS.base.price

describe('buyPack: refusals', () => {
  it('is refused while a round is live', () => {
    const live: GameState = { ...ready(filler(5), 999), phase: 'inProgress' }

    expect(step(live, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(live)
  })

  it('is refused once defeated', () => {
    const defeated: GameState = { ...ready(filler(5), 999), phase: 'defeated' }

    expect(step(defeated, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(defeated)
  })

  it('is refused without enough Ink', () => {
    const poor = ready(filler(5), BASE_PRICE - 1)

    expect(step(poor, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(poor)
  })

  it('is refused when a Suited pack names no suit', () => {
    const state = ready(filler(5), 999)

    expect(step(state, { kind: 'buyPack', pack: 'suited', cullCardIds: [] })).toBe(state)
  })

  it('is refused when a non-Suited pack names a suit', () => {
    const state = ready(filler(5), 999)

    expect(step(state, { kind: 'buyPack', pack: 'base', suit: 'hearts', cullCardIds: [] })).toBe(
      state,
    )
  })

  it('is refused when a culled id is not in the Deck', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = [...filler(9).map((card) => card.id), 'ghost']

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  it('is refused when a culled id is listed twice', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = ['f0', 'f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  it('is refused when too few cards are culled', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = filler(9).map((card) => card.id)

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  // Over-culling would hand the player Deck thinning, which the design does not
  // grant: a Cull exists to stay within the cap and for nothing else.
  it('is refused when more cards are culled than the cap demands', () => {
    const state = ready(filler(DECK_CAP), 999)
    const ids = filler(11).map((card) => card.id)

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ids })).toBe(state)
  })

  it('is refused when cards are culled but none are needed', () => {
    const state = ready(filler(5), 999)

    expect(step(state, { kind: 'buyPack', pack: 'base', cullCardIds: ['f0'] })).toBe(state)
  })

  it('refuses by identity, so a refusal cannot be mistaken for a no-op purchase', () => {
    const state = ready(filler(5), 0)
    const after = step(state, { kind: 'buyPack', pack: 'base', cullCardIds: [] })

    // `simulation.dispatch` compares with ===. A shallow copy here would report
    // every refused purchase as a successful one.
    expect(after).toBe(state)
  })
})

describe('buyPack: a purchase that needs no cull', () => {
  const before = ready(filler(5), 100)
  const after = step(before, { kind: 'buyPack', pack: 'base', cullCardIds: [] })

  it('adds the pack to the Deck', () => {
    expect(after.deck).toHaveLength(5 + PACKS.base.size)
  })

  it('spends exactly the price', () => {
    expect(after.ink).toBe(100 - BASE_PRICE)
  })

  it('keeps every card already held', () => {
    for (const card of before.deck) {
      expect(after.deck.map((held) => held.id)).toContain(card.id)
    }
  })

  it('gives the new cards fresh ids', () => {
    expect(new Set(after.deck.map((card) => card.id)).size).toBe(after.deck.length)
  })

  it('advances the card counter, not the entity counter', () => {
    expect(after.nextCardId).toBe(before.nextCardId + PACKS.base.size)
    expect(after.nextEntityId).toBe(before.nextEntityId)
  })

  it('advances the packs stream, so the next pack differs', () => {
    expect(after.rng.packs).not.toEqual(before.rng.packs)

    const third = step({ ...after, ink: 100 }, { kind: 'buyPack', pack: 'base', cullCardIds: [] })
    const firstRanks = after.deck.slice(5).map((card) => card.kind === 'standard' && card.rank)
    const secondRanks = third.deck.slice(15).map((card) => card.kind === 'standard' && card.rank)

    expect(secondRanks).not.toEqual(firstRanks)
  })

  it('is reproducible — the same state buys the same pack', () => {
    expect(step(before, { kind: 'buyPack', pack: 'base', cullCardIds: [] }).deck).toEqual(
      after.deck,
    )
  })
})

describe('buyPack: a purchase that forces a cull', () => {
  it('destroys exactly the named cards and lands on the cap', () => {
    const before = ready(filler(DECK_CAP), 999)
    const doomed = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9']

    const after = step(before, { kind: 'buyPack', pack: 'base', cullCardIds: doomed })

    expect(after.deck).toHaveLength(DECK_CAP)
    for (const id of doomed) {
      expect(after.deck.map((card) => card.id)).not.toContain(id)
    }
  })

  it('never exceeds the cap', () => {
    const before = ready(filler(28), 999)
    const after = step(before, { kind: 'buyPack', pack: 'scrap', cullCardIds: ['f0'] })

    expect(after.deck.length).toBeLessThanOrEqual(DECK_CAP)
  })

  // The Deck is a multiset. Culling must remove the instance named, not every
  // card that happens to share a rank and suit.
  it('culls the instance named, leaving its duplicates', () => {
    const deck = [
      standardCard('keep-a', 5, 'diamonds'),
      standardCard('doomed', 5, 'diamonds'),
      standardCard('keep-b', 5, 'diamonds'),
      ...filler(27),
    ]
    const after = step({ ...ready(deck, 999) }, {
      kind: 'buyPack',
      pack: 'scrap',
      cullCardIds: ['doomed', 'f0', 'f1'],
    })

    expect(after.deck.map((card) => card.id)).toContain('keep-a')
    expect(after.deck.map((card) => card.id)).toContain('keep-b')
    expect(after.deck.map((card) => card.id)).not.toContain('doomed')
  })
})

describe('buyPack: Suited', () => {
  it('deals the chosen suit', () => {
    const before = ready([], 999)
    const after = step(before, { kind: 'buyPack', pack: 'suited', suit: 'clubs', cullCardIds: [] })

    expect(after.deck).toHaveLength(PACKS.suited.size)
    for (const card of after.deck) {
      expect(card.kind === 'standard' && card.suit).toBe('clubs')
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/game/buyPack.test.ts`
Expected: FAIL — `buyPack` is not a `Command` kind, so this does not even typecheck.

- [ ] **Step 3: Add the Command variant**

In `src/game/types.ts`, add to the `Command` union and import `PackType`:

```ts
import type { PackType } from '../data/packs'
```

```ts
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
```

- [ ] **Step 4: Write the resolution**

Append to `src/game/packs.ts`, and add `findCard, removeCard` plus `GameState` to its imports:

```ts
import { findCard, removeCard } from './cards'
import type { Card, GameState, Suit } from './types'
```

```ts
/**
 * Buy a pack: spend the Ink, destroy the culled cards, deal the new ones.
 *
 * One atomic step. Returns the **same object** on any refusal — never a copy —
 * because `simulation.dispatch` tells a refusal from a success by identity.
 */
export function buyPack(
  state: GameState,
  pack: PackType,
  suit: Suit | undefined,
  cullCardIds: readonly string[],
): GameState {
  // Gap only. This is what bounds a repair-versus-the-wall grind: the ♥ supply
  // cannot grow mid-round, so a repaired Tower still runs out of repairs and the
  // round still ends.
  if (state.phase !== 'gap') return state
  if (!canAfford(state.ink, pack)) return state

  // A Suited pack needs a suit; every other type must not carry one, so a
  // mistaken suit is refused rather than silently ignored.
  if (PACKS[pack].suited !== (suit !== undefined)) return state

  const unique = new Set(cullCardIds)
  if (unique.size !== cullCardIds.length) return state
  if (cullCardIds.length !== cullCountFor(state.deck.length, pack)) return state
  for (const cardId of cullCardIds) {
    if (!findCard(state.deck, cardId)) return state
  }

  let kept: readonly Card[] = state.deck
  for (const cardId of cullCardIds) kept = removeCard(kept, cardId)

  const dealt = dealPack(pack, suit, state.rng.packs, state.nextCardId)

  return {
    ...state,
    ink: state.ink - PACKS[pack].price,
    deck: [...kept, ...dealt.cards],
    rng: { ...state.rng, packs: dealt.rng },
    nextCardId: dealt.nextCardId,
  }
}
```

- [ ] **Step 5: Dispatch it**

In `src/game/step.ts`, add the import and the case:

```ts
import { buyPack } from './packs'
```

```ts
    case 'buyPack':
      return buyPack(state, command.pack, command.suit, command.cullCardIds)
```

Also extend `step`'s doc comment, which currently claims every command is valid in both phases:

```ts
 * Commands are valid both between rounds and mid-round — the player can build
 * during combat, Bloons-style. "Round in progress" is a flag on state, not a
 * separate code path, so there is nothing here that branches on game mode.
 *
 * `buyPack` is the one exception: it is refused while a round is live. That is
 * not a convenience — it is what keeps a repair-versus-the-wall grind bounded,
 * because the ♥ supply cannot grow mid-round. See `buyPack` in `./packs.ts`.
```

- [ ] **Step 6: Export the surface the UI needs**

In `src/game/index.ts`:

```ts
export { canAfford, cullCountFor, dealPack } from './packs'
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test:run src/game/buyPack.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 8: Pin the round-termination bound**

Append to `src/game/roundTermination.test.ts`:

```ts
describe('packs cannot lengthen the wall', () => {
  /**
   * The bound this whole file pins is "♥ runs out". Packs are the thing that
   * could remove it — a player with Ink could buy ♥ forever and hold a blocked
   * Piece against an unkillable Tower with no round end in sight.
   *
   * Gap-only purchasing is what prevents it. This test is the invariant; without
   * it, the rule is only a comment.
   */
  it('refuses a purchase while a round is live, so the ♥ supply is fixed for its duration', () => {
    const grinding: GameState = { ...grind(0), ink: 10_000 }

    expect(grinding.phase).toBe('inProgress')
    expect(step(grinding, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(grinding)
  })

  it('allows the same purchase in the gap', () => {
    const between: GameState = { ...grind(0), phase: 'gap', ink: 10_000 }

    expect(step(between, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).not.toBe(between)
  })
})
```

- [ ] **Step 9: Run the whole suite**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 10: Verify lint, types and coverage**

Run: `pnpm lint && pnpm typecheck && pnpm test:coverage`
Expected: all clean, `src/game/**` still at or above 85/85/85/90.

- [ ] **Step 11: Commit**

```bash
git add src/game/types.ts src/game/packs.ts src/game/step.ts src/game/index.ts src/game/buyPack.test.ts src/game/roundTermination.test.ts
git commit -m "Buy a pack with Ink, culling to the cap in the same step

Gap-only, and roundTermination.test.ts now pins that: the heart supply
cannot grow mid-round, so a repaired Tower still runs out of repairs and
the round still ends. The design doc has warned since it was written
that packs would remove that bound.

Over-culling is refused. Destroying more than the cap demands would be
Deck thinning, which the design does not grant."
```

---

### Task 7: Key the Deck on its card ids

**Files:**
- Modify: `src/state/structuralKey.ts`
- Modify: `src/state/structuralKey.test.ts`

**Interfaces:**
- Consumes: `buyPack` (Task 6).
- Produces: no signature change — `structuralKey(state)` keeps its shape.

- [ ] **Step 1: Write the failing test**

Append to `src/state/structuralKey.test.ts`:

```ts
describe('the Deck', () => {
  /**
   * `deck.length` used to be the whole Deck key, justified by "every card play
   * removes exactly one card". Packs falsify that: culling at the cap destroys
   * exactly as many cards as the pack deals, so the length does not move while
   * the contents change entirely.
   *
   * Keyed on length, the store would never publish and the new cards would be
   * invisible. This is the most common cull case, not an edge one.
   */
  it('changes when a cull-and-open of equal size replaces cards without moving the length', () => {
    const deck = Array.from({ length: DECK_CAP }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
    const before: GameState = { ...withDeck(deck, createInitialState('key-test')), ink: 999 }

    const after = step(before, {
      kind: 'buyPack',
      pack: 'scrap',
      cullCardIds: ['f0', 'f1', 'f2'],
    })

    expect(after.deck).toHaveLength(before.deck.length)
    expect(structuralKey(after)).not.toBe(structuralKey(before))
  })

  it('still changes when a card is played and nothing replaces it', () => {
    const before = withDeck([standardCard('five', 5, 'clubs')], createInitialState('key-test'))
    const after = step(before, { kind: 'buildTower', cardId: 'five', square: { file: 2, rank: 2 } })

    expect(structuralKey(after)).not.toBe(structuralKey(before))
  })

  it('is unchanged by a command that does not touch the Deck', () => {
    const before = createInitialState('key-test')
    const after = step(before, { kind: 'setAutoStart', enabled: true })

    expect(after.deck).toEqual(before.deck)
  })
})
```

Add whatever of these the file does not already import:

```ts
import { DECK_CAP } from '../data/deck'
import { standardCard, withDeck } from '../game/fixtures'
import { createInitialState, step } from '../game'
import type { GameState } from '../game'
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/state/structuralKey.test.ts`
Expected: FAIL on the first test — the key is identical, because 30 cards became 30 cards.

- [ ] **Step 3: Key on the ids**

In `src/state/structuralKey.ts`, replace the `state.deck.length` entry and its comment with:

```ts
    // The Deck's card ids, NOT its length.
    //
    // Length was faithful while every card play removed exactly one card. Packs
    // break that: culling at the cap destroys exactly as many cards as the pack
    // deals, so a purchase can replace ten cards without moving the length by
    // one — and keyed on length, the store would never publish and the new cards
    // would never reach React. That is what culling at the cap always looks
    // like, so it is the common case rather than an edge.
    //
    // Cheap enough to be uninteresting: thirty short ids, joined a couple of
    // dozen times a second, adding no publishes. Derived from the Deck rather
    // than tracked in a counter, so there is no bookkeeping to forget.
    state.deck.map((card) => card.id).join(','),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/state/structuralKey.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the publish rate did not regress**

Run: `pnpm test:run src/state/simulation.test.ts`
Expected: PASS — in particular the test bounding store publishes at 60 per 600 frames. A longer key string does not add publishes; if this fails, something else does.

- [ ] **Step 6: Verify lint, types and coverage**

Run: `pnpm lint && pnpm typecheck && pnpm test:coverage`
Expected: all clean, `src/state/**` still at or above 90/95/85/90.

- [ ] **Step 7: Commit**

```bash
git add src/state/structuralKey.ts src/state/structuralKey.test.ts
git commit -m "Key the Deck on its card ids, not its length

A cull-and-open at the cap replaces cards without changing how many
there are, so the length never moved, the store never published, and
the new cards stayed invisible. Pinned by a test so nobody optimises
the join back to a length."
```

---

### Task 8: The commit button's rules

Pure, so it is testable — `src/ui/` has no jsdom and a decision left in a `.tsx` cannot be tested at all.

**Files:**
- Create: `src/ui/packPurchase.ts`
- Test: `src/ui/packPurchase.test.ts`

**Interfaces:**
- Consumes: `canAfford`, `cullCountFor` from `src/game`; `PACKS`, `PackType` from `src/data/packs`.
- Produces: `interface CommitState { enabled: boolean; label: string; reason: string | null }`; `commitState(args: { deckSize: number; ink: number; pack: PackType | null; suit: Suit | null; markedIds: readonly string[] }): CommitState`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/packPurchase.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PACKS } from '../data/packs'
import { commitState } from './packPurchase'

const BASE = PACKS.base.price

describe('commitState', () => {
  it('asks for a pack when none is picked', () => {
    const state = commitState({ deckSize: 5, ink: 999, pack: null, suit: null, markedIds: [] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Pick a pack.')
  })

  it('names the shortfall when Ink is short', () => {
    const state = commitState({ deckSize: 5, ink: BASE - 10, pack: 'base', suit: null, markedIds: [] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe(`Base costs ${BASE} Ink — you have ${BASE - 10}.`)
  })

  it('asks for a suit on a Suited pack', () => {
    const state = commitState({ deckSize: 5, ink: 999, pack: 'suited', suit: null, markedIds: [] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Pick a suit.')
  })

  it('accepts a Suited pack once a suit is chosen', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      pack: 'suited',
      suit: 'hearts',
      markedIds: [],
    })

    expect(state.enabled).toBe(true)
  })

  it('asks for more marks when too few cards are marked', () => {
    const state = commitState({ deckSize: 30, ink: 999, pack: 'scrap', suit: null, markedIds: ['a'] })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Mark 2 more cards in the Deck to destroy.')
  })

  it('uses the singular for one remaining mark', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b'],
    })

    expect(state.reason).toBe('Mark 1 more card in the Deck to destroy.')
  })

  it('asks for fewer marks when too many are marked', () => {
    const state = commitState({
      deckSize: 30,
      ink: 999,
      pack: 'scrap',
      suit: null,
      markedIds: ['a', 'b', 'c', 'd'],
    })

    expect(state.enabled).toBe(false)
    expect(state.reason).toBe('Unmark 1 card — a Cull only makes room, it never thins the Deck.')
  })

  it('enables a purchase that needs no cull, and prices it in the label', () => {
    const state = commitState({ deckSize: 5, ink: 999, pack: 'base', suit: null, markedIds: [] })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe(`Open Base — ${BASE} Ink`)
    expect(state.reason).toBe(null)
  })

  it('says what it will destroy when a cull is required', () => {
    const marked = Array.from({ length: 10 }, (_, i) => `m${i}`)
    const state = commitState({ deckSize: 30, ink: 999, pack: 'base', suit: null, markedIds: marked })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe(`Destroy 10 & open Base — ${BASE} Ink`)
  })

  it('reports affordability before marks, so the player is not asked to cull for a pack they cannot buy', () => {
    const state = commitState({ deckSize: 30, ink: 0, pack: 'base', suit: null, markedIds: [] })

    expect(state.reason).toContain('Ink')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/ui/packPurchase.test.ts`
Expected: FAIL — `Failed to resolve import "./packPurchase"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/packPurchase.ts`:

```ts
import { PACKS, type PackType } from '../data/packs'
import { canAfford, cullCountFor, type Suit } from '../game'

/**
 * What the pack shop's commit button says and whether it can be pressed.
 *
 * Pure, and here rather than inside `PackShop.tsx`, because there is no jsdom in
 * this project and a decision left in a `.tsx` file cannot be tested at all.
 *
 * The **rules** are not duplicated here: how many cards a pack forces you to
 * destroy comes from `cullCountFor` in the engine, which `step` validates
 * against too. This module decides only how to say it.
 */
export interface CommitState {
  readonly enabled: boolean
  /** The button's text. Meaningful even when disabled. */
  readonly label: string
  /** Why it is disabled, or null when it is not. */
  readonly reason: string | null
}

export function commitState(args: {
  readonly deckSize: number
  readonly ink: number
  readonly pack: PackType | null
  readonly suit: Suit | null
  readonly markedIds: readonly string[]
}): CommitState {
  const { deckSize, ink, pack, suit, markedIds } = args

  if (!pack) return { enabled: false, label: 'Open pack', reason: 'Pick a pack.' }

  const def = PACKS[pack]
  const price = def.price
  const needed = cullCountFor(deckSize, pack)
  const label = needed > 0
    ? `Destroy ${needed} & open ${def.label} — ${price} Ink`
    : `Open ${def.label} — ${price} Ink`

  // Affordability is reported before the cull, so the player is never asked to
  // choose cards to destroy for a pack they cannot buy.
  if (!canAfford(ink, pack)) {
    return { enabled: false, label, reason: `${def.label} costs ${price} Ink — you have ${ink}.` }
  }

  if (def.suited && !suit) {
    return { enabled: false, label, reason: 'Pick a suit.' }
  }

  const short = needed - markedIds.length
  if (short > 0) {
    return {
      enabled: false,
      label,
      reason: `Mark ${short} more ${short === 1 ? 'card' : 'cards'} in the Deck to destroy.`,
    }
  }

  // Over-culling is refused by the engine too — a Cull exists to make room and
  // for nothing else, so the UI explains rather than silently trimming.
  if (short < 0) {
    const excess = -short
    return {
      enabled: false,
      label,
      reason: `Unmark ${excess} ${excess === 1 ? 'card' : 'cards'} — a Cull only makes room, it never thins the Deck.`,
    }
  }

  return { enabled: true, label, reason: null }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/ui/packPurchase.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Verify lint and types**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/packPurchase.ts src/ui/packPurchase.test.ts
git commit -m "Decide the pack shop's commit button outside the component

No jsdom here, so a decision left in a .tsx cannot be tested. The cull
rule itself stays in the engine — this only decides how to say it."
```

---

### Task 9: Extract the mini card face

Pure refactor: no behaviour change, so the whole suite must pass untouched.

**Files:**
- Create: `src/ui/CardFace.tsx`
- Modify: `src/ui/Deck.tsx`

**Interfaces:**
- Consumes: `Card` from `src/game`.
- Produces: `cardLabel(card: Card): string`; `<CardFace card modifier onClick />` rendering one `button.deck__card`.

- [ ] **Step 1: Create the shared face**

Create `src/ui/CardFace.tsx`:

```tsx
import type { Card } from '../game'

const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' } as const

/** A Card's corner index: its rank and suit, or `Joker`. */
export function cardLabel(card: Card): string {
  if (card.kind === 'joker') return 'Joker'

  return `${card.rank}${SUIT_GLYPH[card.suit]}`
}

/**
 * One miniature card face — the corner index, with the suit pip bled off the
 * bottom edge by CSS.
 *
 * Shared by the Deck and the pack shop so the game has exactly one card
 * renderer. `modifier` adds a BEM modifier for state the caller owns: which card
 * is selected in the Deck, which is marked for culling in the shop.
 */
export function CardFace({
  card,
  modifier,
  onClick,
  title,
}: {
  card: Card
  modifier?: string
  onClick?: () => void
  title?: string
}) {
  const suitClass = card.kind === 'standard' ? `deck__card--${card.suit}` : 'deck__card--joker'

  return (
    <button
      type="button"
      className={`deck__card ${suitClass}${modifier ? ` ${modifier}` : ''}`}
      onClick={onClick}
      title={title}
    >
      {cardLabel(card)}
    </button>
  )
}
```

- [ ] **Step 2: Use it in the Deck**

In `src/ui/Deck.tsx`: delete the local `SUIT_GLYPH` constant and the local `cardLabel` function, and import the component:

```tsx
import { CardFace } from './CardFace'
```

`cardLabel` alone is **not** imported — `CardFace` is now the only caller, and the rest of `Deck.tsx` never used it.

Replace the `<li>` body inside `deck__cards` with:

```tsx
          <li key={card.id}>
            <CardFace
              card={card}
              modifier={card.id === selectedCardId ? 'deck__card--active' : undefined}
              onClick={() => {
                // Clear any half-finished Echo so it cannot leak into the next play.
                setEchoSourceTowerId(null)
                // Each Card is picked fresh in rank mode. Carrying the previous
                // Card's mode across would leave a Joker stuck in a suit mode it
                // cannot offer, with no button to switch back.
                setPlayMode('build')
                setSelectedCardId(card.id === selectedCardId ? null : card.id)
              }}
            />
          </li>
```

- [ ] **Step 3: Verify nothing changed**

Run: `pnpm test:run && pnpm lint && pnpm typecheck && pnpm build`
Expected: all pass. This is a refactor — no test should change.

- [ ] **Step 4: Confirm the Deck still looks right**

Run: `pnpm dev`, open the app, and confirm the Deck still renders card faces with suit pips and that clicking one still selects it and shows its two play modes.

- [ ] **Step 5: Commit**

```bash
git add src/ui/CardFace.tsx src/ui/Deck.tsx
git commit -m "Extract the mini card face so the pack shop can reuse it"
```

---

### Task 10: The pack shop modal

**Files:**
- Modify: `src/state/uiStore.ts`
- Create: `src/ui/PackShop.tsx`
- Modify: `src/ui/Hud.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `commitState` (Task 8); `CardFace` (Task 9); `PACKS`, `PACK_TYPES` (Task 3); `cullCountFor` from `src/game`; `dispatch`, `useGameStore`.
- Produces: `uiStore.packShopOpen`, `setPackShopOpen`, `markedForCullIds`, `toggleMarkedForCull`, `clearMarkedForCull`; `<PackShop />`.

- [ ] **Step 1: Add the view state**

In `src/state/uiStore.ts`, add to the `UiStore` interface:

```ts
  /**
   * Whether the pack shop is open.
   *
   * Purely view state: the purchase is a single atomic command, so nothing
   * half-finished lives in `GameState` and closing the shop needs no rollback.
   */
  packShopOpen: boolean
  setPackShopOpen: (open: boolean) => void

  /**
   * Cards marked for destruction in the pack shop, by id.
   *
   * The cull is chosen before the pack opens, and no card is destroyed until the
   * `buyPack` command commits — so this is a pending intention, not state the
   * simulation knows about.
   */
  markedForCullIds: readonly string[]
  toggleMarkedForCull: (cardId: string) => void
  clearMarkedForCull: () => void
```

And to the store body:

```ts
  packShopOpen: false,
  setPackShopOpen: (packShopOpen) => set({ packShopOpen }),
  markedForCullIds: [],
  toggleMarkedForCull: (cardId) =>
    set((store) => ({
      markedForCullIds: store.markedForCullIds.includes(cardId)
        ? store.markedForCullIds.filter((id) => id !== cardId)
        : [...store.markedForCullIds, cardId],
    })),
  clearMarkedForCull: () => set({ markedForCullIds: [] }),
```

- [ ] **Step 2: Write the modal**

Create `src/ui/PackShop.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { SUITS } from '../data/cards'
import { PACK_TYPES, PACKS, type PackType } from '../data/packs'
import { cullCountFor, type Card, type Suit } from '../game'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { CardFace } from './CardFace'
import { commitState } from './packPurchase'

const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' } as const

/**
 * The pack shop: pick a pack, cull to the cap, open it.
 *
 * A modal because the three steps are one commitment — and because nothing is
 * spent until the single `buyPack` command commits, closing it at any point is
 * free and needs no rollback.
 *
 * Culling happens **before** the reveal, which is what keeps the purchase
 * atomic: `GameState` never holds a half-finished transaction, and the marked
 * cards live in `uiStore` until the command lands.
 */
export function PackShop() {
  const open = useUiStore((store) => store.packShopOpen)
  const setOpen = useUiStore((store) => store.setPackShopOpen)
  const marked = useUiStore((store) => store.markedForCullIds)
  const toggleMarked = useUiStore((store) => store.toggleMarkedForCull)
  const clearMarked = useUiStore((store) => store.clearMarkedForCull)

  const deck = useGameStore((store) => store.snapshot.deck)
  const ink = useGameStore((store) => store.snapshot.ink)

  const [pack, setPack] = useState<PackType | null>(null)
  const [suit, setSuit] = useState<Suit | null>(null)
  const [revealed, setRevealed] = useState<readonly Card[] | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setPack(null)
    setSuit(null)
    setRevealed(null)
    clearMarked()
  }, [setOpen, clearMarked])

  // Escape closes, like any modal. Bound only while open, so the handler is not
  // live for the whole session. `close` is memoised so this binds once per open
  // rather than on every render.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  function choose(next: PackType) {
    setPack(next)
    // A pack switch changes how many cards must go, so a stale selection sized
    // for the previous pack would silently be wrong.
    clearMarked()
    if (!PACKS[next].suited) setSuit(null)
  }

  function commit() {
    if (!pack) return

    const before = new Set(deck.map((card) => card.id))
    const accepted = dispatch({
      kind: 'buyPack',
      pack,
      ...(PACKS[pack].suited && suit ? { suit } : {}),
      cullCardIds: marked,
    })

    if (!accepted) return

    // The reveal needs nothing from GameState: what is new is whatever was not
    // in the Deck a moment ago.
    const after = useGameStore.getState().snapshot.deck
    setRevealed(after.filter((card) => !before.has(card.id)))
    clearMarked()
  }

  if (!open) return null

  const needed = pack ? cullCountFor(deck.length, pack) : 0
  const button = commitState({ deckSize: deck.length, ink, pack, suit, markedIds: marked })

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Buy a pack">
      <button type="button" className="modal__scrim" aria-label="Close" onClick={close} />

      <div className="modal__panel">
        {revealed ? (
          <>
            <div className="modal__head">
              <span className="hud__label">
                {revealed.length} new {revealed.length === 1 ? 'card' : 'cards'}
              </span>
              <span className="modal__ink">{ink} Ink</span>
            </div>

            <ul className="modal__reveal">
              {revealed.map((card) => (
                <li key={card.id}>
                  <CardFace card={card} modifier="deck__card--new" />
                </li>
              ))}
            </ul>

            <div className="modal__actions">
              <button type="button" className="hud__button" onClick={close}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal__head">
              <span className="hud__label">Buy a pack</span>
              <span className="modal__ink">{ink} Ink</span>
            </div>

            <ul className="modal__packs">
              {PACK_TYPES.map((type) => {
                const def = PACKS[type]

                return (
                  <li key={type}>
                    <button
                      type="button"
                      className={`modal__pack${pack === type ? ' modal__pack--active' : ''}${
                        ink < def.price ? ' modal__pack--poor' : ''
                      }`}
                      onClick={() => choose(type)}
                    >
                      <strong>{def.label}</strong>
                      <span className="hud__muted">{def.size} cards</span>
                      <span className="modal__ink">{def.price}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {pack && PACKS[pack].suited ? (
              <div className="modal__suits">
                <span className="hud__label">Suit</span>
                {SUITS.map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`modal__suit${suit === option ? ' modal__suit--active' : ''}`}
                    onClick={() => setSuit(option)}
                  >
                    {SUIT_GLYPH[option]}
                  </button>
                ))}
              </div>
            ) : null}

            {needed > 0 ? (
              <div className="modal__cull">
                <span className="hud__label">
                  Destroy {needed} of {deck.length} — marked {marked.length}
                </span>
                <ul className="deck__cards">
                  {deck.map((card) => (
                    <li key={card.id}>
                      <CardFace
                        card={card}
                        modifier={
                          marked.includes(card.id) ? 'deck__card--doomed' : undefined
                        }
                        onClick={() => toggleMarked(card.id)}
                        title="Mark to destroy"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {button.reason ? <p className="hud__hint">{button.reason}</p> : null}

            <div className="modal__actions">
              <button type="button" className="modal__cancel" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="hud__button"
                disabled={!button.enabled}
                onClick={commit}
              >
                {button.label}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the trigger to the HUD**

In `src/ui/Hud.tsx`, import the shop:

```tsx
import { PackShop } from './PackShop'
```

Inside `hud__actions`, after the start-round button and before the auto-start label, add:

```tsx
          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap'}
            onClick={() => useUiStore.getState().setPackShopOpen(true)}
          >
            Buy a pack
          </button>
```

And render the modal beside `TowerPanel`, at the end of the returned fragment:

```tsx
      <TowerPanel />
      <PackShop />
```

Finally, extend `handleReset` so a new run does not inherit the previous run's shop state:

```tsx
    useUiStore.getState().setPackShopOpen(false)
    useUiStore.getState().clearMarkedForCull()
```

- [ ] **Step 4: Style it**

Append to `src/index.css`:

```css
/* The pack shop.

   A modal because pick → cull → reveal is one commitment, and because nothing
   is spent until the single buyPack command lands, so dismissing it is free.

   `.hud` is pointer-events: none, and this sits inside it — so the scrim and
   panel must re-enable them, exactly as `.hud__panel` does. */
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

/* A button, not a div: dismissing by clicking away must be reachable from the
   keyboard and announced, and `aria-label` gives it a name. */
.modal__scrim {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  background: rgb(8 11 15 / 62%);
  cursor: pointer;
}

.modal__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  width: min(30rem, calc(100% - 2rem));
  max-height: calc(100% - 2rem);
  overflow-y: auto;
  padding: 1rem 1.15rem;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 0.6rem;
  background: rgb(16 20 26 / 98%);
  color: #e8edf4;
  box-shadow: 0 12px 40px rgb(0 0 0 / 55%);
}

.modal__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

/* Ink has a colour of its own here, so price reads as currency rather than as
   another number in the row. */
.modal__ink {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #c9a84c;
}

.modal__packs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: 0.4rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.modal__pack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0.4rem;
  background: #1c232d;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.modal__pack:hover {
  border-color: rgb(255 255 255 / 28%);
}

.modal__pack--active {
  border-color: #4fd1c5;
}

/* Dimmed, not disabled: the price is the information, so it must stay readable
   and selectable. The commit button is what refuses. */
.modal__pack--poor {
  opacity: 0.5;
}

.modal__suits {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.modal__suit {
  padding: 0.3rem 0.6rem;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 0.3rem;
  background: #232b36;
  color: #e8edf4;
  font: inherit;
  font-size: 1.1rem;
  cursor: pointer;
}

.modal__suit--active {
  border-color: #4fd1c5;
}

.modal__cull {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgb(255 255 255 / 10%);
}

.modal__reveal {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(2.4rem, 1fr));
  gap: 0.3rem;
  padding: 0.3rem 0.1rem 0.1rem;
  margin: 0;
  list-style: none;
}

.modal__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding-top: 0.6rem;
  border-top: 1px solid rgb(255 255 255 / 10%);
}

.modal__cancel {
  padding: 0.55rem 0.9rem;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 0.4rem;
  background: #2a323d;
  color: #b9c6d6;
  font: inherit;
  cursor: pointer;
}

/* Marked for destruction. Red because it is destructive and irreversible once
   the purchase commits. */
.deck__card--doomed {
  border-color: #e06c75;
  background: #38222a;
  color: #e06c75;
}

/* Just pulled. Teal, the same value selection uses elsewhere. */
.deck__card--new {
  border-color: #4fd1c5;
  background: #1d3a38;
  color: #4fd1c5;
}
```

- [ ] **Step 5: Verify tests, lint, types and build**

Run: `pnpm test:run && pnpm lint && pnpm typecheck && pnpm build`
Expected: all pass.

- [ ] **Step 6: Play it**

Run `pnpm dev` and walk the flow end to end:

1. `Buy a pack` is **disabled** while a round is in progress and enabled in the gap.
2. With too little Ink, the commit button is disabled and names the shortfall.
3. Win enough Ink (play a round), buy a Scrap, confirm three new cards appear in the reveal **and** in the Deck behind.
4. Pick Suited and confirm the suit picker appears and the commit stays disabled until a suit is chosen; buy it and confirm all ten cards share the suit.
5. **The case that motivated Task 7:** get the Deck to exactly 30, buy a Scrap, mark 3, commit — confirm the three new cards actually appear. Before Task 7 the Deck would not have updated at all.
6. Cancel and Escape both close with no Ink spent and no card destroyed.

- [ ] **Step 7: Commit**

```bash
git add src/ui/PackShop.tsx src/ui/Hud.tsx src/state/uiStore.ts src/index.css
git commit -m "Add the pack shop modal

Pick a pack, cull to the cap, open it — one framed commitment, and free
to abandon at any point because nothing is spent until buyPack lands.
The reveal diffs the Deck's ids rather than asking GameState to
remember what was just pulled."
```

---

### Task 11: Documentation

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-06-pack-purchasing-design.md`

- [ ] **Step 1: Get the real test count**

Run: `pnpm test:run`

Note the exact test and file counts from the output. CLAUDE.md warns that a stale figure has already leaked into a plan document once — read it, do not estimate it.

- [ ] **Step 2: Amend the spec's decision 2**

In `docs/superpowers/specs/2026-08-06-pack-purchasing-design.md`, replace the paragraph reading "New card ids come from `nextEntityId`, the counter Pieces and Towers already share, so ids are unique for the whole run and `reset()` rewinds them for free." with:

```markdown
New card ids come from `nextCardId`, a counter of their own.

**Amended during implementation.** This spec originally sourced them from
`nextEntityId`, the counter Pieces and Towers share. That is wrong:
`src/game/tick.ts` derives a spawned Piece's `handedness` from that counter's
parity, so spending ten of it on an opening pack would have flipped the movement
direction of every Piece for the rest of the run — a silent gameplay change
dressed as an id detail. `nextEntityId`'s doc comment now says so.
```

- [ ] **Step 3: Rewrite the rarity rule**

In `docs/design/game-design.md`, replace the line reading "**Rarity is rank.** Low numbers common, high numbers scarce, face cards and Aces precious. No separate rarity system is needed." with:

```markdown
**Rarity is rank, in three tiers.** No separate rarity system is needed.

| Tier | Cards |
| --- | --- |
| Common | 2–10, at **equal weight** — a 10 is no scarcer than a 2 |
| Scarce | J, Q, K, Joker |
| Rarest | A, alone |

2–10 are flat because the rank ladder already separates those nine cards by
geometry, range and damage; charging scarcity for them as well would
double-count the same difference. The Ace is alone in the rarest tier because
nothing else restrains board growth — see the King and Ace hazards under "The
card actions". The Joker sits with the face cards rather than below them: it is
the only answer to a repair-versus-the-wall stall, and making the escape hatch
the hardest card to obtain would be a trap.

**Court shifts mass into the scarce tier, and never improves Ace odds** — it is
better odds on face cards, not a way to buy board growth.
```

- [ ] **Step 4: Rewrite the repair-versus-the-wall entry**

In the same file's open-questions table, the "Repair versus the wall" row currently contains "**Adding packs removes the bound.**" Replace that sentence and the one before it with:

```markdown
**Packs have landed, and the bound survives — because packs are bought only in the gap.** The ♥ supply is fixed for a round's whole duration, so a repaired Tower still runs out of repairs, the Tower still falls, and the round still resumes. `src/game/roundTermination.test.ts` pins both halves: a purchase is refused mid-round and accepted in the gap. What would remove the bound is allowing mid-round purchase, so **that** is the change this question now gates.
```

Leave the rest of the row — the candidate answers and the note about ♥ restoring to full — untouched.

- [ ] **Step 5: Close two open questions and annotate two**

In the open-questions table:

- **Delete** the "Which pack opens a run" row. Add to the "Runs" section, beside "A run opens by opening a pack": `The pack is a **Base** — settled when packs were built.`
- **Delete** the "PRNG streams" row. In the "Seeds" section, after the sentence about a seeded PRNG in `GameState`, add: `Streams are **named**: one run seed hashed with a stream name derives an independent generator per purpose, so adding a second random consumer later cannot shift what an existing seed deals to packs. See `src/game/rng.ts`.`
- **Annotate** "Pack weighting and prices": append `Still open. Placeholder prices and tier weights now exist in `src/data/packs.ts`, labelled as placeholders — they exist because a purchase cannot happen without them, not because they are right. Pack **sizes** are settled and are not part of this question.`
- **Annotate** "Ink income values": append `Packs now price Ink, so this can finally be resolved — jointly with pack prices, as this row has always said.`

- [ ] **Step 6: Record that the King and Ace hazards are now reachable**

In the same file, the passage reading "Two hazards arrive with packs, because copies are unlimited by design. Neither is reachable while the Deck is a fixed authored list:" — replace that lead-in and the "Both will want a cap then." line after the two bullets with:

```markdown
Two hazards arrive with packs, because copies are unlimited by design. **Both are
now reachable** — packs are built and the Deck is no longer a fixed authored
list:
```

and, after the bullets:

```markdown
**Neither is capped, deliberately.** Scarcity is the whole mitigation: Kings sit
in the scarce tier and Aces alone in the rarest. A cap would set a number with no
play data behind it. The Ace is the more pressing of the two, because its hazard
is technical as well as balance — `src/scene/GameScene.tsx` casts shadows on
three.js's default frustum, already visibly wrong at 8×8 and worse with every
rank added.
```

- [ ] **Step 7: Update CLAUDE.md**

Three edits.

**In "Current state"**, replace the `Ink income` bullet's closing sentence — "**The numbers are placeholders** — Ink buys nothing yet, so nothing prices them." — with:

```markdown
**The numbers are still placeholders**, but packs now price them, so the joint tuning pass is finally possible — see the design doc's open questions.
```

Add a new bullet after it:

```markdown
- **Packs.** Four types — Scrap, Base, Court, Suited — bought with Ink **in the gap between rounds only**, culling to the 30-card cap first. A run opens by dealing a Base pack; there is no authored starting Deck. Runs are seeded, with named PRNG streams in `src/game/rng.ts`. Prices and rarity weights in `src/data/packs.ts` are placeholders; the sizes are not.
```

Then replace the whole "What does **not** exist yet" section, whose only entry is packs:

```markdown
What does **not** exist yet:

- **The pack-opening animation** (issue #10's stretch goal). The shop reveals a pack's contents as a grid, with no animation.
- **A visible or enterable seed.** Runs are seeded and reproducible, but the seed is internal — `src/state/simulation.ts` mints it and nothing shows it.
- **Caps on King and Ace accumulation.** Both hazards are now reachable and neither is capped; scarcity is the only mitigation.
```

**In "Invariants that constrain code"**, add:

```markdown
- **Packs are bought only in the gap between rounds, and that is what keeps round termination bounded.** A ♥-repaired Tower a Piece cannot break is a permanent wall, and a round cannot end while a Piece grinds it. What bounds it is that the ♥ supply is finite *within a round* — so `buyPack` is refused while a round is live. This is the one deliberate exception to "commands are valid both between rounds and mid-round". `src/game/roundTermination.test.ts` pins it; without that test the rule is only a comment.
- **`nextEntityId`'s parity is load-bearing.** `tick.ts` derives a spawned Piece's `handedness` from it, so consecutively spawned Pieces weave opposite ways. Never spend that counter on anything but a Piece or a Tower — Cards have `nextCardId`. Dealing a 10-card pack from `nextEntityId` would silently reverse Piece movement for a whole run.
```

**In "How the simulation reaches React"**, step 3 describes `structuralKey`. Append to it:

```markdown
   The Deck is keyed on its **card ids, not its length** — a cull-and-open at the cap replaces cards without changing how many there are, so a length key would never publish and the new cards would never reach React.
```

Finally, update the test count in the "Current state" bullet using the real figures from Step 1.

- [ ] **Step 8: Verify the docs are honest**

Run: `pnpm test:run && pnpm lint && pnpm typecheck && pnpm build`
Expected: all pass, and the test count in CLAUDE.md matches the output exactly.

Re-read the "Repair versus the wall" row and the new invariant together. They must agree: the bound survives *because* purchasing is gap-only, and mid-round purchase is what the open question now gates.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md docs/design/game-design.md docs/superpowers/specs/2026-08-06-pack-purchasing-design.md
git commit -m "Document packs, and fix two passages they falsified

The rarity rule said low numbers common and high numbers scarce; 2-10
now carry equal weight. The repair-versus-the-wall entry said adding
packs removes the round-termination bound; gap-only purchasing means it
does not, and a test pins that.

Closes 'which pack opens a run' as Base and 'PRNG streams' as named.
Records that the King and Ace hazards are now reachable and uncapped on
purpose, and amends the spec's card-id decision."
```

---

## Verification

After every task, before declaring the work done:

- [ ] `pnpm test:run` — all green
- [ ] `pnpm lint` — clean, including the renderer-boundary and `Math.random` rules on `src/game/` and `src/data/`
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test:coverage` — thresholds met (`src/game/**` 85/85/85/90, `src/state/**` 90/95/85/90)
- [ ] `pnpm build` — succeeds
- [ ] The manual walkthrough in Task 10 Step 6, in particular case 5 — the equal-size cull at the cap

## Known risks

Two things worth watching, neither a blocker:

**A seeded opening deal can be unhelpful.** The authored `STARTING_DECK` guaranteed every buildable rank, all four suits, each face rank and both Jokers, which is what made manual testing of unrelated features reliable. A Base pack promises none of that, and with 2–10 flat and dominant a Deck of ten commons in two suits is an ordinary outcome. Nothing here guarantees the opening deal contains a buildable card — the odds are tiny but not zero, and `src/state/simulation.test.ts` throws a clear error rather than failing obscurely if its seed produces one. Whether the opening pack should guarantee anything is a **design question this plan does not answer**; raise it rather than adding a guarantee.

**Coverage on `src/game/` will move.** Three new measured files land (`rng.ts`, `packs.ts`, and the growth in `state.ts`). The thresholds are a ratchet just under current coverage, so a thinly tested branch can fail the build. `nextWeighted`'s floating-point fallback and its `throw` are the least reachable lines in the new code — if coverage falls short, that is where to look first, and the honest fix is a test that exercises them rather than a lowered threshold.
