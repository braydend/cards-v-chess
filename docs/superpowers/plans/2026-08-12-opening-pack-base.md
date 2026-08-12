# Opening Pack Becomes Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A run opens with a Base pack (10 cards) instead of a Scrap pack (3 cards), free and non-escalating as before.

**Architecture:** One constant change in `createInitialState` (`OPENING_PACK` → `'base'`) plus the test assertions and doc comments that reference the Scrap opening. No logic changes — the deal is still free, still never counts toward that pack type's price escalation, and 10 cards is still under the 30-card cap so there is still no cull step.

**Tech Stack:** TypeScript, Vitest, pnpm. Verify with `pnpm test:run src/game/packs.test.ts`, `pnpm typecheck`, `pnpm lint`.

## Global Constraints

- `OPENING_PACK` must be a valid `PackType` from `src/data/packs.ts` (`'scrap' | 'base' | 'court' | 'suited'`).
- The opening deal stays free (`ink` starts at 0) and never increments `packPurchases` — do not route it through `buyPack`.
- 10 < `DECK_CAP` (30), so the opening still has no cull step — do not add one.
- `Math.random` must never appear in `src/game/`.
- Tests should assert against `PACKS.base.size` rather than a hardcoded `10`, so a pack-size retune does not break them.

---

### Task 1: Change the opening pack to Base

**Files:**
- Modify: `src/game/state.ts` (doc comment lines 16-25, `OPENING_PACK` line 26)
- Modify: `src/game/packs.test.ts` (lines 223-224, 246-247)
- Modify: `docs/design/game-design.md` (line 165)
- Modify: `src/data/deck.ts` (doc comment lines 7-9)

**Interfaces:**
- Consumes: `dealPack(pack, suit, rng, ...)` from `./packs`; `PACKS` from `../data/packs`.
- Produces: `createInitialState(seed?)` opening the Deck with a Base pack.

- [ ] **Step 1: Write the failing test**

In `src/game/packs.test.ts`, update the run-opening describe block:

```ts
describe('the run opening', () => {
  it('opens with a Base pack', () => {
    expect(createInitialState('run-a').deck).toHaveLength(PACKS.base.size)
  })
```

and

```ts
  it('advances the card counter past the opening deal', () => {
    expect(createInitialState('run-a').nextCardId).toBe(PACKS.base.size + 1)
  })
```

The remaining assertions in that block (free, unique ids, entity counter at 1, seed determinism, within cap, stream advanced) are unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/packs.test.ts`
Expected: FAIL — the opening still deals `PACKS.scrap.size` (3) cards, so `toHaveLength(PACKS.base.size)` (10) fails.

- [ ] **Step 3: Change `OPENING_PACK`**

In `src/game/state.ts`, update the doc comment and constant:

```ts
/**
 * The pack a run opens with.
 *
 * There is no authored starting Deck: the opening position is whatever this
 * deals, and reading it is the first real decision of the run. It is a Base —
 * ten cards, enough to form real hands immediately. It is free — Ink starts at
 * zero — and an empty Deck plus ten cards cannot breach the cap, so the opening
 * deal has no cull step and never touches `packPurchases`.
 */
const OPENING_PACK = 'base'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/game/packs.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the doc comments**

In `docs/design/game-design.md` line 165, change the sentence:

> The pack is a **Scrap** — three cards, deliberately below the baseline, so a run points the player at the store almost immediately.

to:

> The pack is a **Base** — ten cards, enough to form real hands immediately.

In `src/data/deck.ts` lines 7-9, change:

> There is no authored starting Deck any more — a run opens by dealing a Scrap pack, so the opening position is seeded rather than written down.

to:

> There is no authored starting Deck any more — a run opens by dealing a Base pack, so the opening position is seeded rather than written down.

- [ ] **Step 6: Full verification**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/game/state.ts src/game/packs.test.ts docs/design/game-design.md src/data/deck.ts
git commit -m "feat(game): runs open with a Base pack instead of Scrap"
```
