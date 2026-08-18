# Tower Upgrade Category Breakdown — Design

Date: 2026-08-18
Issue: #79 — "Tower stats view: show upgrades spent and their categories"

## What exists

The Tower inspect panel (`src/ui/TowerPanel.tsx`) shows the current stat values — health, shield, damage taken, pieces defeated, DPS, and a `range · damage · fireIntervalMs · targets` line — and, when the Tower has banked experience, an upgrade section with three spend buttons (`+1 damage`, `Faster firing`, `+10% health`) and a pending count. It reports the upgrade cap indirectly ("Upgrades maxed" at `MAX_UPGRADES_PER_TOWER`, `src/data/towerTypes.ts:99`), but never how many upgrades the player has actually applied, and never where they went.

The engine tracks exactly one upgrade figure per Tower: the monotonic total `upgradesSpent` (`src/game/types.ts:358`). Pending is derived from `kills` and that total (`pendingUpgrades` in `src/game/upgrades.ts`). The spend itself (`applyUpgrade`) mutates the instance `damage` / `fireIntervalMs` / `maxHealth` + `health` fields and bumps `upgradesSpent`.

## Decisions

- **Per-category counts are the bookkeeping.** `Tower.upgradesSpent` is replaced by `upgradeCounts: { damage, fireRate, health }` — three monotonic counters, one per `UpgradeStat`, seeded all-zero at build and bumped by `applyUpgrade` for exactly the stat spent. This re-opens the frozen 2026-08-13 spec's "a single field, `upgradesSpent`, is enough" — a claim that was about pending *accounting*, not *display*; the display needs the category, and the category is exactly the kind of irreducible fact the repo prefers to store.
- **The total is derived, never stored.** `totalUpgrades(counts) = damage + fireRate + health`. `pendingUpgrades(kills, spent)` keeps its number signature; every caller passes the derived total. The cap check (`MAX_UPGRADES_PER_TOWER`), the pending check, and the panel's "X / 10 spent" line all read the same derived total, so they cannot disagree.
- **Stored, not derived from stats.** The alternative — recovering counts from instance values (damage is `live − base`, fireRate is `(base − live) / (0.1 · base)`, health is `log(maxHealth / base) / log(1.1)`) — was rejected: it needs the compounding constants and the 0.1s factored out of `applyUpgrade` so the mutation and the derivation cannot drift, and it relies on float rounding. The counters make the display exact by construction, with no new math in the engine.
- **The `.tsx` stays plumbing.** The panel reads `tower.upgradeCounts` and calls `totalUpgrades`; it computes no derivation of its own. `upgradeReady.ts` swaps `tower.upgradesSpent` for `totalUpgrades(tower.upgradeCounts)`.
- **The summary is always visible.** The "Upgrades: X / 10 spent" line and the per-category breakdown render even at all zeros, including the Wall — a Tower that has spent nothing shows the breakdown without error. It is *not* gated on `pending > 0`, so a Tower that has spent and now has zero pending still reports its investment. Wording follows the issue verbatim: the total line is `Upgrades: {total} / {MAX_UPGRADES_PER_TOWER} spent`, and the breakdown is `{damage} damage · {fireRate} faster firing · {health} health`, `·`-separated to match the panel's existing `range · dmg · ms` line.

## Engine changes

### `src/game/types.ts`

Replace `readonly upgradesSpent: number` with:

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

`UpgradeStat` (`'damage' | 'fireRate' | 'health'`, `src/game/types.ts:544`) is already the switch key of `applyUpgrade`, so the counters' keys line up with the spend paths for free.

### `src/game/upgrades.ts`

Add:

```ts
/** Total upgrades spent, derived as the sum of the per-category counters. */
export function totalUpgrades(counts: Record<UpgradeStat, number>): number {
  return counts.damage + counts.fireRate + counts.health
}
```

`pendingUpgrades(kills, upgradesSpent)` is unchanged in shape — its second parameter is just now always fed `totalUpgrades(tower.upgradeCounts)`.

`upgradeTower`'s refusals:

- `tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER` becomes `totalUpgrades(tower.upgradeCounts) >= MAX_UPGRADES_PER_TOWER`
- `pendingUpgrades(tower.kills, tower.upgradesSpent)` becomes `pendingUpgrades(tower.kills, totalUpgrades(tower.upgradeCounts))`

`applyUpgrade` bumps the matching counter instead of `upgradesSpent`:

```ts
const spent = {
  ...tower,
  upgradeCounts: { ...tower.upgradeCounts, [stat]: tower.upgradeCounts[stat] + 1 },
}
```

The stat mutations themselves are unchanged — the compounding health `0.1 * maxHealth`, the additive `0.1 * fireIntervalBaseMs`, and the flat `+1` damage all stay exactly as they are. No constants are factored out, because the derivation that would need them was rejected.

### `src/game/fixtures.ts`, `src/game/cardPlays.ts`

Seed `upgradeCounts: { damage: 0, fireRate: 0, health: 0 }` in Tower creation and the `tower()` test helper, replacing `upgradesSpent: 0`.

### `structuralKey`

No change. A spend mutates `damage`, `fireIntervalMs`, `maxHealth`, and/or `health`, all already keyed — the panel republishes for free, which the acceptance criterion "no stale figures after the panel has stayed open across rounds" rides on.

## Panel changes

`src/ui/TowerPanel.tsx`:

- `const breakdown = tower.upgradeCounts` and `const total = totalUpgrades(breakdown)`; `const pending = pendingUpgrades(tower.kills, total)`.
- An always-visible summary (regardless of `pending` or `total`):
  - `Upgrades: {total} / {MAX_UPGRADES_PER_TOWER} spent`
  - `{breakdown.damage} damage · {breakdown.fireRate} faster firing · {breakdown.health} health`
- The existing `pending > 0` section ("Upgrades ready: {pending}" + three buttons) and the `total >= MAX_UPGRADES_PER_TOWER` "Upgrades maxed" message stay, keyed off the derived total.

The decision — what the panel says — is split between the pure `totalUpgrades` and the literal counters; the `.tsx` contains no derivation logic.

## Scene changes

`src/scene/upgradeReady.ts`:

```ts
return pendingUpgrades(tower.kills, totalUpgrades(tower.upgradeCounts)) > 0
```

## Design-doc amendment

`docs/design/game-design.md` "Experience upgrades" section: add a sentence that the inspect panel reports the total spent and a per-category breakdown, with per-category counters as the engine's bookkeeping and the total derived.

## Testing

Engine suites only — no jsdom, no `.tsx` tests:

- **`src/game/upgrades.ts`** — `totalUpgrades` sums the counters (all-zero is 0, one non-zero, all three non-zero). `applyUpgrade` increments exactly the spent stat's counter: a fireRate spend leaves `damage` and `health` untouched, a health spend bumps only `health`, and so on across the three stats.
- **`upgradeTower` in `step`** — cap sequencing: the existing 9-spend → 10-spend → refused-at-cap tests move to `totalUpgrades(...)`, and the per-category totals are asserted alongside (e.g. 9 fireRate + 1 health = total 10, refused). Refusals (no pending, missing Tower, Wall) key off the derived total.
- **`structuralKey`** — a spend changes the key (it already keys the mutated stats); no new keying for the counters.
- **`src/scene/upgradeReady.ts`** — pending > 0 decision, fed the derived total.
- **Fixtures** — `tick.test.ts`, `firePulse.test.ts`, `boardClick.test.ts`, `towerDiff.test.ts`, `upgradeReady.test.ts` swap the literal; `structuralKey.test.ts` comment text only.

## Refs

- Design doc: "Experience upgrades" section (`docs/design/game-design.md:380-407`).
- Specs: `2026-08-12-tower-stats-design.md` (issue #58), `2026-08-13-tower-experience-upgrades-design.md` (issue #67), `2026-08-13-tower-upgrade-cap-design.md` (issue #59).