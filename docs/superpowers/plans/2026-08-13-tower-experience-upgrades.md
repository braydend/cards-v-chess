# Tower Experience Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Towers earn banked upgrades from their lifetime kills — every 10 kills (escalating 20% each level, ceiled) banks one pending upgrade the player spends any time on +1 damage, −10% fire interval off base, or +10% max health (healing by exactly the increase) — signalled in-scene by a golden ring and spent from the Tower panel (issue #67).

**Architecture:** Pending upgrades are **derived, never stored**: `pendingUpgrades(kills, upgradesSpent) = thresholdsCleared(kills) - upgradesSpent`, a pure function in `src/game/upgrades.ts`. The existing lifetime `kills` counter is the only XP source. A new `upgradeTower` Command mutates the Tower's instance `damage` / `fireIntervalMs` / `maxHealth` + `health` fields directly (plus a new monotonic `upgradesSpent`). Because `structuralKey` already keys `damage`, `fireIntervalMs`, `maxHealth`, and `health`, a spend republishes for free. The Wall never fires, so it never kills, so it can never earn an upgrade — the mechanic excludes it by construction.

**Tech Stack:** TypeScript (strict), Vitest, React Three Fiber, Vite, pnpm.

## Global Constraints

- No `Math.random` in `src/game/` — runs are seeded, everything deterministic. Enforced by ESLint.
- `src/game/` must never import React or Three.js.
- A Tower's `id` is its identity. `upgradeTower` finds its Tower by id.
- `pendingUpgrades` must be derived from `kills` and `upgradesSpent`, never tracked as its own counter — no mutable XP state, no drain bookkeeping.
- The health upgrade reads the **old** maxHealth for both fields: 10/14 → 15.4/11.4. Never heals to full.
- The fire-rate upgrade subtracts `0.1 * fireIntervalBaseMs` (a new never-mutated instance field), additive off base — never a percentage of the live interval.
- `step`'s switch is exhaustiveness-protected: adding the Command variant without a `case` is a compile error. Add both together.
- `structuralKey` is NOT modified — a spend already mutates keyed stats.
- Run `pnpm test:run`, `pnpm typecheck`, and `pnpm lint` before claiming a task done. All three must pass.
- Commit after each task with a message matching repo style (`feat(engine): ...`, `feat(ui): ...`, `docs: ...`).

---
## Task 1: The pure upgrade-derivation module

The threshold math with no engine coupling — testable in isolation, and the single source of truth for "how many upgrades is this Tower owed".

**Files:**
- Modify: `src/data/towerTypes.ts` (add two exported constants near the type table)
- Create: `src/game/upgrades.ts`
- Test: `src/game/upgrades.test.ts`

**Interfaces:**
- Consumes: `UPGRADE_FIRST_THRESHOLD`, `UPGRADE_THRESHOLD_ESCALATION` from `../data/towerTypes`.
- Produces:
  - `upgradeThreshold(n: number): number` — kills needed to bank the `n`th upgrade. `upgradeThreshold(1)` is `UPGRADE_FIRST_THRESHOLD`; each next is `Math.ceil(previous * UPGRADE_THRESHOLD_ESCALATION)`.
  - `thresholdsCleared(kills: number): number` — how many `upgradeThreshold(n)` values `kills` reaches.
  - `pendingUpgrades(kills: number, upgradesSpent: number): number` — `Math.max(0, thresholdsCleared(kills) - upgradesSpent)`.

- [ ] **Step 1: Write the failing test**

Create `src/game/upgrades.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { pendingUpgrades, thresholdsCleared, upgradeThreshold } from './upgrades'

describe('upgradeThreshold', () => {
  it('starts at the first threshold and escalates 20% each level, ceiled', () => {
    expect(upgradeThreshold(1)).toBe(10)
    expect(upgradeThreshold(2)).toBe(12)
    expect(upgradeThreshold(3)).toBe(15)
    expect(upgradeThreshold(4)).toBe(18)
    expect(upgradeThreshold(5)).toBe(22)
  })
})

describe('thresholdsCleared', () => {
  it('counts how many thresholds a kill count reaches', () => {
    expect(thresholdsCleared(0)).toBe(0)
    expect(thresholdsCleared(9)).toBe(0)
    expect(thresholdsCleared(10)).toBe(1)
    expect(thresholdsCleared(11)).toBe(1)
    expect(thresholdsCleared(12)).toBe(2)
    expect(thresholdsCleared(14)).toBe(2)
    expect(thresholdsCleared(15)).toBe(3)
    expect(thresholdsCleared(22)).toBe(5)
    expect(thresholdsCleared(23)).toBe(5)
  })
})

describe('pendingUpgrades', () => {
  it('is thresholds cleared minus upgrades spent', () => {
    expect(pendingUpgrades(10, 0)).toBe(1)
    expect(pendingUpgrades(23, 2)).toBe(3)
    expect(pendingUpgrades(22, 5)).toBe(0)
  })

  it('never goes below zero', () => {
    expect(pendingUpgrades(5, 1)).toBe(0)
    expect(pendingUpgrades(0, 3)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run`
Expected: FAIL — `./upgrades` does not exist.

- [ ] **Step 3: Add the tuning constants**

In `src/data/towerTypes.ts`, after the `TOWER_TYPE_IDS` array, add:

```ts
/**
 * Tower experience upgrades (issue #67).
 *
 * PLACEHOLDER tuning numbers; the shape is the design. The first upgrade
 * banks at `UPGRADE_FIRST_THRESHOLD` kills, and each next threshold is the
 * previous one escalated by `UPGRADE_THRESHOLD_ESCALATION`, ceiled. Kills are
 * the only XP source, so the Wall — which never fires — can never earn one.
 */
export const UPGRADE_FIRST_THRESHOLD = 10
export const UPGRADE_THRESHOLD_ESCALATION = 1.2
```

- [ ] **Step 4: Implement `src/game/upgrades.ts`**

```ts
import { UPGRADE_FIRST_THRESHOLD, UPGRADE_THRESHOLD_ESCALATION } from '../data/towerTypes'

/**
 * Kills needed to bank the `n`th upgrade.
 *
 * The first banks at `UPGRADE_FIRST_THRESHOLD` (10); each next threshold is
 * the previous one escalated by `UPGRADE_THRESHOLD_ESCALATION` (20%), ceiled —
 * 10, 12, 15, 18, 22, ... `ceil` keeps a fractional threshold from ever
 * demanding a fractional kill count.
 */
export function upgradeThreshold(n: number): number {
  let threshold = UPGRADE_FIRST_THRESHOLD
  for (let i = 1; i < n; i += 1) {
    threshold = Math.ceil(threshold * UPGRADE_THRESHOLD_ESCALATION)
  }
  return threshold
}

/**
 * How many upgrade thresholds a kill count clears.
 *
 * A Tower at 23 kills has cleared 10, 12, 15, 18 and 22 — five upgrades owed
 * before any are spent. Iterates the threshold sequence rather than deriving
 * a closed form, so the escalation stays in the data file and this stays the
 * single place that walks it.
 */
export function thresholdsCleared(kills: number): number {
  let cleared = 0
  let next = UPGRADE_FIRST_THRESHOLD
  while (kills >= next) {
    cleared += 1
    next = Math.ceil(next * UPGRADE_THRESHOLD_ESCALATION)
  }
  return cleared
}

/**
 * Upgrades banked but unspent.
 *
 * Derived, never stored: kills are the XP source, `upgradesSpent` the only
 * bookkeeping, and the count is `thresholdsCleared(kills) - upgradesSpent`,
 * clamped at 0 so an over-spent Tower (impossible through the engine, possible
 * through a hand-built test state) never reports a negative balance.
 */
export function pendingUpgrades(kills: number, upgradesSpent: number): number {
  return Math.max(0, thresholdsCleared(kills) - upgradesSpent)
}
```

- [ ] **Step 5: Run the test, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass. The new test passes and no existing test references the new module yet.

- [ ] **Step 6: Commit**

```bash
git add src/data/towerTypes.ts src/game/upgrades.ts src/game/upgrades.test.ts
git commit -m "feat(engine): tower upgrade threshold derivation (#67)"
```

---
## Task 2: The Tower fields `upgradesSpent` and `fireIntervalBaseMs`

Two new instance fields, seeded at build and never reset: `upgradesSpent` (monotonic spend counter, the only upgrade bookkeeping) and `fireIntervalBaseMs` (the type's fire interval frozen at build, needed because the fire-rate upgrade is additive off base).

**Files:**
- Modify: `src/game/types.ts` (the `Tower` interface)
- Modify: `src/game/cardPlays.ts` (`newTower`)
- Modify: `src/game/fixtures.ts` (`towersAt`)
- Modify: `src/game/tick.test.ts` (a literal `Tower`)
- Modify: `src/scene/boardClick.test.ts` (the `towerAt` helper)
- Modify: `src/scene/towerDiff.test.ts` (the `tower` helper)
- Modify: `src/scene/firePulse.test.ts` (the `tower` helper)

**Interfaces:**
- Produces: `Tower.upgradesSpent: number` and `Tower.fireIntervalBaseMs: number` — required on every `Tower`. `upgradesSpent` starts 0; `fireIntervalBaseMs` starts at the type's `fireIntervalMs`.
- Consumes: `withTower`, `firstTower`, `towersAt` from `src/game/fixtures.ts` (compile-only — `withTower` builds through `newTower`).

- [ ] **Step 1: Add the fields to the `Tower` interface**

In `src/game/types.ts`, after the `kills` field (line 330), add:

```ts
  /**
   * Lifetime count of upgrades the player has spent on this Tower.
   *
   * Monotonic and never reset. The XP source is `kills`; pending upgrades are
   * derived as `pendingUpgrades(kills, upgradesSpent)` (see
   * `src/game/upgrades.ts`), never stored.
   *
   * Kept out of `structuralKey` on purpose: a spend mutates `damage`,
   * `fireIntervalMs`, `maxHealth`, and/or `health`, which are already keyed,
   * so the panel republishes on the spend itself. Keying the counter would
   * add no publishes and just bloat the key.
   */
  readonly upgradesSpent: number
  /**
   * The fire interval seeded from the type's table at build. Never changed.
   *
   * Split from `fireIntervalMs` because the fire-rate upgrade is additive off
   * base: each pick subtracts `0.1 * fireIntervalBaseMs`, so once the live
   * interval is mutated the base can no longer be recovered from it. Kept out
   * of `structuralKey` because it never changes after build.
   */
  readonly fireIntervalBaseMs: number
```

Also rewrite the "never changed after" doc comments on `maxHealth` (line 270), `damage` (line 273-277), and `fireIntervalMs` (line 279-283) so they no longer claim the fields are immutable. Replace "No longer mutated by ♣ supports — supports are gone" with "Mutated only by `upgradeTower` (issue #67); supports are gone." and "Seeded from the type's tower table at build. Never changed after — supports are gone." with "Seeded from the type's tower table at build; raised by `upgradeTower` (issue #67) and nothing else."

- [ ] **Step 2: Seed the fields everywhere a Tower is constructed**

`src/game/cardPlays.ts` (`newTower`, after `kills: 0,` at line 40):
```ts
    kills: 0,
    upgradesSpent: 0,
    fireIntervalBaseMs: def.fireIntervalMs,
```

`src/game/fixtures.ts` (`towersAt`, after `kills: 0,` at line 130):
```ts
        kills: 0,
        upgradesSpent: 0,
        fireIntervalBaseMs: 600,
```
(The literal's `fireIntervalMs: 600` is its base here.)

`src/game/tick.test.ts` (the literal `Tower` at line 538, after `kills: 0,`):
```ts
      kills: 0,
      upgradesSpent: 0,
      fireIntervalBaseMs: vertical.fireIntervalMs,
```

`src/scene/boardClick.test.ts` (the `towerAt` helper, after `kills: 0,` at line 19):
```ts
    kills: 0,
    upgradesSpent: 0,
    fireIntervalBaseMs: 600,
```

`src/scene/towerDiff.test.ts` (the `tower` helper, after `kills: 0,` at line 20):
```ts
    kills: 0,
    upgradesSpent: 0,
    fireIntervalBaseMs: towerType('vertical').fireIntervalMs,
```

`src/scene/firePulse.test.ts` (the `tower` helper, after `kills: 0,` at line 45):
```ts
    kills: 0,
    upgradesSpent: 0,
    fireIntervalBaseMs: 600,
```

- [ ] **Step 3: Run typecheck, the suite, and lint**

Run: `pnpm typecheck && pnpm test:run && pnpm lint`
Expected: all pass. The new fields compile everywhere; no behaviour changes yet, so the suite is unchanged green.

- [ ] **Step 4: Commit**

```bash
git add src/game/types.ts src/game/cardPlays.ts src/game/fixtures.ts src/game/tick.test.ts src/scene/boardClick.test.ts src/scene/towerDiff.test.ts src/scene/firePulse.test.ts
git commit -m "feat(engine): Tower upgradesSpent and fireIntervalBaseMs fields (#67)"
```

---
## Task 3: The `upgradeTower` Command and its `step` handler

The player action: spend one pending upgrade on one stat. Valid any time except terminal phases — mid-round and in the gap alike, like the face-card actions, because a Tower earns kills mid-round and the heal must be spendable when it matters.

**Files:**
- Modify: `src/game/types.ts` (the `Command` union)
- Modify: `src/game/upgrades.ts` (add the handler)
- Modify: `src/game/step.ts` (import + switch case)
- Test: `src/game/upgrades.test.ts`

**Interfaces:**
- Consumes: `pendingUpgrades` from `./upgrades` (Task 1); `Tower.upgradesSpent` and `Tower.fireIntervalBaseMs` (Task 2); `isTerminal` from `./phase`; `withTower`, `firstTower` from `./fixtures`; `step` from `./step`; `towerType` from `../data/towerTypes`.
- Produces:
  - `type UpgradeStat = 'damage' | 'fireRate' | 'health'` in `src/game/types.ts`.
  - Command variant `{ kind: 'upgradeTower'; towerId: string; stat: UpgradeStat }`.
  - `upgradeTower(state: GameState, towerId: string, stat: UpgradeStat): GameState` in `src/game/upgrades.ts`, exported and wired into `step`'s switch.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/upgrades.test.ts`. Extend the imports at the top:

```ts
import { towerType } from '../data/towerTypes'
import { firstTower, withTower } from './fixtures'
import { step } from './step'
import type { GameState } from './types'
```

Add at the bottom:

```ts
describe('upgradeTower', () => {
  /** A live Tower with a chosen kill count. */
  function towerWithKills(state: GameState, kills: number): GameState {
    return {
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, kills })),
    }
  }

  function damageOf(state: GameState): number {
    return firstTower(state).damage
  }

  it('spends one upgrade on +1 damage', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)

    const after = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    expect(damageOf(after)).toBe(vertical.damage + 1)
    expect(firstTower(after).upgradesSpent).toBe(1)
  })

  it('spends one upgrade on 10% faster firing, additive off the base interval', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 12)

    const once = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })
    const twice = step(once, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })

    expect(firstTower(once).fireIntervalMs).toBe(
      vertical.fireIntervalMs - 0.1 * vertical.fireIntervalMs,
    )
    // Second pick still subtracts 10% of BASE — 450 -> 400 — not 10% of 450.
    expect(firstTower(twice).fireIntervalMs).toBe(
      vertical.fireIntervalMs - 0.2 * vertical.fireIntervalMs,
    )
  })

  it('spends one upgrade on +10% health, healing by exactly the increase', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)
    const damaged = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, health: 10 })),
    }

    const after = step(damaged, { kind: 'upgradeTower', towerId: firstTower(damaged).id, stat: 'health' })

    const tower = firstTower(after)
    // Old max was vertical.maxHealth; both fields gain 10% of the OLD max.
    expect(tower.maxHealth).toBe(vertical.maxHealth + 0.1 * vertical.maxHealth)
    expect(tower.health).toBe(10 + 0.1 * vertical.maxHealth)
    expect(tower.upgradesSpent).toBe(1)
  })

  it('refuses when no upgrade is pending', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 9)

    const after = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    expect(after).toBe(base)
  })

  it('refuses after the pending balance is spent', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)
    const spent = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    const refused = step(spent, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'health' })

    expect(refused).toBe(spent)
  })

  it('refuses for a missing Tower', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)

    const after = step(base, { kind: 'upgradeTower', towerId: 'nope', stat: 'damage' })

    expect(after).toBe(base)
  })

  it('refuses for the Wall, which can never earn an upgrade', () => {
    // Defense in depth: a Wall's kills can only ever be 0 through the engine,
    // but the refusal must be explicit so a hand-built state cannot slip one.
    const base = towerWithKills(withTower('wall', { file: 3, rank: 3 }), 10)

    const after = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'health' })

    expect(after).toBe(base)
  })

  it('is valid mid-round and in the gap', () => {
    const midRound = { ...towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10), phase: 'inProgress' }
    const after = step(midRound, { kind: 'upgradeTower', towerId: firstTower(midRound).id, stat: 'damage' })

    expect(damageOf(after)).toBeGreaterThan(damageOf(midRound))
  })

  it('is refused in a terminal phase', () => {
    const defeated = { ...towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10), phase: 'defeated' }

    const after = step(defeated, { kind: 'upgradeTower', towerId: firstTower(defeated).id, stat: 'damage' })

    expect(after).toBe(defeated)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — `'upgradeTower'` is not a known Command kind, so `step` has no case and the typecheck fails.

- [ ] **Step 3: Add the Command variant**

In `src/game/types.ts`, at the top of the `Command` union's surrounding type scope (before `export type Command =`), add the stat type, then add the variant after the `clearPieces` variant (line 536):

```ts
/** The three upgrade options a Tower can spend one pending upgrade on. */
export type UpgradeStat = 'damage' | 'fireRate' | 'health'
```

```ts
  | {
      /**
       * Spend one pending upgrade on a Tower stat.
       *
       * Valid any time except terminal phases — mid-round and in the gap
       * alike, because a Tower earns kills mid-round and the heal must be
       * spendable when it matters. Requires `pendingUpgrades(tower.kills,
       * tower.upgradesSpent) > 0`, so the Wall (which never kills) is refused
       * by construction.
       */
      readonly kind: 'upgradeTower'
      readonly towerId: string
      readonly stat: UpgradeStat
    }
```

- [ ] **Step 4: Implement the handler**

In `src/game/upgrades.ts`, extend the imports and add the handler:

```ts
import { isTerminal } from './phase'
import type { GameState, Tower, UpgradeStat } from './types'
```

```ts
/**
 * Spends one pending upgrade on a Tower stat.
 *
 * Refuses (returns the state unchanged) on a terminal phase, a missing Tower,
 * the Wall — which can never earn an upgrade, checked explicitly so a
 * hand-built test state cannot slip one through — or an empty pending balance.
 *
 * The three spends:
 * - `damage`: +1, flat and stackable.
 * - `fireRate`: `fireIntervalMs - 0.1 * fireIntervalBaseMs`, additive off the
 *   base so every pick is a true 10% of the type's original interval.
 * - `health`: +10% of the CURRENT maxHealth added to BOTH maxHealth and
 *   health, so the heal is exactly the ceiling's rise (10/14 -> 15.4/11.4),
 *   never more and never less.
 *
 * Every spend increments `upgradesSpent`, so the next `pendingUpgrades` call
 * sees one fewer upgrade banked.
 */
export function upgradeTower(state: GameState, towerId: string, stat: UpgradeStat): GameState {
  if (isTerminal(state.phase)) return state

  const tower = state.towers.find((candidate) => candidate.id === towerId)
  if (!tower) return state
  if (tower.type === 'wall') return state
  if (pendingUpgrades(tower.kills, tower.upgradesSpent) < 1) return state

  return {
    ...state,
    towers: state.towers.map((candidate) =>
      candidate.id === towerId ? applyUpgrade(candidate, stat) : candidate,
    ),
  }
}

/** The stat change for one spend, on the old Tower's values. */
function applyUpgrade(tower: Tower, stat: UpgradeStat): Tower {
  const spent = { ...tower, upgradesSpent: tower.upgradesSpent + 1 }
  switch (stat) {
    case 'damage':
      return { ...spent, damage: tower.damage + 1 }
    case 'fireRate':
      return { ...spent, fireIntervalMs: tower.fireIntervalMs - 0.1 * tower.fireIntervalBaseMs }
    case 'health': {
      const gained = 0.1 * tower.maxHealth
      return { ...spent, maxHealth: tower.maxHealth + gained, health: tower.health + gained }
    }
  }
}
```

- [ ] **Step 5: Wire the handler into `step`**

In `src/game/step.ts`, add `upgradeTower` to the `./upgrades` import and a case to the switch. The import line (near the other `./cardPlays` imports):

```ts
import { upgradeTower } from './upgrades'
```

The switch case, after `case 'clearPieces'`:

```ts
    case 'upgradeTower':
      return upgradeTower(state, command.towerId, command.stat)
```

- [ ] **Step 6: Run the tests, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass, including the nine new `upgradeTower` tests. The exhaustiveness-protected switch compiled only because the case now exists.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/upgrades.ts src/game/step.ts src/game/upgrades.test.ts
git commit -m "feat(engine): upgradeTower command spends pending upgrades (#67)"
```

---
## Task 4: Publish `pendingUpgrades` and pin the structuralKey change

The renderer and panel need `pendingUpgrades` on the engine's public surface, and a regression test that a spend republishes React.

**Files:**
- Modify: `src/game/index.ts`
- Test: `src/state/structuralKey.test.ts`

**Interfaces:**
- Consumes: `pendingUpgrades` from `./upgrades` (Task 1); `firstTower`, `withTower` from `../game/fixtures`; `step` from `../game`.
- Produces: `pendingUpgrades` exported from `src/game/index.ts` so `src/scene/` and `src/ui/` can import it through the public surface (the boundary rule: renderer imports from `../game` only).

- [ ] **Step 1: Export `pendingUpgrades`**

In `src/game/index.ts`, add to the `export { ... } from` block:

```ts
export { pendingUpgrades } from './upgrades'
```

(`upgradeThreshold` and `thresholdsCleared` stay internal — tests import them from `./upgrades` directly, and no renderer code reads them.)

- [ ] **Step 2: Write the structuralKey test**

In `src/state/structuralKey.test.ts`, extend the fixtures import (line 4) to include `firstTower`:

```ts
import { firstTower, standardCard, withDeck, withTower } from '../game/fixtures'
```

Add inside `describe('structuralKey', ...)`, after the maxHealth test:

```ts
  it('changes when an upgrade is spent, since the spend mutates keyed stats', () => {
    // A spend writes `damage`, `fireIntervalMs`, `maxHealth` or `health`, all
    // keyed — so the panel republishes on the spend itself, and the pending
    // balance (derived from `kills` and `upgradesSpent`, neither keyed) is
    // recomputed on the same publish.
    const base = withTower('vertical', { file: 2, rank: 2 })
    const withKills = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, kills: 10 })),
    }

    const upgraded = step(withKills, {
      kind: 'upgradeTower',
      towerId: firstTower(withKills).id,
      stat: 'damage',
    })

    expect(upgraded).not.toBe(withKills)
    expect(structuralKey(upgraded)).not.toBe(structuralKey(withKills))
  })
```

- [ ] **Step 3: Run the suite, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/index.ts src/state/structuralKey.test.ts
git commit -m "feat(engine): export pendingUpgrades, pin upgrade spend key change (#67)"
```

---
## Task 5: The scene helper and the golden ring

The in-scene signal: a small pulsing golden ring above every Tower with banked, unspent upgrades. The "is this Tower ready" decision lives in a pure module beside the component so it is testable.

**Files:**
- Create: `src/scene/upgradeReady.ts`
- Test: `src/scene/upgradeReady.test.ts`
- Create: `src/scene/UpgradeReady.tsx`
- Modify: `src/scene/GameScene.tsx`

**Interfaces:**
- Consumes: `pendingUpgrades`, `Tower` from `../game` (Task 4 exports `pendingUpgrades`); `useGameStore` from `../state/store`; `fileToWorldX`, `rankToWorldZ` from `./coords`; `BoardSpec` from `../game`.
- Produces:
  - `isUpgradeReady(tower: Tower): boolean` in `src/scene/upgradeReady.ts`.
  - `<UpgradeReady board={board} />` rendering one pulsing golden ring per ready Tower.

- [ ] **Step 1: Write the failing test**

Create `src/scene/upgradeReady.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { towerType } from '../data/towerTypes'
import type { Tower } from '../game'
import { isUpgradeReady } from './upgradeReady'

function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower-1',
    square: { file: 3, rank: 3 },
    type: 'vertical',
    range: towerType('vertical').range,
    fireCooldownMs: 0,
    health: 14,
    maxHealth: 14,
    damage: 2,
    fireIntervalMs: 500,
    fireIntervalBaseMs: 500,
    shield: 0,
    damageTaken: 0,
    shotsFired: 0,
    kills: 0,
    upgradesSpent: 0,
    ...overrides,
  }
}

describe('isUpgradeReady', () => {
  it('is false at zero kills', () => {
    expect(isUpgradeReady(tower())).toBe(false)
  })

  it('is true once the first threshold clears', () => {
    expect(isUpgradeReady(tower({ kills: 10 }))).toBe(true)
  })

  it('is false once the pending balance is spent', () => {
    expect(isUpgradeReady(tower({ kills: 10, upgradesSpent: 1 }))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run`
Expected: FAIL — `./upgradeReady` does not exist.

- [ ] **Step 3: Implement the pure helper**

Create `src/scene/upgradeReady.ts`:

```ts
import { pendingUpgrades, type Tower } from '../game'

/**
 * Whether a Tower has banked, unspent upgrades — the "ready to upgrade"
 * signal issue #67 asks the scene to draw.
 *
 * Kept out of the component so the decision is testable: the `.tsx` filters
 * with this predicate and is pure plumbing.
 */
export function isUpgradeReady(tower: Tower): boolean {
  return pendingUpgrades(tower.kills, tower.upgradesSpent) > 0
}
```

- [ ] **Step 4: Implement the scene component**

Create `src/scene/UpgradeReady.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MeshStandardMaterial, TorusGeometry, type Mesh } from 'three'
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { isUpgradeReady } from './upgradeReady'

/**
 * A small pulsing golden ring above every Tower with banked, unspent upgrades.
 *
 * The set of ready Towers is small and changes only on a kill or a spend —
 * both rare publishes — so one mesh per ready Tower is fine, and a Tower
 * becoming ready mounts nothing expensive because the geometry and material
 * are shared above the map. The ring is oriented flat (`rotation-x`), its
 * position is the Tower's square, and it sits just clear of the tallest
 * Tower body.
 */
const RING_Y = 1.35
const RING_RADIUS = 0.4

export function UpgradeReady({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)
  const rings = useRef(new Map<string, Mesh>())

  const geometry = useMemo(() => new TorusGeometry(RING_RADIUS, 0.035, 8, 24), [])
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#ffd700', emissive: '#ffd700', emissiveIntensity: 1.4 }),
    [],
  )

  // The pulse is per-frame but ref-only: mutating each ring's scale and
  // rotation directly, never through React state. The clock is the elapsed
  // scene time, so the pulse is refresh-rate independent.
  useFrame(({ clock }) => {
    const phase = clock.getElapsedTime()
    for (const mesh of rings.current.values()) {
      const pulse = (Math.sin(phase * Math.PI * 4) + 1) / 2
      mesh.scale.setScalar(0.85 + pulse * 0.3)
      mesh.rotation.y = phase
    }
  })

  return (
    <>
      {towers.filter(isUpgradeReady).map((tower) => (
        <mesh
          key={tower.id}
          ref={(node) => {
            if (node) rings.current.set(tower.id, node)
            else rings.current.delete(tower.id)
          }}
          geometry={geometry}
          material={material}
          rotation-x={Math.PI / 2}
          position={[
            fileToWorldX(board, tower.square.file),
            RING_Y,
            rankToWorldZ(board, tower.square.rank),
          ]}
        />
      ))}
    </>
  )
}
```

- [ ] **Step 5: Mount it in the scene**

In `src/scene/GameScene.tsx`, add the import and render it next to `<Towers board={board} />` (line 151):

```ts
import { UpgradeReady } from './UpgradeReady'
```

```tsx
      <Towers board={board} />
      <UpgradeReady board={board} />
```

- [ ] **Step 6: Run the suite, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass, including the three `isUpgradeReady` tests.

- [ ] **Step 7: Commit**

```bash
git add src/scene/upgradeReady.ts src/scene/upgradeReady.test.ts src/scene/UpgradeReady.tsx src/scene/GameScene.tsx
git commit -m "feat(scene): golden ring on Towers with pending upgrades (#67)"
```

---
## Task 6: The Tower panel upgrade section

The choice surface: when a selected Tower has pending upgrades, the panel shows how many and three buttons that spend one. The Wall never shows the section because its pending is always 0.

**Files:**
- Modify: `src/ui/TowerPanel.tsx`
- Modify: `src/index.css` (small addition in the towerPanel block)

**Interfaces:**
- Consumes: `pendingUpgrades` from `../game` (Task 4); `dispatch` from `../state/store`; `tower.kills`, `tower.upgradesSpent` (Task 2).
- Produces: an "Upgrades ready: N" line plus three `.hud__button`-styled buttons dispatching `{ kind: 'upgradeTower', towerId, stat }`.

- [ ] **Step 1: Add the imports**

In `src/ui/TowerPanel.tsx`, add to the existing imports:

```tsx
import { pendingUpgrades } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { dispatch } from '../state/store'
```

(Merge with the existing `useGameStore` / `useUiStore` imports — keep `dispatch` from `../state/store`, matching `HandPanel.tsx`.)

- [ ] **Step 2: Compute the pending balance and render the section**

In the component body, after `const def = towerType(tower.type)` (line 33), add:

```tsx
  const pending = pendingUpgrades(tower.kills, tower.upgradesSpent)
```

After the `</dl>` closing the `hud__stats` block (after line 78), add:

```tsx
      {pending > 0 && (
        <div className="towerPanel__upgrades">
          <p className="hud__muted">Upgrades ready: {pending}</p>
          <div className="towerPanel__upgradeButtons">
            <button
              type="button"
              className="hud__button"
              onClick={() => dispatch({ kind: 'upgradeTower', towerId: tower.id, stat: 'damage' })}
            >
              +1 damage
            </button>
            <button
              type="button"
              className="hud__button"
              onClick={() => dispatch({ kind: 'upgradeTower', towerId: tower.id, stat: 'fireRate' })}
            >
              Faster firing
            </button>
            <button
              type="button"
              className="hud__button"
              onClick={() => dispatch({ kind: 'upgradeTower', towerId: tower.id, stat: 'health' })}
            >
              +10% health
            </button>
          </div>
        </div>
      )}
```

The `pending > 0` gate both hides the section for the Wall (pending always 0) and hides it once the last pending upgrade is spent — the buttons never need their own disabled state, because the section disappears with the last banked upgrade.

- [ ] **Step 3: Add the small CSS block**

In `src/index.css`, after the `.towerPanel__geometry` rule (line 549), add:

```css
.towerPanel__upgrades {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.towerPanel__upgradeButtons {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 4: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: pass. There is no jsdom, so the panel itself is untested by design; the pending derivation it calls is already covered in `src/game/upgrades.test.ts`.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test:run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TowerPanel.tsx src/index.css
git commit -m "feat(ui): Tower panel upgrade choices (#67)"
```

---
## Task 7: Design-doc and CLAUDE.md amendments

The health upgrade heals, which breaks the "health only ever goes down" claim. Amend the two spots in the design doc and the matching invariant in CLAUDE.md so the docs stop contradicting the engine.

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Qualify the countdown claim in the design doc — Towers section**

In `docs/design/game-design.md`, line 344 currently reads:

> **Towers are destructible.** They have health, take damage from Pieces, and can be shielded by a Jack. A shield absorbs before health and never regenerates. Nothing repairs a Tower — a hand-built Tower's health only ever goes down, which is what makes every grind a countdown.

Replace the last sentence with:

> Nothing repairs a Tower except a **health upgrade** the player spends from a Tower's experience upgrades (see below) — and even that heal is a finite, kill-gated, player-controlled act, so a hand-built Tower's health otherwise only ever goes down, which is what makes every grind a countdown.

- [ ] **Step 2: Qualify the Staging-rank standoff claim**

Line 362 currently reads:

> ...Three things end that standoff: the Tower falling — a Tower's health only ever decreases, so the grind is always a countdown — a **Joker's Clear**, ...

Replace the parenthetical with:

> the Tower falling — a Tower's health decreases except when the player spends a health upgrade, and that banked heal is finite and kill-gated, so the grind is still a countdown —

- [ ] **Step 3: Add an experience-upgrades paragraph to the Towers section**

In `docs/design/game-design.md`, after the "Reading a Tower's coverage" subsection (after line 378), add a new subsection:

```markdown
### Experience upgrades

**Towers earn upgrades from kills.** A Tower's lifetime kills are its experience:
every `UPGRADE_FIRST_THRESHOLD` kills (10), and each further threshold escalated by
20% (ceiled — 10, 12, 15, 18, 22, ...), it banks one **pending upgrade**. Pending
is derived from kills, never stored; the only bookkeeping is how many have been
spent.

**The player spends pending upgrades any time** — mid-round and in the gap alike,
because kills happen mid-round and the heal must be spendable when it matters.
Three choices, each a deliberate axis: **+1 damage**, **−10% fire interval off the
type's base** (additive, so every pick is a true 10% of the original interval),
and **+10% max health**, which raises the ceiling and heals by exactly the
increase — never to full, never more than the ceiling rises. Upgrades stack
uncapped for now.

**A ready Tower glows.** A small golden ring floats above any Tower with a
banked, unspent upgrade — the only in-scene signal; the choice itself lives in
the Tower's inspect panel.

**The Wall is excluded by construction.** It never fires, so it never kills, so
it can never earn an upgrade. The mechanic does not apply to it.
```

- [ ] **Step 4: Qualify the CLAUDE.md invariant**

In `CLAUDE.md`, line 124 currently reads:

> That terminates because nothing can make the Tower last longer: there is no repair, so a Tower's health only ever decreases, and a grind is always a countdown — the Wall falls and the round resumes.

Replace with:

> That terminates because nothing can make the Tower last longer: there is no repair — a Tower's health only ever decreases except when the player spends a health upgrade, a finite banked reward that itself required kills, so a grind is still always a countdown — the Wall falls and the round resumes.

- [ ] **Step 5: Verify the edits and commit**

Run: `git diff --stat`
Expected: only `docs/design/game-design.md` and `CLAUDE.md` changed. No code, so no tests needed.

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "docs: qualify tower health countdown for experience upgrades (#67)"
```
