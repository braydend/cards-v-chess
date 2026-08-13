# Vertical Tower Nerf

**Status:** Approved design — implementation follows.
**Date:** 2026-08-13
**Resolves:** issue #71

## Problem

A row of vertical Towers carries the player to round 40+ with no real pressure.
The vertical is the **high-card** Tower — the cheapest in the ladder — so a
back row of them (one per file) covers every file for five ranks at 2 damage
per 500ms. Because Piece health is flat across rounds (see
`2026-08-12-remove-piece-health-scaling-design.md`), that static row never stops
being effective: only spawn density and roster composition ramp.

## Decision

Weaken the vertical Tower by **increasing its fire interval**, keeping the other
axes (range, damage, health, geometry) as they are. This is a DPS reduction, not
a coverage reduction — a row still sees the whole board, it just kills slower.

The change is one authored number in the balance table:

```
vertical: fireIntervalMs 500 → 700
```

This drops the vertical's DPS from 4.0 to ~2.86 per file column. The tower keeps
its identity as the budget high-card starter; the ladder order (rarer hand →
stronger Tower) is untouched.

### Why fire interval, not range or damage

- **Range** is the coverage axis — cutting it shrinks how deep a row reaches,
  which changes what the coverage overlay and occlusion tests mean for the
  tower. Fire interval leaves the shape alone.
- **Damage** is the per-hit lethality axis. Fire interval composes with the
  fire-rate upgrade pick (`-10%` off the **base** interval), so upgrades still
  read naturally off the new base.
- The interval stays under the Pawn's 900ms move interval, so the "every firing
  tower gets a shot" invariant (`towerTypes.test.ts`) still holds.

## Changes

### `src/data/towerTypes.ts`

`vertical`'s `fireIntervalMs`: `500 → 700`. The `PLACEHOLDER` balance note at
the top of the table stays.

### `src/data/towerTypes.test.ts`

Pin the new interval so the nerf cannot silently revert:

```ts
expect(towerType('vertical').fireIntervalMs).toBe(700)
```

The existing invariant — every firing type's interval is below the Pawn's
900ms move interval — continues to hold (700 < 900).

### Stale comments

Two test files reference the old interval in prose and would go stale:

- `src/game/coverage.test.ts:509` — "over the vertical Tower's 500ms fire
  interval" → 700ms.
- `src/game/staging.test.ts:464` — "2 damage every 500ms fire interval" →
  700ms.

Neither asserts the value; both are comment-only fixes.

## Not changed

- **No Piece-side scaling.** Flat Piece health was a deliberate 2026-08-12
  decision; this nerf does not revisit it.
- **No other Tower type.** Only the vertical changes.
- **No geometry, range, damage, or health change.**
- **No ladder reorder.** The vertical stays the weakest hand's Tower, just
  weaker overall.

## Tests

All engine and scene tests read the interval from `towerType('vertical')`
rather than hardcoding it, so the single data change plus the new pin is the
whole test surface. Run `pnpm test:run`, `pnpm lint`, `pnpm typecheck`.

## Open follow-up

The issue's stated concern is that a vertical row reaches round 40+. This nerf
moves that ceiling down; the exact new ceiling is not measured here. If play
experience still shows a static vertical row dominating, the follow-up options
are a stronger interval bump or revisiting the flat-HP decision — both recorded
here so the issue can be revisited without re-deriving the context.
