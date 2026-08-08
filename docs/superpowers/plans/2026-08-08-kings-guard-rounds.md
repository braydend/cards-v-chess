# King's Guard Rounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add King's Guard rounds — clustered King+slider squads every 8th round from round 15, replacing the normal composition.

**Architecture:** A new `src/data/guardRounds.ts` owns `isGuardRound`, `guardRoundSpec`, and the placeholder tuning constants. `roundSpec` in `src/data/rounds.ts` becomes a thin dispatcher that delegates to `guardRoundSpec` when `isGuardRound(roundNumber)` is true, otherwise runs the existing pool composition. The engine is untouched — a Guard round is just a different `RoundSpec`.

**Tech Stack:** TypeScript (strict), Vitest, pnpm.

## Global Constraints

- Guard rounds are at round numbers `15, 23, 31, …` — `roundNumber >= 15 && (roundNumber - 15) % 8 === 0`.
- A Guard round **replaces** the normal composition; it never adds spawns on top.
- A squad is **1 King + N sliders**, all on adjacent files, all sharing one `atMs`.
- Sliders are **Bishop, Rook, Queen only** (`slides: true`). Pawns and Knights never appear in a Guard round.
- The King and every slider draw their tier from `tierPoolFor(roundNumber)` — same pool, same interleave, in spawn order. No tier is locked to green.
- Squad count and sliders-per-squad **both grow** with round number (placeholder tuning in `guardRounds.ts`).
- No `Math.random` anywhere. Guard composition is deterministic — same round number, same spawns. Enforced by ESLint.
- Round 15: 1 squad, King + 2 sliders. Round 23: 2 squads, King + 2 sliders each. Round 31: 3 squads, King + 3 sliders each.
- Squad band starts are clamped so no band wraps mid-band (a 7->0 edge would strand a King's flanker); overlapping bands are legal (spawns stack on the Staging rank).
- `src/game/` must never import React or Three.js (this plan touches only `src/data/`, so it cannot violate it).
- The design authority is `docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md`. Read it before changing anything.

---

### Task 1: `guardRounds.ts` — scheduling predicate and tuning constants

**Files:**
- Create: `src/data/guardRounds.ts`
- Test: `src/data/guardRounds.test.ts`

**Interfaces:**
- Produces: `GUARD_ROUND_FIRST: number` (= 15), `GUARD_ROUND_EVERY: number` (= 8), `isGuardRound(roundNumber: number): boolean`. Later tasks use `isGuardRound` for the dispatcher and the spec builder.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { GUARD_ROUND_EVERY, GUARD_ROUND_FIRST, isGuardRound } from './guardRounds'

describe('isGuardRound', () => {
  it('flags rounds 15, 23, 31 and no others in that range', () => {
    for (let n = 1; n <= 40; n += 1) {
      const expected = n >= GUARD_ROUND_FIRST && (n - GUARD_ROUND_FIRST) % GUARD_ROUND_EVERY === 0
      expect(isGuardRound(n)).toBe(expected)
    }
  })

  it('never flags a round before the first Guard round', () => {
    for (let n = 1; n < GUARD_ROUND_FIRST; n += 1) {
      expect(isGuardRound(n)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/data/guardRounds.test.ts`
Expected: FAIL — `Cannot find module './guardRounds'`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * King's Guard round composition.
 *
 * Every 8th round starting at round 15 is a Guard round: it replaces the
 * normal pool composition with clustered King+slider squads, so the King's
 * aura (0.7x move interval, +1 slide to adjacent pieces) actually fires on
 * entry. See the design spec, docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md.
 */

/** The first round that can be a Guard round. Kings enter the pool at 11, so 15 gives the player a few rounds to meet one first. */
export const GUARD_ROUND_FIRST = 15

/** How often a Guard round appears once it can. */
export const GUARD_ROUND_EVERY = 8

/**
 * Whether `roundNumber` is a Guard round. Pure arithmetic — no PRNG, so the
 * same run seed reproduces the same guard cadence for free.
 */
export function isGuardRound(roundNumber: number): boolean {
  return roundNumber >= GUARD_ROUND_FIRST && (roundNumber - GUARD_ROUND_FIRST) % GUARD_ROUND_EVERY === 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/data/guardRounds.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/guardRounds.ts src/data/guardRounds.test.ts
git commit -m "feat(data): schedule king's guard rounds every 8 from round 15"
```

---

### Task 2: `guardRoundSpec` — the squad builder

**Files:**
- Modify: `src/data/guardRounds.ts`
- Modify: `src/data/rounds.ts` (export `tierPoolFor` — see Step 1)
- Test: `src/data/guardRounds.test.ts`

**Interfaces:**
- Consumes: `GUARD_ROUND_FIRST`, `GUARD_ROUND_EVERY` from Task 1; `BOARD.files` from `src/data/board.ts`; `RoundSpec`, `Spawn`, `PieceTier`, `PieceTypeId` from `src/game/types`.
- Produces: `guardRoundSpec(roundNumber: number, tierPool: readonly PieceTier[], sliderPool: readonly PieceTypeId[]): RoundSpec`. The dispatcher (Task 3) passes `tierPoolFor(roundNumber)` and a slider-restricted pool; the engine's `RoundSpec` shape is unchanged.
- Requires `tierPoolFor` be exported from `src/data/rounds.ts` (currently module-private). Add the `export` keyword in Step 1 so the test can import it.

- [ ] **Step 1: Write the failing test**

First, export `tierPoolFor` from `src/data/rounds.ts` so the test can read it:

```ts
export function tierPoolFor(roundNumber: number): PieceTier[] {
```

(Extend the imports in `src/data/guardRounds.test.ts` to the following, and append the describe block:

```ts
import { describe, expect, it } from 'vitest'
import { GUARD_ROUND_EVERY, GUARD_ROUND_FIRST, guardRoundSpec, isGuardRound } from './guardRounds'
import { tierPoolFor } from './rounds'
import type { PieceTypeId, RoundSpec, Spawn } from '../game/types'

/**
 * The slider pool the spec builder receives: the normal tier pool for the
 * round, and a slider-only type pool built from the same WEIGHT interleave.
 * This mirrors exactly what Task 3's dispatcher will pass.
 */
function guardSpec(roundNumber: number): RoundSpec {
  const tierPool = tierPoolFor(roundNumber)
  // Sliders are the slides: true types. Bishops, Rooks and Queens only.
  const sliderPool: PieceTypeId[] = ['bishop', 'rook', 'queen', 'bishop', 'rook']
  return guardRoundSpec(roundNumber, tierPool, sliderPool)
}

/** Groups spawns into squads by shared `atMs`. */
function squadsOf(spec: RoundSpec): Spawn[][] {
  const byAt = new Map<number, Spawn[]>()
  for (const spawn of spec.spawns) {
    const group = byAt.get(spawn.atMs) ?? []
    group.push(spawn)
    byAt.set(spawn.atMs, group)
  }
  return [...byAt.values()]
}

const SLIDERS: readonly PieceTypeId[] = ['bishop', 'rook', 'queen']

describe('guardRoundSpec', () => {
  it('is deterministic — the same round composes the same way', () => {
    expect(guardSpec(15)).toEqual(guardSpec(15))
    expect(guardSpec(31)).toEqual(guardSpec(31))
  })

  it('builds one squad of King + 2 sliders at round 15', () => {
    const squads = squadsOf(guardSpec(15))
    expect(squads).toHaveLength(1)
    const [squad] = squads as [Spawn[]]
    const kings = squad.filter((s) => s.typeId === 'king')
    expect(kings).toHaveLength(1)
    expect(squad).toHaveLength(3)
  })

  it('scales squad count and squad size with the round number', () => {
    expect(squadsOf(guardSpec(15))).toHaveLength(1)
    expect(squadsOf(guardSpec(23))).toHaveLength(2)
    expect(squadsOf(guardSpec(31))).toHaveLength(3)
    // Round 31 squads are King + 3 sliders (4 members each).
    for (const squad of squadsOf(guardSpec(31))) {
      expect(squad).toHaveLength(4)
    }
  })

  it('has exactly one King and no pawns or knights in any squad', () => {
    for (const roundNumber of [15, 23, 31, 39]) {
      for (const squad of squadsOf(guardSpec(roundNumber))) {
        const kings = squad.filter((s) => s.typeId === 'king')
        expect(kings).toHaveLength(1)
        for (const spawn of squad) {
          expect(['king', ...SLIDERS]).toContain(spawn.typeId)
        }
      }
    }
  })

  it('sits every squad member on a contiguous band of files', () => {
    for (const roundNumber of [15, 23, 31, 39]) {
      for (const squad of squadsOf(guardSpec(roundNumber))) {
        const files = squad.map((s) => s.file).sort((a, b) => a - b)
        // Contiguous band: each pair of neighbours differs by 1. Checked
        // circularly so a wrap (if the clamp ever lets one through) is caught
        // as a single >1 gap rather than a break.
        const gaps = []
        for (let i = 0; i < files.length; i += 1) {
          const next = files[(i + 1) % files.length] as number
          const gap = (next - (files[i] as number) + 8) % 8
          if (gap !== 1) gaps.push(gap)
        }
        expect(gaps).toHaveLength(1)
      }
    }
  })

  it('keeps both flanking sliders adjacent to their King on the Staging rank', () => {
    for (const roundNumber of [15, 23, 31]) {
      for (const squad of squadsOf(guardSpec(roundNumber))) {
        const king = squad.find((s) => s.typeId === 'king') as Spawn
        expect(king).toBeDefined()
        // A King on the Staging rank has exactly two squares within Chebyshev
        // distance 1: the files immediately beside it. The band is contiguous
        // (asserted above), so the flanking sliders are the squad members at
        // king.file - 1 and king.file + 1 — where a band edge clips one, the
        // single flanking slider is beside the King instead.
        const adjacent = squad.filter(
          (s) => s.typeId !== 'king' && Math.abs(s.file - king.file) <= 1,
        )
        expect(adjacent.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('assigns tiers from the normal tier pool in spawn order', () => {
    const round = guardSpec(31)
    const tierPool = tierPoolFor(31)
    round.spawns.forEach((spawn, i) => {
      expect(spawn.tier).toBe(tierPool[i % tierPool.length])
    })
  })
})
```

Note: the `spawns` array is built squad-by-squad, in file order within a squad, so "spawn order" for the tier assertion is the array order — the test asserts exactly that.

Note: the `as [Spawn[]]`, `as number`, and `as Spawn` casts are **required** — this test must pass `pnpm typecheck`, and `noUncheckedIndexedAccess` makes the destructure, the modulo index, and the `find` possibly-undefined. Vitest (esbuild) strips types so the test runs without them, but CI runs typecheck; the casts match the style the implementation uses. Do not remove them.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/data/guardRounds.test.ts`
Expected: FAIL — `guardRoundSpec is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/guardRounds.ts`:

```ts
import { BOARD } from './board'
import type { PieceTier, PieceTypeId, RoundSpec, Spawn } from '../game/types'

/**
 * How many squads a Guard round gets. Both the squad count and the per-squad
 * slider count grow with the round number; these formulas are PLACEHOLDER
 * tuning — the shape (both grow) is the design.
 */
export function squadCountFor(roundNumber: number): number {
  const guardIndex = (roundNumber - GUARD_ROUND_FIRST) / GUARD_ROUND_EVERY
  return 1 + guardIndex
}

/**
 * How many sliders ride beside each King. Grows more slowly than the squad
 * count so early Guard rounds stay small. PLACEHOLDER tuning.
 */
export function slidersPerSquadFor(roundNumber: number): number {
  const guardIndex = (roundNumber - GUARD_ROUND_FIRST) / GUARD_ROUND_EVERY
  return 2 + Math.floor(guardIndex / 2)
}

/** Milliseconds between squads in a Guard round. PLACEHOLDER tuning. */
export const GUARD_SQUAD_GAP_MS = 1200

/**
 * Builds a Guard round's spawns: one squad per King, each King flanked by
 * sliders on adjacent files, all sharing one `atMs` so they enter the board
 * together and the King's aura fires on entry.
 *
 * The squad band start is clamped so a band never wraps mid-band — a King at
 * a 7->0 edge would lose a flanker. Bands can still overlap (later squads
 * reuse files), which is legal because spawns stack freely on the Staging rank.
 *
 * `tierPool` is `tierPoolFor(roundNumber)` and `sliderPool` is the slider-only
 * type pool; both come from the dispatcher (Task 3), which is what keeps the
 * normal round's pool logic in `rounds.ts`.
 */
export function guardRoundSpec(
  roundNumber: number,
  tierPool: readonly PieceTier[],
  sliderPool: readonly PieceTypeId[],
): RoundSpec {
  const squadCount = squadCountFor(roundNumber)
  const slidersPerSquad = slidersPerSquadFor(roundNumber)
  // Never wider than the board itself — a squad is a contiguous file band, and
  // there are only BOARD.files of those. Rounds 15–39 sit far below this cap.
  const bandWidth = Math.min(slidersPerSquad + 1, BOARD.files)
  const kingSlot = Math.floor((bandWidth - 1) / 2)
  const stride = bandWidth + 1

  const spawns: Spawn[] = []
  let sliderCursor = 0
  let spawnIndex = 0

  for (let squad = 0; squad < squadCount; squad += 1) {
    // Clamp the band start so a band never wraps mid-band: a King at a band
    // edge that wraps 7->0 would lose a flanker (file 0 is distance 7 from
    // file 7, not 1). Bands may still overlap — spawns stack freely on the
    // Staging rank — but each King keeps two adjacent flankers.
    const baseFile = Math.min((squad * stride) % BOARD.files, BOARD.files - bandWidth)
    const atMs = squad * GUARD_SQUAD_GAP_MS

    for (let slot = 0; slot < bandWidth; slot += 1) {
      const file = baseFile + slot
      const isKing = slot === kingSlot
      const typeId: PieceTypeId = isKing
        ? 'king'
        : (sliderPool[sliderCursor % sliderPool.length] as PieceTypeId)
      if (!isKing) sliderCursor += 1

      spawns.push({
        atMs,
        typeId,
        tier: tierPool[spawnIndex % tierPool.length] as PieceTier,
        file,
      })
      spawnIndex += 1
    }
  }

  return { number: roundNumber, spawns }
}
```

This gives: round 15 → 1 squad of 3 (King + 2 sliders, files 0,1,2), round 23 → 2 squads of 3 (files 0,1,2 and 4,5,6 — exactly the spec's illustrative layout), round 31 → 3 squads of 4 (files 0,1,2,3 / 4,5,6,7 / 2,3,4,5). The third squad overlaps the first — legal, since spawns stack on the Staging rank. Every King sits left-of-middle with both flanking sliders at file distance 1.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/data/guardRounds.test.ts`
Expected: PASS — including the flanker-adjacency test, which asserts a floor of 2. (The spec's "bands wrap modulo the file count" wording is superseded here by clamping: a band that wraps 7->0 would strand its King's flanker at file distance 7. The spec's own layout goal — "both flanking sliders at Chebyshev distance 1" — wins; clamping is the placeholder formula that satisfies it. Overlapping bands still occur, which the spec already permits.)

- [ ] **Step 5: Run the full suite**

Run: `pnpm test:run`
Expected: PASS — no existing test depends on round composition at 15, 23, 31 (the existing `rounds.test.ts` only inspects rounds 1–14).

- [ ] **Step 6: Commit**

```bash
git add src/data/guardRounds.ts src/data/guardRounds.test.ts src/data/rounds.ts
git commit -m "feat(data): build king's guard squads"
```

---

### Task 3: Dispatcher — `roundSpec` delegates to Guard rounds

**Files:**
- Modify: `src/data/rounds.ts:115`
- Test: `src/data/rounds.test.ts`

**Interfaces:**
- Consumes: `isGuardRound`, `guardRoundSpec` from `src/data/guardRounds.ts`.
- Produces: `roundSpec(roundNumber: number): RoundSpec` now returns Guard composition for Guard round numbers, normal composition otherwise. `step.ts` (`src/game/step.ts:52`) keeps calling `roundSpec` unchanged.

- [ ] **Step 1: Write the failing test**

Append to `src/data/rounds.test.ts`:

```ts
import { isGuardRound } from './guardRounds'

describe('round dispatch', () => {
  it('returns Guard composition for Guard round numbers', () => {
    const spec = roundSpec(15)
    expect(isGuardRound(15)).toBe(true)
    // Guard rounds are King + sliders only — no pawns, no knights.
    for (const spawn of spec.spawns) {
      expect(['king', 'bishop', 'rook', 'queen']).toContain(spawn.typeId)
    }
  })

  it('keeps the normal composition for non-Guard rounds', () => {
    const spec = roundSpec(14)
    expect(isGuardRound(14)).toBe(false)
    // The normal pool still sends pawns.
    expect(spec.spawns.some((spawn) => spawn.typeId === 'pawn')).toBe(true)
  })

  it('is still deterministic at a Guard round number', () => {
    expect(roundSpec(23)).toEqual(roundSpec(23))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/data/rounds.test.ts`
Expected: FAIL — `roundSpec(15)` currently returns the normal pool composition (pawns present).

- [ ] **Step 3: Write minimal implementation**

In `src/data/rounds.ts`, add the import and make `roundSpec` dispatch:

```ts
import { guardRoundSpec, isGuardRound } from './guardRounds'
```

```ts
/**
 * The slider-only type pool a Guard round's sliders draw from: the slides:
 * true types, interleaved by the same WEIGHT logic as `poolFor`. The Guard
 * round uses only sliders, because only they receive the King's +1 slide —
 * see the kings-guard-rounds spec.
 */
function sliderPoolFor(): PieceTypeId[] {
  const sliders: readonly PieceTypeId[] = ['bishop', 'rook', 'queen']
  const passes = Math.max(...sliders.map((typeId) => WEIGHT[typeId]))
  const pool: PieceTypeId[] = []
  for (let pass = 1; pass <= passes; pass += 1) {
    for (const typeId of sliders) {
      if (WEIGHT[typeId] >= pass) pool.push(typeId)
    }
  }
  return pool
}

export function roundSpec(roundNumber: number): RoundSpec {
  if (isGuardRound(roundNumber)) {
    return guardRoundSpec(roundNumber, tierPoolFor(roundNumber), sliderPoolFor())
  }

  const pool = poolFor(roundNumber)
  const tierPool = tierPoolFor(roundNumber)
  const count = 2 + roundNumber
  const spawns: Spawn[] = []

  for (let i = 0; i < count; i += 1) {
    spawns.push({
      atMs: i * 1200,
      // `pool` is never empty — the Pawn is available from round 1.
      typeId: pool[i % pool.length] as PieceTypeId,
      // `tierPool` is never empty — Green is available from round 1.
      tier: tierPool[i % tierPool.length] as PieceTier,
      file: (i * 3 + roundNumber) % BOARD.files,
    })
  }

  return { number: roundNumber, spawns }
}
```

`sliderPoolFor` returns `['bishop', 'rook', 'queen', 'bishop', 'rook']` (bishop and rook have WEIGHT 2, queen WEIGHT 1), so a round-15 squad of King + 2 sliders gets a Bishop and a Rook. `tierPoolFor(15)` is non-empty (Green weight stays at `max(1, …)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/data/rounds.test.ts`
Expected: PASS — the three new dispatch tests plus all pre-existing round/tier composition tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test:run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/rounds.ts src/data/rounds.test.ts
git commit -m "feat(data): dispatch roundSpec to guard rounds"
```

---

### Task 4: Update the design doc's current-state section

The living design doc must reflect that Guard rounds now exist. Do not restate the spec's full reasoning — just the current state.

**Files:**
- Modify: `docs/design/game-design.md`

**Interfaces:**
- Consumes: nothing new from code.
- Produces: a short subsection under "Runs" (or wherever round composition is discussed) recording the Guard round schedule and shape.

- [ ] **Step 1: Add the section**

Under "### Seeds" or a new "### Round composition" heading in the Runs section, add:

> **King's Guard rounds.** Every 8th round starting at round 15 (15, 23, 31, …) replaces the normal composition with one or more **squads**: a King flanked by sliders (Bishop, Rook, Queen only) on adjacent files, spawning together so the King's aura fires as the squad enters. Both the squad count and each squad's size grow with the round number. The King and its sliders all draw tiers from the normal tier pool, so a late Guard round's King can be yellow, red, or black. Composition lives in `src/data/guardRounds.ts`; the squad and size formulas are placeholder tuning. See [`docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md`](../superpowers/specs/2026-08-08-kings-guard-rounds-design.md) for the full reasoning.

- [ ] **Step 2: Verify**

Run: `git diff docs/design/game-design.md` — confirm only the intended addition.

- [ ] **Step 3: Commit**

```bash
git add docs/design/game-design.md
git commit -m "docs: record king's guard rounds in the design doc"
```

---

### Task 5: Full verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: no errors. (`src/data/` importing `src/game/types` is fine; no React/Three.js anywhere.)

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm test:run`
Expected: all tests pass.

- [ ] **Step 4: Run coverage**

Run: `pnpm test:coverage`
Expected: passes the existing thresholds. `src/data/` is excluded from coverage, so no new threshold applies.

- [ ] **Step 5: Run build**

Run: `pnpm build`
Expected: succeeds.
