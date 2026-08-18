# Tower Upgrade Category Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Tower inspect panel shows the total upgrades spent on a Tower and a per-category breakdown (damage / fireRate / health), backed by per-category counters on the engine's `Tower`.

**Architecture:** Replace the single monotonic `Tower.upgradesSpent` counter with `Tower.upgradeCounts: { damage, fireRate, health }`. The total and the pending balance are derived as the sum (`totalUpgrades` in `src/game/upgrades.ts`), never stored. The panel reads the counters and the derived total; it contains no derivation logic.

**Tech Stack:** TypeScript strict (5.x), Vitest, pnpm.

## Global Constraints

- **No React/Three.js in `src/game/` or `src/data/`** — enforced by ESLint. `totalUpgrades` lives in `src/game/upgrades.ts` and must not import renderer code.
- **Renderer imports of `src/game/` must go through `src/game/index.ts`** — `src/scene/` and `src/ui/` may only import the public surface. `totalUpgrades` MUST be added to `src/game/index.ts` exports in Task 1, before any scene/ui file uses it.
- **Test files are exempt** from the inbound half of the boundary rule — `upgrades.test.ts` imports `./upgrades` directly.
- **No `Math.random` in `src/game/`** — enforced by ESLint. Nothing here introduces randomness.
- **UI copy uses exact domain vocabulary** — "damage", "faster firing", "health", "Upgrades", "spent". The breakdown separator is ` · `, matching the panel's existing `range · dmg · ms` line.
- **No jsdom and no component tests** — a decision left inside a `.tsx` cannot be tested. The derivation (`totalUpgrades`) lives in `src/game/` and is engine-tested; `TowerPanel.tsx` stays plumbing.
- **`structuralKey` is NOT changed** — a spend already mutates `damage`, `fireIntervalMs`, `maxHealth`, and/or `health`, all keyed, so the panel republishes for free. `upgradeCounts` is deliberately not keyed.
- **Frozen docs are never edited** — `docs/superpowers/specs/2026-08-13-*.md` and `docs/superpowers/plans/2026-08-13-*.md` reference `upgradesSpent`; they are historical records and stay as they are.
- Verify with `pnpm test:run` (not `pnpm test`, which is watch mode), `pnpm typecheck`, and `pnpm lint`. Vitest runs through esbuild, which strips types without checking them — a passing test suite is NOT a passing typecheck.

---

### Task 1: `totalUpgrades` — derive the total from the counters

Add the pure helper that the rest of the work keys off. It is a new function with its own tests and its own export.

**Files:**
- Modify: `src/game/upgrades.ts`
- Modify: `src/game/upgrades.test.ts`
- Modify: `src/game/index.ts`

**Interfaces:**
- Consumes: `UpgradeStat` from `./types` (already imported in `upgrades.ts`); `towerType` from `../data/towerTypes` in the test (already imported).
- Produces: `totalUpgrades(counts: Record<UpgradeStat, number>): number` — exported from `src/game/upgrades.ts` AND from `src/game/index.ts`. Later tasks call it from `src/game/upgrades.ts` (Task 2) and from `src/scene/upgradeReady.ts` and `src/ui/TowerPanel.tsx` via `../game` (Tasks 2–3).

- [ ] **Step 1: Write the failing test**

Add a `describe('totalUpgrades', ...)` block to `src/game/upgrades.test.ts`, and add `totalUpgrades` to the import on line 5:

```ts
import { pendingUpgrades, thresholdsCleared, totalUpgrades, upgradeThreshold } from './upgrades'
```

```ts
describe('totalUpgrades', () => {
  it('sums the per-category counters', () => {
    expect(totalUpgrades({ damage: 0, fireRate: 0, health: 0 })).toBe(0)
    expect(totalUpgrades({ damage: 2, fireRate: 0, health: 0 })).toBe(2)
    expect(totalUpgrades({ damage: 0, fireRate: 3, health: 0 })).toBe(3)
    expect(totalUpgrades({ damage: 1, fireRate: 2, health: 3 })).toBe(6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run -- src/game/upgrades.test.ts`
Expected: FAIL — `totalUpgrades is not a function`.

- [ ] **Step 3: Write the minimal implementation**

In `src/game/upgrades.ts`, add after the `pendingUpgrades` function (line 56):

```ts
/**
 * Total upgrades spent on a Tower, derived as the sum of the per-category
 * counters (issue #79).
 *
 * Derived, never stored: the category counts are the bookkeeping, and the
 * total — the figure the cap, the pending balance, and the panel's "X / 10
 * spent" line all read — is their sum, so every consumer sees the same number.
 */
export function totalUpgrades(counts: Record<UpgradeStat, number>): number {
  return counts.damage + counts.fireRate + counts.health
}
```

- [ ] **Step 4: Export from the public surface**

In `src/game/index.ts` line 18, replace:

```ts
export { pendingUpgrades } from './upgrades'
```

with:

```ts
export { pendingUpgrades, totalUpgrades } from './upgrades'
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/upgrades.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/upgrades.ts src/game/upgrades.test.ts src/game/index.ts
git commit -m "feat(engine): derive total upgrades spent as the sum of per-category counters (#79)"
```

---

### Task 2: Replace `Tower.upgradesSpent` with `Tower.upgradeCounts`

The field swap. Atomic: every `upgradesSpent` reference in `src/` must move in this task or `pnpm typecheck` fails, so the engine, scene, and test fixtures change together.

**Files:**
- Modify: `src/game/types.ts:358` — the `upgradesSpent` field
- Modify: `src/game/upgrades.ts` — refusals + `applyUpgrade` + doc comments
- Modify: `src/game/cardPlays.ts:41` — Tower creation seed
- Modify: `src/game/fixtures.ts:131` — `towersAt` literal
- Modify: `src/scene/upgradeReady.ts:11` — consume the derived total
- Modify: `src/game/upgrades.test.ts` — assertions + new per-category tests
- Modify: `src/scene/upgradeReady.test.ts` — literal + assertion updates
- Modify: `src/scene/firePulse.test.ts:46` — literal
- Modify: `src/scene/boardClick.test.ts:20` — literal
- Modify: `src/scene/towerDiff.test.ts:21` — literal
- Modify: `src/game/tick.test.ts:560` — literal
- Modify: `src/state/structuralKey.test.ts:27` — comment text

**Interfaces:**
- Consumes: `totalUpgrades` from Task 1 (via `./upgrades` in `upgrades.ts`, via `../game` in `upgradeReady.ts`).
- Produces: `Tower.upgradeCounts: Record<UpgradeStat, number>` — the only upgrade bookkeeping on `Tower`. `upgradeCounts.damage`, `.fireRate`, `.health` are each monotonic, seeded `0`, and incremented only by the matching stat's spend. Task 3 reads them and the derived total.

- [ ] **Step 1: Replace the `Tower` field**

In `src/game/types.ts`, replace the `upgradesSpent` field (lines 346–358) with:

```ts
  /**
   * Lifetime count of upgrades spent on this Tower, per category.
   *
   * Monotonic and never reset. Each `upgradeTower` spend increments exactly the
   * counter for the stat spent; the total is derived as the sum (see
   * `totalUpgrades` in `src/game/upgrades.ts`), never stored. Pending upgrades
   * are derived as `pendingUpgrades(kills, totalUpgrades(upgradeCounts))`, never
   * stored.
   *
   * Kept out of `structuralKey` on purpose: a spend mutates `damage`,
   * `fireIntervalMs`, `maxHealth`, and/or `health`, which are already keyed, so
   * the panel republishes on the spend itself. Keying the counters would add no
   * publishes and just bloat the key.
   */
  readonly upgradeCounts: Record<UpgradeStat, number>
```

`UpgradeStat` is already defined at `src/game/types.ts:544` as `'damage' | 'fireRate' | 'health'` — the same keys `applyUpgrade` switches on, so the counters' keys line up with the spend paths for free.

- [ ] **Step 2: Update the engine logic in `src/game/upgrades.ts`**

2a. Reword the `pendingUpgrades` doc comment (lines 43–52): replace "the only bookkeeping" and "`upgradesSpent`" with the derived-total wording, e.g.:

```ts
/**
 * Upgrades banked but unspent.
 *
 * Derived, never stored: kills are the XP source, the total spent (the sum of
 * the per-category `upgradeCounts` counters) the only bookkeeping, and the
 * count is `thresholdsCleared(kills) - totalSpent`, clamped below by 0 (an
 * over-spent Tower, impossible through the engine but possible through a
 * hand-built test state) and above by the remaining room under
 * `MAX_UPGRADES_PER_TOWER` — a capped Tower reports 0, so the glow and the
 * panel go quiet even while kills keep crossing thresholds.
 */
```

2b. In `upgradeTower`, replace the two refusals (lines 87–88):

```ts
  if (totalUpgrades(tower.upgradeCounts) >= MAX_UPGRADES_PER_TOWER) return state
  if (pendingUpgrades(tower.kills, totalUpgrades(tower.upgradeCounts)) < 1) return state
```

2c. Reword the `upgradeTower` doc comment's last paragraph (lines 78–79):

```ts
 * Every spend increments the spent stat's counter, so the next
 * `pendingUpgrades` call sees one fewer upgrade banked.
```

2d. In `applyUpgrade` (line 101), replace the counter bump:

```ts
  const spent = {
    ...tower,
    upgradeCounts: { ...tower.upgradeCounts, [stat]: tower.upgradeCounts[stat] + 1 },
  }
```

The three stat mutations in the `switch` are unchanged — the compounding health `0.1 * maxHealth`, the additive `0.1 * fireIntervalBaseMs`, and the flat `+1` damage stay exactly as they are.

- [ ] **Step 3: Update the two Tower-creation seeds**

In `src/game/cardPlays.ts:41`, replace:

```ts
    upgradesSpent: 0,
```

with:

```ts
    upgradeCounts: { damage: 0, fireRate: 0, health: 0 },
```

In `src/game/fixtures.ts:131` (inside `towersAt`), replace:

```ts
        upgradesSpent: 0,
```

with:

```ts
        upgradeCounts: { damage: 0, fireRate: 0, health: 0 },
```

- [ ] **Step 4: Update `src/scene/upgradeReady.ts`**

Replace line 11:

```ts
export function isUpgradeReady(tower: Tower): boolean {
  return pendingUpgrades(tower.kills, totalUpgrades(tower.upgradeCounts)) > 0
}
```

and update the import on line 1:

```ts
import { pendingUpgrades, totalUpgrades, type Tower } from '../game'
```

- [ ] **Step 5: Update the test literals (mechanical swap)**

In each of these files, replace the single `upgradesSpent: 0,` literal with `upgradeCounts: { damage: 0, fireRate: 0, health: 0 },`:

- `src/scene/firePulse.test.ts:46`
- `src/scene/boardClick.test.ts:20`
- `src/scene/towerDiff.test.ts:21`
- `src/game/tick.test.ts:560`

- [ ] **Step 6: Update `src/state/structuralKey.test.ts` comment**

In the comment at line 27, replace `(derived from \`kills\` and \`upgradesSpent\`, neither keyed)` with `(derived from \`kills\` and the sum of \`upgradeCounts\`, neither keyed)`. The assertions in that file are unchanged.

- [ ] **Step 7: Update `src/scene/upgradeReady.test.ts`**

7a. Replace the literal on line 22:

```ts
    upgradesSpent: 0,
```

with:

```ts
    upgradeCounts: { damage: 0, fireRate: 0, health: 0 },
```

7b. Replace the two assertions that pass `upgradesSpent` overrides:

```ts
    expect(isUpgradeReady(tower({ kills: 10, upgradesSpent: 1 }))).toBe(false)
```

becomes:

```ts
    expect(isUpgradeReady(tower({ kills: 10, upgradeCounts: { damage: 1, fireRate: 0, health: 0 } }))).toBe(false)
```

and:

```ts
    expect(isUpgradeReady(tower({ kills: 500, upgradesSpent: 10 }))).toBe(false)
```

becomes:

```ts
    expect(isUpgradeReady(tower({ kills: 500, upgradeCounts: { damage: 10, fireRate: 0, health: 0 } }))).toBe(false)
```

- [ ] **Step 8: Update the engine assertions in `src/game/upgrades.test.ts`**

8a. Line 81 — after a `damage` spend:

```ts
    expect(firstTower(after).upgradeCounts).toEqual({ damage: 1, fireRate: 0, health: 0 })
    expect(totalUpgrades(firstTower(after).upgradeCounts)).toBe(1)
```

8b. Line 114 — after a `health` spend:

```ts
    expect(tower.upgradeCounts).toEqual({ damage: 0, fireRate: 0, health: 1 })
    expect(totalUpgrades(tower.upgradeCounts)).toBe(1)
```

8c. Lines 209 and 212 — the tenth-spend sequence:

```ts
    expect(totalUpgrades(firstTower(state).upgradeCounts)).toBe(9)
```

and:

```ts
    expect(totalUpgrades(firstTower(tenth).upgradeCounts)).toBe(10)
```

8d. Lines 227 and 235 — the cap refusal test:

```ts
    expect(totalUpgrades(firstTower(state).upgradeCounts)).toBe(10)
```

and:

```ts
    expect(totalUpgrades(firstTower(refused).upgradeCounts)).toBe(10)
```

- [ ] **Step 9: Add the per-category increment tests**

Add these two tests to the `describe('upgradeTower', ...)` block in `src/game/upgrades.test.ts` (after the existing health test, line 115):

```ts
  it('increments exactly the counter for the stat spent, leaving the others untouched', () => {
    // 40 kills clear thresholds at 10, 22, 27, 33 — four banked, three spends
    // is comfortably within the balance.
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 40)

    const fire = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })
    expect(firstTower(fire).upgradeCounts).toEqual({ damage: 0, fireRate: 1, health: 0 })

    const health = step(fire, { kind: 'upgradeTower', towerId: firstTower(fire).id, stat: 'health' })
    expect(firstTower(health).upgradeCounts).toEqual({ damage: 0, fireRate: 1, health: 1 })

    const damage = step(health, { kind: 'upgradeTower', towerId: firstTower(health).id, stat: 'damage' })
    expect(firstTower(damage).upgradeCounts).toEqual({ damage: 1, fireRate: 1, health: 1 })
    expect(totalUpgrades(firstTower(damage).upgradeCounts)).toBe(3)
  })

  it('records the fire-rate floor: 9 picks on a 700ms interval, all in the fireRate counter', () => {
    // The 10th fire-rate spend would drive the interval to 0 and is refused;
    // the 9 that landed all sit in the fireRate counter, with damage and
    // health untouched.
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)

    let state = base
    for (let i = 0; i < 10; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })
    }

    expect(firstTower(state).fireIntervalMs).toBeCloseTo(0.1 * vertical.fireIntervalMs, 10)
    expect(firstTower(state).upgradeCounts).toEqual({ damage: 0, fireRate: 9, health: 0 })
    expect(totalUpgrades(firstTower(state).upgradeCounts)).toBe(9)
  })
```

- [ ] **Step 10: Run the full suite, typecheck, and lint**

Run: `pnpm test:run`
Expected: PASS — all suites, including the 753 pre-existing tests.

Run: `pnpm typecheck`
Expected: PASS — this is the critical one: esbuild strips types, so only `tsc` catches a missed `upgradesSpent` reference.

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 11: Confirm no `upgradesSpent` remains in `src/`**

Run: `rg -l "upgradesSpent" src/`
Expected: no output (the docs/ references are frozen and untouched).

- [ ] **Step 12: Commit**

```bash
git add src/
git commit -m "feat(engine): track upgrade spends per category, replacing the total field (#79)"
```

---

### Task 3: Tower panel shows total spent and per-category breakdown

The player-facing deliverable. `TowerPanel.tsx` reads the counters and the derived total — no derivation in the component.

**Files:**
- Modify: `src/ui/TowerPanel.tsx`

**Interfaces:**
- Consumes: `totalUpgrades` from `../game` (exported in Task 1); `tower.upgradeCounts` (Task 2); `MAX_UPGRADES_PER_TOWER` from `../data/towerTypes` (already imported); `pendingUpgrades` from `../game` (already imported).
- Produces: an always-visible `Upgrades: X / 10 spent` line and a `N damage · N faster firing · N health` breakdown line in the Tower panel.

- [ ] **Step 1: Update the imports**

In `src/ui/TowerPanel.tsx` line 1, replace:

```ts
import { pendingUpgrades } from '../game'
```

with:

```ts
import { pendingUpgrades, totalUpgrades } from '../game'
```

- [ ] **Step 2: Derive the total once, and source pending from it**

Replace line 36:

```ts
  const pending = pendingUpgrades(tower.kills, tower.upgradesSpent)
```

with:

```ts
  const total = totalUpgrades(tower.upgradeCounts)
  const pending = pendingUpgrades(tower.kills, total)
```

- [ ] **Step 3: Add the always-visible summary block**

Insert between the closing `</dl>` (line 80) and the `{pending > 0 && (...)}` block (line 82):

```tsx
      <div className="towerPanel__upgrades">
        <p className="hud__muted">
          Upgrades: {total} / {MAX_UPGRADES_PER_TOWER} spent
        </p>
        <p className="hud__muted">
          {tower.upgradeCounts.damage} damage · {tower.upgradeCounts.fireRate} faster firing ·{' '}
          {tower.upgradeCounts.health} health
        </p>
      </div>
```

This block renders regardless of `pending` or `total`, so a Tower that has spent nothing — including the Wall — shows `Upgrades: 0 / 10 spent` / `0 damage · 0 faster firing · 0 health` without error.

- [ ] **Step 4: Update the "Upgrades maxed" gate**

Replace line 111:

```ts
      {tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER && (
```

with:

```ts
      {total >= MAX_UPGRADES_PER_TOWER && (
```

The `pending > 0` gate on the spend buttons and the `Upgrades ready: {pending}` line are unchanged.

- [ ] **Step 5: Typecheck and build**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS.

Run: `pnpm build`
Expected: PASS — `build` runs typecheck then the production build, confirming the JSX is well-formed.

There are no component tests (no jsdom), so verification is the typecheck/build above plus a manual check in `pnpm dev`: open a Tower panel with a fresh Tower (zeros), spend upgrades across two categories (counts move, total climbs, breakdown sums to total), and reach the cap (the "Upgrades maxed" line still appears).

- [ ] **Step 6: Commit**

```bash
git add src/ui/TowerPanel.tsx
git commit -m "feat(ui): show upgrades spent and per-category breakdown in the Tower panel (#79)"
```

---

### Task 4: Design-doc amendment

**Files:**
- Modify: `docs/design/game-design.md`

**Interfaces:**
- Consumes: nothing new — a documentation update describing the Task 2/3 behaviour.

- [ ] **Step 1: Add the breakdown sentence**

In `docs/design/game-design.md`, in the "Experience upgrades" section, after the paragraph ending "...clamped out of the UI. The fire-rate 0-interval safety still floors a `vertical`'s interval at 10% of base (9 picks) before the cap could." (line 400), add:

```markdown
The inspect panel reports the investment: a total line — `Upgrades: 3 / 10
spent` — and a per-category breakdown — `2 damage · 1 faster firing · 1
health` — so a Tower's damage, rate, and health picks are legible at a glance.
The engine's bookkeeping is per-category counters on the Tower instance; the
total and the pending balance are derived from their sum, never stored.
```

- [ ] **Step 2: Verify the doc reads correctly**

Run: `git diff docs/design/game-design.md`
Expected: only the added paragraph, no other edits.

- [ ] **Step 3: Commit**

```bash
git add docs/design/game-design.md
git commit -m "docs: document the per-category upgrade breakdown in the design doc (#79)"
```

---

## Self-Review

**Spec coverage:**
- "A line reporting the total spent, e.g. 'Upgrades: 3 / 10 spent'" → Task 3, Step 3.
- "A per-category breakdown — how many damage, fireRate, and health upgrades were applied" → Task 3, Step 3; counters from Task 2.
- "A Tower that has spent nothing shows the breakdown without error (all zeros), including the Wall" → Task 3, Step 3 (ungated block) + Task 2, Step 5 (fixture seeds).
- "The breakdown updates immediately when an upgrade is spent, with no stale figures after the panel has stayed open across rounds" → no `structuralKey` change; a spend mutates keyed stats (Global Constraints; Task 2 keeps `structuralKey.ts` untouched).
- "The per-category counts sum to tower.upgradesSpent" → the total IS the sum, by construction; Task 2 Step 9 asserts it.
- "A pure module in src/game/ decides the breakdown and is covered by engine tests" → `totalUpgrades` (Task 1) plus the counters themselves; Task 1 Step 1 tests, Task 2 Step 9 asserts.
- "TowerPanel.tsx contains no derivation logic" → Task 3 reads `totalUpgrades` + counters only.
- Spec "Decisions" — stored-not-derived (Task 2), total derived (Task 1), `.tsx` plumbing (Task 3), always-visible (Task 3), issue-verbatim wording (Task 3).

**Placeholder scan:** No TBD/TODO; every step has concrete code or an exact file/line edit.

**Type consistency:** `totalUpgrades(counts: Record<UpgradeStat, number>)` is defined in Task 1 and used identically in Tasks 2–3. `upgradeCounts: Record<UpgradeStat, number>` is defined in Task 2 Step 1 and read as `tower.upgradeCounts.damage` / `.fireRate` / `.health` in Task 3. No name drift.