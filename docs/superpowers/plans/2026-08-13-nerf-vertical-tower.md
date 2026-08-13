# Vertical Tower Nerf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Weaken the vertical Tower by raising its fire interval from 500ms to 700ms, pinning the new value with a data-level test, and updating the two comments that cite the old interval.

**Architecture:** A one-line balance change in the tower type table, a new assertion in the existing tower-type data test, and two comment-only fixes. No engine logic changes.

**Tech Stack:** TypeScript, Vitest, pnpm.

## Global Constraints

- `src/data/` must never import React or Three.js (ESLint-enforced).
- `Math.random` must never appear in `src/game/` or `src/data/` (ESLint-enforced).
- The hand ladder stays in strict rarity order — this change does not reorder it.
- Balance numbers live in `src/data/` tables, never in logic.
- The vertical's fire interval must stay below the Pawn's 900ms move interval (existing invariant in `towerTypes.test.ts`).

---

### Task 1: Raise the vertical's fire interval and pin it

**Files:**
- Modify: `src/data/towerTypes.ts:44` (the `vertical` line)
- Test: `src/data/towerTypes.test.ts` (new `it` block)

**Interfaces:**
- Consumes: `towerType('vertical')` from `src/data/towerTypes.ts`
- Produces: `towerType('vertical').fireIntervalMs === 700`, the new authored value

- [ ] **Step 1: Change the authored interval**

In `src/data/towerTypes.ts`, on the `vertical` line, change `fireIntervalMs: 500` to `fireIntervalMs: 700`. The line becomes:

```ts
vertical: { geometry: 'vertical', range: 5, damage: 2, fireIntervalMs: 700, maxHealth: 14, targetsPerShot: 1 },
```

- [ ] **Step 2: Write the pinning test**

Add this `it` block inside the existing `describe('the tower type table', ...)` in `src/data/towerTypes.test.ts`, after the `'never fires slower than a Pawn moves...'` test:

```ts
it('gives the vertical a 700ms fire interval (issue #71 nerf)', () => {
  expect(towerType('vertical').fireIntervalMs).toBe(700)
})
```

- [ ] **Step 3: Run the tower-type tests**

Run: `pnpm test:run src/data/towerTypes.test.ts`
Expected: all pass, including the new assertion and the existing `'never fires slower than a Pawn moves...'` invariant (700 < 900).

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test:run`
Expected: all pass. Engine and scene tests read the interval from `towerType('vertical')`, so none hardcode 500.

- [ ] **Step 5: Commit**

```bash
git add src/data/towerTypes.ts src/data/towerTypes.test.ts
git commit -m "nerf: raise vertical tower fire interval 500->700ms (issue #71)"
```

---

### Task 2: Update the stale 500ms comments

**Files:**
- Modify: `src/game/coverage.test.ts:509` (comment only)
- Modify: `src/game/staging.test.ts:463-465` (comment only)
- Modify: `src/scene/firePulse.ts:112` (comment only — found during Task 1 review)
- Modify: `src/game/upgrades.test.ts:159` (comment only — found during Task 1 review)

**Interfaces:**
- Consumes: nothing new — both are comment rewrites inside existing tests
- Produces: comments that describe the current authored interval

- [ ] **Step 1: Fix the coverage.test.ts comment**

In `src/game/coverage.test.ts`, the comment currently reads:

```ts
  // Under a Pawn's 900ms move interval, so the Piece never moves or promotes
  // during the window, and over the vertical Tower's 500ms fire interval, so
  // the Tower definitely gets a shot off.
```

Change `the vertical Tower's 500ms fire interval` to `the vertical Tower's 700ms fire interval`.

- [ ] **Step 2: Fix the staging.test.ts comment**

In `src/game/staging.test.ts`, the comment currently reads:

```ts
    // Long enough that a vulnerable Pawn (maxHealth 3, pieceTypes.ts) would
    // have died to vertical fire (2 damage every 500ms fire interval) several
    // times over — 8 seconds is 16 shots, eight kills' worth — while short of
    // the roughly 12.6 seconds the Pawn's own blocked-attack grind (half of 2
    // damage every 900ms move interval) needs to fell the Tower's 14 health.
```

The window is `8_000`ms (`elapsed < 8_000`). At 700ms a shot lands every 700ms, so the window holds 11 shots. Rewrite the middle line and the parenthetical:

```ts
    // Long enough that a vulnerable Pawn (maxHealth 3, pieceTypes.ts) would
    // have died to vertical fire (2 damage every 700ms fire interval) several
    // times over — 8 seconds is 11 shots, seven kills' worth — while short of
    // the roughly 12.6 seconds the Pawn's own blocked-attack grind (half of 2
    // damage every 900ms move interval) needs to fell the Tower's 14 health.
```

Note: the margin claim still holds — the Pawn would have died several times over either way, and the 8s window stays short of the 12.6s grind. Do not change the test code, only the comment.

- [ ] **Step 3: Fix the firePulse.ts comment**

In `src/scene/firePulse.ts`, the doc comment currently reads:

```ts
 * Both are PLACEHOLDERS, but chosen so the cadence reads at both extremes:
 * a fast Tower (`vertical`, fires every 500ms) gives one 205ms blip then
 * 295ms of dark, and a range-boosted Tower keeps several rings in flight at
 * once.
```

The blip/fade math is `PULSE_SQUARES_PER_SECOND = 22` and `PULSE_FADE_MS = 160` — the 205ms blip figure is unchanged. Only the dark-time arithmetic changes with the interval. Change `fires every 500ms` to `fires every 700ms` and `295ms of dark` to `495ms of dark` (700ms interval minus the 205ms blip):

```ts
 * Both are PLACEHOLDERS, but chosen so the cadence reads at both extremes:
 * a fast Tower (`vertical`, fires every 700ms) gives one 205ms blip then
 * 495ms of dark, and a range-boosted Tower keeps several rings in flight at
 * once.
```

- [ ] **Step 4: Fix the upgrades.test.ts comment**

In `src/game/upgrades.test.ts`, the comment currently reads:

```ts
    // The guard refuses any spend whose result would be <= 0, so the spend that
    // would hit 0 is itself refused: the interval floors at 10% of base (9
    // spends on a 500ms interval), never 0. A 0ms interval hangs the engine's
    // firing loop, so the spend must be refused and the upgrade kept.
```

The "9 spends" count is unchanged — the floor is at 10% of base regardless of the interval, so the refusal point is the same. Only the parenthetical's interval value is stale. Change `spends on a 500ms interval` to `spends on a 700ms interval`:

```ts
    // The guard refuses any spend whose result would be <= 0, so the spend that
    // would hit 0 is itself refused: the interval floors at 10% of base (9
    // spends on a 700ms interval), never 0. A 0ms interval hangs the engine's
    // firing loop, so the spend must be refused and the upgrade kept.
```

- [ ] **Step 5: Run the affected tests**

Run: `pnpm test:run src/game/coverage.test.ts src/game/staging.test.ts src/game/upgrades.test.ts src/scene/firePulse.test.ts`
Expected: all pass.

- [ ] **Step 6: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/coverage.test.ts src/game/staging.test.ts src/scene/firePulse.ts src/game/upgrades.test.ts
git commit -m "docs: update 500ms vertical fire interval comments to 700ms (issue #71)"
```
