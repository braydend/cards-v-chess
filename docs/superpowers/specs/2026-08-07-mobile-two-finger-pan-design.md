# Mobile Two-Finger Pan — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The landscape HUD's right rail and the selected-card strip sit beside the
board, and even though the strip now stacks into a narrow column, it still
covers a corner of the play area. On a phone there is no way to move the
board relative to the camera — `OrbitControls` has `enablePan={false}`
(`src/scene/GameScene.tsx:41`), so a two-finger drag does nothing. The player
cannot nudge the board out from under the chrome.

## Decision

**Enable two-finger pan on touch only, clamped so the board can never be
panned off-screen.** three.js's `OrbitControls` already pans the camera on a
two-finger drag — the gesture is built in, and `enablePan` is the switch.
Turning it on for touch gives the feature with no new gesture code; the work
is gating it and clamping the pan target.

### 1. Pan on touch only

`GameScene` uses the existing `useMediaQuery(COARSE_POINTER_QUERY)` hook from
`src/ui/useMediaQuery.ts` — the same pointer-shape query the tap-to-preview
uses. Pass `enablePan={coarse}` to `<OrbitControls>`. On a fine pointer
(desktop mouse) `enablePan` stays `false`, exactly as today; on a coarse
pointer (touch) two-finger drag pans.

Desktop stays byte-identical by construction: the `(pointer: coarse)` query
never matches a mouse, so the prop that changes is only ever true on touch.

### 2. Clamp the pan target

A two-finger drag moves `controls.target` — the world point the camera orbits
around. To keep the board reachable, the target stays within a radius of the
board's centre (the origin). The radius grows with the board, because an Ace
adds a rank:

```
maxPan = 0.5 * Math.hypot(board.files, board.ranks) + 2
```

At 8×8, `board.files = 8`, `board.ranks = 8`: `0.5 × √128 + 2 ≈ 7.7` units —
enough to shift the board clear of the right rail, never enough to lose the
Core. Board squares are 1 world unit, so the half-diagonal is
`0.5 × √(files² + ranks²)`.

The clamp runs in the controls' `onChange` handler, holding a ref to the
controls instance: if the target's distance from the origin exceeds `maxPan`,
it is scaled back to `maxPan` (same direction, shorter length). Rotate and
zoom do not move the target, so the clamp is a no-op during those gestures —
only a pan can exceed the radius, and only a pan can be pulled back.

### 3. Scope

`src/scene/GameScene.tsx` only: the hook, a controls ref, the `onChange`
clamp, and the `enablePan` prop. No engine, state, store, or CSS changes.

## Rejected

- **`enablePan` unconditionally.** Gives desktop right-drag/middle-drag pan,
  a desktop behavior change outside the request. The coarse-pointer gate keeps
  desktop exact.
- **A custom two-finger gesture handler.** three.js already pans on two-finger
  drag when `enablePan` is on; a hand-rolled gesture would fight the built-in
  touch handling (pinch, rotate) for no benefit.
- **Unbounded pan.** The player could push the board entirely off-screen and
  have to guess where it went mid-round. The clamp is cheap and prevents a
  real loss-of-board.

## Consequences

- **The board becomes nudgeable on a phone** — two-finger drag moves it out
  from under the HUD chrome, and the clamp guarantees it stays reachable.
- **Desktop is untouched** — the coarse-pointer gate is the same one the
  tap-to-preview already relies on.
- **One file changed.** No engine or state changes; the gesture is three.js's
  own, configured not reimplemented.
- **Testing** is bounded by the repo's constraint (the renderer is untested):
  verify with `pnpm build && pnpm lint && pnpm test:run` and a manual
  playtest — two-finger drag pans, one-finger still orbits, pinch still zooms,
  the board cannot be lost, and desktop is unchanged.
