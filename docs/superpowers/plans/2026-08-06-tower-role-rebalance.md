# Tower Role Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebalance Tower ranks 6–10 so coverage and single-target damage trade against each other, and ranks 7–9 become distinct utility roles (Wall, Amplifier, Freezer) instead of four flavours of the same gun.

**Architecture:** Three new firing geometries (`none`, `ring`, `band`) join `TowerGeometry`, whose exhaustive `switch` in `coversSquare` and `Record` in `GEOMETRY_LABELS` make every one a compile error until handled. The rank table in `src/data/towerRanks.ts` is replaced wholesale. The two Tower auras — Amplifier and Freezer — live in a new `src/game/towerAuras.ts` and are **derived per tick from position**, storing no per-Piece duration state, mirroring the pattern `src/game/auras.ts` already uses for the King and Bishop.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, pnpm. No renderer work is required beyond a compile-forced label addition — `coversSquare` is shared, so `CoveragePreview.tsx` and `firePulse.ts` pick up the new geometries for free.

**Spec:** [`docs/superpowers/specs/2026-08-06-tower-role-rebalance-design.md`](../specs/2026-08-06-tower-role-rebalance-design.md)

**Issue:** [#19 — towers 6-10 may be overpowered](https://github.com/braydend/cards-v-chess/issues/19)

## Global Constraints

- **`src/game/` and `src/data/` must never import React or Three.js.** Enforced by ESLint; a violation fails `pnpm lint` and therefore CI.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** Enforced by ESLint. Nothing in this plan needs randomness.
- **`src/scene/`, `src/ui/`, `src/state/` import from `src/game/index.ts` only**, never from a module inside `src/game/`. Test files are exempt. Enforced by ESLint.
- **Never add a per-tick value to `structuralKey`.** Both auras are derived and stored nowhere, so this plan adds none. `src/state/simulation.test.ts` bounds store publishes at 60 per 600 frames; if it starts failing, something is pushing per-frame updates through React.
- **Tests go through the public surface** (`step`, `tick`, state inspection), using the builders in `src/game/fixtures.ts`. Do not construct a `Tower` by hand.
- **Vitest strips types without checking them.** A passing suite is not a passing typecheck. Every task runs `pnpm typecheck` as well as `pnpm test:run`.
- **Verify before claiming.** Run the command, read the output. Do not report a task complete on a test you did not watch pass.
- Run `pnpm install` once before starting if `node_modules` is absent.

## Baseline

Confirmed on branch `tower_rebalance` before any task: **560 tests across 34 files, all passing.** `pnpm test:run` prints the live count.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/game/types.ts` | `TowerGeometry` gains `'none' \| 'ring' \| 'band'` | 1 |
| `src/game/coverage.ts` | `coversSquare` handles the three new geometries | 1 |
| `src/ui/geometryLabels.ts` | Player-facing label per geometry (`Record` forces all three) | 1 |
| `src/game/coverage.test.ts` | Geometry unit tests | 1 |
| `src/data/towerRanks.ts` | The new ladder table, plus the `aura` field on `TowerRankDef` | 2 |
| `src/game/tick.ts` | Skip non-firing Towers; apply both auras | 2, 4, 5 |
| `src/data/towerRanks.test.ts` | Ladder invariants — rewritten for the new design | 2, 3 |
| `src/game/firing.test.ts` | Two tests repaired against the new numbers | 2 |
| `src/game/support.test.ts` | One test repaired against rank 5's new interval | 2 |
| **`src/game/towerAuras.ts`** | **New.** Amplifier and Freezer, derived from Tower and Piece positions | 4, 5 |
| **`src/game/towerAuras.test.ts`** | **New.** Aura unit tests | 4, 5 |
| `src/game/roundTermination.test.ts` | A ♥-fed Wall still falls and the round still ends | 6 |
| `docs/design/game-design.md` | Rank ladder table, rationale, open questions | 7 |
| `CLAUDE.md` | Vocabulary, current state | 7 |

`towerAuras.ts` is a new file rather than an addition to `auras.ts` because `auras.ts` owns **Chess-faction** auras (the King's speed buff, the Bishop's healing) and this owns **Cards-faction** ones. They share the derived-per-tick discipline, not a subject.

---

### Task 1: The three new firing geometries

**Files:**
- Modify: `src/game/types.ts:109-116` (the `TowerGeometry` union)
- Modify: `src/game/coverage.ts:17-48` (`coversSquare`)
- Modify: `src/ui/geometryLabels.ts:16-25` (`GEOMETRY_LABELS`)
- Test: `src/game/coverage.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TowerGeometry` now includes `'none' | 'ring' | 'band'`. `coversSquare(geometry: TowerGeometry, range: number, from: Square, target: Square): boolean` — signature unchanged.

This task is purely additive. No rank uses the new geometries yet, so all 560 existing tests must still pass at the end of it.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/coverage.test.ts`:

```ts
describe('coversSquare: none', () => {
  it('covers nothing at any range', () => {
    expect(coversSquare('none', 0, ORIGIN, { file: 4, rank: 5 })).toBe(false)
    expect(coversSquare('none', 8, ORIGIN, { file: 4, rank: 5 })).toBe(false)
    expect(coversSquare('none', 8, ORIGIN, { file: 5, rank: 5 })).toBe(false)
  })

  it('does not cover its own square either', () => {
    expect(coversSquare('none', 8, ORIGIN, ORIGIN)).toBe(false)
  })
})

describe('coversSquare: ring', () => {
  it('covers the outer band at exactly its range', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 7, rank: 4 })).toBe(true)
  })

  it('covers one square inside its range, so the band is two deep', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 6, rank: 4 })).toBe(true)
  })

  it('is blind at its own feet', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 5, rank: 4 })).toBe(false)
    expect(coversSquare('ring', 3, ORIGIN, { file: 5, rank: 5 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('ring', 3, ORIGIN, ORIGIN)).toBe(false)
  })

  it('does not cover beyond its range', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 0, rank: 4 })).toBe(false)
  })

  it('measures the band by Chebyshev distance, so corners are in it', () => {
    expect(coversSquare('ring', 3, ORIGIN, { file: 7, rank: 7 })).toBe(true)
  })
})

describe('coversSquare: band', () => {
  it('covers the full file width at its own board rank', () => {
    expect(coversSquare('band', 1, ORIGIN, { file: 0, rank: 4 })).toBe(true)
    expect(coversSquare('band', 1, ORIGIN, { file: 15, rank: 4 })).toBe(true)
  })

  it('covers the board ranks either side, within range', () => {
    expect(coversSquare('band', 1, ORIGIN, { file: 0, rank: 3 })).toBe(true)
    expect(coversSquare('band', 1, ORIGIN, { file: 0, rank: 5 })).toBe(true)
  })

  it('does not cover beyond its range in board ranks', () => {
    expect(coversSquare('band', 1, ORIGIN, { file: 4, rank: 6 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('band', 1, ORIGIN, ORIGIN)).toBe(false)
  })

  it('ignores file distance entirely — a Piece can never flank it', () => {
    // The whole point of the rank-10 toll gate. A file distance of 40 is
    // still covered; only the board-rank distance is bounded.
    expect(coversSquare('band', 1, ORIGIN, { file: 44, rank: 4 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/coverage.test.ts`

Expected: FAIL. The three new geometry strings are not in `TowerGeometry`, so `coversSquare('none', ...)` fails to typecheck. Vitest strips types, so at runtime these fall through the `switch` and return `undefined`, failing `toBe(false)` / `toBe(true)`.

- [ ] **Step 3: Add the geometries to the type union**

In `src/game/types.ts`, replace the `TowerGeometry` union:

```ts
/**
 * A Tower's firing geometry, set by the rank of the Card that built it.
 * Towers are generic — this is NOT chess-piece movement.
 *
 * `none` is a Tower that never fires. Rank 7 is the Wall: its whole identity
 * is blocking and soaking, so it has no firing geometry at all rather than a
 * geometry that happens to be empty.
 */
export type TowerGeometry =
  | 'none'
  | 'adjacent'
  | 'horizontal'
  | 'vertical'
  | 'cross'
  | 'diagonal'
  | 'star'
  | 'ring'
  | 'band'
```

- [ ] **Step 4: Implement the three geometries**

In `src/game/coverage.ts`, replace the body of `coversSquare`. Note that **`band` and `none` are handled before the shared distance guards**: `band` is the first geometry whose coverage is not a function of Chebyshev distance, so running it through `if (distance > range)` would wrongly clip its flanks.

```ts
export function coversSquare(
  geometry: TowerGeometry,
  range: number,
  from: Square,
  target: Square,
): boolean {
  const fileDistance = Math.abs(target.file - from.file)
  const rankDistance = Math.abs(target.rank - from.rank)
  const distance = Math.max(fileDistance, rankDistance)

  // A Tower never covers its own square. Nothing can stand there anyway: a
  // Piece that would land on a Tower attacks it instead of moving.
  if (distance === 0) return false

  // Handled before the shared range guard below, because neither one is a
  // function of Chebyshev distance in the way the rest of the ladder is.
  switch (geometry) {
    // Rank 7, the Wall. It blocks and soaks and never shoots, so there is no
    // square it covers — including at a generous range.
    case 'none':
      return false
    // Rank 10, the toll gate. The FULL file width, bounded only in board
    // ranks, so nothing can flank it. Files never grow (only board ranks do),
    // so a band spans the whole board for an entire run.
    case 'band':
      return rankDistance <= range
    default:
      break
  }

  if (distance > range) return false

  switch (geometry) {
    // Every direction. The distance guards above have already excluded the
    // Tower's own square and anything out of range, so at range 1 this is
    // exactly the eight neighbours.
    case 'adjacent':
      return true
    case 'horizontal':
      return rankDistance === 0
    case 'vertical':
      return fileDistance === 0
    case 'cross':
      return rankDistance === 0 || fileDistance === 0
    case 'diagonal':
      return fileDistance === rankDistance
    // Rank 6: cross and diagonal combined. Rank 4 taught the player that 4 is
    // 2 and 3 together; 6 being 4 and 5 together reads the same way.
    case 'star':
      return rankDistance === 0 || fileDistance === 0 || fileDistance === rankDistance
    // Rank 8, the Amplifier. The outer two squares of its reach only — it is
    // blind at its own feet, which is what makes its hollow core a socket for
    // a short-range Tower rather than a flaw.
    case 'ring':
      return distance >= range - 1
    // Unreachable: both are returned above, before the range guard. Listed so
    // the switch stays exhaustive and adding a geometry stays a compile error.
    case 'none':
    case 'band':
      return false
  }
}
```

- [ ] **Step 5: Add the player-facing labels**

`GEOMETRY_LABELS` is a `Record<TowerGeometry, string>`, so this is a compile error until all three are present. In `src/ui/geometryLabels.ts`:

```ts
export const GEOMETRY_LABELS: Record<TowerGeometry, string> = {
  // "the eight squares around it" until the ladder grew: ranks 7, 9 and 10 are
  // adjacent at range 3–4, which is a disc, not a ring of eight.
  adjacent: 'Hits every square around it',
  horizontal: 'Fires along its rank',
  vertical: 'Fires along its file',
  cross: 'Fires along rank and file',
  diagonal: 'Fires along diagonals — one colour only',
  star: 'Fires along rank, file and diagonals',
  none: 'Never fires — it blocks and soaks',
  ring: 'Hits at a distance, blind at its feet',
  band: 'Fires across the full width of the board',
}
```

- [ ] **Step 6: Run the new tests, the full suite, and the typecheck**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: PASS.

Run: `pnpm test:run`
Expected: PASS — **all 560 baseline tests plus the new geometry tests.** This task changes no rank, so no existing test may break. If one does, stop and diagnose before continuing.

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/coverage.ts src/game/coverage.test.ts src/ui/geometryLabels.ts
git commit -m "Add the none, ring and band firing geometries

None is the Wall's absence of a gun, ring is the Amplifier's hollow core,
and band is the rank-10 toll gate: full file width, bounded only in board
ranks, so nothing can flank it.

Band and none are resolved before the shared Chebyshev range guard. Band
is the first geometry whose coverage is not a function of that distance,
and clipping it there would wrongly cut its flanks off."
```

---

### Task 2: The new rank ladder

**Files:**
- Modify: `src/data/towerRanks.ts` (the whole `TOWER_RANKS` table, plus `aura` on `TowerRankDef`)
- Modify: `src/game/tick.ts:198` (skip non-firing Towers in `fireTowers`)
- Modify: `src/data/towerRanks.test.ts` (five invariant tests must be rewritten)
- Modify: `src/game/firing.test.ts` (two tests repaired)
- Modify: `src/game/support.test.ts` (one test repaired)

**Interfaces:**
- Consumes: `TowerGeometry` including `'none' | 'ring' | 'band'` from Task 1.
- Produces: `TowerRankDef` gains `readonly aura?: 'amplify' | 'freeze'`. `TOWER_RANKS[8].aura === 'amplify'`, `TOWER_RANKS[9].aura === 'freeze'`. Tasks 4 and 5 read this field.

**This task breaks exactly 8 tests in 3 files.** That set was measured by applying the table and running the suite, so it is the expected fallout, not a surprise. Every one is repaired within this task.

- [ ] **Step 1: Replace the rank table**

In `src/data/towerRanks.ts`, add the `aura` field to `TowerRankDef` (above `targetsPerShot`):

```ts
  /**
   * A Tower-side aura, applied to every Piece this Tower covers.
   *
   * Optional because most ranks have none. Derived per tick from position and
   * stored nowhere — see `src/game/towerAuras.ts`. Deliberately NOT inferred
   * from geometry: a ring is a shape, `amplify` is a job, and a future rank
   * could want either without the other.
   */
  readonly aura?: 'amplify' | 'freeze'
```

Then replace `TOWER_RANKS` entirely, along with the doc comment above it:

```ts
/**
 * The rank ladder, rebalanced for issue #19.
 *
 * TWO AXES MOVE IN OPPOSITE DIRECTIONS, AND THAT IS THE DESIGN. Coverage rises
 * with rank; single-target DPS falls. A rank 2 out-damages a rank 10 against a
 * single Piece by six times, permanently, so low ranks can never become
 * landfill. A rank 10 wins only when there is a crowd.
 *
 * Raising damage or shortening an interval at the top of the ladder without
 * cutting coverage to match rebuilds exactly the problem #19 reported: a
 * single rank-6 Tower placed centrally used to carry auto-rounds for 45+
 * rounds unattended. `towerRanks.test.ts` pins both axes.
 *
 * Range is NOT comparable across geometries: it counts squares along the
 * pattern, so `adjacent` range 3 is a 7x7 disc of 48 squares while `vertical`
 * range 4 is 8 squares. See the design spec for measured coverage per rank.
 *
 * Every number here is a PLACEHOLDER; the relationships are the design.
 */
export const TOWER_RANKS: Record<BuildableRank, TowerRankDef> = {
  2: { geometry: 'adjacent', range: 1, damage: 3, fireIntervalMs: 400, maxHealth: 10, targetsPerShot: 1 },
  3: { geometry: 'vertical', range: 5, damage: 2, fireIntervalMs: 500, maxHealth: 14, targetsPerShot: 1 },
  4: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 18, targetsPerShot: 1 },
  5: { geometry: 'diagonal', range: 5, damage: 2, fireIntervalMs: 550, maxHealth: 22, targetsPerShot: 1 },
  6: { geometry: 'star', range: 3, damage: 2, fireIntervalMs: 600, maxHealth: 26, targetsPerShot: 1 },
  // The Wall. No gun, and health well above every firing rank — its whole
  // value is the seconds it buys. `fireIntervalMs` is inert but deliberately
  // POSITIVE, never 0, so no future change to `fireTowers`'s
  // `while (cooldown >= tower.fireIntervalMs)` guard can spin on it.
  7: { geometry: 'none', range: 0, damage: 0, fireIntervalMs: 1000, maxHealth: 45, targetsPerShot: 0 },
  // The Amplifier. Barely shoots; doubles what every OTHER Tower deals to
  // anything inside its ring. Its hollow core is a socket for a rank 2.
  8: { geometry: 'ring', range: 4, damage: 1, fireIntervalMs: 700, maxHealth: 30, targetsPerShot: 3, aura: 'amplify' },
  // The Freezer. 750ms rather than 650ms on purpose: at 650 it would
  // out-damage rank 8, inverting the ladder one rank before the top.
  9: { geometry: 'adjacent', range: 2, damage: 1, fireIntervalMs: 750, maxHealth: 34, targetsPerShot: 3, aura: 'freeze' },
  // The toll gate. Full board width, chip damage, unlimited targets: one toll
  // on every Piece, and nothing can go around it.
  10: { geometry: 'band', range: 1, damage: 1, fireIntervalMs: 800, maxHealth: 38, targetsPerShot: Number.POSITIVE_INFINITY },
}
```

- [ ] **Step 2: Run the suite to see the expected 8 failures**

Run: `pnpm test:run`

Expected: FAIL — **8 failures across 3 files**, exactly:
```
src/data/towerRanks.test.ts  never fires slower than a Pawn moves, so every Tower gets a shot
src/data/towerRanks.test.ts  rises in health with rank
src/data/towerRanks.test.ts  never fires slower as rank rises
src/data/towerRanks.test.ts  never targets fewer Pieces as rank rises
src/data/towerRanks.test.ts  hits at least one Piece at every rank
src/game/firing.test.ts      damages a Piece inside its coverage
src/game/firing.test.ts      rank 10 hits everything it covers
src/game/support.test.ts     ♦ Speed > fires more often than its rank alone would once ticked
```

If the count or the set differs, stop and diagnose — something in the table does not match this plan.

- [ ] **Step 3: Skip non-firing Towers in `fireTowers`**

In `src/game/tick.ts`, inside `fireTowers`'s `for (const tower of towers)` loop, add the guard as the first statement after `const def = towerRank(tower.cardRank)`:

```ts
  for (const tower of towers) {
    const def = towerRank(tower.cardRank)

    // The Wall never fires. Skipping before the cooldown loop rather than
    // relying on `selectTargets` returning nothing keeps a gunless Tower out
    // of the firing path entirely — and means its inert `fireIntervalMs` is
    // never read, so it can never gate a loop.
    if (def.geometry === 'none') {
      nextTowers.push(tower)
      continue
    }

    let cooldown = tower.fireCooldownMs + dtMs
```

Note `nextTowers.push(tower)` — not a spread with a reset cooldown. A Wall's `fireCooldownMs` must stay at its built value of 0 so `firePulse.ts` never sees a change and never draws a shot for it.

- [ ] **Step 4: Rewrite the ladder invariants**

Replace the whole `describe('the rank ladder', ...)` block in `src/data/towerRanks.test.ts`. Four of the old invariants described the *old* ladder and are now false by design; they are replaced by the invariants of the new one.

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from './pieceTypes'
import { BUILDABLE_RANKS, TOWER_RANKS, towerRank } from './towerRanks'

/** Every rank that actually shoots — the ladder minus the Wall. */
const FIRING_RANKS = BUILDABLE_RANKS.filter((rank) => towerRank(rank).geometry !== 'none')

/** Damage per second against a single Piece. */
function singleTargetDps(rank: (typeof BUILDABLE_RANKS)[number]): number {
  const def = towerRank(rank)
  return def.damage / (def.fireIntervalMs / 1000)
}

describe('the rank ladder', () => {
  it('covers every rank from 2 to 10', () => {
    expect(BUILDABLE_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('defines every buildable rank', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(TOWER_RANKS[rank]).toBeDefined()
    }
  })

  it('has exactly one Tower that never fires — the Wall at rank 7', () => {
    const gunless = BUILDABLE_RANKS.filter((rank) => towerRank(rank).geometry === 'none')

    expect(gunless).toEqual([7])
  })

  it('gives the Wall no damage and no targets, so nothing can make it shoot', () => {
    expect(towerRank(7).damage).toBe(0)
    expect(towerRank(7).targetsPerShot).toBe(0)
  })

  it('gives the Wall a positive fire interval, so no loop can spin on it', () => {
    // Inert — `fireTowers` skips a gunless Tower before reading this. Asserted
    // anyway because a 0 here would be a live hazard the moment that guard
    // moved or a `while (cooldown >= interval)` condition was rewritten.
    expect(towerRank(7).fireIntervalMs).toBeGreaterThan(0)
  })

  it('never fires slower than a Pawn moves, so every firing Tower gets a shot', () => {
    for (const rank of FIRING_RANKS) {
      expect(towerRank(rank).fireIntervalMs).toBeLessThan(PIECE_TYPES.pawn.moveIntervalMs)
    }
  })

  it('rises in health with rank across the firing ranks', () => {
    const healths = FIRING_RANKS.map((rank) => towerRank(rank).maxHealth)

    // reduce, not indexed access, so this holds under noUncheckedIndexedAccess.
    healths.reduce((previous, current) => {
      expect(current).toBeGreaterThan(previous)
      return current
    })
  })

  it('gives the Wall more health than any Tower that shoots', () => {
    // The Wall sits outside the health curve rather than on it: soaking is the
    // only thing it does, so it must out-last everything that also has a gun.
    const firingHealths = FIRING_RANKS.map((rank) => towerRank(rank).maxHealth)

    for (const health of firingHealths) {
      expect(towerRank(7).maxHealth).toBeGreaterThan(health)
    }
  })

  it('NEVER raises single-target DPS as rank rises', () => {
    // THE CORE PROPERTY OF THIS LADDER, and the direct answer to issue #19.
    // Coverage rises with rank, so damage must fall — otherwise a high rank is
    // strictly better at everything and placement stops mattering. Ranks 4 and
    // 5 tie deliberately, hence "or equal".
    const dps = FIRING_RANKS.map(singleTargetDps)

    dps.reduce((previous, current) => {
      expect(current).toBeLessThanOrEqual(previous)
      return current
    })
  })

  it('makes rank 2 the best single-target killer in the game', () => {
    // The guarantee that a low rank is never landfill. If this fails, a Deck
    // full of 2s has become worthless and the pack economy has a hole in it.
    for (const rank of FIRING_RANKS.filter((candidate) => candidate !== 2)) {
      expect(singleTargetDps(2)).toBeGreaterThan(singleTargetDps(rank))
    }
  })

  it('never targets fewer Pieces as rank rises, across the firing ranks', () => {
    const targets = FIRING_RANKS.map((rank) => towerRank(rank).targetsPerShot)

    targets.reduce((previous, current) => {
      expect(current).toBeGreaterThanOrEqual(previous)
      return current
    })
  })

  it('hits at least one Piece at every firing rank', () => {
    for (const rank of FIRING_RANKS) {
      expect(towerRank(rank).targetsPerShot).toBeGreaterThanOrEqual(1)
    }
  })

  it('puts an amplify aura on rank 8 and a freeze aura on rank 9, and nowhere else', () => {
    const auras = BUILDABLE_RANKS.map((rank) => [rank, towerRank(rank).aura] as const)

    expect(auras.filter(([, aura]) => aura !== undefined)).toEqual([
      [8, 'amplify'],
      [9, 'freeze'],
    ])
  })
})
```

- [ ] **Step 5: Repair `firing.test.ts`**

Two failures, each with a specific cause.

**(a) `damages a Piece inside its coverage`** — rank 2's damage rose from 1 to 3 and a Pawn has 3 health, so the target now dies and is removed from `state.pieces`, making `after.pieces[0]?.health` `undefined`. Read the surviving Piece by id and use a target that survives one shot. Replace the test at `src/game/firing.test.ts:52-59`:

```ts
  it('damages a Piece inside its coverage', () => {
    // A Rook, not a Pawn: rank 2 deals 3 and a Pawn has exactly 3 health, so a
    // Pawn would die on the first shot and leave nothing to read a health off.
    const state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pieceAt('rook', 'target-0', { file: 3, rank: 4 }),
    ])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)
    const survivor = after.pieces.find((piece) => piece.id === 'target-0')

    expect(survivor?.health).toBe(PIECE_TYPES.rook.maxHealth - TOWER_RANKS[2].damage)
  })
```

Add whatever of `pieceAt` and `PIECE_TYPES` the file does not already import — `pieceAt` from `./fixtures`, `PIECE_TYPES` from `../data/pieceTypes`. Remove the now-unused `PAWN_HEALTH` constant only if nothing else in the file uses it; `pnpm lint` will say.

**(b) `rank 10 hits everything it covers`** — rank 10 is now a `band` at range 1, so its coverage is the full width of board ranks 2–4 from a Tower on rank 3, and the old target squares no longer all sit inside it. Replace the piece squares:

```ts
  it('rank 10 hits everything it covers', () => {
    // A band spans the full file width, so these are spread across the board
    // on purpose — that is the property being tested. Rank 5 is outside the
    // +/-1 band from board rank 3 and must NOT be hit.
    const state = scenario(10, { file: 3, rank: 3 }, [
      { file: 0, rank: 4 },
      { file: 3, rank: 4 },
      { file: 7, rank: 2 },
      { file: 6, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(4)
  })
```

Then read the surrounding tests in the `targets per shot` describe block and confirm the rank 8 ones still hold: rank 8 is now a `ring` at range 4, so a target at Chebyshev distance 3 or 4 from the Tower is covered and one at distance 1 or 2 is **not**. If the rank 8 tests place Pieces adjacent to the Tower, move them to distance 3–4 and keep the `toHaveLength(TOWER_RANKS[8].targetsPerShot)` assertion intact.

**(c) `caps at its target count`** — this test passed under the experimental table but its comment says "Rank 8 covers four Pieces". Verify the four squares are all inside the ring at range 4 from `{ file: 3, rank: 3 }`; if any sits at distance 1 or 2 it is now in the hollow core and the test is passing for the wrong reason. Move any such square out to distance 3 or 4.

- [ ] **Step 6: Repair `support.test.ts`**

The failure is arithmetic in `fires more often than its rank alone would once ticked` at `src/game/support.test.ts:125`. Rank 5's interval rose from 500ms to 550ms. Three Ace ♦ still shrink it by 270ms (`3 × DIAMOND_SPEED_MS × FACE_SUPPORT_PREMIUM` = `3 × 60 × 1.5`), giving 280ms — which is no longer under half of 550ms, so two shots no longer fit in one rank-interval window.

Use rank 3 instead, whose 500ms interval preserves the original arithmetic exactly. Update the comment to match:

```ts
    // Rank 3, not rank 5: the rebalance moved rank 5 to a 550ms interval, and
    // 550 - 270 = 280 is fractionally over half, so two shots no longer fit in
    // one rank-interval window. Rank 3's 500ms keeps the original arithmetic.
    const built = withTower(3, SQUARE)
    const towerId = firstTowerId(built)

    // Three Aces played for ♦ shrink the 500ms rank interval by 270ms
    // (3 × 60ms × the 1.5 face premium), to 230ms — under half, so two shots
    // fit inside one rank-interval-sized window.
```

Rank 3 is `vertical`, so confirm the test's Piece sits on the Tower's file. If `SQUARE` and the Piece square do not share a file, move the Piece onto it — a `vertical` Tower covers nothing off its own file.

- [ ] **Step 7: Run everything**

Run: `pnpm test:run`
Expected: PASS, all files. The count rises above 560 by the tests added in Steps 4.

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add src/data/towerRanks.ts src/data/towerRanks.test.ts src/game/tick.ts src/game/firing.test.ts src/game/support.test.ts
git commit -m "Rebalance the rank ladder so coverage and damage trade

Single-target DPS now falls as rank rises -- 7.5 at rank 2 down to 1.25
at rank 10 -- so a high rank is stronger overall without being better at
everything. Rank 2 out-damages rank 10 against one Piece by six times,
permanently, which is what stops low ranks becoming landfill.

Rank 7 is the Wall: geometry none, no damage, no targets, and health
above every firing rank. fireTowers skips it before the cooldown loop.

Four ladder invariants described the old design and were false by
construction under the new one -- monotonically shortening intervals
most of all, which is now inverted on purpose. They are replaced by the
invariants that actually hold, including the DPS curve itself."
```

---

### Task 3: Pin the coverage ceiling

**Files:**
- Modify: `src/data/towerRanks.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: `TOWER_RANKS` from Task 2, `coversSquare` from Task 1.
- Produces: nothing consumed downstream.

This is the test that makes issue #19 falsifiable rather than a play-feel argument. It measures every rank's footprint from every square of an 8x8 board.

- [ ] **Step 1: Write the test**

Append to `src/data/towerRanks.test.ts`. Note it imports `coversSquare` from `src/game/` — legal here because `src/data/` may import from `src/game/`, and the inbound ESLint restriction exempts test files anyway.

```ts
import { coversSquare } from '../game/coverage'

/**
 * The measured answer to issue #19: "towers 6-10 may be overpowered".
 *
 * Before the rebalance a rank-10 Tower on a central 8x8 square covered ALL 63
 * other squares and hit every Piece on them, and a single rank 6 carried
 * auto-rounds for 45+ rounds unattended. A ceiling on footprint is what keeps
 * placement a decision, so it is asserted rather than eyeballed.
 *
 * Measured on a literal 8x8 even though an Ace grows the board. Growth only
 * ever DILUTES a footprint's share — a `band` covers the same absolute squares
 * on a taller board, and no other geometry gains reach — so 8x8 is the tightest
 * case and passing it here means passing it everywhere.
 */
const FILES = 8
const RANKS = 8
const OTHER_SQUARES = FILES * RANKS - 1

/** The most squares this rank can cover from any one square of an 8x8 board. */
function peakCoverage(rank: (typeof BUILDABLE_RANKS)[number]): number {
  const def = towerRank(rank)
  let peak = 0

  for (let file = 0; file < FILES; file += 1) {
    for (let boardRank = 0; boardRank < RANKS; boardRank += 1) {
      let covered = 0

      for (let targetFile = 0; targetFile < FILES; targetFile += 1) {
        for (let targetRank = 0; targetRank < RANKS; targetRank += 1) {
          const hit = coversSquare(
            def.geometry,
            def.range,
            { file, rank: boardRank },
            { file: targetFile, rank: targetRank },
          )
          if (hit) covered += 1
        }
      }

      peak = Math.max(peak, covered)
    }
  }

  return peak
}

describe('the coverage ceiling', () => {
  /**
   * 39 of 63 squares — 61.9% — is the ring at rank 8 placed centrally, and it
   * is the widest footprint on the ladder. Asserted as a SQUARE COUNT rather
   * than a percentage so the threshold is exact rather than a rounded float.
   */
  const CEILING = 39

  it('never lets any rank cover more than 39 of the other 63 squares', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(peakCoverage(rank)).toBeLessThanOrEqual(CEILING)
    }
  })

  it('never lets any rank cover the whole board', () => {
    // The specific failure #19 reported. Kept separate from the ceiling above
    // because it is the property that matters even if the ceiling is retuned.
    for (const rank of BUILDABLE_RANKS) {
      expect(peakCoverage(rank)).toBeLessThan(OTHER_SQUARES)
    }
  })

  it('gives the Wall no footprint at all', () => {
    expect(peakCoverage(7)).toBe(0)
  })

  it('leaves every firing rank somewhere it is not', () => {
    for (const rank of FIRING_RANKS) {
      expect(peakCoverage(rank)).toBeGreaterThan(0)
      expect(peakCoverage(rank)).toBeLessThan(OTHER_SQUARES)
    }
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm test:run src/data/towerRanks.test.ts`
Expected: PASS. If `never lets any rank cover more than 39` fails, the table in Task 2 does not match this plan — read the actual peak out of the failure message and reconcile against the spec before changing `CEILING`.

- [ ] **Step 3: Run the full suite and typecheck**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/data/towerRanks.test.ts
git commit -m "Pin the coverage ceiling that issue #19 reported breaking

Measures every rank's footprint from every square of an 8x8 and asserts
no rank exceeds 39 of the other 63 squares. Before the rebalance rank 10
covered all 63 from a central square.

Asserted as a square count, not a percentage, so the threshold is exact
rather than a rounded float. 8x8 is the tightest case: an Ace only ever
dilutes a footprint's share, so passing here means passing on any board."
```

---

### Task 4: The Amplifier aura

**Files:**
- Create: `src/game/towerAuras.ts`
- Create: `src/game/towerAuras.test.ts`
- Modify: `src/game/tick.ts` (`fireTowers`)

**Interfaces:**
- Consumes: `TOWER_RANKS[8].aura === 'amplify'` and `geometry: 'ring'` from Task 2.
- Produces:
  - `AMPLIFIER_MULTIPLIER: number` (= 2)
  - `amplifierIdsByPiece(towers: readonly Tower[], pieces: readonly Piece[]): ReadonlyMap<string, ReadonlySet<string>>` — piece id → the ids of every Amplifier covering it.
  - `amplificationFor(towerId: string, pieceId: string, amplifiers: ReadonlyMap<string, ReadonlySet<string>>): number` — the damage multiplier a given Tower's shot gets against a given Piece. Returns `AMPLIFIER_MULTIPLIER` when some **other** Tower amplifies it, otherwise `1`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/towerAuras.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTowerId, liveRound, pawnAt, pieceAt, withTower } from './fixtures'
import { tick } from './index'
import { AMPLIFIER_MULTIPLIER, amplificationFor, amplifierIdsByPiece } from './towerAuras'
import type { GameState } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('amplifierIdsByPiece', () => {
  it('lists the Amplifier covering a Piece inside its ring', () => {
    // Rank 8 is a ring at range 4: distance 3 and 4 are covered, 1 and 2 are
    // the hollow core.
    const state = liveRound(withTower(8, { file: 3, rank: 3 }), [
      pawnAt('inside-ring', { file: 3, rank: 6 }),
    ])
    const amplifiers = amplifierIdsByPiece(state.towers, state.pieces)

    expect(amplifiers.get('inside-ring')).toEqual(new Set([firstTowerId(state)]))
  })

  it('does not list a Piece standing in the hollow core', () => {
    const state = liveRound(withTower(8, { file: 3, rank: 3 }), [
      pawnAt('in-core', { file: 3, rank: 4 }),
    ])

    expect(amplifierIdsByPiece(state.towers, state.pieces).get('in-core')).toBeUndefined()
  })

  it('ignores Towers with no amplify aura', () => {
    const state = liveRound(withTower(4, { file: 3, rank: 3 }), [
      pawnAt('covered', { file: 3, rank: 5 }),
    ])

    expect(amplifierIdsByPiece(state.towers, state.pieces).size).toBe(0)
  })
})

describe('amplificationFor', () => {
  const amplifiers = new Map([['piece-1', new Set(['tower-8'])]])

  it('amplifies another Tower firing into the ring', () => {
    expect(amplificationFor('tower-2', 'piece-1', amplifiers)).toBe(AMPLIFIER_MULTIPLIER)
  })

  it('NEVER amplifies the Amplifier itself', () => {
    // Load-bearing. A self-amplifying rank 8 is self-sufficient, which rebuilds
    // the dominance problem issue #19 reported, one rank along. Mirrors the
    // King never buffing itself and applyHealing's own self-check.
    expect(amplificationFor('tower-8', 'piece-1', amplifiers)).toBe(1)
  })

  it('leaves an unamplified Piece alone', () => {
    expect(amplificationFor('tower-2', 'piece-9', amplifiers)).toBe(1)
  })

  it('does not stack when two Amplifiers cover the same Piece', () => {
    const two = new Map([['piece-1', new Set(['tower-8', 'tower-9'])]])

    expect(amplificationFor('tower-2', 'piece-1', two)).toBe(AMPLIFIER_MULTIPLIER)
  })
})

describe('the Amplifier in a live round', () => {
  it('doubles what another Tower deals inside the ring', () => {
    // A Rook has 14 health, enough to survive and be measured. It sits at
    // Chebyshev distance 3 from the rank 8 and distance 1 from the rank 2,
    // so it is inside the ring AND inside the rank 2's reach.
    const withRing = withTower(8, { file: 0, rank: 0 })
    const both = withTower(2, { file: 3, rank: 2 }, withRing)
    const state = liveRound(both, [pieceAt('rook', 'victim', { file: 3, rank: 3 })])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)
    const victim = after.pieces.find((piece) => piece.id === 'victim')
    const dealt = 14 - (victim?.health ?? 0)

    expect(dealt).toBe(TOWER_RANKS[2].damage * AMPLIFIER_MULTIPLIER)
  })

  it('does not double its own shot', () => {
    // The same Piece, with only the Amplifier present. It must take exactly
    // rank 8's damage, unmultiplied.
    const state = liveRound(withTower(8, { file: 0, rank: 0 }), [
      pieceAt('rook', 'victim', { file: 3, rank: 3 }),
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const victim = after.pieces.find((piece) => piece.id === 'victim')

    expect(14 - (victim?.health ?? 0)).toBe(TOWER_RANKS[8].damage)
  })
})
```

Before running, verify the two board-geometry claims by hand: from `{file: 0, rank: 0}` a ring at range 4 covers `{file: 3, rank: 3}` because Chebyshev distance is 3, which is `>= range - 1` (3) and `<= range` (4). From `{file: 3, rank: 2}` a rank 2 at range 1 covers `{file: 3, rank: 3}` at distance 1. If either is wrong, adjust the squares rather than the assertion.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:run src/game/towerAuras.test.ts`
Expected: FAIL — `Cannot find module './towerAuras'`.

- [ ] **Step 3: Create `src/game/towerAuras.ts`**

```ts
import { towerRank } from '../data/towerRanks'
import { coversSquare } from './coverage'
import type { Piece, Tower } from './types'

/**
 * Tower-side auras — the Cards faction's answer to `auras.ts`, which owns the
 * Chess faction's King and Bishop auras.
 *
 * Both auras here are DERIVED PER TICK FROM POSITION and stored nowhere. A
 * Piece is amplified while it stands inside a ring, not for N seconds after
 * being hit. That is a deliberate design choice, not an implementation detail:
 *
 * - No per-Piece duration state, so nothing new changes every tick, so nothing
 *   here can end up in `structuralKey` and push a React render per frame.
 * - Non-stacking falls out for free, matching the King aura's documented
 *   choice rather than inventing a second rule for the same question.
 * - Placement matters. A timed debuff travels with the Piece and stops caring
 *   where the Tower was; an aura is bounded by coverage.
 *
 * Both functions read their Piece and Tower lists as frozen arrays and never
 * re-read what they are building, so no Piece's outcome can depend on which
 * Tower the caller happened to process first — the same discipline `auras.ts`
 * and `tick.ts`'s Tower map already apply.
 */

/** Damage multiplier a Piece inside an Amplifier's ring takes from other Towers. */
export const AMPLIFIER_MULTIPLIER = 2

/**
 * Piece id to the ids of every Amplifier covering it.
 *
 * Ids rather than a boolean because the Amplifier must not amplify its own
 * fire — see `amplificationFor`. A plain set of "amplified pieces" could not
 * express that.
 */
export function amplifierIdsByPiece(
  towers: readonly Tower[],
  pieces: readonly Piece[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const byPiece = new Map<string, Set<string>>()

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    if (def.aura !== 'amplify') continue

    for (const piece of pieces) {
      if (!coversSquare(def.geometry, def.range, tower.square, piece.square)) continue

      const existing = byPiece.get(piece.id)
      if (existing) existing.add(tower.id)
      else byPiece.set(piece.id, new Set([tower.id]))
    }
  }

  return byPiece
}

/**
 * The damage multiplier `towerId`'s shot gets against `pieceId`.
 *
 * AN AMPLIFIER NEVER AMPLIFIES ITSELF. Without that exclusion a lone rank 8 is
 * self-sufficient, which rebuilds the dominance problem issue #19 reported one
 * rank further along — the Amplifier's whole identity is being worthless alone
 * and excellent beside a short-range Tower. This mirrors the King never
 * buffing itself and `applyHealing`'s `other.id === piece.id` check, so all
 * three auras in the codebase agree on what "other" means.
 *
 * Auras do not stack: two Amplifiers are one Amplifier.
 */
export function amplificationFor(
  towerId: string,
  pieceId: string,
  amplifiers: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const sources = amplifiers.get(pieceId)
  if (!sources) return 1

  for (const sourceId of sources) {
    if (sourceId !== towerId) return AMPLIFIER_MULTIPLIER
  }

  return 1
}
```

- [ ] **Step 4: Apply it in `fireTowers`**

In `src/game/tick.ts`, add the import:

```ts
import { amplificationFor, amplifierIdsByPiece } from './towerAuras'
```

Inside `fireTowers`, after the `remainingHealth` map is built and before the `for (const tower of towers)` loop:

```ts
  // Derived once, from the Piece and Tower lists as passed in, so no Piece's
  // damage depends on which Tower fired first.
  const amplifiers = amplifierIdsByPiece(towers, pieces)
```

Then change the damage line inside the target loop:

```ts
      for (const target of targets) {
        const multiplier = amplificationFor(tower.id, target.id, amplifiers)
        remainingHealth.set(
          target.id,
          (remainingHealth.get(target.id) ?? 0) - tower.damage * multiplier,
        )
      }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test:run src/game/towerAuras.test.ts`
Expected: PASS.

Run: `pnpm test:run`
Expected: PASS, everything. The Amplifier only exists at rank 8, so no test that does not build a rank 8 can be affected.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/towerAuras.ts src/game/towerAuras.test.ts src/game/tick.ts
git commit -m "Add the rank 8 Amplifier aura

A Piece inside the ring takes double damage from every OTHER Tower. The
exclusion is load-bearing: a self-amplifying rank 8 would be
self-sufficient and rebuild the dominance problem #19 reported, one rank
along. Its identity is being worthless alone and excellent beside a
short-range Tower dropped in its hollow core.

Derived per tick from position with no duration state, following the
pattern auras.ts already uses for the King and Bishop -- which is also
what keeps it out of structuralKey."
```

---

### Task 5: The Freezer aura

**Files:**
- Modify: `src/game/towerAuras.ts`
- Modify: `src/game/towerAuras.test.ts`
- Modify: `src/game/tick.ts` (`tick` and `movePieces`)

**Interfaces:**
- Consumes: `TOWER_RANKS[9].aura === 'freeze'` from Task 2; `towerAuras.ts` from Task 4.
- Produces:
  - `FREEZE_MULTIPLIER: number` (= 1.5)
  - `frozenPieceIds(towers: readonly Tower[], pieces: readonly Piece[]): ReadonlySet<string>`

- [ ] **Step 1: Write the failing tests**

Append to `src/game/towerAuras.test.ts`:

```ts
describe('frozenPieceIds', () => {
  it('freezes a Piece inside a rank 9 disc', () => {
    // Rank 9 is adjacent at range 2 — a solid 5x5 disc, no hollow core.
    const state = liveRound(withTower(9, { file: 3, rank: 3 }), [
      pawnAt('chilled', { file: 4, rank: 4 }),
    ])

    expect(frozenPieceIds(state.towers, state.pieces).has('chilled')).toBe(true)
  })

  it('leaves a Piece outside the disc alone', () => {
    const state = liveRound(withTower(9, { file: 3, rank: 3 }), [
      pawnAt('warm', { file: 7, rank: 7 }),
    ])

    expect(frozenPieceIds(state.towers, state.pieces).has('warm')).toBe(false)
  })

  it('ignores Towers with no freeze aura', () => {
    const state = liveRound(withTower(8, { file: 3, rank: 3 }), [
      pawnAt('covered', { file: 3, rank: 6 }),
    ])

    expect(frozenPieceIds(state.towers, state.pieces).size).toBe(0)
  })
})

describe('the Freezer in a live round', () => {
  it('makes a Pawn take longer to cross the same distance', () => {
    // Rank 9 sits off to the side so it covers the Pawn's path without ever
    // blocking it — a blocked Pawn would attack instead of moving and this
    // would measure the wrong thing.
    const frozen = liveRound(withTower(9, { file: 1, rank: 5 }), [
      pawnAt('runner', { file: 2, rank: 6 }),
    ])
    const free = liveRound(withTower(9, { file: 7, rank: 0 }), [
      pawnAt('runner', { file: 2, rank: 6 }),
    ])

    const afterFrozen = runFor(frozen, 2000)
    const afterFree = runFor(free, 2000)

    const frozenRank = afterFrozen.pieces.find((piece) => piece.id === 'runner')?.square.rank
    const freeRank = afterFree.pieces.find((piece) => piece.id === 'runner')?.square.rank

    // A Pawn moves DOWN in board rank, so a higher remaining rank means it
    // travelled less. Both must still be on the board for this to mean
    // anything.
    expect(frozenRank).toBeDefined()
    expect(freeRank).toBeDefined()
    expect(frozenRank ?? 0).toBeGreaterThan(freeRank ?? 0)
  })
})
```

Verify by hand before running: a rank 9 at `{file: 1, rank: 5}` covers `{file: 2, rank: 6}` (Chebyshev distance 1, within range 2) and covers the Pawn's next few squares down file 2. A rank 9 at `{file: 7, rank: 0}` covers nothing near file 2. If either is wrong, move the Tower, not the assertion.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:run src/game/towerAuras.test.ts`
Expected: FAIL — `frozenPieceIds is not a function` / not exported.

- [ ] **Step 3: Implement `frozenPieceIds`**

Append to `src/game/towerAuras.ts`:

```ts
/**
 * Move-interval multiplier for a Piece inside a Freezer's coverage. Higher is
 * slower — the mirror image of `KING_SPEED_MULTIPLIER`, which is below 1.
 */
export const FREEZE_MULTIPLIER = 1.5

/**
 * Every Piece currently standing inside a Freezer's coverage.
 *
 * Membership, not a count: two Freezers slow exactly as much as one, matching
 * the King aura. Ids are not needed here the way they are for the Amplifier,
 * because a Freezer has nothing to exclude itself from — it slows Pieces, and
 * a Tower is not a Piece.
 *
 * NOTE THIS SLOWS GRINDING AS WELL AS WALKING. A blocked Piece attacks a Tower
 * on the same move cadence it would have walked on (see `movePieces`), so a
 * Freezer covering a Wall makes each ♥ buy more seconds of stall. That does
 * NOT loosen the round-termination bound — the ♥ supply is still fixed
 * mid-round, because `buyPack` is refused while a round is live — so rounds
 * get slower, never endless. Accepted deliberately; see "Repair versus the
 * wall" in the design doc.
 */
export function frozenPieceIds(
  towers: readonly Tower[],
  pieces: readonly Piece[],
): ReadonlySet<string> {
  const frozen = new Set<string>()

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    if (def.aura !== 'freeze') continue

    for (const piece of pieces) {
      if (coversSquare(def.geometry, def.range, tower.square, piece.square)) frozen.add(piece.id)
    }
  }

  return frozen
}
```

- [ ] **Step 4: Apply it in `movePieces`**

In `src/game/tick.ts`, extend the import:

```ts
import {
  FREEZE_MULTIPLIER,
  amplificationFor,
  amplifierIdsByPiece,
  frozenPieceIds,
} from './towerAuras'
```

In `tick`, beside where `buffed` is derived (after `const allPieces = ...`):

```ts
  const buffed = buffedPieceIds(allPieces)
  // Derived from tick-start Tower and Piece positions for the same reason
  // `buffed` and `towerBySquare` are: so no Piece's outcome depends on the
  // order Pieces are processed in.
  const frozen = frozenPieceIds(state.towers, allPieces)
```

Pass it to `movePieces`:

```ts
  const moved = movePieces(
    allPieces,
    state.board,
    state.core.square,
    towerBySquare,
    dtMs,
    buffed,
    frozen,
  )
```

Add the parameter to the signature:

```ts
function movePieces(
  pieces: readonly Piece[],
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  dtMs: number,
  buffed: ReadonlySet<string>,
  frozen: ReadonlySet<string>,
): { pieces: Piece[]; leaked: number; towerDamage: Map<string, number>; promoted: Square[] } {
```

And apply it where the interval is computed, replacing the existing `moveIntervalMs` line:

```ts
    const isBuffed = buffed.has(piece.id)
    const buffedInterval = isBuffed ? baseInterval * KING_SPEED_MULTIPLIER : baseInterval
    // A King's buff and a Freezer's slow COMPOSE rather than override: 0.7 x
    // 1.5 = 1.05, so a King almost exactly cancels a freeze. That is the
    // intended reading — the King is the Chess faction's answer to the
    // Freezer, not immune to it.
    const moveIntervalMs = frozen.has(piece.id) ? buffedInterval * FREEZE_MULTIPLIER : buffedInterval
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test:run src/game/towerAuras.test.ts`
Expected: PASS.

Run: `pnpm test:run`
Expected: PASS, everything.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/towerAuras.ts src/game/towerAuras.test.ts src/game/tick.ts
git commit -m "Add the rank 9 Freezer aura

A Piece inside the disc has its move interval multiplied by 1.5 -- the
mirror of KING_SPEED_MULTIPLIER, and derived per tick from position with
no duration state, so nothing new changes every tick.

The King's buff and the freeze compose rather than override: 0.7 x 1.5 =
1.05, so a King very nearly cancels a freeze. Read as intended -- the
King is the Chess faction's answer to the Freezer.

A blocked Piece attacks on the same cadence it walks on, so this slows
grinding too. That lengthens a wall stall without loosening its bound:
the heart supply is still fixed mid-round."
```

---

### Task 6: A ♥-fed Wall still falls

**Files:**
- Modify: `src/game/roundTermination.test.ts`

**Interfaces:**
- Consumes: rank 7 as the Wall from Task 2.
- Produces: nothing consumed downstream.

The design deliberately left "Repair versus the wall" open, on the grounds that the existing bound survives the Wall untouched: ♥ supply is fixed mid-round because `buyPack` is refused while a round is live, so the Wall runs out of repairs and falls. That reasoning is only a comment until a test asserts it.

- [ ] **Step 1: Read the existing suite first**

Read `src/game/roundTermination.test.ts` in full. It already has a `grind` helper building a rank-5 Tower with a Pawn attacking it from up-file, and a `HEAL_DEFICIT` constant whose docstring explains it must divide evenly into the Tower's max health at 1 damage per hop. The new test follows that shape; do not duplicate the helper if it can be parameterised.

- [ ] **Step 2: Write the failing test**

Add to `src/game/roundTermination.test.ts`:

```ts
describe('the rank 7 Wall', () => {
  it('has no gun, so it can never shoot back at what grinds it', () => {
    // The premise of everything below. A Wall is the diagonal blind spot
    // generalised: rank 5 cannot shoot a Piece directly up-file, and rank 7
    // cannot shoot anything at all.
    expect(TOWER_RANKS[7].geometry).toBe('none')
    expect(TOWER_RANKS[7].damage).toBe(0)
  })

  it('still falls when fed every ♥ in the Deck, and the round still ends', () => {
    // WHY THIS TEST EXISTS. "Repair versus the wall" is an OPEN design
    // question, left open on the grounds that the existing bound survives the
    // Wall: ♥ supply is fixed for a round's whole duration because buyPack is
    // refused while a round is live, so repair runs out, the Wall falls, and
    // the round resumes. That is reasoning, not evidence, until this runs.
    const HEARTS = 4

    const built = withTower(7, TOWER_SQUARE)
    const seeded = withDeck(
      Array.from({ length: HEARTS }, (_, index) => standardCard(`h${index}`, 7, 'hearts')),
      built,
    )
    let state = liveRound(seeded, [pawnAt('grinder', GRINDER_SQUARE)])

    // Grind, repairing to full whenever the deficit is large enough and a ♥ is
    // left. A ♥ must match the Tower's rank, hence rank 7 hearts above.
    for (const card of ['h0', 'h1', 'h2', 'h3']) {
      state = runFor(state, 20_000)
      if (state.towers.length === 0) break
      state = step(state, { kind: 'supportTower', cardId: card, towerId: firstTowerId(state) })
    }

    state = runFor(state, 120_000)

    expect(state.towers).toHaveLength(0)
    expect(state.phase).not.toBe('inProgress')
  })
})
```

`TOWER_SQUARE` and `GRINDER_SQUARE` already exist at the top of the file, as does `runFor`. Import `firstTowerId` from `./fixtures` if it is not already imported.

- [ ] **Step 3: Run it**

Run: `pnpm test:run src/game/roundTermination.test.ts`

Expected: PASS. If it hangs or times out, that is the *finding* — it means the Wall has broken round termination and the "leave it open" decision in the spec is wrong. Stop and report it rather than adjusting the numbers to make it green.

If it fails because the Wall falls *before* all four ♥ are spent, the loop's `break` handles it and the assertions still hold. If it fails because a ♥ was refused, check the rank match: a ♥ reaches only a Tower of its own rank, so the cards must be rank 7.

- [ ] **Step 4: Run the full suite and typecheck**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add src/game/roundTermination.test.ts
git commit -m "Pin that a heart-fed Wall still falls

Repair versus the wall stays an open design question, left open because
the existing bound survives the Wall untouched: the heart supply is fixed
for a round's whole duration since buyPack is refused mid-round, so
repair runs out and the Wall falls.

That was reasoning rather than evidence. A Tower with no gun at all is
the sharpest version of the case, so it is the one worth asserting."
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`
- Modify: `src/ui/geometryLabels.ts` (docstring only — the `horizontal` note is now stale)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

Per CLAUDE.md's documentation structure: `game-design.md` is **what the game is**, `CLAUDE.md` is **how to work in this repo**. The spec is already frozen and must not be edited.

- [ ] **Step 1: Replace the rank ladder in `game-design.md`**

Find the `### Rank ladder` section. Replace its table with:

```markdown
| Rank | Firing geometry | Role | Pieces hit per shot |
| --- | --- | --- | --- |
| **2** | Adjacent — the eight surrounding squares | Point-blank executioner | 1 |
| **3** | Vertical — along its file | Lane sniper | 1 |
| **4** | Cross — horizontal and vertical | Crossroads | 1 |
| **5** | Diagonal — the X | The X, blind spot retained | 1 |
| **6** | Star — cross and diagonal together | 4 and 5 together | 1 |
| **7** | None — it never fires | **Wall** — blocks and soaks | 0 |
| **8** | Ring — a band at distance, hollow at its feet | **Amplifier** | 3 |
| **9** | Adjacent, tight | **Freezer** | 3 |
| **10** | Band — the full width of the board, ±1 rank | **Toll gate** | **everything it covers** |
```

Then replace the paragraph beginning "**Shape carries the rank's identity through 7.**" with:

```markdown
**Power rises with rank, but every rank trades something.** Coverage rises as
rank does; single-target damage falls. A rank 2 out-damages a rank 10 against
one Piece by six times, permanently, so a low rank can never become landfill —
and a rank 10 wins only when there is a crowd. This replaced a ladder that
scaled coverage, damage, fire rate and target count all at once, which made a
single rank-6 Tower carry auto-rounds for 45+ rounds unattended. See
[`2026-08-06-tower-role-rebalance-design.md`](../superpowers/specs/2026-08-06-tower-role-rebalance-design.md).

**Ranks 7, 8 and 9 are utility, not damage.** The Wall has no gun at all; the
Amplifier doubles what *other* Towers deal inside its ring and never its own
shot; the Freezer slows what it covers. Both auras are positional — a Piece is
slowed *while it stands in the coverage*, not for a duration after being hit —
so they stack no more than the King's aura does, and placement is the whole
decision.

**Rank 10 is where a horizontal line finally works.** Horizontal was tried at
rank 2 and rejected: Pieces travel down a file, so a horizontal line catches
each Piece for one move interval and therefore one shot. At rank 10, with
unlimited targets, "one toll on every Piece and nothing can go around it" is
the identity rather than the flaw. Files never grow — only ranks do — so a band
spans the full width for an entire run, while an Ace dilutes its share.
```

Keep the existing paragraphs on rank 2's move off horizontal and on rank 5's colour-preserving property; both are still true and still relevant.

- [ ] **Step 2: Update the open questions in `game-design.md`**

In the "Repair versus the wall" row, append:

```markdown
**Rank 7 is now a Wall with no gun at all**, which is the sharpest version of
this case — it can never break its own stall. It does not loosen the bound: the
♥ supply is still fixed mid-round because `buyPack` is refused while a round is
live, so a Wall runs out of repairs and falls. `roundTermination.test.ts` pins
that directly. Two things now lengthen a stall without unbounding it: the Wall's
health, deliberately tuned shy for exactly this reason, and the rank 9 Freezer,
which slows *grinding* as well as walking because a blocked Piece attacks on
its move cadence.
```

- [ ] **Step 3: Update `CLAUDE.md`**

Add to the domain vocabulary table, after the **Echo** row:

```markdown
| **Wall** | The **rank 7** Tower. No firing geometry at all — it blocks and soaks, and never shoots |
| **Amplifier** | The **rank 8** Tower. Pieces inside its ring take doubled damage from every *other* Tower, never from itself |
| **Freezer** | The **rank 9** Tower. Pieces inside its coverage move — and grind — slower |
| **Toll gate** | The **rank 10** Tower. A band spanning the full board width, hitting everything it covers for chip damage |
```

Add to the invariants list, after the "A support's value never depends on a rank" bullet:

```markdown
- **Coverage and single-target damage move in opposite directions up the rank ladder.** Raising damage or shortening a fire interval at the top without cutting coverage to match rebuilds issue #19 exactly — a single rank-6 Tower once carried auto-rounds for 45+ rounds unattended. `src/data/towerRanks.test.ts` pins both axes: no rank may cover more than 39 of an 8x8's other 63 squares, and single-target DPS must never rise with rank. These are the design, not tuning.
- **An Amplifier never amplifies its own fire.** A self-amplifying rank 8 is self-sufficient, which rebuilds the dominance problem one rank along. `amplificationFor` in `src/game/towerAuras.ts` is the single answer, and it mirrors the King never buffing itself.
- **Tower auras are positional, never timed.** A Piece is slowed or amplified *while it stands in the coverage*. Giving either a duration would add per-Piece state that changes every tick — the exact class of value `structuralKey` excludes to keep React renders rare.
```

In the "Current state" section, update the tower bullet to say ranks 7–9 are utility roles, and refresh the test count from `pnpm test:run`.

- [ ] **Step 4: Fix the stale docstring in `geometryLabels.ts`**

The docstring says "`horizontal` is currently unreachable — rank 2 was moved off it". Still true, but now worth pairing with why rank 10 is a `band` rather than `horizontal`:

```ts
 * Every geometry on the 2–10 ladder in `src/data/towerRanks.ts` must appear
 * here. `horizontal` is currently unreachable — rank 2 was moved off it, and
 * rank 10's toll gate is a `band` rather than a `horizontal` because it is
 * bounded in board ranks but not in files. It is still in the union, and
 * `Record` will not let it be dropped.
```

- [ ] **Step 5: Verify the whole thing**

Run: `pnpm test:run`
Expected: PASS. Note the exact test count printed — it goes into the CLAUDE.md update in Step 3, and a stale figure there has leaked into a plan document before.

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md src/ui/geometryLabels.ts
git commit -m "Document the rebalanced ladder and its new invariants

game-design.md gets the new rank table, the coverage-versus-damage trade,
and why rank 10 is where a horizontal line finally works. The Repair
versus the wall question stays open, now recording that a gunless Wall is
its sharpest case and that the Freezer lengthens a stall without
unbounding it.

CLAUDE.md gains Wall, Amplifier, Freezer and Toll gate as vocabulary,
plus three invariants: the two axes must move in opposite directions, an
Amplifier never amplifies itself, and Tower auras are positional rather
than timed."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: new ladder → 2; rank 6 keeps star, loses reach → 2; rank 10 band → 1 and 2; the three utility mechanics → 1, 2, 4, 5; the numbers → 2; engine surface (`none`/`ring`/`band`, band before the distance guard) → 1; the amplifier self-exclusion rule → 4; auras don't stack → 4 and 5; known interaction (freeze slows grinding) → 5 (code comment) and 7 (design doc); verification: coverage test → 3, aura ordering → 4 and 5, wall round-termination → 6, amplifier self-exclusion pinned → 4, `towerRanks`/`firing` reshaped → 2; documentation → 7.

**The rejections** (ink factory, confuser, rarity change) are recorded in the frozen spec and correctly produce no task — they are decisions not to build.

**Placeholder scan.** Every code step carries real code. The two places the plan cannot pre-compute — the exact rank-8 target squares in `firing.test.ts` Step 5(c), and the existing shape of `roundTermination.test.ts` — are written as "read this, verify this specific geometric claim, adjust the square not the assertion", with the claim stated exactly.

**Type consistency.** `amplifierIdsByPiece` / `amplificationFor` / `AMPLIFIER_MULTIPLIER` / `frozenPieceIds` / `FREEZE_MULTIPLIER` are named identically in their definitions (Tasks 4, 5), their test files, and their `tick.ts` call sites. `TowerRankDef.aura` is `'amplify' | 'freeze'` at its definition (Task 2) and at both readers (Tasks 4, 5). `FIRING_RANKS` is defined once in `towerRanks.test.ts` Task 2 Step 4 and reused in Task 3.

**Known risk, flagged not hidden.** Task 2 Step 5 depends on the current contents of `firing.test.ts`'s `targets per shot` block, which the plan has read but which the implementer must re-read: rank 8 becoming a `ring` means squares at Chebyshev distance 1–2 from the Tower are now in the hollow core, and a test placing targets there would break or, worse, pass for the wrong reason.
