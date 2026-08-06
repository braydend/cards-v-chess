# Tower Firing Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Tower's shots visible as an expanding ring of lit squares clipped to its real firing geometry, so the player can read where a Tower reaches and how often it fires.

**Architecture:** Renderer-only. A new pure module `src/scene/firePulse.ts` detects shots by watching `Tower.fireCooldownMs` fall between frames, and computes each square's brightness from every in-flight pulse. A new `src/scene/FirePulses.tsx` drives it from `useFrame` and writes the results into one instanced quad per board square, additively blended. Nothing in `src/game/`, `src/data/` or `src/state/` changes.

**Tech Stack:** TypeScript (strict), React Three Fiber, drei `Instances`, three.js `Color` / `AdditiveBlending`, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-06-tower-firing-animation-design.md`](../specs/2026-08-06-tower-firing-animation-design.md)

## Global Constraints

- **`src/game/` and `src/data/` must never import React or three.js.** This work touches neither, but do not "help" by adding a field to the engine — ESLint fails the build.
- **`src/scene/` must import engine code through the `../game` barrel**, never a module inside it (`../game/coverage` is a lint error; `../game` is correct). **Test files are exempt**, which is what lets `firePulse.test.ts` import `../game/fixtures`.
- **Do not allocate in the frame loop.** Reuse module-level scratch objects and caller-owned buffers. Two exceptions are deliberate and explained in Task 1 — the array `detectShots` returns, and the `FirePulse` records themselves — do not "fix" them. Anything else that allocates per frame, such as compacting the live-pulse list, is in scope for you to fix.
- **Never call `setState` inside `useFrame`.** Mutate refs.
- **A growing `limit` on drei's `Instances` needs a `key` on the same value.** Non-negotiable — see the Ace wedge in CLAUDE.md.
- **TypeScript config:** `strict`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `verbatimModuleSyntax: true`. So indexing an array or `Float32Array` yields `T | undefined` and must be guarded, and type-only imports must use `import type`.
- **This codebase has no non-null assertions (`!`).** Guard or default instead.
- **`src/scene/` is excluded from coverage thresholds** in `vite.config.ts`. Write the tests anyway — `towerDiff.ts`, `towerColour.ts` and `boardClick.ts` all have them. Do not add a threshold entry.
- **Commands:** `pnpm test:run` (single run — never `pnpm test`, which watches), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/scene/firePulse.ts` | **Create.** All the logic: the `FirePulse` record, shot detection, pulse lifetime, per-square colour accumulation, and the two feel constants. No React, no JSX. |
| `src/scene/firePulse.test.ts` | **Create.** Unit tests for the above, including one that drives the real engine. |
| `src/scene/FirePulses.tsx` | **Create.** Plumbing only: run the frame loop, draw the instanced quads. No decisions. |
| `src/scene/Board.tsx` | **Modify.** Mount `<FirePulses>` alongside the other ground overlays. One import, one line of JSX. |

The split exists because `src/scene/` has no jsdom and no component tests, so anything decided inside a `.tsx` cannot be tested at all. `firePulse.ts` follows `towerDiff.ts`: mutate-in-place, no React, no three.js beyond `Color`.

---

### Task 1: Shot detection

**Files:**
- Create: `src/scene/firePulse.ts`
- Test: `src/scene/firePulse.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Uses `tick` and the `Tower` / `BuildableRank` types from the `../game` barrel, and `liveRound` / `pawnAt` / `withTower` from `../game/fixtures` (tests only).
- Produces:
  - `interface FirePulse { readonly file: number; readonly boardRank: number; readonly cardRank: BuildableRank; readonly startedAt: number }`
  - `detectShots(lastCooldownMs: Map<string, number>, towers: readonly Tower[], now: number): FirePulse[]` — mutates `lastCooldownMs` in place.

**Why a cooldown decrease is an exact shot signal.** On exit from `fireTowers` in `src/game/tick.ts`, a Tower's stored `fireCooldownMs` is either below `fireIntervalMs` (it fired, subtracting one whole interval) or exactly `fireIntervalMs` (nothing in range, clamped to "ready" rather than banking shots). The stored value can never *exceed* the interval, so that clamp can only hold or raise it. ♦ Speed only lowers the interval. Therefore a decrease means a shot, and a shot always produces one.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/firePulse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { tick, type Tower } from '../game'
import { liveRound, pawnAt, withTower } from '../game/fixtures'
import { detectShots, type FirePulse } from './firePulse'

/** The fixed timestep `src/state/simulation.ts` drives the engine with. */
const FIXED_DT_MS = 1000 / 60

/** A Tower with the fields `detectShots` reads, overridable one at a time. */
function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower-1',
    square: { file: 3, rank: 3 },
    cardRank: 2,
    fireCooldownMs: 0,
    health: 8,
    maxHealth: 8,
    damage: 1,
    fireIntervalMs: 600,
    shield: 0,
    damageTaken: 0,
    ...overrides,
  }
}

describe('detectShots', () => {
  it('seeds a first-seen Tower without reporting a shot', () => {
    const last = new Map<string, number>()

    // No previous value means nothing to compare. A Tower built between frames
    // has no shot the renderer can honestly claim.
    expect(detectShots(last, [tower({ fireCooldownMs: 120 })], 1)).toEqual([])
    expect(last.get('tower-1')).toBe(120)
  })

  it('stays silent while the cooldown accumulates', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ fireCooldownMs: 120 })], 1)

    expect(detectShots(last, [tower({ fireCooldownMs: 137 })], 2)).toEqual([])
  })

  it('reports a shot when the cooldown decreases', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ fireCooldownMs: 590 })], 1)

    const pulses = detectShots(last, [tower({ fireCooldownMs: 7 })], 2)

    expect(pulses).toEqual([{ file: 3, boardRank: 3, cardRank: 2, startedAt: 2 }])
  })

  it('stays silent when a target-less Tower clamps up to its interval', () => {
    const last = new Map<string, number>()
    // `fireTowers` holds a Tower with nothing in range at exactly
    // fireIntervalMs rather than banking shots, so the value rises to the
    // interval and then stops. It never drops, so it must never read as a shot.
    detectShots(last, [tower({ fireCooldownMs: 583 })], 1)

    expect(detectShots(last, [tower({ fireCooldownMs: 600 })], 2)).toEqual([])
    expect(detectShots(last, [tower({ fireCooldownMs: 600 })], 3)).toEqual([])
  })

  it('carries the square and card rank, so a Tower destroyed mid-flight still draws', () => {
    const last = new Map<string, number>()
    const placed = { id: 'tower-9', cardRank: 5 as const, square: { file: 6, rank: 2 } }
    detectShots(last, [tower({ ...placed, fireCooldownMs: 480 })], 1)

    const pulses = detectShots(last, [tower({ ...placed, fireCooldownMs: 12 })], 2)

    // The Tower can now leave state entirely and the pulse still knows where it
    // was — the same reason `Ghost` carries its own square in towerDiff.ts.
    expect(detectShots(last, [], 3)).toEqual([])
    expect(pulses).toEqual([{ file: 6, boardRank: 2, cardRank: 5, startedAt: 2 }])
  })

  it('prunes a Tower that has left state', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower()], 1)
    expect(last.has('tower-1')).toBe(true)

    detectShots(last, [], 2)

    // Without this, `reset()` reusing `tower-1` would be compared against a
    // stale cooldown from the previous run and report a shot that never happened.
    expect(last.has('tower-1')).toBe(false)
  })

  it('reports a shot that a real tick produced', () => {
    // The load-bearing test. Everything rests on "a decrease means a shot",
    // which was established by reading `fireTowers` — hand-rolled Towers would
    // only re-assert that reading. This drives the real engine, so a change to
    // `fireTowers`'s cooldown bookkeeping fails here instead of silently
    // killing the animation.
    //
    // Rank 2 is `adjacent` range 1, so a Pawn on the neighbouring square is
    // covered. The Tower is built through the command surface, per CLAUDE.md.
    let state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pawnAt('piece-1', { file: 3, rank: 4 }),
    ])

    const last = new Map<string, number>()
    const pulses: FirePulse[] = []

    // 40 steps is 667ms. `cardPlays.ts` builds a Tower at `fireCooldownMs: 0`,
    // so the first shot lands around step 36 and a second could not arrive
    // before step 72 — hence exactly one. It is also short of the Pawn's first
    // 900ms hop, so the Pawn stays covered throughout. `detectShots` runs every
    // step because that is what the frame loop does; sampling once at the end
    // would read a cooldown that has already wrapped.
    for (let i = 0; i < 40; i += 1) {
      state = tick(state, FIXED_DT_MS)
      pulses.push(...detectShots(last, state.towers, i / 60))
    }

    expect(pulses).toHaveLength(1)
    expect(pulses[0]).toMatchObject({ file: 3, boardRank: 3, cardRank: 2 })
  })

  it('reports nothing from a real tick while the Piece is out of range', () => {
    // Same Tower, Pawn four squares away — outside rank 2's range of 1. The
    // Tower reaches "ready" and holds there, so the cooldown never falls.
    let state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pawnAt('piece-1', { file: 7, rank: 7 }),
    ])

    const last = new Map<string, number>()
    const pulses: FirePulse[] = []

    for (let i = 0; i < 40; i += 1) {
      state = tick(state, FIXED_DT_MS)
      pulses.push(...detectShots(last, state.towers, i / 60))
    }

    expect(pulses).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/firePulse.test.ts`
Expected: FAIL — `Failed to resolve import "./firePulse"`, because the module does not exist yet.

- [ ] **Step 3: Create the module**

Create `src/scene/firePulse.ts`:

```ts
import type { BuildableRank, Tower } from '../game'

/**
 * One shot's expanding ring.
 *
 * Carries its own square and card rank rather than a Tower id, for the same
 * reason `Ghost` does in towerDiff.ts: a Tower can be destroyed while its last
 * shot is still travelling, and once it leaves `GameState` this record is the
 * only place the renderer still knows where the shot came from.
 */
export interface FirePulse {
  readonly file: number
  readonly boardRank: number
  readonly cardRank: BuildableRank
  /** Clock seconds when the shot happened. */
  readonly startedAt: number
}

/**
 * Reconciles remembered cooldowns against live Towers and returns a pulse for
 * every Tower that has fired since the last call. Mutates `lastCooldownMs` in
 * place — seeding Towers it has not seen, updating the rest, and pruning ones
 * that have left state.
 *
 * A DECREASE IN `fireCooldownMs` IS AN EXACT SHOT SIGNAL. On exit from
 * `fireTowers` the stored value is either below `fireIntervalMs` (it fired,
 * subtracting one whole interval) or exactly `fireIntervalMs` (nothing in
 * range, clamped to "ready" rather than banking shots). The stored value can
 * never exceed the interval, so that clamp can only hold or raise it, and ♦
 * Speed only ever lowers the interval. So a decrease means a shot, and a shot
 * always produces one.
 *
 * It also cannot under-count. A frame advances at most
 * `FIXED_DT_MS * MAX_CATCHUP_STEPS` = 83.3ms of simulation, so at the 100ms
 * `MIN_FIRE_INTERVAL_MS` floor a Tower would need a stored cooldown of 116.7ms
 * to fire twice in one frame — impossible, since it never exceeds the interval.
 * One pulse per observed decrease is right.
 *
 * The known gap is a false NEGATIVE: a Tower that fires and then loses every
 * target within the same frame's ticks has its decrease erased by the clamp.
 * That needs two or more ticks per frame, so it cannot happen above roughly
 * 30fps, and it is accepted — see the spec.
 *
 * Returns a fresh array, and a `FirePulse` is allocated per shot. Both are
 * deliberate: a shot must allocate a record regardless, so zero allocation is
 * unreachable here, and what remains is one small array per frame rather than
 * the per-entity-per-frame `new Vector3()` CLAUDE.md's rule targets.
 */
export function detectShots(
  lastCooldownMs: Map<string, number>,
  towers: readonly Tower[],
  now: number,
): FirePulse[] {
  const pulses: FirePulse[] = []

  for (const tower of towers) {
    const previous = lastCooldownMs.get(tower.id)
    lastCooldownMs.set(tower.id, tower.fireCooldownMs)

    if (previous === undefined) continue
    if (tower.fireCooldownMs >= previous) continue

    pulses.push({
      file: tower.square.file,
      boardRank: tower.square.rank,
      cardRank: tower.cardRank,
      startedAt: now,
    })
  }

  // Only when the sizes disagree, so the common frame — nothing built, nothing
  // destroyed — does no extra work. Pruning matters because `reset()` rewinds
  // Tower ids to 1: a stale cooldown under a reused id would read as a shot.
  if (lastCooldownMs.size !== towers.length) {
    for (const id of lastCooldownMs.keys()) {
      if (!towers.some((tower) => tower.id === id)) lastCooldownMs.delete(id)
    }
  }

  return pulses
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/firePulse.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Check types and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean. If lint complains about importing `../game/fixtures`, confirm the file is named `firePulse.test.ts` — the inbound barrel rule exempts `**/*.test.{ts,tsx}` only.

- [ ] **Step 6: Commit**

```bash
git add src/scene/firePulse.ts src/scene/firePulse.test.ts
git commit -m "Detect a Tower's shots from its firing cooldown

fireCooldownMs is already an exact shot signal: fireTowers leaves it at
or below fireIntervalMs, a shot subtracts one whole interval, and the
no-target case clamps upward, so a decrease is a shot and a shot always
produces one. Reading it needs no engine change and adds nothing to
structuralKey.

The load-bearing test drives real tick calls rather than hand-rolled
Towers, so a change to fireTowers's cooldown bookkeeping fails the test
instead of silently killing the animation."
```

---

### Task 2: Pulse lifetime and per-square colour

**Files:**
- Modify: `src/scene/firePulse.ts` (append — do not touch `detectShots`)
- Test: `src/scene/firePulse.test.ts` (append)

**Interfaces:**
- Consumes: `FirePulse` from Task 1.
- Produces:
  - `PULSE_SQUARES_PER_SECOND: number` (22) and `PULSE_FADE_MS: number` (160)
  - `isPulseLive(pulse: FirePulse, now: number): boolean`
  - `accumulatePulses(out: Float32Array, board: BoardSpec, pulses: readonly FirePulse[], now: number): void`

**The intensity rule.** For a square at Chebyshev distance `d` from the pulse's origin:

```
arrival   = d / PULSE_SQUARES_PER_SECOND
age       = (now - startedAt) - arrival
intensity = coversSquare(geometry, range, origin, square) && 0 <= age < fadeSec
              ? 1 - age / fadeSec
              : 0
```

`geometry` and `range` come from `towerRank(pulse.cardRank)`. They are pure functions of the card rank — no support touches either (♥ repairs, ♦ lowers the interval, ♠ moves health, ♣ raises damage), and `Tower` carries no geometry or range field at all; `fireTowers` looks them up the same way. That is why the record stores only the rank.

Calling the engine's `coversSquare` rather than re-deriving the shapes is the point of the whole design: the pulse then cannot disagree with what the Tower actually hits, or with `CoveragePreview`, because all three go through one predicate.

- [ ] **Step 1: Write the failing tests**

In `src/scene/firePulse.test.ts`, **replace** the import block written in Task 1 with this one. Do not add a second `from '../game'` or `from './firePulse'` line — merge into these:

```ts
import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { tick, type BoardSpec, type BuildableRank, type Tower } from '../game'
import { liveRound, pawnAt, withTower } from '../game/fixtures'
import {
  accumulatePulses,
  detectShots,
  isPulseLive,
  PULSE_FADE_MS,
  PULSE_SQUARES_PER_SECOND,
  type FirePulse,
} from './firePulse'
import { RANK_COLOURS } from './rankColours'
```

Then append these suites below the existing `describe('detectShots', ...)`:

```ts
/** Local, not `BOARD` from data/ — a balance tweak must not break these. */
const board: BoardSpec = { files: 8, ranks: 8 }

/**
 * The red channel written for a square — a proxy for "lit", enough to assert
 * direction and ratios on. `?? 0` because `noUncheckedIndexedAccess` makes a
 * Float32Array read `number | undefined`, and this codebase has no `!`.
 */
function channel(out: Float32Array, file: number, boardRank: number): number {
  return out[(boardRank * board.files + file) * 3] ?? 0
}

function pulseAt(cardRank: BuildableRank, file = 3, boardRank = 3): FirePulse {
  return { file, boardRank, cardRank, startedAt: 0 }
}

describe('accumulatePulses', () => {
  it('lights nothing outside the footprint', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    // Rank 4 is `cross`. The square directly up-file is covered; its diagonal
    // neighbour, at the same Chebyshev distance, is not.
    accumulatePulses(out, board, [pulseAt(4)], 1 / PULSE_SQUARES_PER_SECOND)

    expect(channel(out, 3, 4)).toBeGreaterThan(0)
    expect(channel(out, 4, 4)).toBe(0)
  })

  it('lights nothing the wave has not reached yet', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    // Rank 4 reaches 4 squares. At 50ms the ring has passed d=1 (45ms) but is
    // nowhere near d=4 (182ms).
    accumulatePulses(out, board, [pulseAt(4)], 0.05)

    expect(channel(out, 3, 4)).toBeGreaterThan(0)
    expect(channel(out, 3, 7)).toBe(0)
  })

  it('fades a square from full to nothing over PULSE_FADE_MS', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    const pulse = pulseAt(4)
    const arrival = 1 / PULSE_SQUARES_PER_SECOND
    const fadeSec = PULSE_FADE_MS / 1000

    accumulatePulses(out, board, [pulse], arrival)
    const full = channel(out, 3, 4)

    accumulatePulses(out, board, [pulse], arrival + fadeSec / 2)
    const half = channel(out, 3, 4)

    // Sampled clearly past the fade, not exactly on it. `(arrival + fadeSec)`
    // minus `arrival` in doubles is 0.15999999999999998, a hair under the
    // threshold, which leaves an intensity of 2.2e-16 rather than 0 and would
    // fail the assertion below for no behavioural reason.
    accumulatePulses(out, board, [pulse], arrival + fadeSec + 0.01)

    // Compared against the rank colour rather than a hard-coded float, so a
    // palette change does not break this. `new Color(hex)` converts sRGB into
    // the renderer's working space, which is what the implementation stores.
    expect(full).toBeCloseTo(new Color(RANK_COLOURS[4]).r, 5)
    expect(half).toBeCloseTo(full / 2, 5)
    expect(channel(out, 3, 4)).toBe(0)
  })

  it('zeroes the buffer before summing, so a departed pulse leaves no residue', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(out, board, [pulseAt(4)], 1 / PULSE_SQUARES_PER_SECOND)
    expect(channel(out, 3, 4)).toBeGreaterThan(0)

    accumulatePulses(out, board, [], 1 / PULSE_SQUARES_PER_SECOND)

    expect(channel(out, 3, 4)).toBe(0)
  })

  it('sums two pulses covering the same square', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    const below = pulseAt(4, 3, 3)
    const above = pulseAt(4, 3, 5)
    const arrival = 1 / PULSE_SQUARES_PER_SECOND

    accumulatePulses(out, board, [below], arrival)
    const single = channel(out, 3, 4)

    // {3,4} sits one square from each origin along the file, so both rings
    // reach it at the same instant.
    accumulatePulses(out, board, [below, above], arrival)

    expect(channel(out, 3, 4)).toBeCloseTo(single * 2, 5)
  })

  it('never writes past the squares the board actually has', () => {
    const squareFloats = board.files * board.ranks * 3
    const out = new Float32Array(squareFloats + 12)
    out.fill(-1, squareFloats)

    // Rank 8 is `star` at range 6, so from the corner its footprint runs well
    // past two edges of an 8x8 board.
    accumulatePulses(out, board, [pulseAt(8, 0, 0)], 0.2)

    expect(channel(out, 1, 1)).toBeGreaterThan(0)
    expect(out[squareFloats]).toBe(-1)
    expect(out[squareFloats + 11]).toBe(-1)
  })
})

describe('isPulseLive', () => {
  it('stays live while the ring travels and through the outermost fade', () => {
    // Rank 4, range 4: sweep 182ms, plus 160ms of fade, so 342ms of life.
    const pulse = pulseAt(4)

    expect(isPulseLive(pulse, 0.1)).toBe(true)
    expect(isPulseLive(pulse, 0.3)).toBe(true)
    expect(isPulseLive(pulse, 0.35)).toBe(false)
  })

  it('gives a short-range Tower a shorter life than a long-range one', () => {
    // Rank 2 reaches 1 square (205ms of life); rank 8 reaches 6 (433ms).
    expect(isPulseLive(pulseAt(2), 0.25)).toBe(false)
    expect(isPulseLive(pulseAt(8), 0.25)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/firePulse.test.ts`
Expected: FAIL — `accumulatePulses`, `isPulseLive`, `PULSE_FADE_MS` and `PULSE_SQUARES_PER_SECOND` are not exported.

- [ ] **Step 3: Implement it**

Append to `src/scene/firePulse.ts`, and extend the top import block to:

```ts
import { Color } from 'three'
import { towerRank } from '../data/towerRanks'
import { coversSquare, type BoardSpec, type BuildableRank, type Tower } from '../game'
import { RANK_COLOURS } from './rankColours'
```

Then append:

```ts
/**
 * Presentation constants, tunable by feel — the same category as
 * `HIT_FLASH_MS` and `DEATH_FLARE_MS` in towerColour.ts. Nothing in the engine
 * reads them and neither is a balance value.
 *
 * Both are PLACEHOLDERS, but chosen so the cadence reads at both extremes:
 * rank 2 (range 1, fires 600ms) gives one 205ms blip then 395ms of dark, and
 * rank 10 stacked with ♦ down to the 100ms MIN_FIRE_INTERVAL_MS floor keeps
 * about 3.4 rings in flight, spaced 2.2 squares apart on a 4-square footprint.
 */
export const PULSE_SQUARES_PER_SECOND = 22
export const PULSE_FADE_MS = 160

const FADE_SECONDS = PULSE_FADE_MS / 1000

/**
 * Rank colours as three.js Colours, built once at module load exactly as
 * towerColour.ts builds its DAMAGED / FLASH / CRITICAL constants.
 *
 * `new Color(hex)` converts sRGB into the renderer's working space, so these
 * are directly summable and directly writable with `Color.setRGB`. Parsing the
 * hex by hand would skip that conversion and wash every pulse out.
 *
 * Written out entry by entry rather than built with `Object.fromEntries`, which
 * would need a type assertion. Exhaustive by construction: a new
 * `BuildableRank` makes this a type error.
 */
const RANK_RGB: Record<BuildableRank, Color> = {
  2: new Color(RANK_COLOURS[2]),
  3: new Color(RANK_COLOURS[3]),
  4: new Color(RANK_COLOURS[4]),
  5: new Color(RANK_COLOURS[5]),
  6: new Color(RANK_COLOURS[6]),
  7: new Color(RANK_COLOURS[7]),
  8: new Color(RANK_COLOURS[8]),
  9: new Color(RANK_COLOURS[9]),
  10: new Color(RANK_COLOURS[10]),
}

/**
 * Reused across every call so the frame loop allocates nothing. `coversSquare`
 * takes `Square`s, and building a fresh pair per square per pulse would be
 * thousands of objects a second. Mutable on purpose — `coversSquare` only ever
 * reads them.
 */
const scratchOrigin = { file: 0, rank: 0 }
const scratchTarget = { file: 0, rank: 0 }

/** Whether this pulse still has anything to draw. */
export function isPulseLive(pulse: FirePulse, now: number): boolean {
  const { range } = towerRank(pulse.cardRank)

  return now - pulse.startedAt < range / PULSE_SQUARES_PER_SECOND + FADE_SECONDS
}

/**
 * Sums every pulse's contribution into `out`, three floats per square, indexed
 * row-major by board rank then file — the order `allSquares` produces, so one
 * index serves both this buffer and the renderer's mesh array.
 *
 * Zeroes only the board's own region, never the whole buffer, so it cannot
 * clobber anything a caller keeps past the end. Allocates nothing: the caller
 * owns `out`, and the two `Square`s handed to `coversSquare` are module-level
 * scratch.
 *
 * Additive by design. The renderer draws with `AdditiveBlending`, where black
 * contributes nothing — so an unlit square needs no special case and
 * overlapping pulses simply sum into something brighter.
 */
export function accumulatePulses(
  out: Float32Array,
  board: BoardSpec,
  pulses: readonly FirePulse[],
  now: number,
): void {
  out.fill(0, 0, board.files * board.ranks * 3)

  for (const pulse of pulses) {
    const { geometry, range } = towerRank(pulse.cardRank)
    const rgb = RANK_RGB[pulse.cardRank]
    const elapsed = now - pulse.startedAt

    scratchOrigin.file = pulse.file
    scratchOrigin.rank = pulse.boardRank

    // Clamped to the board, which is also what guarantees no write lands
    // outside `out`.
    const minFile = Math.max(0, pulse.file - range)
    const maxFile = Math.min(board.files - 1, pulse.file + range)
    const minRank = Math.max(0, pulse.boardRank - range)
    const maxRank = Math.min(board.ranks - 1, pulse.boardRank + range)

    for (let boardRank = minRank; boardRank <= maxRank; boardRank += 1) {
      for (let file = minFile; file <= maxFile; file += 1) {
        // Chebyshev, the measure `coversSquare` uses for range.
        const distance = Math.max(
          Math.abs(file - pulse.file),
          Math.abs(boardRank - pulse.boardRank),
        )

        const age = elapsed - distance / PULSE_SQUARES_PER_SECOND
        if (age < 0 || age >= FADE_SECONDS) continue

        scratchTarget.file = file
        scratchTarget.rank = boardRank
        if (!coversSquare(geometry, range, scratchOrigin, scratchTarget)) continue

        const intensity = 1 - age / FADE_SECONDS
        const base = (boardRank * board.files + file) * 3

        // `?? 0` because `noUncheckedIndexedAccess` types these reads as
        // `number | undefined`, and this codebase has no non-null assertions.
        out[base] = (out[base] ?? 0) + rgb.r * intensity
        out[base + 1] = (out[base + 1] ?? 0) + rgb.g * intensity
        out[base + 2] = (out[base + 2] ?? 0) + rgb.b * intensity
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/firePulse.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Check types and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/scene/firePulse.ts src/scene/firePulse.test.ts
git commit -m "Compute a firing pulse's per-square brightness

An expanding ring clipped to the Tower's real firing geometry, so a rank
4 pulse spreads as a cross and a rank 5 as a diagonal X rather than the
generic ring issue #23 sketched. The clipping calls the engine's own
coversSquare, so the pulse cannot disagree with what the Tower hits or
with CoveragePreview's build-time footprint.

Contributions are summed in rank colour for additive blending, which is
what lets the renderer draw one instance per square and treat black as
unlit."
```

---

### Task 3: Draw it

**Files:**
- Create: `src/scene/FirePulses.tsx`
- Modify: `src/scene/Board.tsx` (add an import, and one line inside the fragment returned by `Board`)

**Interfaces:**
- Consumes: `detectShots`, `isPulseLive`, `accumulatePulses`, `FirePulse` from Tasks 1 and 2. `getState` from `../state/simulation`. `allSquares`, `squareKey`, `BoardSpec` from the `../game` barrel. `SQUARE_SIZE`, `fileToWorldX`, `rankToWorldZ` from `./coords`.
- Produces: `FirePulses`, a component taking `{ board: BoardSpec }`.

There are no tests in this task — `src/scene/` has no jsdom, which is exactly why Tasks 1 and 2 hold every decision. This file is plumbing, and it is verified by the compiler, the linter, and running the app.

- [ ] **Step 1: Create the component**

Create `src/scene/FirePulses.tsx`:

```tsx
import { Instance, Instances, type PositionMesh } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { AdditiveBlending, type Group } from 'three'
import { allSquares, squareKey, type BoardSpec } from '../game'
import { getState } from '../state/simulation'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'
import { accumulatePulses, detectShots, isPulseLive, type FirePulse } from './firePulse'

/**
 * Above the coverage preview, whose box top sits at 0.05, and the selection
 * marker at 0.06. Nothing in that stack writes depth, so there is no z-fight
 * against the board — but coplanar transparent quads sort unstably by camera
 * distance, so the pulse takes its own height and an explicit `renderOrder`
 * rather than relying on that sort. The box is 0.01 tall, so it spans
 * 0.065–0.075 and stays clear of the marker entirely.
 *
 * Drawing over a hovered build preview is fine: additive on teal lightens it,
 * for a fraction of a second.
 */
const PULSE_Y = 0.07
const PULSE_HEIGHT = 0.01

/**
 * A Tower's shots, as a ring of lit squares expanding through its firing
 * geometry — so the player can read where a Tower reaches and how often it
 * fires, neither of which a silent Tower shows.
 *
 * Every decision lives in `firePulse.ts` and is unit-tested; this is plumbing.
 * It subscribes to nothing: `board` arrives as a prop and everything else is
 * read live from `getState()` in the frame loop, the same way `Pieces.tsx`
 * interpolates. Nothing here reaches React, so a shot costs no render.
 *
 * The layer is a fixed instance per board square, mounted once and never
 * remounted for a shot. Additive blending is what makes that work: black
 * contributes nothing, so an unlit square needs no special case, and
 * overlapping pulses sum into something brighter for free. The alternative —
 * an instance per lit square per pulse — would need a `limit` guessed from a
 * concurrent pulse count that nothing bounds.
 */
export const FirePulses = memo(function FirePulses({ board }: { board: BoardSpec }) {
  const squares = useMemo(() => allSquares(board), [board])

  // An array, not a Map: `squareKey(square)` in the frame loop would allocate
  // a string per square per frame. `allSquares` is row-major (rank outer, file
  // inner), which is the order `accumulatePulses` writes, so one index serves
  // both.
  const meshes = useRef<(PositionMesh | null)[]>([])
  const pulses = useRef<FirePulse[]>([])
  const lastCooldownMs = useRef(new Map<string, number>())
  const lastEntityId = useRef(0)
  const group = useRef<Group>(null)

  // Reallocated only when the board grows, never per frame.
  const intensity = useMemo(() => new Float32Array(squares.length * 3), [squares.length])

  useFrame((state) => {
    const now = state.clock.elapsedTime
    const liveState = getState()

    // `reset()` rewinds `nextEntityId` to 1 — the only way it goes backwards
    // within a run. Without this, a previous run's pulses would ride into the
    // new one, and a remembered cooldown under a reused Tower id would read as
    // a shot that never happened.
    if (liveState.nextEntityId < lastEntityId.current) {
      pulses.current.length = 0
      lastCooldownMs.current.clear()
    }
    lastEntityId.current = liveState.nextEntityId

    // Compacted in place rather than with `filter`, which allocates a fresh
    // array on every frame — including the idle ones, where there is nothing
    // to filter. Mutating in place also keeps `pulses.current`'s identity
    // stable instead of rebinding the ref 60 times a second.
    const live = pulses.current
    let write = 0
    for (let read = 0; read < live.length; read += 1) {
      const pulse = live[read]
      if (pulse && isPulseLive(pulse, now)) {
        live[write] = pulse
        write += 1
      }
    }
    live.length = write

    pulses.current.push(...detectShots(lastCooldownMs.current, liveState.towers, now))

    // Toggle `visible` rather than unmount, so no material ever recompiles.
    // Stale colours behind a hidden group do not matter: the frame that makes
    // it visible again is a frame that accumulates first.
    if (group.current) group.current.visible = pulses.current.length > 0
    if (pulses.current.length === 0) return

    accumulatePulses(intensity, board, pulses.current, now)

    for (let i = 0; i < squares.length; i += 1) {
      const mesh = meshes.current[i]
      if (!mesh) continue

      const base = i * 3
      mesh.color.setRGB(
        intensity[base] ?? 0,
        intensity[base + 1] ?? 0,
        intensity[base + 2] ?? 0,
      )
    }
  })

  return (
    <group ref={group}>
      {/*
       * `key` is load-bearing, not decoration — do not remove it. See the long
       * comment in Board.tsx: drei's `Instances` sizes its buffers once from
       * `limit`, and a later `limit` change moves `mesh.count` without
       * resizing them, which is the Ace wedge.
       *
       * It is load-bearing here in a way it is not in `CoveragePreview`. That
       * component unmounts whenever nothing is hovered, so it reallocates by
       * accident. This one never unmounts, so an Ace really would grow `limit`
       * past buffers allocated at the old size.
       */}
      <Instances key={squares.length} limit={squares.length} renderOrder={1}>
        <boxGeometry args={[SQUARE_SIZE * 0.9, PULSE_HEIGHT, SQUARE_SIZE * 0.9]} />
        {/*
         * Additive so the pulse brightens whatever square it sits on. The rank
         * palette has uneven contrast against the board's cream and slate —
         * yellow rank 5 is weak on cream, grey rank 10 on slate — and additive
         * removes that problem outright instead of correcting per rank.
         *
         * `toneMapped={false}` because App.tsx passes no `gl` override, so R3F
         * applies its default ACES tone mapping, which rolls off precisely the
         * bright end additive blending produces.
         */}
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />

        {squares.map((square, index) => (
          <Instance
            key={squareKey(square)}
            // Braces, and no implicit return: React 19 treats a value returned
            // from a ref callback as a cleanup function.
            //
            // This fires far more often than mount and unmount. `GameScene`
            // selects `core`, which `tick` rebuilds every tick, so `Board`
            // re-renders on every publish — and drei's `Instance` reattaches
            // its ref on each one. Harmless here only because no timing lives
            // per-mesh: it is all on the `FirePulse` records, and a briefly
            // null handle is absorbed by the guard in the frame loop. See the
            // ghost ref comment in Towers.tsx for the version of this that
            // bites. `memo` above stops the churn anyway, since `board`
            // identity is stable between Aces.
            ref={(mesh: PositionMesh | null) => {
              meshes.current[index] = mesh
            }}
            // Black is invisible under additive blending, so an unlit square
            // needs nothing special — and this is correct on the first frame,
            // before useFrame has run once.
            color="#000000"
            position={[
              fileToWorldX(board, square.file),
              PULSE_Y,
              rankToWorldZ(board, square.rank),
            ]}
          />
        ))}
      </Instances>
    </group>
  )
})
```

- [ ] **Step 2: Mount it in Board.tsx**

In `src/scene/Board.tsx`, add the import beside the existing `CoveragePreview` one (imports are alphabetised by path in this file):

```ts
import { FirePulses } from './FirePulses'
```

Then add it to the fragment `Board` returns, after `SelectionMarker` — it draws above both overlays, so reading order matches draw order:

```tsx
      <CoveragePreview board={board} />
      <SelectionMarker board={board} />
      <FirePulses board={board} />
      <PlacementSurface board={board} />
```

- [ ] **Step 3: Check types and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: both clean. `react-hooks` rules apply to `.tsx` here, so a violation of the ref or dependency rules fails lint rather than appearing at runtime.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test:run`
Expected: every test passes, including `src/state/simulation.test.ts`'s bound on store publishes — this change adds none, because it touches neither `structuralKey` nor any engine state.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: clean typecheck then a successful production build.

- [ ] **Step 6: Verify it in the running app**

Run: `pnpm dev`, open the served URL, and check each of these:

1. Play a low card (a 2 or a 3) near the middle of the board, then start a round. When a Piece comes into range, a ring of lit squares expands from the Tower **in that rank's shape** — a 3 fires up and down its file only, never sideways.
2. Play a 4 and a 5 on the board together. The 4's pulse spreads as a cross, the 5's as a diagonal X, and the two are **different colours** matching their Tower bodies.
3. While a Tower is firing, pick a build Card from the Deck and hover near it. The teal build preview stays readable, and the pulse reads as separate from it.
4. Confirm a Tower with no Piece in range shows **nothing** — it is not firing, so there is no shot to draw.
5. Let the Core fall, hit "Play again", and confirm no pulse from the previous run survives into the new one.
6. Play an Ace to grow the board, then let a Tower fire. Confirm there is **no wedge or garbage geometry** across the scene — this is the case the `key` on `Instances` exists for, and it is the one to look at hardest.

- [ ] **Step 7: Commit**

```bash
git add src/scene/FirePulses.tsx src/scene/Board.tsx
git commit -m "Draw the Tower firing pulse

One instanced quad per board square, mounted once, its colour summed
each frame from every in-flight pulse. Additive blending is what makes
that shape work: black contributes nothing, so an unlit square needs no
special case and overlapping pulses sum into something brighter.

Subscribes to nothing — board arrives as a prop and the rest is read
live in useFrame — so a shot costs no React render and structuralKey is
untouched.

Closes #23"
```

---

## Verification

After Task 3, all of these must hold:

- `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` and `pnpm build` all pass — the four jobs CI runs.
- `src/game/`, `src/data/` and `src/state/` are untouched. `git diff --stat main...HEAD` should show only `src/scene/` and `docs/`.
- `src/scene/firePulse.test.ts` holds 16 tests, and at least one drives real `tick` calls.
- The six manual checks in Task 3 Step 6 all behave as described.

## Out of scope

Do not add these, even if they seem like obvious neighbours — each is a recorded decision in the spec:

- A muzzle flash or recoil on the Tower body. `Towers.tsx` already flashes and squashes a Tower when it *takes* a hit; a similar flash when it *fires* makes both unreadable.
- Any per-target signal, tracer or projectile. Pieces already scale with health, and per-target data would need the engine change the spec rejects.
- An idle "ready" indicator. A Tower with nothing in range does not fire at all.
- Retuning `PULSE_SQUARES_PER_SECOND` or `PULSE_FADE_MS` beyond what Step 6 shows to be plainly broken. They are placeholders chosen to hold at the extremes.
- Fixing the false negative described in `detectShots`'s comment. It is accepted, and the only clean fix is the rejected engine event.
- Fixing the unrelated cosmetic shadow-frustum band in `GameScene.tsx`. It is a real open problem and it is not this one.
