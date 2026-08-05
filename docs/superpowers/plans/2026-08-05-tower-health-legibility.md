# Tower Health Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Tower's remaining health and the damage it has absorbed visible — a colour ramp plus hit, critical, and death signals on the board, and exact figures in a click-to-open inspect panel.

**Architecture:** The engine gains one field (`damageTaken`) and nothing else — no event system. The renderer learns about hits and deaths by **diffing published snapshots**, because `advance()` runs up to five ticks per `emit()`, so anything written per-tick and cleared per-tick is lossy by construction. All three board signals are per-instance colour and scale mutation inside one `useFrame`, so no new geometry is added for health and no React render happens per frame.

**Tech Stack:** TypeScript (strict), React 19, React Three Fiber 9, drei 10, three 0.185, zustand 5, Vitest 4, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-05-tower-health-legibility-design.md`](../specs/2026-08-05-tower-health-legibility-design.md) — read it before starting. It records *why* each of these choices beat the alternatives.

## Global Constraints

Every task's requirements implicitly include all of these.

- **`src/game/` and `src/data/` must never import `react`, `react-dom`, `three`, `zustand`, `@react-three/fiber`, `@react-three/drei`, or anything under `scene/`, `ui/`, or `state/`.** ESLint enforces this — a violation fails `pnpm lint`, it is not merely a convention.
- **Never call `setState` inside `useFrame`** or in fast handlers like `onPointerMove`. Mutate refs directly.
- **Do not allocate inside the frame loop.** No `new Color()` / `new Vector3()` per frame — instantiate once and mutate with `.set()` / `.lerp()`.
- **Do not add any per-tick-changing value to `structuralKey`.** It would push a React render every frame and silently destroy the property `src/state/simulation.test.ts` guards.
- **`Math.random` must never appear in `src/game/`.** Runs are seeded and reproducible.
- **Share geometries and materials; instance repeated meshes.** Towers are already one instanced draw call per card rank — keep it that way.
- **Vocabulary, exactly:** Tower, Piece, Core, Round, Card, rank, suit. Never "wave", never "defender", never "hand". Where a Card's rank and a board rank could both appear, name them `cardRank` and `boardRank`.
- **No new test tooling.** There is no jsdom and no testing-library in this project, and all existing tests are headless by design. Do not add a component-testing stack. Logic that needs testing gets extracted into a pure module instead.
- **Use `pnpm test:run` (not `pnpm test`, which is watch mode) in automation.**
- Package manager is pinned: `pnpm@10.28.1`. TypeScript is pinned to the 5.x line on purpose — do not upgrade it.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/types.ts` | *Modify.* `Tower` gains `damageTaken` |
| `src/game/step.ts` | *Modify.* `placeTower` initialises `damageTaken: 0` |
| `src/game/tick.ts` | *Modify.* `applyTowerDamage` accumulates it |
| `src/game/movement.test.ts` | *Modify.* Its `Tower` fixture needs the new field to typecheck |
| `src/game/blocking.test.ts` | *Modify.* Add a `damage taken` describe block |
| `src/scene/towerColour.ts` | **Create.** Pure colour maths + presentation constants |
| `src/scene/towerColour.test.ts` | **Create.** Headless tests for the above |
| `src/scene/boardClick.ts` | **Create.** What a click on a square means (pure) |
| `src/scene/boardClick.test.ts` | **Create.** Headless tests for the above |
| `src/state/uiStore.ts` | *Modify.* Add `selectedTowerId` |
| `src/scene/Board.tsx` | *Modify.* Click branches select/deselect/build; mounts the marker |
| `src/scene/Towers.tsx` | *Modify.* Rewritten around a frame loop: ramp, flash, pulse, death |
| `src/scene/SelectionMarker.tsx` | **Create.** One flat ring on the selected Tower's square |
| `src/ui/formatStat.ts` | **Create.** Float-safe display formatting |
| `src/ui/formatStat.test.ts` | **Create.** Headless tests for the above |
| `src/ui/geometryLabels.ts` | **Create.** `GEOMETRY_LABELS`, moved out of `Hud.tsx` |
| `src/ui/TowerPanel.tsx` | **Create.** The inspect panel |
| `src/ui/Hud.tsx` | *Modify.* Import the shared labels, mount the panel, clear selection on reset |
| `src/index.css` | *Modify.* Append `.towerPanel*` rules |

The two genuinely risky pieces of logic — the colour maths and the click-meaning rules — are deliberately pulled out of components into pure modules, because that is the only way to get them under test in a project with no renderer test harness.

---

## Task 1: Engine — lifetime `damageTaken` on Tower

**Files:**
- Modify: `src/game/types.ts:64-73` (the `Tower` interface)
- Modify: `src/game/step.ts:53-78` (`placeTower`)
- Modify: `src/game/tick.ts` (`applyTowerDamage`, the last function in the file)
- Modify: `src/game/movement.test.ts:7-21` (its `Tower` fixture)
- Test: `src/game/blocking.test.ts` (append a new describe block)

**Interfaces:**
- Consumes: nothing — this is the first task.
- Produces: `Tower.damageTaken: number` — a lifetime counter, monotonically increasing, never reduced. Tasks 4 and 7 read it.

**Why a counter and not `maxHealth - health`:** those are equal only while nothing heals. ♥ repair and ♠ maximum-health are both designed. A derived value would silently stop meaning "damage taken" the day repair lands. See spec decision 2.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/blocking.test.ts`. The existing `blockedApproach`, `runFor`, `PAWN`, `BLOCKED_DAMAGE`, and `DT` helpers at the top of that file are reused — do not redefine them.

```typescript
describe('damage taken', () => {
  it('starts at zero on a newly placed Tower', () => {
    const state = step(createInitialState(), {
      kind: 'placeTower',
      square: { file: 1, rank: 1 },
      cardRank: 4,
    })

    expect(state.towers[0]?.damageTaken).toBe(0)
  })

  it('accumulates every attack the Tower absorbs', () => {
    // Rank 5 has the blind spot directly up-file, so it cannot return fire and
    // the Pawn survives to land a second attack.
    const state = blockedApproach(5, { file: 3, rank: 4 })

    const after = runFor(state, PAWN.moveIntervalMs * 2 + DT)

    expect(after.towers[0]?.damageTaken).toBe(BLOCKED_DAMAGE * 2)
  })

  it('stays at zero for a Tower nothing attacks', () => {
    const placed = step(createInitialState(), {
      kind: 'placeTower',
      square: { file: 7, rank: 7 },
      cardRank: 3,
    })

    const after = runFor({ ...placed, phase: 'inProgress', pendingSpawns: [] }, 3000)

    expect(after.towers[0]?.damageTaken).toBe(0)
  })
})
```

Note the second test asserts against `BLOCKED_DAMAGE * 2` directly rather than against `maxHealth - health`. That is deliberate: an assertion tying the counter to remaining health would start failing the day ♥ repair lands, for a reason that has nothing to do with this counter being correct.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/blocking.test.ts`
Expected: FAIL. All three new tests fail, and TypeScript reports `damageTaken` does not exist on type `Tower`.

- [ ] **Step 3: Add the field to the Tower type**

In `src/game/types.ts`, add to the `Tower` interface after `maxHealth`:

```typescript
  /**
   * Lifetime damage this Tower has absorbed. Never reduced.
   *
   * Deliberately NOT derived as `maxHealth - health`. ♥ repair and ♠ maximum
   * health are both designed, and each breaks that identity: a Tower repaired
   * to full must still report what it has weathered.
   *
   * Kept out of `structuralKey` on purpose — it only ever changes in the same
   * breath as `health`, which is already in the key.
   */
  readonly damageTaken: number
```

- [ ] **Step 4: Initialise it when a Tower is placed**

In `src/game/step.ts`, inside the Tower literal that `placeTower` returns, add after `maxHealth`:

```typescript
        damageTaken: 0,
```

- [ ] **Step 5: Accumulate it when damage lands**

In `src/game/tick.ts`, replace the body of the `.map()` inside `applyTowerDamage`:

```typescript
    .map((tower) => {
      const dealt = damage.get(tower.id)
      return dealt === undefined
        ? tower
        : { ...tower, health: tower.health - dealt, damageTaken: tower.damageTaken + dealt }
    })
```

- [ ] **Step 6: Fix the existing Tower fixture**

`src/game/movement.test.ts` builds a `Tower` literal in `towersAt`, so it will not compile without the new field. Add to that literal, after `maxHealth: 8,`:

```typescript
        damageTaken: 0,
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm test:run && pnpm typecheck`
Expected: PASS. All tests green, including the three new ones and the pre-existing 38. No TypeScript errors.

If `movement.test.ts` still errors, another `Tower` literal exists somewhere — find it with `grep -rn "fireCooldownMs" src/` and give it `damageTaken: 0` too.

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/game/step.ts src/game/tick.ts src/game/blocking.test.ts src/game/movement.test.ts
git commit -m "Track lifetime damage taken on each Tower"
```

---

## Task 2: Pure colour maths for Tower state

**Files:**
- Create: `src/scene/towerColour.ts`
- Test: `src/scene/towerColour.test.ts`

**Interfaces:**
- Consumes: `RANK_COLOURS` from `src/scene/rankColours.ts` (existing); `CardRank` from `src/game`.
- Produces:
  - `towerColour(target: Color, cardRank: CardRank, healthFraction: number, flashProgress: number, criticalPhase: number): Color` — mutates and returns `target`.
  - `CRITICAL_HEALTH_FRACTION = 0.3`, `HIT_FLASH_MS = 150`, `DEATH_FLARE_MS = 300`, `CRITICAL_PULSE_HZ = 1.2`.
  - Task 4 consumes all of these.

This module exists so the one piece of fiddly logic in the slice is testable without a renderer, and so the frame loop can stay allocation-free. `src/scene/` may import `three` — the ESLint boundary only restricts `src/game/` and `src/data/`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/towerColour.test.ts`:

```typescript
import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { RANK_COLOURS } from './rankColours'
import { towerColour } from './towerColour'

const scratch = new Color()

/** Total channel energy — a proxy for "brighter", enough to assert direction. */
function brightness(healthFraction: number, flashProgress = 0, criticalPhase = 0): number {
  const colour = towerColour(scratch, 4, healthFraction, flashProgress, criticalPhase)
  return colour.r + colour.g + colour.b
}

describe('towerColour', () => {
  it('is exactly the rank colour at full health', () => {
    const result = towerColour(scratch, 4, 1, 0, 0)

    expect(result.getHexString()).toBe(new Color(RANK_COLOURS[4]).getHexString())
  })

  it('darkens as health drops', () => {
    expect(brightness(0.5)).toBeLessThan(brightness(1))
    expect(brightness(0)).toBeLessThan(brightness(0.5))
  })

  it('brightens for the duration of a hit flash', () => {
    expect(brightness(1, 1)).toBeGreaterThan(brightness(1, 0))
  })

  it('pulses once health is critical', () => {
    // Phase 0.25 is the sine peak, 0.75 the trough.
    expect(brightness(0.1, 0, 0.25)).not.toBeCloseTo(brightness(0.1, 0, 0.75))
  })

  it('ignores the pulse phase above the critical threshold', () => {
    expect(brightness(0.8, 0, 0.25)).toBeCloseTo(brightness(0.8, 0, 0.75))
  })

  it('clamps health outside 0..1 rather than producing nonsense', () => {
    expect(brightness(1.5)).toBeCloseTo(brightness(1))
    expect(brightness(-0.5)).toBeCloseTo(brightness(0))
  })

  it('mutates the colour it is given instead of allocating', () => {
    expect(towerColour(scratch, 2, 0.5, 0, 0)).toBe(scratch)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/towerColour.test.ts`
Expected: FAIL — cannot resolve `./towerColour`.

- [ ] **Step 3: Write the implementation**

Create `src/scene/towerColour.ts`:

```typescript
import { Color } from 'three'
import type { CardRank } from '../game'
import { RANK_COLOURS } from './rankColours'

/**
 * Presentation constants, tunable by feel. Nothing in the engine reads them and
 * none of them is a balance value.
 */
export const CRITICAL_HEALTH_FRACTION = 0.3
export const HIT_FLASH_MS = 150
export const DEATH_FLARE_MS = 300
export const CRITICAL_PULSE_HZ = 1.2

/** How far toward `DAMAGED` a Tower at zero health goes. Preserved exactly. */
const DAMAGE_RAMP = 0.85

const DAMAGED = new Color('#3b0d0d')
const FLASH = new Color('#fff3d0')
const CRITICAL = new Color('#ff5a4a')

/**
 * The colour a Tower should be this frame.
 *
 * Mutates and returns `target` rather than allocating — this runs once per Tower
 * per frame, and allocating in the frame loop is exactly what CLAUDE.md forbids.
 * The module-level Colours above are constructed once and only ever read.
 *
 * - `healthFraction` is `health / maxHealth`, clamped here so a caller cannot
 *   produce nonsense from a transient out-of-range value.
 * - `flashProgress` is 1 at the instant of a hit and 0 once the flash expires.
 * - `criticalPhase` is elapsed time in *cycles* (seconds × CRITICAL_PULSE_HZ).
 *   Ignored unless health is under CRITICAL_HEALTH_FRACTION.
 */
export function towerColour(
  target: Color,
  cardRank: CardRank,
  healthFraction: number,
  flashProgress: number,
  criticalPhase: number,
): Color {
  const health = Math.min(1, Math.max(0, healthFraction))

  target.set(RANK_COLOURS[cardRank])
  target.lerp(DAMAGED, (1 - health) * DAMAGE_RAMP)

  if (health < CRITICAL_HEALTH_FRACTION) {
    // Sine rather than a sawtooth so the pulse eases at both ends instead of
    // snapping, which reads as a heartbeat rather than a strobe.
    const pulse = (Math.sin(criticalPhase * Math.PI * 2) + 1) / 2
    target.lerp(CRITICAL, pulse * 0.6)
  }

  if (flashProgress > 0) {
    target.lerp(FLASH, Math.min(1, flashProgress))
  }

  return target
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/towerColour.test.ts`
Expected: PASS — all seven.

- [ ] **Step 5: Commit**

```bash
git add src/scene/towerColour.ts src/scene/towerColour.test.ts
git commit -m "Add pure colour maths for Tower health, hits, and criticality"
```

---

## Task 3: Selecting a Tower by clicking it

**Files:**
- Create: `src/scene/boardClick.ts`
- Test: `src/scene/boardClick.test.ts`
- Modify: `src/state/uiStore.ts`
- Modify: `src/scene/Board.tsx:67-77` (the `onClick` handler in `PlacementSurface`)

**Interfaces:**
- Consumes: `Tower.damageTaken` from Task 1 (only because test fixtures must construct a full `Tower`).
- Produces:
  - `resolveBoardClick(square: Square, towers: readonly Tower[], selectedTowerId: string | null): BoardClick` where `BoardClick` is `{kind:'select', towerId: string} | {kind:'deselect'} | {kind:'build'}`.
  - `useUiStore` gains `selectedTowerId: string | null` and `setSelectedTowerId(towerId: string | null): void`. Tasks 5 and 7 read both.

The click rules, exhaustively — the plan states all four so there is nothing to infer:

| Click target | Result |
| --- | --- |
| A Tower that is not selected | It becomes selected |
| The already-selected Tower | Deselected (the gesture toggles) |
| An empty square | Builds as it does today, and clears any selection |
| The Core's square | `placeTower` refuses it, as today. Selection untouched |

- [ ] **Step 1: Write the failing tests**

Create `src/scene/boardClick.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import type { Square, Tower } from '../game'
import { resolveBoardClick } from './boardClick'

function towerAt(id: string, square: Square): Tower {
  return {
    id,
    square,
    cardRank: 3,
    fireCooldownMs: 0,
    health: 12,
    maxHealth: 12,
    damageTaken: 0,
  }
}

const A = towerAt('tower-1', { file: 2, rank: 2 })
const B = towerAt('tower-2', { file: 5, rank: 6 })

describe('resolveBoardClick', () => {
  it('builds on an empty square', () => {
    expect(resolveBoardClick({ file: 0, rank: 0 }, [A, B], null)).toEqual({ kind: 'build' })
  })

  it('builds on an empty square even while a Tower is selected', () => {
    expect(resolveBoardClick({ file: 0, rank: 0 }, [A, B], A.id)).toEqual({ kind: 'build' })
  })

  it('selects the Tower on a square that holds one', () => {
    expect(resolveBoardClick(A.square, [A, B], null)).toEqual({
      kind: 'select',
      towerId: 'tower-1',
    })
  })

  it('deselects when the already-selected Tower is clicked again', () => {
    expect(resolveBoardClick(A.square, [A, B], A.id)).toEqual({ kind: 'deselect' })
  })

  it('switches selection when a different Tower is clicked', () => {
    expect(resolveBoardClick(B.square, [A, B], A.id)).toEqual({
      kind: 'select',
      towerId: 'tower-2',
    })
  })

  it('builds when there are no Towers at all', () => {
    expect(resolveBoardClick({ file: 2, rank: 2 }, [], null)).toEqual({ kind: 'build' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/boardClick.test.ts`
Expected: FAIL — cannot resolve `./boardClick`.

- [ ] **Step 3: Write the implementation**

Create `src/scene/boardClick.ts`:

```typescript
import { squaresEqual, type Square, type Tower } from '../game'

export type BoardClick =
  | { readonly kind: 'select'; readonly towerId: string }
  | { readonly kind: 'deselect' }
  | { readonly kind: 'build' }

/**
 * What a click on a board square means.
 *
 * Extracted from the component so the rules are testable — this project has no
 * jsdom and no component tests, so logic left inside a `.tsx` file is logic that
 * cannot be tested at all.
 *
 * Clicking a Tower selects it, clicking the selected Tower deselects it, and
 * clicking anywhere else builds as it always has. The gesture is free of
 * ambiguity because `placeTower` already refuses an occupied square, so
 * selecting could never have collided with building.
 */
export function resolveBoardClick(
  square: Square,
  towers: readonly Tower[],
  selectedTowerId: string | null,
): BoardClick {
  const tower = towers.find((candidate) => squaresEqual(candidate.square, square))
  if (!tower) return { kind: 'build' }

  return tower.id === selectedTowerId
    ? { kind: 'deselect' }
    : { kind: 'select', towerId: tower.id }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/boardClick.test.ts`
Expected: PASS — all six.

- [ ] **Step 5: Add selection to the UI store**

In `src/state/uiStore.ts`, add to the `UiStore` interface after the `hoveredSquare` pair:

```typescript
  /** The Tower whose inspect panel is open. Null when nothing is selected. */
  selectedTowerId: string | null
  setSelectedTowerId: (towerId: string | null) => void
```

and to the `create` initialiser:

```typescript
  selectedTowerId: null,
  setSelectedTowerId: (selectedTowerId) => set({ selectedTowerId }),
```

- [ ] **Step 6: Wire the click handler**

In `src/scene/Board.tsx`, add this import alongside the existing ones:

```typescript
import { getState } from '../state/simulation'
import { resolveBoardClick } from './boardClick'
```

Then replace the whole `onClick` prop on the `<mesh>` in `PlacementSurface`:

```tsx
      onClick={(event) => {
        event.stopPropagation()

        const square = {
          file: worldXToFile(board, event.point.x),
          rank: worldZToRank(board, event.point.z),
        }

        // Live state rather than a store subscription. Subscribing Board to the
        // snapshot would re-render all 64 square instances on every Tower hit;
        // a click is rare enough to read state on demand.
        const { selectedTowerId, setSelectedTowerId, selectedRank } = useUiStore.getState()
        const outcome = resolveBoardClick(square, getState().towers, selectedTowerId)

        if (outcome.kind === 'select') {
          setSelectedTowerId(outcome.towerId)
          return
        }

        if (outcome.kind === 'deselect') {
          setSelectedTowerId(null)
          return
        }

        setSelectedTowerId(null)
        dispatch({ kind: 'placeTower', square, cardRank: selectedRank })
      }}
```

- [ ] **Step 7: Verify the whole suite, types, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS on all three. No new tests break — `simulation.test.ts`'s publish-count guard is untouched because nothing here changes `structuralKey`.

- [ ] **Step 8: Commit**

```bash
git add src/scene/boardClick.ts src/scene/boardClick.test.ts src/state/uiStore.ts src/scene/Board.tsx
git commit -m "Select a Tower by clicking it"
```

---

## Task 4: Board signals — ramp, hit flash, critical pulse, death flare

**Files:**
- Modify: `src/scene/Towers.tsx` (full rewrite of the file)

**Interfaces:**
- Consumes: `Tower.damageTaken` is *not* needed here; `Tower.health` / `maxHealth` are. `towerColour`, `HIT_FLASH_MS`, `DEATH_FLARE_MS`, `CRITICAL_PULSE_HZ` from Task 2. `RANK_COLOURS` from the existing `rankColours.ts`.
- Produces: nothing consumed by later tasks.

**This task has no unit test, and that is deliberate** — it is renderer wiring, and the project has no renderer test harness. The logic worth testing was extracted into Task 2. The gate here is `pnpm typecheck`, `pnpm lint`, and **manual observation in `pnpm dev`**, with explicit steps below. Do not add jsdom to make this testable.

**Three facts verified against the installed drei 10.7.7 — rely on them:**
1. `PositionMesh` (the type of an `<Instance>` ref) is exported from `@react-three/drei` and carries a real `THREE.Color` at `.color`.
2. The parent `<Instances>` runs its own `useFrame` that decomposes each instance's `matrixWorld` and copies `instance.color` into the `instanceColor` buffer. So mutating a child's `.color` and `.scale` reaches the GPU with no React render.
3. Because that copy happens in drei's frame callback, a mutation made in *our* frame callback may land one frame later. At 16ms against a 150ms flash this is imperceptible — accepted, not worked around.

- [ ] **Step 1: Replace the file**

Rewrite `src/scene/Towers.tsx` entirely:

```tsx
import { Instance, Instances, type PositionMesh } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { BUILDABLE_RANKS } from '../data/towerRanks'
import type { BoardSpec, CardRank } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { RANK_COLOURS } from './rankColours'
import { CRITICAL_PULSE_HZ, DEATH_FLARE_MS, HIT_FLASH_MS, towerColour } from './towerColour'

/** A Tower that has fallen, held briefly so its destruction is visible. */
interface Ghost {
  readonly id: string
  readonly cardRank: CardRank
  readonly file: number
  readonly boardRank: number
}

/**
 * Per-Tower animation bookkeeping. Lives in a ref, never in state: it is
 * written by the frame loop, and routing it through React would be the
 * per-frame render CLAUDE.md forbids.
 *
 * It carries the Tower's square and card rank as well as its health, because a
 * destroyed Tower leaves `GameState` entirely — this record is the only place
 * the renderer still knows where it was.
 */
interface TowerAnimation {
  cardRank: CardRank
  file: number
  boardRank: number
  lastHealth: number
  /** Set by the snapshot diff; the next frame stamps it with a clock time. */
  flashPending: boolean
  /** Clock seconds when the current flash began; -1 when idle. */
  flashStartedAt: number
}

function towerHeight(cardRank: CardRank): number {
  return 0.55 + cardRank * 0.06
}

/**
 * Towers, and everything a player can read off them without opening a panel.
 *
 * Four signals, all achieved by mutating the existing instanced meshes — no new
 * geometry, and no React render per frame:
 *
 * - **Health** darkens the Tower's rank colour (the long-standing behaviour,
 *   moved from render-time to frame-time).
 * - **A hit** flares it bright and squashes it briefly.
 * - **Critical health** pulses it toward a warning red.
 * - **Destruction** flares and shrinks a short-lived ghost, so a Tower does not
 *   simply pop out of existence.
 *
 * Hits and deaths are found by **diffing published snapshots**, not by engine
 * events: `advance()` runs up to five ticks per `emit()`, so anything the engine
 * wrote per-tick and cleared per-tick would be lost exactly when the frame rate
 * drops. A health change is what publishes a snapshot, so a diff cannot miss one.
 */
export function Towers({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)
  const phase = useGameStore((store) => store.snapshot.phase)
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([])

  const animations = useRef(new Map<string, TowerAnimation>())
  const ghostStartedAt = useRef(new Map<string, number>())
  const meshes = useRef(new Map<string, PositionMesh>())

  // Diffing runs in an effect rather than in the render body: it mutates refs
  // and schedules state, neither of which belongs in render.
  useEffect(() => {
    const live = new Set<string>()

    for (const tower of towers) {
      live.add(tower.id)
      const existing = animations.current.get(tower.id)

      if (!existing) {
        animations.current.set(tower.id, {
          cardRank: tower.cardRank,
          file: tower.square.file,
          boardRank: tower.square.rank,
          lastHealth: tower.health,
          flashPending: false,
          flashStartedAt: -1,
        })
        continue
      }

      if (tower.health < existing.lastHealth) existing.flashPending = true
      existing.lastHealth = tower.health
    }

    const fallen: Ghost[] = []

    for (const [id, animation] of animations.current) {
      if (live.has(id)) continue
      animations.current.delete(id)

      // Towers only ever die during a live round. Gating on the phase is what
      // stops `reset()` — which clears the whole board at once from the defeated
      // screen — from firing a death flare for every Tower the player built.
      if (phase === 'inProgress') {
        fallen.push({
          id,
          cardRank: animation.cardRank,
          file: animation.file,
          boardRank: animation.boardRank,
        })
      }
    }

    if (fallen.length > 0) setGhosts((current) => [...current, ...fallen])
  }, [towers, phase])

  // Ghosts are cleared as a batch. Two deaths close together therefore leave the
  // first ghost on screen slightly longer, which is invisible in practice — its
  // scale has already reached zero.
  useEffect(() => {
    if (ghosts.length === 0) return

    const timer = setTimeout(() => {
      setGhosts([])
      ghostStartedAt.current.clear()
    }, DEATH_FLARE_MS)

    return () => clearTimeout(timer)
  }, [ghosts])

  useFrame((state) => {
    const now = state.clock.elapsedTime

    for (const tower of towers) {
      const mesh = meshes.current.get(tower.id)
      const animation = animations.current.get(tower.id)
      if (!mesh || !animation) continue

      if (animation.flashPending) {
        animation.flashPending = false
        animation.flashStartedAt = now
      }

      const flashProgress =
        animation.flashStartedAt < 0
          ? 0
          : Math.max(0, 1 - (now - animation.flashStartedAt) / (HIT_FLASH_MS / 1000))

      towerColour(
        mesh.color,
        tower.cardRank,
        tower.health / tower.maxHealth,
        flashProgress,
        now * CRITICAL_PULSE_HZ,
      )

      // Squash and recover on impact. Scale rather than position, so the Tower
      // stays seated on its square instead of hopping.
      const squash = flashProgress * 0.12
      mesh.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
    }

    for (const ghost of ghosts) {
      const mesh = meshes.current.get(ghost.id)
      if (!mesh) continue

      let startedAt = ghostStartedAt.current.get(ghost.id)
      if (startedAt === undefined) {
        startedAt = now
        ghostStartedAt.current.set(ghost.id, now)
      }

      const remaining = Math.max(0, 1 - (now - startedAt) / (DEATH_FLARE_MS / 1000))

      towerColour(mesh.color, ghost.cardRank, 0, remaining, now * CRITICAL_PULSE_HZ)
      mesh.scale.setScalar(remaining)
    }
  })

  return (
    <>
      {BUILDABLE_RANKS.map((cardRank) => {
        const live = towers.filter((tower) => tower.cardRank === cardRank)
        const dying = ghosts.filter((ghost) => ghost.cardRank === cardRank)
        if (live.length === 0 && dying.length === 0) return null

        const height = towerHeight(cardRank)

        // One instanced draw call per rank, shared geometry and material, with
        // ghosts riding in the same group so a death costs no extra call.
        return (
          <Instances key={cardRank} limit={128} castShadow>
            <cylinderGeometry args={[0.24, 0.32, height, 6]} />
            <meshStandardMaterial flatShading />

            {live.map((tower) => (
              <Instance
                key={tower.id}
                // Braces, and no implicit return: React 19 treats a value
                // returned from a ref callback as a cleanup function.
                ref={(mesh: PositionMesh | null) => {
                  if (mesh) meshes.current.set(tower.id, mesh)
                  else meshes.current.delete(tower.id)
                }}
                // Correct on the first frame, before useFrame has run once.
                color={RANK_COLOURS[cardRank]}
                position={[
                  fileToWorldX(board, tower.square.file),
                  height / 2,
                  rankToWorldZ(board, tower.square.rank),
                ]}
              />
            ))}

            {dying.map((ghost) => (
              <Instance
                key={ghost.id}
                ref={(mesh: PositionMesh | null) => {
                  if (mesh) meshes.current.set(ghost.id, mesh)
                  else meshes.current.delete(ghost.id)
                }}
                color={RANK_COLOURS[cardRank]}
                position={[
                  fileToWorldX(board, ghost.file),
                  height / 2,
                  rankToWorldZ(board, ghost.boardRank),
                ]}
              />
            ))}
          </Instances>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Verify types, lint, and the suite**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS on all three.

If `import { type PositionMesh } from '@react-three/drei'` fails to resolve, import it from `@react-three/drei/core/Instances` instead — the class is declared there and re-exported through `core/index.d.ts`.

- [ ] **Step 3: Verify the publish-count guard specifically**

Run: `pnpm test:run src/state/simulation.test.ts`
Expected: PASS, in particular *"publishes a snapshot only on structural change, not per frame"*. Nothing in this task touches `structuralKey`, and this test is what proves the frame loop has not started routing updates through React.

- [ ] **Step 4: Verify by eye**

Run: `pnpm dev`, open the served URL, then:

1. Build a rank 5 Tower directly in front of the Core's file (click a square on file 3) and start the round. Rank 5 is the diagonal geometry with the up-file blind spot, so it cannot shoot back and a Pawn will grind it all the way down — the only rank that reliably shows the full sequence.
2. Confirm, in order: the Tower **flares and squashes** each time the Pawn attacks; it **darkens** progressively; it begins to **pulse red** in its last few hits; and when it falls it **flares and shrinks** rather than vanishing instantly.
3. Confirm an untouched Tower elsewhere on the board shows its flat rank colour and does not pulse or flicker.
4. Let the Core fall, press **Play again**, and confirm **no death flares** fire for the Towers cleared by the reset.

Check the browser console is free of React warnings, especially about refs or state updates during render.

- [ ] **Step 5: Commit**

```bash
git add src/scene/Towers.tsx
git commit -m "Show Tower hits, criticality, and destruction on the board"
```

---

## Task 5: The selection marker

**Files:**
- Create: `src/scene/SelectionMarker.tsx`
- Modify: `src/scene/Board.tsx` (mount it beside `CoveragePreview`)

**Interfaces:**
- Consumes: `selectedTowerId` from Task 3.
- Produces: `<SelectionMarker board={board} />`.

Without a marker, clicking a Tower has no visible effect until the panel from Task 7 exists — and even then, nothing ties the panel to a square. This is the one place the slice adds geometry: a single mesh, mounted only while something is selected.

- [ ] **Step 1: Create the component**

Create `src/scene/SelectionMarker.tsx`:

```tsx
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const SELECTED = '#f4f7fb'

/**
 * A ring on the selected Tower's square.
 *
 * Drawn flat in the board plane in the same style as CoveragePreview, and only
 * ever one object — it is mounted only while a Tower is selected.
 *
 * It subscribes to the Tower list so that it disappears by itself when the
 * selected Tower is destroyed. That means a re-render per Tower hit, which is
 * one small mesh and cheap; the alternative is a ring left hanging over an
 * empty square.
 */
export function SelectionMarker({ board }: { board: BoardSpec }) {
  const selectedTowerId = useUiStore((store) => store.selectedTowerId)
  const towers = useGameStore((store) => store.snapshot.towers)
  const selected = towers.find((tower) => tower.id === selectedTowerId)

  if (!selected) return null

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        fileToWorldX(board, selected.square.file),
        0.05,
        rankToWorldZ(board, selected.square.rank),
      ]}
    >
      <ringGeometry args={[SQUARE_SIZE * 0.42, SQUARE_SIZE * 0.5, 24]} />
      <meshBasicMaterial color={SELECTED} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}
```

- [ ] **Step 2: Mount it**

In `src/scene/Board.tsx`, add the import:

```typescript
import { SelectionMarker } from './SelectionMarker'
```

and render it inside the `Board` component's fragment, immediately after `<CoveragePreview board={board} />`:

```tsx
      <SelectionMarker board={board} />
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: PASS on all three.

Then `pnpm dev` and confirm: clicking a Tower rings its square; clicking the same Tower again removes the ring; clicking a different Tower moves it; clicking an empty square builds and removes the ring; and letting a selected Tower be destroyed removes it.

- [ ] **Step 4: Commit**

```bash
git add src/scene/SelectionMarker.tsx src/scene/Board.tsx
git commit -m "Ring the selected Tower's square"
```

---

## Task 6: Shared geometry labels and float-safe formatting

**Files:**
- Create: `src/ui/geometryLabels.ts`
- Create: `src/ui/formatStat.ts`
- Test: `src/ui/formatStat.test.ts`
- Modify: `src/ui/Hud.tsx` (delete its local `GEOMETRY_LABELS`, import the shared one)

**Interfaces:**
- Consumes: `TowerGeometry` from `src/game`.
- Produces: `GEOMETRY_LABELS: Record<TowerGeometry, string>` and `formatStat(value: number): string`. Task 7 uses both.

`GEOMETRY_LABELS` currently lives in `Hud.tsx` typed as `Record<string, string>`. Moving it out serves the panel *and* tightens the type: keyed by the `TowerGeometry` union, adding a geometry becomes a compile error here instead of an undefined label at runtime.

- [ ] **Step 1: Write the failing formatter tests**

Create `src/ui/formatStat.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatStat } from './formatStat'

describe('formatStat', () => {
  it('leaves whole numbers alone', () => {
    expect(formatStat(8)).toBe('8')
    expect(formatStat(0)).toBe('0')
  })

  it('keeps a genuine half', () => {
    expect(formatStat(1.5)).toBe('1.5')
  })

  it('cleans up floating-point drift', () => {
    expect(formatStat(8.999999999999998)).toBe('9')
  })

  it('rounds to a single decimal', () => {
    expect(formatStat(1.24)).toBe('1.2')
    expect(formatStat(1.26)).toBe('1.3')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/ui/formatStat.test.ts`
Expected: FAIL — cannot resolve `./formatStat`.

- [ ] **Step 3: Write the formatter**

Create `src/ui/formatStat.ts`:

```typescript
/**
 * Formats an engine number for display.
 *
 * Engine damage is `attackDamage × BLOCKED_ATTACK_MULTIPLIER`, so it is a float.
 * The Pawn's `2 × 0.5` happens to land on a clean 1, but any Piece with an odd
 * attack damage will not, and repeated float subtraction drifts — a Tower can
 * reach 8.999999999999998 health. Round to one decimal and let `String` drop a
 * trailing `.0`, so the panel never shows the drift.
 */
export function formatStat(value: number): string {
  return String(Math.round(value * 10) / 10)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/ui/formatStat.test.ts`
Expected: PASS — all four.

- [ ] **Step 5: Extract the geometry labels**

Create `src/ui/geometryLabels.ts`:

```typescript
import type { TowerGeometry } from '../game'

/**
 * Player-facing description of each firing geometry.
 *
 * Keyed by `TowerGeometry` rather than `string`, so adding a geometry to the
 * union is a compile error here instead of a missing label at runtime.
 *
 * Shared by the HUD's rank picker and the Tower inspect panel. It lived in
 * `Hud.tsx` until both needed it.
 */
export const GEOMETRY_LABELS: Record<TowerGeometry, string> = {
  adjacent: 'Hits the eight squares around it',
  horizontal: 'Fires along its rank',
  vertical: 'Fires along its file',
  cross: 'Fires along rank and file',
  diagonal: 'Fires along diagonals — one colour only',
}
```

- [ ] **Step 6: Point the HUD at it**

In `src/ui/Hud.tsx`, delete the whole local `const GEOMETRY_LABELS: Record<string, string> = { ... }` block (it sits just below the imports) and add:

```typescript
import { GEOMETRY_LABELS } from './geometryLabels'
```

Leave the `GEOMETRY_LABELS[selected.geometry]` usage in the JSX exactly as it is.

- [ ] **Step 7: Verify**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS on all three. The HUD's rank detail line still renders the same copy.

- [ ] **Step 8: Commit**

```bash
git add src/ui/formatStat.ts src/ui/formatStat.test.ts src/ui/geometryLabels.ts src/ui/Hud.tsx
git commit -m "Share the geometry labels and format engine floats for display"
```

---

## Task 7: The Tower inspect panel

**Files:**
- Create: `src/ui/TowerPanel.tsx`
- Modify: `src/ui/Hud.tsx` (mount the panel; clear selection on reset)
- Modify: `src/index.css` (append `.towerPanel*` rules at the end)

**Interfaces:**
- Consumes: `Tower.damageTaken` (Task 1), `selectedTowerId` / `setSelectedTowerId` (Task 3), `GEOMETRY_LABELS` and `formatStat` (Task 6), `towerRank` from `src/data/towerRanks` (existing).
- Produces: `<TowerPanel />` — takes no props.

The panel shows: card rank, the geometry description, `health / maxHealth`, damage taken, and the rank's damage, range, and fire interval. It renders nothing when no Tower is selected.

- [ ] **Step 1: Create the panel**

Create `src/ui/TowerPanel.tsx`:

```tsx
import { towerRank } from '../data/towerRanks'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { formatStat } from './formatStat'
import { GEOMETRY_LABELS } from './geometryLabels'

/**
 * Details of the selected Tower.
 *
 * The board carries the ambient signals — a Tower darkens, flashes, and pulses.
 * This is where the exact figures live, which is why the board needs no health
 * bars above every Tower.
 *
 * It updates in step with damage for free: a hit changes `health`, `health` is
 * in `structuralKey`, and a change there is what publishes a snapshot.
 *
 * `damageTaken` is a lifetime total, not `maxHealth - health`. Once ♥ repair
 * exists, a Tower at full health still reporting heavy damage taken is the
 * "Repair versus the wall" open question made visible — see the design doc.
 */
export function TowerPanel() {
  const selectedTowerId = useUiStore((store) => store.selectedTowerId)
  const setSelectedTowerId = useUiStore((store) => store.setSelectedTowerId)
  const towers = useGameStore((store) => store.snapshot.towers)

  // A destroyed Tower simply stops being found, so the panel closes itself.
  // Tower ids are never reused within a run, so a stale id cannot mismatch.
  const tower = towers.find((candidate) => candidate.id === selectedTowerId)
  if (!tower) return null

  const def = towerRank(tower.cardRank)

  return (
    <div className="towerPanel">
      <h2 className="towerPanel__title">
        Rank {tower.cardRank} Tower
        <button
          type="button"
          className="towerPanel__close"
          aria-label="Close Tower details"
          onClick={() => setSelectedTowerId(null)}
        >
          ×
        </button>
      </h2>

      <dl className="hud__stats">
        <div>
          <dt>Health</dt>
          <dd>
            {formatStat(tower.health)}
            <span className="hud__muted"> / {formatStat(tower.maxHealth)}</span>
          </dd>
        </div>
        <div>
          <dt>Damage taken</dt>
          <dd>{formatStat(tower.damageTaken)}</dd>
        </div>
      </dl>

      <p className="towerPanel__geometry">{GEOMETRY_LABELS[def.geometry]}</p>

      <p className="hud__muted">
        range {def.range} · {formatStat(def.damage)} dmg · {def.fireIntervalMs}ms
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Mount it and clear selection on reset**

In `src/ui/Hud.tsx`:

Add the import:

```typescript
import { TowerPanel } from './TowerPanel'
```

Pull the setter from the UI store, beside the existing `setSelectedRank` line:

```typescript
  const setSelectedTowerId = useUiStore((store) => store.setSelectedTowerId)
```

Replace the "Play again" button's handler so a stale selection cannot survive a reset. This matters: `reset()` rewinds `nextEntityId` to 1, so ids restart and a surviving `selectedTowerId` would silently re-attach to a brand-new Tower.

```tsx
            <button
              type="button"
              className="hud__button"
              onClick={() => {
                setSelectedTowerId(null)
                reset()
              }}
            >
              Play again
            </button>
```

Finally, render the panel as a sibling of `.hud__panel`, immediately before the closing `</div>` of the `.hud` wrapper:

```tsx
      <TowerPanel />
```

- [ ] **Step 3: Add the styles**

Append to the end of `src/index.css`:

```css
/* The Tower inspect panel. Bottom-right so it never covers the HUD panel.
   `.hud` is pointer-events: none, so this must re-enable them like .hud__panel.
   Offsets are 0 rather than 1rem: `.hud` already carries 1rem of padding, and an
   absolutely positioned child is placed against its padding box. */
.towerPanel {
  position: absolute;
  right: 0;
  bottom: 0;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: 13rem;
  padding: 0.9rem 1.05rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0.6rem;
  background: rgb(16 20 26 / 88%);
  color: #e8edf4;
}

.towerPanel p {
  margin: 0;
}

.towerPanel__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.towerPanel__close {
  padding: 0 0.25rem;
  border: 0;
  background: none;
  font-size: 1.1rem;
  line-height: 1;
  color: #8fa0b5;
  cursor: pointer;
}

.towerPanel__close:hover {
  color: #e8edf4;
}

.towerPanel__geometry {
  font-size: 0.85rem;
  color: #c3cdda;
}
```

- [ ] **Step 4: Verify the full gate**

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS on all four.

- [ ] **Step 5: Verify by eye, end to end**

Run `pnpm dev`, then:

1. Build a rank 4 Tower and click it. Confirm the panel opens bottom-right showing `Rank 4 Tower`, health `16 / 16`, damage taken `0`, "Fires along rank and file", and `range 4 · 2 dmg · 550ms`.
2. Start a round and let a Pawn grind a rank 5 Tower. Confirm health falls and **damage taken rises in step**, and that both stay clean integers — no `8.999999999999998`.
3. Confirm the panel closes on: the × button, clicking the same Tower again, clicking an empty square, and the selected Tower being destroyed.
4. Confirm the panel never covers the HUD panel, and that dragging to orbit still works when the drag starts on the canvas rather than on a panel.
5. Let the Core fall, press **Play again**, build a new Tower, and confirm the panel does **not** open by itself — proof the selection was cleared with the reset.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TowerPanel.tsx src/ui/Hud.tsx src/index.css
git commit -m "Add a Tower inspect panel showing health and damage taken"
```

---

## Done when

- `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` all pass.
- `src/state/simulation.test.ts`'s publish-count guard still passes — nothing in this slice touches `structuralKey`.
- The manual checks in Tasks 4, 5, and 7 have all been observed, not assumed.
- Issue #4's two asks are both satisfied: remaining health is readable (ramp and pulse on the board, exact figures in the panel), and damage from attacking Pieces is visible both as it lands (flash) and cumulatively (the panel's tally).

## Deliberately not in this plan

Recorded so a reviewer does not read these as oversights. All are from the spec's "Not done, deliberately" section:

- **The coverage preview over an occupied square.** Hovering a square that holds a Tower still previews what the *selected build rank* would cover from there — a footprint for a build that cannot happen. Pre-existing, and about coverage rather than health.
- **A HUD summary of Tower condition.** Considered and declined: the critical pulse already gives whole-board awareness on the board itself, where the player is looking during a round.
- **Component tests.** No jsdom, no testing-library, and no plan to add them. The logic that needed testing was extracted into `towerColour.ts`, `boardClick.ts`, and `formatStat.ts` precisely so it could be tested headlessly.
- **Any open design question.** In particular, this resolves nothing about "Repair versus the wall" — Task 1 only makes the evidence for it visible.
