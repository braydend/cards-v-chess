# Placement ghost: the pending Tower riding the pointer

**Date:** 2026-08-18
**Status:** Agreed
**Issue:** [#80](https://github.com/braydend/cards-v-chess/issues/80)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The two-step Tower placement flow. Committing a hand consumes its Cards and
sets `GameState.pendingTower` (`src/game/cardPlays.ts`); the next click on a
legal square realises it. While the pending Tower awaits its square,
`src/scene/CoveragePreview.tsx` shows where it would **shoot** — a teal
footprint under the pointer, red on an illegal square — but never what it
**is**. There is no 3D model of the Tower itself on screen until the click
lands.

Placement is a one-off per hand and the Cards are already spent when the Tower
appears awaiting placement. The flat overlay answers "where will this shoot?"
but not "what am I about to put down, and exactly where does it stand?" — size,
height, and presence are only guessable until committed. A translucent ghost of
the pending Tower that rides the pointer lets the player see the object itself
before the click.

## Decision

A new `src/scene/PlacementGhost.tsx`, mounted in `Board.tsx` beside
`CoveragePreview`, renders a semi-transparent model of the pending Tower's type
at the active square's world position while a Tower is pending and a square is
active.

### Active square

Identical to `CoveragePreview.tsx:54`: `hoveredSquare` on a fine pointer,
`previewedSquare` on a coarse pointer, via `useMediaQuery(COARSE_POINTER_QUERY)`.

### Appearance

- Same geometry, height, and colour as the live Tower: `towerHeight`
  (`src/scene/Towers.tsx:12`, **exported** so the ghost shares the one source)
  and the `cylinderGeometry args={[0.24, 0.32, height, 6]}` / `TOWER_COLOURS`
  from `src/scene/Towers.tsx:192`. A single `<mesh>`, never `Instances` —
  there is at most one ghost.
- **Ghostly hologram**: `meshStandardMaterial flatShading transparent
  opacity={0.35} depthWrite={false}`, no cast/receive shadow, so it reads as a
  hologram above the board rather than a near-real preview.
- **Floats**: the base hovers ~0.15 world units above the board surface
  (board square tops sit at y = 0), so the ghost visibly floats and settles
  onto the square when the click lands.
- **Legality drives the tint.** The ghost calls the engine's own `canBuildOn`
  (`src/game/placement.ts:27`) — the single predicate, never a copy — and
  flips its colour to the shared `ILLEGAL` red (`#f56565`, exported from
  `CoveragePreview`) on a refused square, in the same visual language as
  `CoveragePreview`'s red marker, so the two refusals always agree.
- **Draw order**: `renderOrder={6}`, one rung above `FirePulses` (5) in the
  flat-overlay ladder, so the object under the pointer draws over the teal,
  amber, and pulse overlays where their projected pixels overlap. `depthWrite:
  false` keeps the board visible through it.
- Geometry and material are `useMemo`'d on `(type, illegal)`, so square hops
  re-render the mesh without recompiling them (the R3F discipline's "share
  geometries and materials").
- **Never intercepts a click**: `raycast={() => null}` on the mesh. This is one
  of the few times the scene needs the explicit opt-out — a mesh floating above
  `PlacementSurface` (`src/scene/Board.tsx:87`, the single raycast target)
  would otherwise swallow the pointer events that turn a click into a square.

### The trail

In a component-level `useFrame`, guarded on the mesh ref:

- The component renders `null` when `ghostFor` returns null, so the mesh
  **mounts fresh at the active square** — "snap on appear" is free, there is no
  cross-board glide, and the trail exists only between square hops.
- **Position is owned by `useFrame`, never by the `position` prop.** The mesh's
  JSX position is a module-level constant; a target-carrying `position` prop
  would be re-applied by R3F on every square-change re-render, snapping the
  mesh to the new square instantly and killing the trail. On the first frame
  after mount, `useFrame` snaps the mesh to the target (the commit frame is
  corrected before paint), and on subsequent frames it eases.
- Each frame the position eases toward the active square's world centre (plus
  the hover clearance) at a **subtle drift** rate (~12/s) with
  `ease(current, target, dt, rate)` — `current + (target - current) *
  (1 - exp(-rate * dt))`, delta-scaled so the behaviour is refresh-rate
  independent. Because `hoveredSquare` only changes per square
  (`src/scene/Board.tsx:95`), the trail interpolates between square centres
  rather than tracking continuous pointer motion — the cheap option, and a fit
  for the board's discrete-hop aesthetic.
- A slight tilt leans the ghost into its motion (`tiltFrom` on current-vs-target
  displacement, clamped small) and it settles upright as it arrives.
- Movement happens entirely on a ref: no `setState` in `useFrame`, no per-frame
  allocation, per the R3F discipline in CLAUDE.md.

### Pure logic module

Non-trivial branching lives in a pure module beside it,
`src/scene/placementGhost.ts` — no three imports, no jsdom needed — in the
project's pattern (`boardClick.ts`, `towerFootprint.ts`), since logic left in a
`.tsx` cannot be tested:

- `ghostFor({ pendingTower, activeSquare, legal })` →
  `{ type, illegal } | null`. Null when nothing is pending *or* nothing is
  active — the whole "no ghost renders" rule, in one testable place.
- `ease(current, target, dt, rate)` — the exponential damp above.
- `tiltFrom(dx, dz)` — the clamped lean from displacement.

### Store wiring

Mirrors `CoveragePreview`'s subscription discipline, so a Piece hop (a snapshot
change every hop) cannot force a ghost recompute:

- `pendingType` — `useGameStore((s) => s.snapshot.pendingTower)`, re-renders
  only when the pending type changes.
- `hoveredSquare` / `previewedSquare` — `useUiStore`, re-render only per square
  change (at most 64 updates crossing the board).
- `legal` — `useGameStore((s) => !activeSquare || canBuildOn(s.snapshot,
  activeSquare))`, selected as a bare boolean so zustand's `Object.is` — not the
  snapshot object — decides re-render; a Piece hop that does not flip legality
  costs nothing.

## Acceptance criteria

- With a hand committed, a semi-transparent ghost of the pending Tower's type
  follows the hovered square on a fine pointer and the previewed square on a
  coarse pointer.
- The ghost matches the live Tower's geometry, height, and colour, floating
  ~0.15 above the square's world centre.
- On a square `canBuildOn` refuses, the ghost turns the shared illegal red,
  consistent with `CoveragePreview`'s red marker.
- The ghost never intercepts a pointer event aimed at the board.
- The ghost trails/eases behind square hops, delta-scaled, with no `setState` in
  `useFrame` and no per-frame allocation.
- With no pending Tower, or nothing hovered/previewed, no ghost renders.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test:run` pass.

## Rejected alternatives

- **Ride the per-type `Instances` group in `Towers.tsx`.** Share the tower
  geometry and draw call with the live Towers. Rejected: `Instances` shares one
  material across all slots, and the ghost needs transparency plus a
  colour-shifting red tint — so it needs a second material (and effectively a
  second group) anyway — and the placement-preview concern does not belong in
  the densest file in the scene (diffing, hit and death animations).
- **Declarative only, no `useFrame`.** The ghost snaps to the square centre
  from JSX like `CoveragePreview`'s flat boxes. Cheapest and simplest, but it
  drops the trailing feel entirely — the "deliberate little treat" that makes
  the object feel alive while the player hunts for the square. A static bob is
  not the carried object the issue asks for.

## Consequence

Placement is legible before commitment: the player sees the object — size,
height, colour, hover — and the exact square it will land on, instead of
guessing from the teal footprint. The two refusals (flat red marker, red ghost)
now agree by construction, both reading the engine's `canBuildOn`.