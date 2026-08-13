# Tower Upgrade Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cap the total upgrades a single Tower can spend at 10 (issue #59), uniform across types — a capped Tower stops taking upgrades, stops glowing, and the panel reports "Upgrades maxed" while kills keep banking clamped-out pending.

**Architecture:** The cap is a data constant in `src/data/towerTypes.ts` (`MAX_UPGRADES_PER_TOWER = 10`). The engine enforces it two ways from one source of truth: `pendingUpgrades` clamps its derived balance to the remaining room under the cap (so the glow, which reads `pendingUpgrades`, goes quiet on its own), and `upgradeTower` refuses a spend once `upgradesSpent` reaches the cap (defense in depth). No new stored state — `upgradesSpent` stays the only bookkeeping. The panel adds a "Upgrades maxed" line gated on `upgradesSpent >= MAX_UPGRADES_PER_TOWER`; the existing `pending > 0` gate already hides the buttons at cap because the clamped balance is 0.

**Tech Stack:** TypeScript (strict), Vitest, React Three Fiber, Vite, pnpm.

## Global Constraints

- `src/game/` must never import React or Three.js; `src/game/` and `src/data/` must never use `Math.random` (seeded runs). Both enforced by ESLint.
- `pendingUpgrades` stays **derived** from `kills` and `upgradesSpent` — the cap is a clamp on that derivation plus a spend refusal, never a new stored field.
- `MAX_UPGRADES_PER_TOWER` lives in `src/data/towerTypes.ts` next to the threshold constants. It is NOT re-exported through `src/game/index.ts`; `src/scene/` and `src/ui/` import it from `../data/towerTypes` directly, matching how the threshold constants are read.
- `structuralKey` is NOT modified. A spend mutates keyed stats; a capped tower's spends stop happening, so there is nothing new to key.
- The fire-rate 0-interval safety guard in `upgradeTower` is untouched and still fires under the cap (a `vertical` can spend at most 9 fire-rate picks; the 10th would hit 0).
- Run `pnpm test:run && pnpm typecheck && pnpm lint` before claiming a task done. All three must pass.
- Commit after each task with a message matching repo style (`feat(engine): ...`, `feat(ui): ...`, `docs: ...`).

---
## Task 1: The cap constant, the clamped pending balance, and the spend refusal

The whole engine side. One new data constant, a clamp on the derived `pendingUpgrades`, and a cap refusal in `upgradeTower` — with tests for the clamp and both refusal paths.

**Files:**
- Modify: `src/data/towerTypes.ts` (add `MAX_UPGRADES_PER_TOWER` after the threshold constants)
- Modify: `src/game/upgrades.ts` (`pendingUpgrades` clamp + `upgradeTower` refusal + doc comments)
- Test: `src/game/upgrades.test.ts`

**Interfaces:**
- Consumes: `MAX_UPGRADES_PER_TOWER` from `../data/towerTypes`; existing `pendingUpgrades`, `thresholdsCleared`, `upgradeTower` from `./upgrades`; `withTower`, `firstTower` from `./fixtures`; `step` from `./step`; `towerType` from `../data/towerTypes`.
- Produces:
  - `MAX_UPGRADES_PER_TOWER: number` (= 10) exported from `src/data/towerTypes.ts`. Task 3 consumes it from there.
  - `pendingUpgrades(kills: number, upgradesSpent: number): number` now clamped: `Math.min(Math.max(0, MAX_UPGRADES_PER_TOWER - upgradesSpent), Math.max(0, thresholdsCleared(kills) - upgradesSpent))`.
  - `upgradeTower` refuses (returns the state unchanged) when `tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER`.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/upgrades.test.ts`. Extend the imports at the top:

```ts
import { towerType } from '../data/towerTypes'
```

Add inside the `describe('pendingUpgrades', ...)` block (after the "never goes below zero" test):

```ts
  it('clamps to the remaining room under the cap', () => {
    // 9 spent leaves room for one more; 2 are banked (kills 122 clear 11
    // thresholds, 11 - 9 = 2), so the reported balance is 1, not 2.
    expect(pendingUpgrades(122, 9)).toBe(1)
  })

  it('clamps to zero at the cap, even with kills past more thresholds', () => {
    expect(pendingUpgrades(2000, 10)).toBe(0)
    expect(pendingUpgrades(254, 10)).toBe(0)
  })
```

Add inside the `describe('upgradeTower', ...)` block, at the bottom (after the "still allows damage after fire-rate is maxed" test):

```ts
  it('allows the tenth spend and refuses the eleventh', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)
    let state = base
    for (let i = 0; i < 9; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    }
    expect(firstTower(state).upgradesSpent).toBe(9)

    const tenth = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    expect(firstTower(tenth).upgradesSpent).toBe(10)
    expect(firstTower(tenth).damage).toBe(firstTower(state).damage + 1)

    const refused = step(tenth, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    expect(refused).toBe(tenth)
  })

  it('refuses every stat once the cap of 10 is spent', () => {
    // 500 kills clear far more than 10 thresholds, so pending is large; only
    // the cap stops these spends.
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)
    let state = base
    for (let i = 0; i < 10; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    }
    expect(firstTower(state).upgradesSpent).toBe(10)
    const capped = firstTower(state)

    const refused = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'health' })
    const alsoRefused = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })

    expect(refused).toBe(state)
    expect(alsoRefused).toBe(state)
    expect(firstTower(refused).upgradesSpent).toBe(10)
    expect(firstTower(refused).damage).toBe(capped.damage)
    expect(firstTower(alsoRefused).fireIntervalMs).toBe(capped.fireIntervalMs)
  })
```

Note: `kills: 500` already appears in the two fire-rate tests, so the loop to 10 spends does not collide with the fire-rate 0-interval guard (damage spends never hit it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run`
Expected: the four new tests FAIL — `pendingUpgrades` still returns the unclamped balance (122, 9 → 2, not 1; 2000, 10 → 10+, not 0), and `upgradeTower` still accepts the 11th spend.

- [ ] **Step 3: Add the cap constant**

In `src/data/towerTypes.ts`, after the `UPGRADE_THRESHOLD_ESCALATION` constant (line 79), add:

```ts
/**
 * Hard cap on total upgrades a single Tower can spend (issue #59).
 *
 * Uniform across types. A capped Tower keeps earning kills and keeps crossing
 * thresholds, but the derived pending balance is clamped to 0, so it stops
 * glowing and the panel reports "Upgrades maxed". PLACEHOLDER tuning number;
 * the cap is the design.
 */
export const MAX_UPGRADES_PER_TOWER = 10
```

- [ ] **Step 4: Clamp `pendingUpgrades` and refuse the capped spend**

In `src/game/upgrades.ts`, add the import (merge with the existing `../data/towerTypes` import block):

```ts
import {
  MAX_UPGRADES_PER_TOWER,
  UPGRADE_FIRST_THRESHOLD,
  UPGRADE_SECOND_THRESHOLD,
  UPGRADE_THRESHOLD_ESCALATION,
} from '../data/towerTypes'
```

Replace the `pendingUpgrades` implementation and its doc comment:

```ts
/**
 * Upgrades banked but unspent.
 *
 * Derived, never stored: kills are the XP source, `upgradesSpent` the only
 * bookkeeping, and the count is `thresholdsCleared(kills) - upgradesSpent`,
 * clamped below by 0 (an over-spent Tower, impossible through the engine but
 * possible through a hand-built test state) and above by the remaining room
 * under `MAX_UPGRADES_PER_TOWER` — a capped Tower reports 0, so the glow and
 * the panel go quiet even while kills keep crossing thresholds.
 */
export function pendingUpgrades(kills: number, upgradesSpent: number): number {
  const banked = Math.max(0, thresholdsCleared(kills) - upgradesSpent)
  return Math.min(Math.max(0, MAX_UPGRADES_PER_TOWER - upgradesSpent), banked)
}
```

In `upgradeTower`, add the cap refusal after the Wall check (line 81) and before the pending check:

```ts
  if (tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER) return state
```

Extend `upgradeTower`'s doc comment: after "the Wall — which can never earn an upgrade, checked explicitly so a hand-built test state cannot slip one through —" add "a Tower at `MAX_UPGRADES_PER_TOWER` spent — the cap, refused even when kills have banked more —" before "or an empty pending balance".

- [ ] **Step 5: Run the tests, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass, including the four new tests and all existing upgrade tests. The existing "refuses a fire-rate spend that would drive the interval to zero" test still passes: it ends at 9 spent (the 10th fire-rate pick is refused by the 0-interval guard before the cap could matter).

- [ ] **Step 6: Commit**

```bash
git add src/data/towerTypes.ts src/game/upgrades.ts src/game/upgrades.test.ts
git commit -m "feat(engine): cap tower upgrades at 10 total spends (issue #59)"
```

---
## Task 2: The scene test — no glow at the cap

No scene code changes. `isUpgradeReady` reads the clamped `pendingUpgrades`, so a capped Tower stops glowing for free; this task pins that with a test.

**Files:**
- Test: `src/scene/upgradeReady.test.ts`

**Interfaces:**
- Consumes: `isUpgradeReady` from `./upgradeReady` (unchanged); `tower` helper and `towerType` already in the test file.

- [ ] **Step 1: Write the failing test**

Add to `src/scene/upgradeReady.test.ts`, inside `describe('isUpgradeReady', ...)`:

```ts
  it('is false at the cap even with kills far past more thresholds', () => {
    // The cap clamps the derived pending balance to 0, so a capped Tower
    // stops glowing even while kills keep crossing thresholds.
    expect(isUpgradeReady(tower({ kills: 500, upgradesSpent: 10 }))).toBe(false)
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run`
Expected: FAIL — before Task 1, `pendingUpgrades(500, 10)` is `thresholdsCleared(500) - 10`, which is well above 0.

(If you are running this task after Task 1, this test already passes — Task 1 is the prerequisite. Re-run the file to confirm green, then commit.)

- [ ] **Step 3: Run the suite, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/scene/upgradeReady.test.ts
git commit -m "test(scene): capped Tower stops glowing despite banked kills (#59)"
```

---
## Task 3: The panel's "Upgrades maxed" state

The player-facing signal: a selected Tower that has spent its cap shows "Upgrades maxed" instead of upgrade buttons. The buttons already hide on their own — the clamped pending balance is 0, so the existing `pending > 0` gate drops the whole section — this task adds the explanation.

**Files:**
- Modify: `src/ui/TowerPanel.tsx`

**Interfaces:**
- Consumes: `MAX_UPGRADES_PER_TOWER` from `../data/towerTypes` (Task 1); `tower.upgradesSpent`; existing `pending` computation and `towerPanel__upgrades` CSS class.
- Produces: a "Upgrades maxed" line rendered when `tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER`.

- [ ] **Step 1: Add the import**

In `src/ui/TowerPanel.tsx`, extend the existing data import (line 2):

```tsx
import { MAX_UPGRADES_PER_TOWER, towerType } from '../data/towerTypes'
```

- [ ] **Step 2: Render the maxed line**

In the component body, after the existing `{pending > 0 && (...)}` upgrade section (after line 109), add:

```tsx
      {tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER && (
        <div className="towerPanel__upgrades">
          <p className="hud__muted">Upgrades maxed — this Tower has spent all of its upgrades.</p>
        </div>
      )}
```

The two blocks are mutually exclusive by construction: at the cap, `pending` is 0 (clamped), so the first block is false and the second true; below the cap the reverse. Reusing the `towerPanel__upgrades` class keeps the spacing identical.

- [ ] **Step 3: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: pass. There is no jsdom, so the panel itself is untested by design; the maxed gate is a one-line comparison and the capped pending balance it depends on is covered in `src/game/upgrades.test.ts` and `src/scene/upgradeReady.test.ts`.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test:run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/TowerPanel.tsx
git commit -m "feat(ui): Tower panel shows maxed upgrades at the cap (#59)"
```

---
## Task 4: Design-doc amendment

The design doc currently says upgrades stack uncapped. Record the cap and its maxed behavior. No other doc claims upgrades are uncapped — CLAUDE.md's health-upgrade qualification (line 124) is already correct and stays.

**Files:**
- Modify: `docs/design/game-design.md`

- [ ] **Step 1: Amend the "Experience upgrades" paragraph**

In `docs/design/game-design.md`, lines 394-395 currently read:

> increase — never to full, never more than the ceiling rises. Upgrades stack
> uncapped for now.

Replace with:

> increase — never to full, never more than the ceiling rises. Upgrades are
> capped at **10 total spends per Tower**, uniform across types (issue #59): a
> Tower that has spent 10 stops taking upgrades, stops glowing, and the panel
> reports **Upgrades maxed**. A capped Tower keeps earning kills and keeps
> crossing thresholds, but the derived pending balance is clamped out of the
> UI. The fire-rate 0-interval safety still floors a `vertical`'s interval at
> 10% of base (9 picks) before the cap could.

- [ ] **Step 2: Verify the edit and commit**

Run: `git diff --stat`
Expected: only `docs/design/game-design.md` changed. No code, so no tests needed.

```bash
git add docs/design/game-design.md
git commit -m "docs: record the 10-upgrade cap and maxed panel state (#59)"
```
