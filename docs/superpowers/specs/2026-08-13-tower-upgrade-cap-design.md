# Tower Upgrade Cap — Design

Date: 2026-08-13
Issue: #59 — "tower upgrade limit"

## What exists

Towers earn experience upgrades from kills (issue #67). Each crossed threshold
(10, 22, 27, 33, 40, ...) banks one pending upgrade; the player spends pending
upgrades any time on one of three stats: **+1 damage**, **−10% fire interval off
the type's base**, or **+10% max health**. Pending is derived, never stored:
`pendingUpgrades(kills, upgradesSpent) = thresholdsCleared(kills) − upgradesSpent`,
clamped at 0. The only bookkeeping is the monotonic `upgradesSpent` counter.

The escalation makes each upgrade progressively more expensive, but it is not a
bound: in free play a tower keeps earning kills and can be upgraded without
limit, so a long-lived tower still compounds into an overpowered build.

## Decisions

- **A hard cap on total spends per tower: 10.** A tower stops upgrading entirely
  once it has spent 10 upgrades, regardless of which stats they went into. This
  is a cap on `upgradesSpent`, not per stat — the issue's "5 each" was written
  before the three-axis system settled; 10 total is the same budget, spent how
  the player likes.
- **Uniform across tower types.** One number for every type. Upgrades apply to
  each shot or hit, so a splash/ring/tollgate tower multiplies a +1 damage
  across many targets while a vertical applies it to one — a per-type cap would
  be tighter for the wide towers, but that is tuning for later, not the shape.
  Keep the single constant.
- **The cap is on spends, so a capped tower keeps killing.** Kills still cross
  thresholds and bank pending upgrades, but pending is clamped out of the UI
  once the cap is reached. Nothing about the kill economy changes.
- **Clamp the derived counter, refuse in the engine.** `pendingUpgrades` clamps
  to `MAX_UPGRADES_PER_TOWER − upgradesSpent` (floored at 0), and `upgradeTower`
  refuses when `upgradesSpent >= MAX_UPGRADES_PER_TOWER`. Because the glow and
  the panel both read `pendingUpgrades`, the clamp alone hides the ready-glow
  and the upgrade buttons at cap — one source of truth, no new stored state.
- **At cap the panel says "Upgrades maxed".** The upgrade section already shows
  only when pending > 0, so the buttons disappear on their own; the panel adds a
  line explaining the buttons are gone. The tower stops glowing.
- **The fire-rate 0-interval safety stays.** A spend that would drive
  `fireIntervalMs` to 0 or below is refused today and stays refused. It
  interacts with the cap naturally: a `vertical` (500ms base, −50ms per pick)
  can spend at most 9 picks on fire rate before the 10th would hit 0, so its
  last upgrade goes to damage or health. No change to that rule.
- **Design-doc amendment.** "Upgrades stack uncapped for now" becomes the cap,
  and the maxed-panel/glow behavior is recorded.

## Engine changes

### `src/data/towerTypes.ts`

Add beside the threshold constants:

```ts
/** Hard cap on total upgrades a single Tower can spend (issue #59). */
export const MAX_UPGRADES_PER_TOWER = 10
```

### `src/game/upgrades.ts`

- `pendingUpgrades(kills, upgradesSpent)` clamps to
  `Math.min(MAX_UPGRADES_PER_TOWER - upgradesSpent,
  Math.max(0, thresholdsCleared(kills) - upgradesSpent))`. A tower at 9 spent
  with 5 banked reports 1; a capped tower reports 0. The function's doc comment
  gains the cap.
- `upgradeTower` gains a refusal: when `tower.upgradesSpent >=
  MAX_UPGRADES_PER_TOWER`, return the state unchanged, before the pending check.
  All existing refusals (terminal phase, missing tower, Wall, no pending,
  fire-rate-to-zero) are unchanged.

### `src/game/upgrades.ts` exports

`MAX_UPGRADES_PER_TOWER` is not re-exported through `src/game/index.ts`; the
engine reads it from `src/data/towerTypes.ts` directly, matching the threshold
constants. The panel reads it from the same data module.

## Panel changes

`src/ui/TowerPanel.tsx`:

- The upgrade section stays gated on `pending > 0` — with the clamp it is empty
  at cap with no extra logic.
- When `tower.upgradesSpent >= MAX_UPGRADES_PER_TOWER`, render an "Upgrades
  maxed" line in place of the section (same `hud__muted` styling as "Upgrades
  ready: N").
- The comparison is a one-liner, so it lives in the `.tsx` rather than a pure
  helper — TowerPanel is excluded from coverage, and there is no branching worth
  testing here.

## Scene changes

None. `src/scene/upgradeReady.ts` returns `pendingUpgrades(tower.kills,
tower.upgradesSpent) > 0`, and the clamped counter is 0 at cap, so a capped
tower stops glowing even while its kills keep crossing thresholds.

## Design-doc amendments

`docs/design/game-design.md` line 395: "Upgrades stack uncapped for now" becomes
a hard cap of 10 total spends per Tower (uniform across types), with the maxed
panel state and clamped glow recorded. The "Open questions" table needs no new
row — capping upgrade stacks is now closed; "Capping Queen range stacks" remains
the separate, still-open question.

## Testing

Engine suites only — no jsdom, no `.tsx` tests:

- **`src/game/upgrades.test.ts`** — the 11th spend is refused for each stat and
  `upgradesSpent` stays at 10; a capped tower keeps `pendingUpgrades` at 0
  despite kills past further thresholds; over-bank clamps to the remaining room
  (9 spent, 5 banked → 1); the fire-rate-to-zero refusal still fires under the
  cap.
- **`src/scene/upgradeReady.test.ts`** — no glow at cap despite banked kills.
- **Existing suites** — stay green. `structuralKey` is untouched: a capped
  tower's spends stop changing the keyed stats because no spends happen, and the
  counter itself is deliberately unkeyed.
