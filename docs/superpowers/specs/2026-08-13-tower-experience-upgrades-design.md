# Tower Experience Upgrades — Design

Date: 2026-08-13
Issue: #67 — "change tower upgrading to be 'experience' based"

## What exists

Towers already carry a lifetime `kills` counter on the instance (`src/game/types.ts`), incremented in `fireTowers` for the finishing blow. Tower instance stats — `damage`, `fireIntervalMs`, `maxHealth`, `health` — are seeded from the type table at build and currently never change after (supports are gone). `structuralKey` keys `damage`, `fireIntervalMs`, `maxHealth`, and `health`, so any mutation of them republishes to React for free.

## Decisions

- **Kills are the only XP source**, and the Wall is excluded outright: it never fires, never kills, so it can never earn an upgrade. No separate upgrade set for it — the mechanic simply does not apply.
- **Thresholds escalate.** The first upgrade banks at 10 kills; each next threshold is `ceil(previous * 1.2)`: 10, 12, 15, 18, 22, … The first threshold (10) and escalation factor (1.2) are tuning data in `src/data/towerTypes.ts`.
- **Pending is derived, never stored.** `pendingUpgrades(tower) = thresholdsCleared(tower.kills) - tower.upgradesSpent`. A single new field, `upgradesSpent` (monotonic), is enough — there is no XP counter and no drain bookkeeping. A tower that never fires stays at pending 0 by construction.
- **The player chooses, any time.** `upgradeTower` is a Command valid mid-round and in the gap alike — not one of the gap-only exceptions. Pending upgrades bank across rounds; nothing clears them except spending.
- **Banked upgrades are uncapped** for now — a tower that lives long enough can be upgraded without bound, mirroring the currently-uncapped Queen/King/Ace stacks. Capping is a future change.
- **Health upgrade heals by exactly the increase.** +10% health adds `0.1 * maxHealth` (old max) to both `maxHealth` and `health`: a tower at 10/14 picks health and becomes 15.4/11.4. Never heals to full, never heals more than the ceiling rises.
- **Fire rate is additive off base.** Each pick subtracts `0.1 * fireIntervalBaseMs`, where `fireIntervalBaseMs` is a new instance field seeded from the type table at build and never changed — necessary because once `fireIntervalMs` is mutated, the base cannot be recovered from it.
- **Damage upgrade is +1 flat**, stackable.
- **Golden particle is the only in-scene signal.** A small pulsing golden effect on any Tower with pending upgrades, derived from state so it appears and disappears on the same publishes a kill or spend already triggers. The choice itself lives in the inspect panel — no floating prompt, no second overlay.
- **Design-doc amendment.** The "Towers only ever lose health / grind is always a countdown" claims are qualified: a Tower's health decreases except when the player spends a health upgrade. Round termination is unaffected — healing requires a player action spending a finite banked upgrade that itself required kills, so a grind cannot extend forever from nothing.

## Engine changes

### `src/game/types.ts`

Add to `Tower`:

```ts
/**
 * Lifetime count of upgrades the player has spent on this Tower.
 *
 * Monotonic and never reset. The source of XP is `kills`; pending upgrades
 * are derived as `thresholdsCleared(kills) - upgradesSpent`, never stored.
 * Kept out of `structuralKey` because a spend mutates `damage`,
 * `fireIntervalMs`, `maxHealth`, and/or `health`, which are already keyed.
 */
readonly upgradesSpent: number
/**
 * The Tower's fire interval from the type table at build. Never changed.
 *
 * Split from `fireIntervalMs` because the fire-rate upgrade is additive off
 * base: each pick subtracts `0.1 * fireIntervalBaseMs`, so once the live
 * interval is mutated the base can no longer be recovered from it.
 */
readonly fireIntervalBaseMs: number
```

Rewrite the "never changed after — supports are gone" doc comments on `damage`, `fireIntervalMs`, and `maxHealth`: they are now mutated by `upgradeTower` (and nothing else).

### `src/data/towerTypes.ts`

Add tuning constants, e.g.:

```ts
export const UPGRADE_FIRST_THRESHOLD = 10
export const UPGRADE_THRESHOLD_ESCALATION = 1.2
```

Placeholder numbers like the rest of the tower table; the shape is the design.

### New pure module `src/game/upgrades.ts`

```ts
/** Threshold at which the nth upgrade banks. thresholdsCleared uses this. */
export function upgradeThreshold(n: number): number

/** How many upgrade thresholds a kill count clears. */
export function thresholdsCleared(kills: number): number

/** How many upgrades are banked but unspent. */
export function pendingUpgrades(kills: number, upgradesSpent: number): number
```

`upgradeThreshold(1) = 10`, `upgradeThreshold(2) = ceil(10 * 1.2) = 12`, `upgradeThreshold(3) = 15`, etc. `thresholdsCleared` counts how many of those the kill count reaches. `pendingUpgrades` clamps at 0 (spent never exceeds cleared).

### `src/game/types.ts` — the Command

```ts
| { readonly kind: 'upgradeTower'; readonly towerId: string; readonly stat: 'damage' | 'fireRate' | 'health' }
```

`step` validates: the Tower exists, `pendingUpgrades > 0`, and the Tower is not the Wall (defense in depth — a Wall never has pending, but the refusal is explicit). On success it spends one upgrade and returns a new Tower:

- **damage**: `damage + 1`
- **fireRate**: `fireIntervalMs - 0.1 * fireIntervalBaseMs`
- **health**: `maxHealth + 0.1 * maxHealth`, `health + 0.1 * maxHealth` — both read the *old* max.

and `upgradesSpent + 1`. A refusal returns the same `GameState` object (identity check, matching every other Command).

### `src/game/fixtures.ts`

Seed `upgradesSpent: 0` and `fireIntervalBaseMs` (from the type table) in Tower creation and the test helper.

### `structuralKey`

No change. A spend mutates `damage`, `fireIntervalMs`, `maxHealth`, and/or `health`, all already keyed — the panel and particle republish for free.

## Panel changes

`src/ui/TowerPanel.tsx` — an upgrade section shown only when `pendingUpgrades > 0`:

- A line reporting how many upgrades are ready (e.g. "Upgrades ready: 2").
- Three buttons: **+1 damage**, **Faster firing (−10%)**, **+10% health**, each dispatching `{ kind: 'upgradeTower', towerId, stat }` through `dispatch` from `src/state/simulation.ts`.
- Buttons disable as the pending count reaches 0.
- The Wall shows no section (its pending is always 0).

The pending count and the "does this Tower have a pending upgrade" decision live in the pure `src/game/upgrades.ts` module, so the `.tsx` stays plumbing.

## Scene changes

New `src/scene/UpgradeReady.tsx` renders a small pulsing golden ring/burst above any Tower with pending upgrades, plus a pure helper `src/scene/upgradeReady.ts` deciding the branch. Drawn per the R3F discipline: toggled `visible` rather than conditionally mounted, shared geometry/material via `useMemo`, no per-frame allocation. It reads the snapshot's `towers` for `kills`/`upgradesSpent` and derives pending through `src/game/upgrades.ts`.

## Design-doc amendments

`docs/design/game-design.md` lines 344 and 362 claim a Tower's health only ever goes down and that this is what makes every grind a countdown. Both get qualified: *except when the player spends a health upgrade — a finite, player-controlled banked upgrade that itself required kills*. The round-termination argument survives: nothing time-based or automatic heals a Tower, so a grind still cannot self-extend.

## Testing

Engine suites only — no jsdom, no `.tsx` tests:

- **`src/game/upgrades.ts`** — `upgradeThreshold` cadence (10, 12, 15, 18, 22, …), `thresholdsCleared` at/around boundaries, `pendingUpgrades` accounting, clamp at 0.
- **`upgradeTower` in `step`** — each stat mutates correctly (health 10/14 → 15.4/11.4; fire rate subtracts from the stored base, not the live interval), a second pick compounds correctly (14 → 15.4 vs base 14 → 12.6), refusal on no pending / missing Tower / Wall, valid mid-round and in the gap, spending a second time at pending 0 refused.
- **`structuralKey`** — a spend changes the key (it already keys the mutated stats).
- **`src/scene/upgradeReady.ts`** — pending > 0 decision.
- **Existing suites** — stay green. The Wall's no-kill path means `roundTermination.test.ts` is untouched.
