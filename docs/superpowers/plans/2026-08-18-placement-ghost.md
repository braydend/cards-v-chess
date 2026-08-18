# Placement Ghost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a translucent ghost of the pending Tower riding the pointer while a hand is committed, so the player sees the object itself — size, height, colour, and exact square — before the placement click lands.

**Architecture:** A new `src/scene/PlacementGhost.tsx` mounted in `Board.tsx` renders a single transparent mesh with the live Tower's geometry/height/colour, eased toward the active square in `useFrame` (subtle drift, no `setState`, no per-frame allocation). All decisions live in a pure, unit-tested `src/scene/placementGhost.ts`; the shared tower geometry and preview colours move into pure modules (`towerGeometry.ts`, `previewColours.ts`) so the ghost matches the live Tower by construction and the two red refusals share one constant.

**Tech Stack:** React Three Fiber, three.js, TypeScript (strict), zustand, Vitest. Engine (`src/game/`) untouched.

## Global Constraints

- **Engine boundary:** `src/game/` and `src/data/` must never import React or Three.js. All new code lives in `src/scene/`; any import from the engine goes through the public surface at `src/game/index.ts` (type-only `TowerTypeId`, `Square`, `BoardSpec`, and `canBuildOn` are all on it — `CoveragePreview.tsx` and `boardClick.ts` already import exactly these).
- **Fast Refresh:** never export a non-component value from a `.tsx` component file (documented in `rankColours.ts`) — it silently degrades HMR to full reloads. This is why `towerHeight` and the preview colours move into pure `.ts` modules.
- **R3F discipline** (CLAUDE.md): no `setState` in `useFrame`; scale motion by `delta`; no per-frame allocation (no fresh objects — this is why the tilt helpers are scalars); share geometries and materials (memoize); toggle `visible` rather than remounting where mounting would recompile materials.
- **`react-hooks/immutability`:** never write through a ref passed in as a prop; bind it to a local name ending in `Ref` first. The refs here are local `useRef`s, so this is satisfied by naming.
- **Render-order ladder:** the flat overlays use explicit distinct `renderOrder`s — ring (0), amber (1), teal (2), illegal marker (3), SelectionMarker (4), FirePulses (5). The ghost is a translucent *solid*, not a flat overlay, but it must still beat the transparent-pass sort: give it `renderOrder={6}`, one above `FirePulses`. Values must stay distinct; a tie drops back to the camera-dependent sort.
- **The ghost reads the engine's `canBuildOn` (`src/game/placement.ts`), never a copy** — a narrower copy in the renderer would disagree with the refusal in `cardPlays.ts`.
- **Naming:** "ghost" for this object throughout; a card's "rank" vs a board's "rank" stay distinct (`boardRank` etc.).
- **Tests:** no jsdom, so no component tests — any non-trivial decision must live in a pure module that Vitest can reach. Run `pnpm test:run` (not watch) in automation; a passing test suite is not a passing typecheck — run `pnpm typecheck` for any type claim.
- **Verification commands:** `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, `pnpm build`.

---

### Task 1: Shared tower-geometry and preview-colour modules, wired into existing consumers

Extracts the tower height formula (currently duplicated in `Towers.tsx:12` and `UpgradeReady.tsx:32`) and the preview overlay colours (currently local to `CoveragePreview.tsx`) into pure modules, so the ghost can reuse them without violating the Fast Refresh rule and without copying formulas.

**Files:**
- Create: `src/scene/towerGeometry.ts`
- Create: `src/scene/towerGeometry.test.ts`
- Create: `src/scene/previewColours.ts`
- Modify: `src/scene/Towers.tsx` (delete local `towerHeight`, use shared)
- Modify: `src/scene/UpgradeReady.tsx` (delete local `towerHeight`, use shared)
- Modify: `src/scene/CoveragePreview.tsx` (import `COVERED`/`ILLEGAL` from shared module)

**Interfaces:**
- Produces:
  - `src/scene/towerGeometry.ts`: `export const TOWER_RADIUS_TOP = 0.24`, `export const TOWER_RADIUS_BOTTOM = 0.32`, `export const TOWER_SEGMENTS = 6`, `export function towerHeight(type: TowerTypeId): number`
  - `src/scene/previewColours.ts`: `export const COVERED = '#4fd1c5'`, `export const ILLEGAL = '#f56565'`

- [ ] **Step 1: Write the failing test** — `src/scene/towerGeometry.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { TOWER_TYPE_IDS } from '../data/towerTypes'
import { towerHeight } from './towerGeometry'

describe('towerHeight', () => {
  it('grows strictly with the tower type rarity order', () => {
    const heights = TOWER_TYPE_IDS.map((type) => towerHeight(type))
    for (let index = 1; index < heights.length; index += 1) {
      expect(heights[index]).toBeGreaterThan(heights[index - 1] ?? 0)
    }
  })

  it('starts at the base height for the lowest tower type', () => {
    expect(towerHeight(TOWER_TYPE_IDS[0]!)).toBe(0.55)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/scene/towerGeometry.test.ts`
Expected: FAIL — the module does not exist yet (`Cannot find module './towerGeometry'`).

- [ ] **Step 3: Create the shared modules**

`src/scene/towerGeometry.ts`:

```ts
import { TOWER_TYPE_IDS, type TowerTypeId } from '../data/towerTypes'

/**
 * The tower cylinder's radii and radial segment count — the same geometry the
 * live Towers render, shared so the placement ghost matches them by
 * construction rather than by restating the numbers.
 *
 * Lives in a pure module, not in a component file: exporting a non-component
 * value from a `.tsx` breaks React Fast Refresh (see the note in
 * `rankColours.ts`), and `towerHeight` was already duplicated across
 * `Towers.tsx` and `UpgradeReady.tsx`.
 */
export const TOWER_RADIUS_TOP = 0.24
export const TOWER_RADIUS_BOTTOM = 0.32
export const TOWER_SEGMENTS = 6

/**
 * The tower's body height by type — size is a legibility signal, so it must
 * stay a single function both the live render and the ghost agree on.
 */
export function towerHeight(type: TowerTypeId): number {
  return 0.55 + TOWER_TYPE_IDS.indexOf(type) * 0.08
}
```

`src/scene/previewColours.ts`:

```ts
/**
 * The build-preview overlay colours, shared between `CoveragePreview` and the
 * placement ghost.
 *
 * Shared so the two refusals agree by construction: the ghost's illegal tint
 * and `CoveragePreview`'s red marker read the same constant. Pure module for
 * the Fast Refresh reason `towerGeometry.ts` gives.
 */
export const COVERED = '#4fd1c5'
export const ILLEGAL = '#f56565'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/scene/towerGeometry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewire `Towers.tsx`**

In `src/scene/Towers.tsx`:
- Delete the local function at lines 12–14:

```ts
function towerHeight(type: TowerTypeId): number {
  return 0.55 + TOWER_TYPE_IDS.indexOf(type) * 0.08
}
```

- Add to the imports from `./coords`'s neighbours (alphabetical, one import line for the module):

```ts
import { TOWER_RADIUS_BOTTOM, TOWER_RADIUS_TOP, TOWER_SEGMENTS, towerHeight } from './towerGeometry'
```

- Replace the cylinder geometry at line 192:

```tsx
<cylinderGeometry args={[0.24, 0.32, height, 6]} />
```

with:

```tsx
<cylinderGeometry args={[TOWER_RADIUS_TOP, TOWER_RADIUS_BOTTOM, height, TOWER_SEGMENTS]} />
```

`TOWER_TYPE_IDS` stays imported — `Towers.tsx` still uses it at line 181 for the per-type map.

- [ ] **Step 6: Rewire `UpgradeReady.tsx`**

In `src/scene/UpgradeReady.tsx`:
- Delete the local function at lines 31–34 (including its doc comment `/** The tower's body height, matching the height used in `Towers.tsx`. */`).
- Remove the now-unused `import { TOWER_TYPE_IDS } from '../data/towerTypes'` (it is only used by the deleted function).
- Add:

```ts
import { towerHeight } from './towerGeometry'
```

- [ ] **Step 7: Rewire `CoveragePreview.tsx`**

In `src/scene/CoveragePreview.tsx`:
- Delete lines 11–12:

```ts
const COVERED = '#4fd1c5'
const ILLEGAL = '#f56565'
```

- Add:

```ts
import { COVERED, ILLEGAL } from './previewColours'
```

(Place it with the other `./` imports, alphabetically before `./towerFootprint`.)

- [ ] **Step 8: Run the full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all pass. `towerGeometry.test.ts` passes; the rewire is a pure move, so `Towers.tsx`/`UpgradeReady.tsx`/`CoveragePreview.tsx` behave exactly as before.

- [ ] **Step 9: Commit**

```bash
git add src/scene/towerGeometry.ts src/scene/towerGeometry.test.ts src/scene/previewColours.ts src/scene/Towers.tsx src/scene/UpgradeReady.tsx src/scene/CoveragePreview.tsx
git commit -m "refactor: share tower geometry and preview colours in pure modules"
```

---

### Task 2: Pure placement-ghost logic module

The whole decision surface of the ghost, extracted for the usual reason: this project has no jsdom and no component tests, so a decision left inside a `.tsx` is a decision no test can reach. `PlacementGhost.tsx` reads the stores and calls these functions.

**Files:**
- Create: `src/scene/placementGhost.ts`
- Create: `src/scene/placementGhost.test.ts`

**Interfaces:**
- Consumes: `type TowerTypeId` and `type Square` from `../game` (the public surface; type-only, so no engine dependency).
- Produces:
  - `export interface GhostAppearance { readonly type: TowerTypeId; readonly illegal: boolean }`
  - `export function ghostFor(pendingTower: TowerTypeId | null, activeSquare: Square | null, legal: boolean): GhostAppearance | null`
  - `export function ease(current: number, target: number, dt: number, rate: number): number`
  - `export function tiltX(dz: number): number`
  - `export function tiltZ(dx: number): number`

Deviation from the spec: the spec named a single `tiltFrom(dx, dz): { x, z }`, but that allocates a fresh object per frame, which the acceptance criteria forbid. Two scalar functions give the frame loop the same lean with zero allocation; the tests below pin the same properties (proportional, clamped, sign-symmetric).

- [ ] **Step 1: Write the failing test** — `src/scene/placementGhost.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import type { Square } from '../game'
import { ease, ghostFor, tiltX, tiltZ } from './placementGhost'

const ACTIVE: Square = { file: 3, rank: 2 }

describe('ghostFor', () => {
  it('renders nothing with no pending Tower', () => {
    expect(ghostFor(null, ACTIVE, true)).toBeNull()
  })

  it('renders nothing with no active square', () => {
    expect(ghostFor('vertical', null, true)).toBeNull()
  })

  it('renders nothing with neither', () => {
    expect(ghostFor(null, null, true)).toBeNull()
  })

  it('reports the pending type as legal on a legal square', () => {
    expect(ghostFor('cross', ACTIVE, true)).toEqual({ type: 'cross', illegal: false })
  })

  it('flags an illegal square', () => {
    expect(ghostFor('ring', ACTIVE, false)).toEqual({ type: 'ring', illegal: true })
  })
})

describe('ease', () => {
  it('moves partway toward the target in one step', () => {
    const value = ease(0, 10, 0.016, 12)
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThan(10)
  })

  it('converges asymptotically without ever overshooting', () => {
    let value = 0
    for (let step = 0; step < 1000; step += 1) {
      value = ease(value, 10, 0.1, 12)
      expect(value).toBeLessThanOrEqual(10)
    }
    expect(value).toBeCloseTo(10, 3)
  })

  it('scales with dt — a larger dt converges faster', () => {
    const slow = ease(0, 10, 0.016, 12)
    const fast = ease(0, 10, 0.032, 12)
    expect(fast).toBeGreaterThan(slow)
  })

  it('does not move when dt is zero', () => {
    expect(ease(5, 10, 0, 12)).toBe(5)
  })

  it('does not move when the rate is zero', () => {
    expect(ease(5, 10, 1, 0)).toBe(5)
  })

  it('converges monotonically upward toward a higher target', () => {
    let value = 0
    let previous = value
    for (let step = 0; step < 100; step += 1) {
      value = ease(value, 10, 0.05, 12)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })
})

describe('tiltX and tiltZ', () => {
  it('are upright with no displacement', () => {
    expect(tiltX(0)).toBe(0)
    expect(tiltZ(0)).toBe(0)
  })

  it('tilt proportionally to displacement', () => {
    expect(Math.abs(tiltX(0.2))).toBeGreaterThan(Math.abs(tiltX(0.1)))
    expect(Math.abs(tiltZ(0.2))).toBeGreaterThan(Math.abs(tiltZ(0.1)))
  })

  it('clamp so a huge displacement never exceeds a moderate one', () => {
    expect(tiltX(1000)).toBe(tiltX(10))
    expect(tiltZ(1000)).toBe(tiltZ(10))
  })

  it('lean opposite ways for opposite displacements', () => {
    expect(tiltZ(0.2)).toBeCloseTo(-tiltZ(-0.2), 10)
    expect(tiltX(0.2)).toBeCloseTo(-tiltX(-0.2), 10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/scene/placementGhost.test.ts`
Expected: FAIL — `Cannot find module './placementGhost'`.

- [ ] **Step 3: Write the minimal implementation** — `src/scene/placementGhost.ts`

```ts
import type { Square, TowerTypeId } from '../game'

/**
 * The pending Tower's ghost: what to draw, extracted from the component for the
 * reason `boardClick.ts` gives — this project has no jsdom and no component
 * tests, so a decision left inside a `.tsx` file is a decision no test can
 * reach. Everything here is pure; `PlacementGhost.tsx` reads the stores and
 * passes what it finds in.
 */

/** How the ghost looks for one render: which Tower, and whether the square is refused. */
export interface GhostAppearance {
  readonly type: TowerTypeId
  readonly illegal: boolean
}

/**
 * Whether a ghost should render, and how.
 *
 * Null covers the two cases that look different to a player and are the same
 * here: no Tower is pending, and no square is active (nothing hovered, or on a
 * coarse pointer nothing previewed yet). Both mean "draw nothing", so both are
 * one answer.
 */
export function ghostFor(
  pendingTower: TowerTypeId | null,
  activeSquare: Square | null,
  legal: boolean,
): GhostAppearance | null {
  if (pendingTower === null || activeSquare === null) return null
  return { type: pendingTower, illegal: !legal }
}

/**
 * Exponential damp toward a target, scaled by `dt` so the trail's speed is
 * refresh-rate independent.
 *
 * `current + (target - current) * (1 - exp(-rate * dt))` — asymptotic: it
 * closes a fixed fraction of the remaining gap per unit time, so it never
 * overshoots and converges monotonically. A zero `dt` or zero `rate` moves
 * nothing.
 */
export function ease(current: number, target: number, dt: number, rate: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

const TILT_SCALE = 0.25
const MAX_TILT = 0.35

function clampTilt(value: number): number {
  return Math.max(-MAX_TILT, Math.min(MAX_TILT, value))
}

/**
 * Lean around the x axis from a z displacement (the ghost tips forward or back
 * as it trails). Scalar so the frame loop allocates nothing; the component
 * calls `tiltX` and `tiltZ` with the per-axis displacement.
 */
export function tiltX(dz: number): number {
  return clampTilt(dz * TILT_SCALE)
}

/** Lean around the z axis from an x displacement. */
export function tiltZ(dx: number): number {
  return clampTilt(-dx * TILT_SCALE)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/scene/placementGhost.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Run the full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/scene/placementGhost.ts src/scene/placementGhost.test.ts
git commit -m "feat: pure placement-ghost logic (visibility, legality, trail maths)"
```

---

### Task 3: The PlacementGhost component and its mount in the board

Renders the ghost: a single transparent mesh with the live Tower's geometry, height, and colour, eased toward the active square in `useFrame`. No component tests are possible (no jsdom) — every decision is already covered by Tasks 1 and 2, so this file is plumbing plus the frame loop.

**Files:**
- Create: `src/scene/PlacementGhost.tsx`
- Modify: `src/scene/Board.tsx` (mount after `CoveragePreview`, line 72)

**Interfaces:**
- Consumes:
  - `src/scene/placementGhost.ts`: `ghostFor`, `ease`, `tiltX`, `tiltZ` (Task 2)
  - `src/scene/towerGeometry.ts`: `towerHeight`, `TOWER_RADIUS_TOP`, `TOWER_RADIUS_BOTTOM`, `TOWER_SEGMENTS` (Task 1)
  - `src/scene/previewColours.ts`: `ILLEGAL` (Task 1)
  - `src/scene/rankColours.ts`: `TOWER_COLOURS`
  - `../game`: `canBuildOn`, `type BoardSpec`
  - `../state/store`: `useGameStore`; `../state/uiStore`: `useUiStore`
  - `../ui/useMediaQuery`: `COARSE_POINTER_QUERY`, `useMediaQuery`
  - `./coords`: `fileToWorldX`, `rankToWorldZ`
- Produces: `export function PlacementGhost({ board }: { board: BoardSpec })` — mounted in `Board.tsx`.

- [ ] **Step 1: Write the component** — `src/scene/PlacementGhost.tsx`

```tsx
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { canBuildOn, type BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { COARSE_POINTER_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { fileToWorldX, rankToWorldZ } from './coords'
import { ease, ghostFor, tiltX, tiltZ } from './placementGhost'
import { ILLEGAL } from './previewColours'
import { TOWER_COLOURS } from './rankColours'
import { TOWER_RADIUS_BOTTOM, TOWER_RADIUS_TOP, TOWER_SEGMENTS, towerHeight } from './towerGeometry'

/** How far the ghost's base floats above the board surface (square tops sit at y = 0). */
const HOVER_CLEARANCE = 0.15
/** Per-second approach rate for the trail — subtle drift, tuned by feel. */
const EASE_RATE = 12
/**
 * One rung above `FirePulses` (5) in the flat-overlay ladder. The ghost is a
 * translucent solid, not a flat overlay, but the ladder still applies:
 * transparent objects sort by camera z unless they carry an explicit
 * `renderOrder`, and a tie drops back to that sort. The object under the
 * pointer is the thing being read, so it draws on top.
 */
const GHOST_RENDER_ORDER = 6

/** Identity-stable so R3F never re-applies it — the ghost's position is owned by useFrame. */
const ORIGIN: [number, number, number] = [0, 0, 0]

/**
 * The pending Tower riding the pointer.
 *
 * While a hand is committed (`pendingTower` set) and a square is active, shows
 * a translucent model of the Tower about to be placed, easing between square
 * centres so it trails behind the pointer like something being carried. All
 * decisions live in `placementGhost.ts`; this is plumbing plus the frame loop.
 */
export function PlacementGhost({ board }: { board: BoardSpec }) {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const previewedSquare = useUiStore((store) => store.previewedSquare)
  // Touch has no hover: the first tap commits a square to `previewedSquare`,
  // and the ghost rides that, exactly as `CoveragePreview`'s `activeSquare` does.
  const activeSquare = coarse ? previewedSquare : hoveredSquare
  const pendingType = useGameStore((store) => store.snapshot.pendingTower)
  // The engine's own predicate, selected as a bare boolean so zustand's
  // `Object.is` — not the snapshot object — decides re-render. A Piece hop that
  // does not flip legality on the hovered square costs nothing here.
  const legal = useGameStore((store) => !activeSquare || canBuildOn(store.snapshot, activeSquare))
  const ghostRef = useRef<Mesh>(null)
  const lastMeshRef = useRef<Mesh | null>(null)

  const ghost = useMemo(
    () => ghostFor(pendingType, activeSquare, legal),
    [pendingType, activeSquare, legal],
  )

  // Keyed on the height (a number derived from the type), not on `ghost` (a
  // fresh object every render), so square hops re-render without rebuilding the
  // geometry — the R3F discipline's "share geometries" applied to the one mesh
  // that can hold only one.
  const height = ghost === null ? 0 : towerHeight(ghost.type)
  const args = useMemo(
    (): [number, number, number, number] => [
      TOWER_RADIUS_TOP,
      TOWER_RADIUS_BOTTOM,
      height,
      TOWER_SEGMENTS,
    ],
    [height],
  )

  useFrame((_, delta) => {
    const mesh = ghostRef.current
    if (!ghost || !activeSquare || !mesh) return

    const targetX = fileToWorldX(board, activeSquare.file)
    const targetZ = rankToWorldZ(board, activeSquare.rank)
    const targetY = HOVER_CLEARANCE + towerHeight(ghost.type) / 2

    // The mesh mounts fresh at the active square (each mount is a new mesh
    // object), so the frame it mounts snaps to the target — no glide in from a
    // stale position, no cross-board drift when the pointer re-enters. Only the
    // frames after that ease between square hops.
    if (lastMeshRef.current !== mesh) {
      lastMeshRef.current = mesh
      mesh.position.set(targetX, targetY, targetZ)
      mesh.rotation.set(0, 0, 0)
      return
    }

    mesh.position.x = ease(mesh.position.x, targetX, delta, EASE_RATE)
    mesh.position.y = ease(mesh.position.y, targetY, delta, EASE_RATE)
    mesh.position.z = ease(mesh.position.z, targetZ, delta, EASE_RATE)
    // Lean into the motion from the current displacement, settling upright as
    // the ghost arrives. `tiltX`/`tiltZ` are scalars, so the frame loop
    // allocates nothing.
    mesh.rotation.x = tiltX(targetZ - mesh.position.z)
    mesh.rotation.z = tiltZ(targetX - mesh.position.x)
  })

  if (!ghost) return null

  return (
    <mesh
      ref={ghostRef}
      position={ORIGIN}
      renderOrder={GHOST_RENDER_ORDER}
      // `PlacementSurface` is the single raycast target that turns a click into
      // a square; a mesh floating above it would swallow pointer events. This is
      // one of the few places the scene needs the explicit opt-out.
      raycast={() => null}
    >
      <cylinderGeometry args={args} />
      <meshStandardMaterial
        color={ghost.illegal ? ILLEGAL : TOWER_COLOURS[ghost.type]}
        transparent
        opacity={0.35}
        depthWrite={false}
        flatShading
      />
    </mesh>
  )
}
```

- [ ] **Step 2: Mount it in `Board.tsx`**

In `src/scene/Board.tsx`:
- Add the import (alphabetical, among the `./` scene imports — after `./CoveragePreview`, before `./FirePulses`):

```ts
import { PlacementGhost } from './PlacementGhost'
```

- Add the mount directly after `<CoveragePreview board={board} />` (line 72):

```tsx
<PlacementGhost board={board} />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. If the `raycast={() => null}` prop or the `args` tuple type complains, adjust the explicit types: `const noRaycast = (): void => undefined` (still passed as `raycast={noRaycast}`) and keep the tuple annotation on `args`.

- [ ] **Step 4: Lint and full test run**

Run: `pnpm lint && pnpm test:run`
Expected: all pass. The behaviour of the frame loop itself (easing, snapping on mount) has no unit coverage by design — the pure maths it calls is covered in Task 2.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: succeeds (typecheck + production build).

- [ ] **Step 6: Manual smoke check**

Run: `pnpm dev`, commit a hand from the Deck, and verify against the acceptance criteria:
- With a hand committed, a translucent ghost of the pending Tower's type follows the hovered square on a fine pointer (previewed square on a coarse pointer).
- It matches the live Tower's geometry/height/colour and floats ~0.15 above the square's centre.
- On a square `canBuildOn` refuses (a Piece's square, the Core, an occupied Tower square), the ghost turns the same red as `CoveragePreview`'s marker.
- Clicking through the ghost still places the Tower (it never intercepts the click).
- It trails/eases between square hops and settles; with no pending Tower or nothing hovered, no ghost renders.

- [ ] **Step 7: Commit**

```bash
git add src/scene/PlacementGhost.tsx src/scene/Board.tsx
git commit -m "feat: placement ghost shows the pending Tower riding the pointer (issue #80)"
```

---

## Self-Review

**Spec coverage:**
- "Ghost follows hovered/previewed square, coarse/fine" → Task 3 (`activeSquare` logic).
- "Matches live Tower geometry, height, colour" → Task 1 (`towerGeometry`/`rankColours`) + Task 3 material.
- "Illegal square turns the shared red" → Task 1 (`previewColours.ILLEGAL`) + Task 3.
- "Never intercepts pointer events" → Task 3 (`raycast={() => null}`).
- "Trails/eases, delta-scaled, no setState, no per-frame allocation" → Task 2 (`ease`, scalar `tiltX`/`tiltZ`) + Task 3 frame loop.
- "No ghost when no pending Tower or nothing active" → Task 2 (`ghostFor`) + Task 3 (`if (!ghost) return null`).
- "lint, typecheck, test:run pass" → verification steps in every task.
- "Pure module beside the component" → Task 2.
- "Shared `canBuildOn`, single predicate" → Task 3 legal selector.

**Placeholder scan:** no TBD/TODO; every code step carries real code.

**Type consistency:** `ghostFor(pendingTower, activeSquare, legal)` and `GhostAppearance` are written once (Task 2) and consumed identically in Task 3; `towerHeight`, the radii/segment constants, `COVERED`/`ILLEGAL` names match across Tasks 1 and 3; `ease`/`tiltX`/`tiltZ` signatures match. `BoardSpec` flows as a prop in Tasks 1–3 the same way it does in `Board.tsx` today.

**Deviation notes (spec → plan):**
1. Spec: "`ILLEGAL` exported from `CoveragePreview`". Plan: moved to `previewColours.ts` — exporting a non-component value from a `.tsx` breaks Fast Refresh (documented in `rankColours.ts`).
2. Spec: "`towerHeight` exported from `Towers.tsx`". Plan: moved to `towerGeometry.ts` for the same reason, also de-duplicating the copy in `UpgradeReady.tsx`.
3. Spec: "`tiltFrom(dx, dz)` → `{x, z}`". Plan: split into scalar `tiltX`/`tiltZ` so the frame loop allocates nothing per frame (an acceptance criterion).