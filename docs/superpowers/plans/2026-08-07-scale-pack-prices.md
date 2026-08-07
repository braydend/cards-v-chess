# Scale Pack Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escalate pack prices — compounding 10% per purchase, per pack type — so packs stay meaningful as a run's income grows, and switch the free opening deal to a Scrap pack to push players into the store immediately.

**Architecture:** A single pure price function `packPrice(pack, count)` in `src/game/packs.ts` owns the escalation; the engine's `buyPack` charges it and a new `GameState.packPurchases` counter drives it; the shop reads the same function from the zustand snapshot so engine and UI can never disagree. The escalation replaces the design doc's "prices are fixed" rule (spec decision 2).

**Tech Stack:** TypeScript strict, Vitest, React Three Fiber UI in `src/ui/`, seeded PRNG (no `Math.random` in `src/game/`).

## Global Constraints

- New base prices: **scrap 50, base 100, suited 200, court 400** (spec decision 1).
- Escalation: compounding **1.10x per purchase, per pack type**, rounding **up** each step, **unbounded** (spec decision 2).
- Escalation math must be **exact integer arithmetic** — `next = floor((price × 11 + 9) / 10)` — **never** `Math.ceil(price * 1.1)`, which drifts on IEEE 754 (`50 × 1.1 === 55.00000000000001`). Spec decision 2 makes this load-bearing.
- `packPrice` lives once, in `src/game/packs.ts`; the shop and the engine both read it (spec decision 4).
- `GameState` gains `packPurchases: Record<PackType, number>`, zero-initialised per run (spec decision 3).
- The opening deal is a free **Scrap** pack, dealt directly by `createInitialState` — it never goes through `buyPack`, never escalates (spec decision 6).
- The shop shows each pack's **current** price and nothing else — no escalation hint, no next price (spec decision 7).
- **Ink income values are untouched** — prices only (spec decision, "Deferred").
- `Math.random` must never appear in `src/game/`.
- Every commit must leave `pnpm lint` and `pnpm typecheck` green (CI enforces both).

---

### Task 1: New base prices in `src/data/packs.ts`

**Files:**
- Modify: `src/data/packs.ts` (prices + header comment)
- Test: `src/data/packs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PACKS.scrap.price = 50`, `PACKS.base.price = 100`, `PACKS.court.price = 400`, `PACKS.suited.price = 200`. `PackType`, `PACK_TYPES`, `PACKS`, `TIER_WEIGHTS`, `tierOf`, `RarityTier` all unchanged.

- [ ] **Step 1: Write the failing test**

Add to the `PACKS` describe block in `src/data/packs.test.ts`:

```ts
  it('prices the packs at the resolved bases', () => {
    expect(PACKS.scrap.price).toBe(50)
    expect(PACKS.base.price).toBe(100)
    expect(PACKS.court.price).toBe(400)
    expect(PACKS.suited.price).toBe(200)
  })
```

The existing ordering test (`scrap < base < suited < court`) still passes unchanged; the new exact values are what this task pins.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- src/data/packs.test.ts`
Expected: FAIL — `expected 50, received 15` (or the first mismatch).

- [ ] **Step 3: Update the prices and the header comment**

In `src/data/packs.ts`, change the four prices:

```ts
export const PACKS: Record<PackType, PackDef> = {
  scrap: {
    label: 'Scrap',
    size: 3,
    price: 50,
    suited: false,
    tierBoost: FLAT,
  },
  base: {
    label: 'Base',
    size: 10,
    price: 100,
    suited: false,
    tierBoost: FLAT,
  },
  court: {
    label: 'Court',
    size: 10,
    price: 400,
    suited: false,
    // Shifts mass into the scarce tier — it does not exclude 2-10, so a Court
    // is better odds and never a guarantee.
    tierBoost: { common: 1, scarce: 5, rarest: 1 },
  },
  suited: {
    label: 'Suited',
    size: 10,
    price: 200,
    // The only pack that lets a player commit to a strategy rather than simply
    // get better numbers.
    suited: true,
    tierBoost: FLAT,
  },
}
```

Rewrite the module header comment (currently claims every price is a placeholder) to:

```ts
/**
 * Pack balance.
 *
 * The **prices are settled** — each value here is the BASE price, from which
 * the escalation in `src/game/packs.ts` starts: every purchase of a pack type
 * raises that type's price by 10%, compounding, for the rest of the run. See
 * `packPrice` in `src/game/packs.ts` and the design doc's "Ink and packs".
 *
 * The **tier weights are still PLACEHOLDER**, in exactly the sense
 * `src/data/ink.ts` means it. Ink's worth is set by what it buys and packs are
 * what buy it, so weights and Ink income have to be tuned against each other in
 * one pass — see "Pack weighting and prices" and "Ink income values" in the
 * design doc's open questions. Numbers exist here because a deal cannot happen
 * without them, not because they are right.
 *
 * The **sizes** are not placeholders. They come from the design doc's pack table
 * and the cull arithmetic depends on them.
 */
```

Update the `PackDef.price` field comment from `/** PLACEHOLDER price, in Ink. */` to `/** BASE price, in Ink — escalated per purchase by `packPrice`. */`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run -- src/data/packs.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full lint, typecheck, and test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: All green. Nothing else reads the prices yet, so the wider suite must be unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/data/packs.ts src/data/packs.test.ts
git commit -m "Set pack base prices to 50/100/200/400"
```

---

### Task 2: `packPrice` — the escalation function

**Files:**
- Modify: `src/game/packs.ts`
- Modify: `src/game/index.ts` (export)
- Test: `src/game/packs.test.ts`

**Interfaces:**
- Consumes: `PACKS` from `../data/packs`; `PackType` (already imported in `packs.ts`).
- Produces:
  ```ts
  packPrice(pack: PackType, count: number): number
  ```
  Returns the price of `pack` after `count` purchases of *that* type this run: base at count 0, then `floor((price × 11 + 9) / 10)` per purchase (exactly `ceil(price × 11 / 10)` in integer arithmetic). Exported from `src/game/index.ts` as `packPrice`.

- [ ] **Step 1: Write the failing tests**

Add a `describe('packPrice', ...)` block to `src/game/packs.test.ts`. The `import` at the top must gain `packPrice`:

```ts
import { canAfford, cullCountFor, dealPack, packPrice } from './packs'
```

The tests:

```ts
describe('packPrice', () => {
  it('is the base price before any purchase', () => {
    expect(packPrice('scrap', 0)).toBe(50)
    expect(packPrice('base', 0)).toBe(100)
    expect(packPrice('court', 0)).toBe(400)
    expect(packPrice('suited', 0)).toBe(200)
  })

  it('compounds 1.10x per purchase, rounding up each step', () => {
    // The issue's example: 50 → 55 → 61 → 68 → 75 → 83 → 92 → 102.
    expect(packPrice('scrap', 1)).toBe(55)
    expect(packPrice('scrap', 2)).toBe(61)
    expect(packPrice('scrap', 3)).toBe(68)
    expect(packPrice('scrap', 4)).toBe(75)
    expect(packPrice('scrap', 5)).toBe(83)
    expect(packPrice('scrap', 6)).toBe(92)
    expect(packPrice('scrap', 7)).toBe(102)
  })

  // 50 × 1.1 is 55.00000000000001 in IEEE 754, so Math.ceil(50 * 1.1) is 56 —
  // NOT the 55 the issue demands. The integer formula must give 55.
  it('rounds exactly, with no floating-point drift', () => {
    expect(packPrice('scrap', 1)).toBe(55)
  })

  it('escalates each type off its own base', () => {
    expect(packPrice('base', 1)).toBe(110)
    expect(packPrice('suited', 1)).toBe(220)
    expect(packPrice('court', 1)).toBe(440)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/game/packs.test.ts`
Expected: FAIL — `packPrice is not a function` / `cannot find name 'packPrice'`.

- [ ] **Step 3: Implement `packPrice`**

Add to `src/game/packs.ts`, above `canAfford`:

```ts
/**
 * What a pack of this type currently costs, after `count` purchases of that
 * type this run.
 *
 * Compounding 1.10x per purchase, rounded UP at every step: 50 → 55 → 61 → …
 * Each pack type escalates off its own count — buying Scraps never raises Base.
 * Unbounded: a type the player keeps buying eventually prices itself out of
 * reach, which is the intent.
 *
 * The multiply is integer arithmetic on purpose. `floor((price * 11 + 9) / 10)`
 * is exactly `ceil(price * 11 / 10)` for an integer price, while
 * `Math.ceil(price * 1.1)` drifts on IEEE 754 — 50 × 1.1 is 55.00000000000001,
 * so a floating ceil gives 56 instead of the 55 the issue's example demands,
 * and every later step compounds the drift.
 */
export function packPrice(pack: PackType, count: number): number {
  let price = PACKS[pack].price
  for (let i = 0; i < count; i += 1) {
    price = Math.floor((price * 11 + 9) / 10)
  }
  return price
}
```

- [ ] **Step 4: Export it from the public surface**

In `src/game/index.ts`, add `packPrice` to the existing `./packs` export:

```ts
export { canAfford, cullCountFor, packPrice } from './packs'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:run -- src/game/packs.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full lint, typecheck, and test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: All green. `packPrice` is additive — no existing caller changes.

- [ ] **Step 7: Commit**

```bash
git add src/game/packs.ts src/game/index.ts src/game/packs.test.ts
git commit -m "Add packPrice: compounding 10% escalation per pack type"
```

---

### Task 3: `packPurchases` state and the Scrap opening deal

**Files:**
- Modify: `src/game/types.ts` (GameState field)
- Modify: `src/game/state.ts` (initialise field, `OPENING_PACK` → `'scrap'`)
- Modify: `src/data/deck.ts` (comment)
- Test: `src/game/packs.test.ts` (opening tests)

**Interfaces:**
- Consumes: `PackType` (types.ts already imports it); `PACKS` for size assertions.
- Produces:
  - `GameState.packPurchases: Record<PackType, number>` — how many of each pack type have been bought this run. `createInitialState` returns `{ scrap: 0, base: 0, court: 0, suited: 0 }`.
  - `createInitialState()` now opens with a Scrap pack (3 cards), still free, still not through `buyPack`.

- [ ] **Step 1: Write the failing tests**

Update the `the run opening` describe block in `src/game/packs.test.ts`. Change the first test's title and body, change the card-counter test, and add two new tests:

```ts
  it('opens with a Scrap pack', () => {
    expect(createInitialState('run-a').deck).toHaveLength(PACKS.scrap.size)
  })

  it('counts no pack purchases yet, so the first bought pack costs its base', () => {
    expect(createInitialState('run-a').packPurchases).toEqual({
      scrap: 0,
      base: 0,
      court: 0,
      suited: 0,
    })
  })
```

(Keep `is free — Ink starts at zero` and the other opening tests as they are.) Update the card-counter test:

```ts
  it('advances the card counter past the opening deal', () => {
    expect(createInitialState('run-a').nextCardId).toBe(PACKS.scrap.size + 1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/game/packs.test.ts`
Expected: FAIL — opening is still 10 cards (`PACKS.base.size`), and `packPurchases` is `undefined`.

- [ ] **Step 3: Add the field to `GameState`**

In `src/game/types.ts`, add to the `GameState` interface, next to `ink`:

```ts
  /**
   * How many packs of each type have been bought this run.
   *
   * The price of a pack escalates with this — `packPrice(pack, count)` in
   * `src/game/packs.ts` — so it must live on the same object as the Ink it is
   * spent with. Per run: reset with the run, no persistence. The opening deal
   * is free and never goes through `buyPack`, so it never increments this.
   */
  readonly packPurchases: Record<PackType, number>
```

- [ ] **Step 4: Initialise it, and switch the opening to Scrap**

In `src/game/state.ts`:

```ts
const OPENING_PACK = 'scrap'
```

Add the field to the returned object (alphabetical/grouped with `ink`):

```ts
    ink: 0,
    packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
```

Update the `OPENING_PACK` doc comment to reflect the new deal:

```ts
/**
 * The pack a run opens with.
 *
 * There is no authored starting Deck: the opening position is whatever this
 * deals, and reading it is the first real decision of the run. It is a Scrap —
 * three cards, deliberately below the baseline — so a run points the player at
 * the store almost immediately. It is free — Ink starts at zero — and an empty
 * Deck plus three cards cannot breach the cap, so the opening deal has no cull
 * step and never touches `packPurchases`.
 */
const OPENING_PACK = 'scrap'
```

- [ ] **Step 5: Update the `deck.ts` comment**

In `src/data/deck.ts`, the header comment says "a run opens by dealing a Base pack". Change it to:

```ts
 * There is no authored starting Deck any more — a run opens by dealing a Scrap
 * pack, so the opening position is seeded rather than written down. See
 * `createInitialState` in `src/game/state.ts`.
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run -- src/game/packs.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full lint, typecheck, and test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: All green. `buyPack` still charges the static base (Task 4 wires escalation), so no purchase test changes yet. `src/game/fixtures.ts` spreads `createInitialState`, so every test state inherits the new field for free.

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/game/state.ts src/data/deck.ts src/game/packs.test.ts
git commit -m "Track pack purchases per run; open with a free Scrap pack"
```

---

### Task 4: `buyPack` charges the current price and bumps the counter

This task changes the `canAfford` signature, so the UI call sites (`packPurchase.ts`, `PackShop.tsx`) must move with it in the same commit or typecheck breaks.

**Files:**
- Modify: `src/game/packs.ts` (`canAfford`, `buyPack`)
- Modify: `src/ui/packPurchase.ts`
- Modify: `src/ui/PackShop.tsx`
- Test: `src/game/packs.test.ts` (canAfford)
- Test: `src/game/buyPack.test.ts`
- Test: `src/ui/packPurchase.test.ts`

**Interfaces:**
- Consumes: `packPrice` (Task 2), `GameState.packPurchases` (Task 3).
- Produces:
  - `canAfford(ink: number, pack: PackType, count: number): boolean` — `ink >= packPrice(pack, count)`.
  - `commitState` args gain `packPurchases: Record<PackType, number>`.
  - `buyPack` spends `packPrice(pack, state.packPurchases[pack])` and returns `packPurchases[pack] + 1` on success.

- [ ] **Step 1: Write the failing engine tests**

Update the `canAfford` describe in `src/game/packs.test.ts`:

```ts
describe('canAfford', () => {
  it('needs the current, possibly escalated price', () => {
    expect(canAfford(49, 'scrap', 0)).toBe(false)
    expect(canAfford(50, 'scrap', 0)).toBe(true)
    expect(canAfford(54, 'scrap', 1)).toBe(false)
    expect(canAfford(55, 'scrap', 1)).toBe(true)
  })
})
```

Add escalation tests to `src/game/buyPack.test.ts` (inside the `a purchase that needs no cull` describe, or as a new describe):

```ts
describe('buyPack: escalation', () => {
  it('charges the base price on the first purchase, then an escalated price', () => {
    const first = ready(filler(5), 999)
    const after = step(first, { kind: 'buyPack', pack: 'scrap', cullCardIds: [] })

    expect(after).not.toBe(first)
    expect(after.ink).toBe(999 - 50)
    expect(after.packPurchases.scrap).toBe(1)

    const second = step(after, { kind: 'buyPack', pack: 'scrap', cullCardIds: [] })

    expect(second).not.toBe(after)
    expect(second.ink).toBe(999 - 50 - 55)
    expect(second.packPurchases.scrap).toBe(2)
  })

  it('escalates each pack type independently', () => {
    const state = ready(filler(5), 999)
    const afterScrap = step(state, { kind: 'buyPack', pack: 'scrap', cullCardIds: [] })

    // Scrap bought once — a Base bought next costs its own base, not 55.
    expect(afterScrap.packPurchases.scrap).toBe(1)
    expect(afterScrap.packPurchases.base).toBe(0)

    const afterBase = step(afterScrap, { kind: 'buyPack', pack: 'base', cullCardIds: [] })

    expect(afterBase.packPurchases.base).toBe(1)
    expect(afterBase.ink).toBe(999 - 50 - 100)
  })

  it('refuses a second purchase it cannot afford at the escalated price', () => {
    const first = ready(filler(5), 50)
    const after = step(first, { kind: 'buyPack', pack: 'scrap', cullCardIds: [] })

    expect(after).not.toBe(first)
    expect(after.ink).toBe(0)
    // The second Scrap costs 55; only 0 held, so it is refused by identity.
    expect(step(after, { kind: 'buyPack', pack: 'scrap', cullCardIds: [] })).toBe(after)
  })
})
```

Fix the existing `advances the packs stream` test, which currently buys a second Base with `ink: 100` — that now costs 110 and would be refused, silently breaking the test's premise (it would pass vacuously on an empty slice). Give it enough Ink:

```ts
  it('advances the packs stream, so the next pack differs', () => {
    expect(after.rng.packs).not.toEqual(before.rng.packs)

    const third = step({ ...after, ink: 999 }, { kind: 'buyPack', pack: 'base', cullCardIds: [] })
    const firstRanks = after.deck.slice(5).map((card) => card.kind === 'standard' && card.rank)
    const secondRanks = third.deck.slice(15).map((card) => card.kind === 'standard' && card.rank)

    expect(secondRanks).not.toEqual(firstRanks)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/game/packs.test.ts src/game/buyPack.test.ts`
Expected: FAIL — `canAfford` still takes 2 args (the new call sites error at typecheck, and the tests call it with 3).

- [ ] **Step 3: Update `canAfford` and `buyPack` in `src/game/packs.ts`**

```ts
export function canAfford(ink: number, pack: PackType, count: number): boolean {
  return ink >= packPrice(pack, count)
}
```

`buyPack` (in the same file):

```ts
  if (state.phase !== 'gap') return state
  if (!canAfford(state.ink, pack, state.packPurchases[pack])) return state
```

and the return object:

```ts
  return {
    ...state,
    ink: state.ink - packPrice(pack, state.packPurchases[pack]),
    packPurchases: { ...state.packPurchases, [pack]: state.packPurchases[pack] + 1 },
    deck: [...kept, ...dealt.cards],
    rng: { ...state.rng, packs: dealt.rng },
    nextCardId: dealt.nextCardId,
  }
```

- [ ] **Step 4: Update `commitState` in `src/ui/packPurchase.ts`**

Add `packPurchases` to the args type and use it for both the label price and affordability:

```ts
export function commitState(args: {
  readonly deckSize: number
  readonly ink: number
  readonly phase: RoundPhase
  readonly pack: PackType | null
  readonly suit: Suit | null
  readonly markedIds: readonly string[]
  readonly packPurchases: Record<PackType, number>
}): CommitState {
```

Inside, replace the `def.price` read and the `canAfford` call:

```ts
  const def = PACKS[pack]
  const price = packPrice(pack, args.packPurchases[pack])
  const needed = cullCountFor(deckSize, pack)
```

and:

```ts
  if (!canAfford(ink, pack, args.packPurchases[pack])) {
```

Update the import line:

```ts
import { canAfford, cullCountFor, packPrice, type Card, type RoundPhase, type Suit } from '../game'
```

Note: the destructuring `const { deckSize, ink, phase, pack, suit, markedIds } = args` at the top of the function stays as is — `price` reads `args.packPurchases` directly above.

- [ ] **Step 5: Update `PackShop.tsx`**

Add `packPrice` to the game import:

```ts
import { canAfford, cullCountFor, packPrice, type Card, type Suit } from '../game'
```

Read the counter from the snapshot, next to `ink`:

```ts
  const packPurchases = useGameStore((store) => store.snapshot.packPurchases)
```

Pass it to `commitState`:

```ts
  const button = commitState({
    deckSize: deck.length,
    ink,
    phase,
    pack,
    suit,
    markedIds: marked,
    packPurchases,
  })
```

Use it for the list's price readout and affordability (lines 201-208):

```ts
                      className={`modal__pack${pack === type ? ' modal__pack--active' : ''}${
                        !canAfford(ink, type, packPurchases[type]) ? ' modal__pack--poor' : ''
                      }`}
```

and:

```ts
                      <span className="modal__ink">{packPrice(type, packPurchases[type])}</span>
```

- [ ] **Step 6: Update `src/ui/packPurchase.test.ts`**

Every `commitState({ ... })` call must now include `packPurchases`. Add `packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 }` to each of the fourteen calls. For example, the first becomes:

```ts
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: null,
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 0, base: 0, court: 0, suited: 0 },
    })
```

Add a test that the label prices an escalated pack:

```ts
  it('prices the label at the escalated price once a type has been bought', () => {
    const state = commitState({
      deckSize: 5,
      ink: 999,
      phase: 'gap',
      pack: 'scrap',
      suit: null,
      markedIds: [],
      packPurchases: { scrap: 2, base: 0, court: 0, suited: 0 },
    })

    expect(state.enabled).toBe(true)
    expect(state.label).toBe('Open Scrap — 61 Ink')
  })
```

(`61` is `packPrice('scrap', 2)` from Task 2's pinned sequence.)

- [ ] **Step 7: Run the full lint, typecheck, and test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: All green. `packPurchase.test.ts` passes with the count field everywhere; `PackShop.tsx` compiles against the new `canAfford`/`packPrice`.

- [ ] **Step 8: Commit**

```bash
git add src/game/packs.ts src/ui/packPurchase.ts src/ui/PackShop.tsx src/game/packs.test.ts src/game/buyPack.test.ts src/ui/packPurchase.test.ts
git commit -m "Charge the escalated pack price and count purchases"
```

---

### Task 5: `structuralKey` publishes pack purchases

**Files:**
- Modify: `src/state/structuralKey.ts`
- Modify: `src/state/structuralKey.test.ts`
- Test: `src/state/structuralKey.test.ts`

**Interfaces:**
- Consumes: `GameState.packPurchases` (Task 3); `PACK_TYPES` from `../data/packs`.
- Produces: `structuralKey(state)` now includes the purchase counts, so a price-only-visible change still publishes.

- [ ] **Step 1: Write the failing test**

Add to `src/state/structuralKey.test.ts`:

```ts
  it('changes when pack purchases move, since the shop prices from them', () => {
    const base = createInitialState('key-test')
    const purchased = { ...base, packPurchases: { ...base.packPurchases, scrap: 1 } }

    expect(structuralKey(purchased)).not.toBe(structuralKey(base))
  })
```

Also harden the existing `survives a real cull-and-open at the cap` test. Its whole point is "the Deck's *ids* drive the key, not its length", and it isolates the Deck by holding `ink` equal — but a purchase now also moves `packPurchases`, which would make the test pass even if the Deck were keyed by length again. Hold the counter equal too:

```ts
    // Holding ink and packPurchases equal leaves the Deck as the only term that
    // can move, so this is a genuine end-to-end pin rather than a restatement
    // of the fixture — keyed on length again, both keys would come out identical.
    expect(
      structuralKey({ ...after, ink: before.ink, packPurchases: before.packPurchases }),
    ).not.toBe(structuralKey(before))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- src/state/structuralKey.test.ts`
Expected: FAIL — `structuralKey` does not read `packPurchases`, so the two states key identically.

- [ ] **Step 3: Include the counts in the key**

In `src/state/structuralKey.ts`, add an import and a key term:

```ts
import { PACK_TYPES } from '../data/packs'
import type { GameState } from '../game'
```

In the returned array, next to `state.ink`:

```ts
    state.ink,
    // Pack purchases, because the shop prices from them. Rare-changing — a
    // purchase already moves ink and the Deck ids, so this adds no publishes;
    // keyed so a price change is never silently invisible.
    PACK_TYPES.map((pack) => state.packPurchases[pack]).join(','),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- src/state/structuralKey.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full lint, typecheck, and test suite**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: All green. `simulation.test.ts`'s 60-publish bound still holds — purchases were already publishing on ink + deck ids, so the new term adds no publishes.

- [ ] **Step 6: Commit**

```bash
git add src/state/structuralKey.ts src/state/structuralKey.test.ts
git commit -m "Key pack purchases so price changes reach React"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`

**Interfaces:** None — docs only.

- [ ] **Step 1: Rewrite the fixed-price rule in `docs/design/game-design.md`**

The current sentence at line 226:

> **Prices are fixed per pack type. Packs do not escalate in price.** Distinct types at distinct prices give a real decision ("save for a Court, or buy two Base now?") and self-balance, because the player sets their own rate.

Replace with:

> **Prices escalate per pack type.** Each type has a **base** price — Scrap 50, Base 100, Suited 200, Court 400 — and every purchase of a type raises *that* type's price by 10%, compounding and rounding up, for the rest of the run: Scrap goes 50 → 55 → 61 → 68 → …. The escalation is exact integer arithmetic (`next = ceil(price × 11 / 10)`), never a floating-point ceil. Distinct types at distinct bases still give a real decision ("save for a Court, or buy two Base now?"), and the escalation keeps a pack meaningful as income grows — early packs are cheap, later ones are a decision. The count lives on `GameState.packPurchases` and is reset with the run.

- [ ] **Step 2: Update the opening-deal sentence in `docs/design/game-design.md`**

At line 193, change:

> The pack is a **Base** — settled when packs were built.

to:

> The pack is a **Scrap** — three cards, deliberately below the baseline, so a run points the player at the store almost immediately. It is free, and it never counts as a purchase toward that type's escalation.

- [ ] **Step 3: Mark the pricing open question resolved**

In the open-questions table (line 389), update the "Pack weighting and prices" row:

> | **Pack weighting and prices** | **Prices are settled** — base prices and per-type escalation are in `src/data/packs.ts` and `src/game/packs.ts`, and the mechanics are recorded in `2026-08-07-scale-pack-prices-design.md`. The **weights** are still open; they are placeholders in `src/data/packs.ts` because a deal cannot happen without them. Pack **sizes** are settled and are not part of this question. |

And in the "Ink income values" row (line 390), note that prices have moved so the joint pass can now target income:

> Ink's worth is set by what it buys, and **pack prices now exist — see "Pack weighting and prices" above — so these can be resolved against them**. The *shapes* are settled and are not open — see "Ink and packs" above for the current three income paths, and [`2026-08-06-ink-income-design.md`](../superpowers/specs/2026-08-06-ink-income-design.md) for the reasoning behind them. One more thing to weigh whenever this pass happens: `tick.ts` feeds a freshly promoted Queen into the same tick's Tower fire, so a Pawn worth 1 Ink shot on the way in is worth 8 if left to reach the back rank and die as a Queen instead — withholding fire from an approaching Pawn is a legible, currently uncosted 8x income play. This can finally be resolved — jointly with pack prices, as this row has always said.

- [ ] **Step 4: Update `CLAUDE.md`**

In the "Current state" section, the Packs bullet (line 23). Change:

> **Packs.** Four types — Scrap, Base, Court, Suited — bought with Ink **in the gap between rounds only**, culling to the 30-card cap first. A run opens by dealing a Base pack; there is no authored starting Deck. Runs are seeded, with named PRNG streams in `src/game/rng.ts`. Prices and rarity weights in `src/data/packs.ts` are placeholders; the sizes are not.

to:

> **Packs.** Four types — Scrap, Base, Court, Suited — bought with Ink **in the gap between rounds only**, culling to the 30-card cap first. A run opens by dealing a free Scrap pack; there is no authored starting Deck. Prices **escalate** per pack type — each purchase of a type raises that type's price by 10%, compounding, via `packPrice` in `src/game/packs.ts`, tracked in `GameState.packPurchases` — so base prices in `src/data/packs.ts` are real, while the rarity weights there are still placeholders; the sizes are not. Runs are seeded, with named PRNG streams in `src/game/rng.ts`.

- [ ] **Step 5: Verify the docs read coherently**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: All green (docs don't affect tests; this guards against accidental edits elsewhere).

- [ ] **Step 6: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "Document escalating pack prices and the Scrap opening deal"
```

---

## Self-Review

**Spec coverage:**
- Decision 1 (base prices 50/100/200/400) → Task 1.
- Decision 2 (compounding 1.10x per type, round up, unbounded, exact integer math) → Task 2.
- Decision 3 (`packPurchases` on `GameState`, zero-init, per run, in structuralKey) → Tasks 3 and 5.
- Decision 4 (one `packPrice`, engine + UI read it) → Tasks 2 and 4.
- Decision 5 (`buyPack` charges current price, bumps counter) → Task 4.
- Decision 6 (opening deal → free Scrap, never escalates) → Task 3.
- Decision 7 (shop shows current price only) → Task 4 (no hint, no next-price added).
- "Deferred" (ink income untouched, no cap, no escalation hint) → respected throughout; Task 6 updates the open-question rows rather than resolving income.
- Spec's exact-integer rounding requirement → Task 2, pinned by the `no floating-point drift` test.

**Placeholder scan:** No TBD/TODO; every step has concrete code. The fourteen `commitState` test call sites in Task 4 Step 6 are described as a sweep because each is the same one-line addition — the surrounding context and first example pin the exact shape.

**Type consistency:** `canAfford(ink, pack, count)` — defined in Task 4 Step 3, consumed by `packPurchase.ts` Step 4, `PackShop.tsx` Step 5, and tests in Steps 1/6. `packPrice(pack, count)` — defined Task 2, exported in its Step 4, consumed Tasks 4 and 5. `packPurchases: Record<PackType, number>` — added to `GameState` Task 3, read by `buyPack` Task 4 and `structuralKey` Task 5. `OPENING_PACK = 'scrap'` Task 3. No drift between tasks.
