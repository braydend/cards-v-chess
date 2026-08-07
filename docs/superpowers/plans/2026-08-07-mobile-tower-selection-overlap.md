# Mobile Tower-Selection Board Overlap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone in landscape, when a Card is selected the board glides left just enough that the selected-card strip no longer covers it, and glides back to centre when the Card goes away; the strip itself is narrowed so its mode labels wrap instead of stretching it.

**Architecture:** A pure module `src/scene/stripOffset.ts` computes the pan offset from the strip's live rect and the board's projected width (numbers in, number out — no three.js, so it is unit-testable). `GameScene.tsx` measures the strip when the selection or the mode toggle changes, and a `useFrame` loop eases `controls.target.x` toward the goal with ref state only (no React re-renders, no structural-key traffic). `src/index.css` narrows the landscape strip to a fixed width so the mode sentences wrap. Two-finger pan and its clamp are untouched.

**Tech Stack:** React (React Three Fiber app), three.js, zustand, plain CSS, Vitest. No new dependencies.

## Global Constraints

- **Spec:** [`docs/superpowers/specs/2026-08-07-mobile-tower-selection-overlap-design.md`](../specs/2026-08-07-mobile-tower-selection-overlap-design.md) — frozen, agreed. The spec's width value is `min(14rem, calc(100% - var(--mobile-rail) - 1.4rem))`; the strip's height cap is deliberately unsettled (deferred to playtest) — do **not** add a `max-height` to the strip.
- **Desktop and portrait are untouched.** The CSS change lives inside the existing landscape `@media (max-width: 28rem) and (orientation: landscape), (max-height: 30rem) and (orientation: landscape)` block at the end of `src/index.css`. On desktop there is no `.mobileStrip` element, so the auto-shift's `document.querySelector('.mobileStrip')` returns null and the goal stays 0.
- **Labels stay verbatim.** `GEOMETRY_LABELS`, `rankModeLabel`, `supportModeLabel`, `targetHint` are not rewritten — the strip narrowing is text flow (wrapping), never new copy.
- **Two-finger pan and its clamp are unchanged.** `enablePan={coarse}`, the `onChange` radius clamp, and `maxPan = 0.5 * Math.hypot(board.files, board.ranks) + 2` stay exactly as they are.
- **No engine, no `structuralKey`, no store changes.** `src/game/` and `src/data/` are not touched. `GameScene.tsx` may read `selectedCardId` / `playMode` from `useUiStore` (view state) exactly as `Board.tsx` already reads `useUiStore`.
- **`stripOffset.ts` is pure** — no `three` and no React imports, so Vitest can import it. It exports exactly `panOffsetForStrip` and `easeOutCubic`; later tasks consume those exact names and signatures.
- **No jsdom / no component tests.** The DOM measurement and the camera animation are verified by `pnpm build && pnpm lint && pnpm test:run` plus a manual landscape playtest (Task 3). The numeric core is the only new unit-tested code.
- **No comments unless they explain a non-obvious decision** — but keep the existing load-bearing comments in `GameScene.tsx` (the `key`-on-board-size, pan-clamp and ref-state rationale) accurate as you edit around them.

---

### Task 1: The pure offset module

**Files:**
- Create: `src/scene/stripOffset.ts`
- Test: `src/scene/stripOffset.test.ts`

**Interfaces:**
- Produces:
  - `panOffsetForStrip(input: { stripLeftPx: number; boardLeftPx: number; boardRightPx: number; boardFiles: number; maxPan: number }): number` — the world-unit x offset to push `controls.target.x` by (positive = board moves left on screen), clamped to `[0, maxPan]`; `0` when the strip does not overlap the board or the projection is degenerate.
  - `easeOutCubic(t: number): number` — cubic ease-out over a 0..1 progress fraction, `0` → `0`, `1` → `1`.
- Consumed by: Task 3's `GameScene.tsx`.

The board spans `±files/2` world units (squares are 1 unit, centred on the origin — see `fileToWorldX` in `src/scene/coords.ts`), so the caller projects the board's left/right edges to screen pixels and this module converts pixels to world units through the board's own projected width. No camera or three.js math belongs here.

- [ ] **Step 1: Write the failing test**

Create `src/scene/stripOffset.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { easeOutCubic, panOffsetForStrip } from './stripOffset'

describe('panOffsetForStrip', () => {
  it('returns the world-unit overlap between the board and the strip', () => {
    // Board projected to px 283..561 (8 files): 34.75 px per world unit. The
    // strip's left edge at px 449 cuts 112 px into the board — 3.22 world
    // units. Mirrors an 8x8 board at 844px landscape.
    const offset = panOffsetForStrip({
      stripLeftPx: 449,
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBeCloseTo((561 - 449) / 34.75, 5)
  })

  it('returns 0 when the strip does not overlap the board', () => {
    const offset = panOffsetForStrip({
      stripLeftPx: 600, // right of the board's right edge at 561
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBe(0)
  })

  it('returns 0 when the strip is exactly flush with the board edge', () => {
    const offset = panOffsetForStrip({
      stripLeftPx: 561,
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBe(0)
  })

  it('clamps to maxPan so the Core stays reachable', () => {
    // A strip at the very left of the screen wants far more than maxPan.
    const offset = panOffsetForStrip({
      stripLeftPx: 0,
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBe(7.7)
  })

  it('returns 0 for a degenerate projection', () => {
    // Zero-width board (pxPerWorld = 0) and a NaN board edge both must not
    // produce an offset — the caller guards on a real measurement.
    expect(
      panOffsetForStrip({ stripLeftPx: 449, boardLeftPx: 283, boardRightPx: 283, boardFiles: 8, maxPan: 7.7 }),
    ).toBe(0)
    expect(
      panOffsetForStrip({ stripLeftPx: 449, boardLeftPx: Number.NaN, boardRightPx: 561, boardFiles: 8, maxPan: 7.7 }),
    ).toBe(0)
  })
})

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('eases out: more progress early, less late', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run src/scene/stripOffset.test.ts`
Expected: FAIL — `Cannot find module './stripOffset'` (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/scene/stripOffset.ts`:

```ts
/**
 * How far the board must pan to clear the selected-card strip, in world units.
 *
 * The caller pushes `controls.target.x` by the result — positive x moves the
 * board left on screen, clearing a menu that docks right. Pixels are converted
 * through the board's own projected width, so no camera math lives here: the
 * caller projects the board's left/right edges and passes pixels.
 *
 * A negative overlap (the strip is already clear) and a degenerate projection
 * (a zero-width or non-finite board) both return 0: there is nothing to pan.
 * The result is clamped to `maxPan` so the Core stays reachable.
 */
export function panOffsetForStrip(input: {
  stripLeftPx: number
  boardLeftPx: number
  boardRightPx: number
  boardFiles: number
  maxPan: number
}): number {
  const pxPerWorld = (input.boardRightPx - input.boardLeftPx) / input.boardFiles
  if (!Number.isFinite(pxPerWorld) || pxPerWorld <= 0) return 0

  const overlapWorld = (input.boardRightPx - input.stripLeftPx) / pxPerWorld
  return Math.max(0, Math.min(overlapWorld, input.maxPan))
}

/**
 * Cubic ease-out for the ~200ms board glide: fast start, slow arrival.
 * `t` is a 0..1 progress fraction.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:run src/scene/stripOffset.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Verify the suite still passes**

Run: `pnpm build && pnpm lint && pnpm test:run`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add src/scene/stripOffset.ts src/scene/stripOffset.test.ts
git commit -m "feat(scene): add the strip-clearing pan offset and ease"
```

---

### Task 2: Constrain the landscape strip to a wrapping column

**Files:**
- Modify: `src/index.css` (the landscape `@media` block, `.mobileStrip` rule ~line 860)

**Interfaces:**
- Consumes: the existing `--mobile-rail` custom property and the `.mobileStrip`, `.mobileStrip__modes`, `.hud__hint` class names from `MobileHud.tsx`.
- Produces: a strip at most `min(14rem, calc(100% - var(--mobile-rail) - 1.4rem))` wide whose mode buttons and hint wrap to multiple lines. Consumed visually by Task 3's measurement (the narrower strip needs less pan).

The change is entirely inside the landscape `@media` block — the base `.mobileStrip` rule (portrait placement, `left: 0.7rem; right: 0.7rem; bottom: calc(3.2rem + ...)`) and the portrait deck overlay are untouched.

- [ ] **Step 1: Replace the landscape `.mobileStrip` rule and add the wrap constraints**

In `src/index.css`, the landscape `@media` block currently has:

```css
  .mobileStrip {
    left: auto;
    right: calc(var(--mobile-rail) + 0.7rem);
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
    flex-direction: column;
    align-items: center;
    width: auto;
    max-width: min(24rem, calc(100% - var(--mobile-rail) - 1.4rem));
  }
```

Replace it with:

```css
  .mobileStrip {
    left: auto;
    right: calc(var(--mobile-rail) + 0.7rem);
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
    flex-direction: column;
    align-items: center;
    /* Fixed width, not content-hugging: the mode-toggle sentences wrap to
       several lines inside this column instead of stretching the strip to
       the longest unbreakable line. */
    width: min(14rem, calc(100% - var(--mobile-rail) - 1.4rem));
    max-width: none;
  }

  /* The mode buttons and hint fill the strip's width so their text wraps
     instead of widening it. */
  .mobileStrip__modes,
  .mobileStrip .hud__hint {
    width: 100%;
  }
```

Notes:
- `width` replaces the old `width: auto; max-width: min(24rem, …)` pair — the strip is now exactly `min(14rem, …)`, roughly 40% narrower than the old 24rem cap.
- `.mobileStrip__modes` already is `flex-direction: column` with `min-width: 0` (from the mobile block above); `width: 100%` makes it fill the strip so its `.deck__mode` buttons (flex items, `align-items: stretch` by default) wrap their text instead of pushing the strip wider.
- `align-items: center` stays, so the 2.6rem card and the cancel button still centre; the `width: 100%` items fill regardless.
- Do **not** add `max-height` or `overflow` — the height cap is deliberately deferred to playtest.

- [ ] **Step 2: Verify**

Run: `pnpm build && pnpm lint && pnpm test:run`
Expected: all clean. Then manual smoke in DevTools responsive mode at 932×430 (landscape phone): pick a card, and the strip is a narrow column with the `Build — …` / support labels wrapped to several lines, left of the right rail; portrait (430×932) and desktop are unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(ui): constrain the landscape strip to a wrapping column"
```

---

### Task 3: Auto-shift the board clear of the strip

**Files:**
- Modify: `src/ui/useMediaQuery.ts` (add `LANDSCAPE_QUERY`)
- Modify: `src/scene/GameScene.tsx`

**Interfaces:**
- Consumes: `panOffsetForStrip` and `easeOutCubic` from `./stripOffset` (Task 1); `LANDSCAPE_QUERY` added here; `selectedCardId` and `playMode` from `useUiStore` (already populated by `MobileHud.tsx` and `Deck.tsx`).
- Produces: the landscape-only auto-shift — while a Card is selected, `controls.target.x` eases to the offset that clears the strip; on deselect, play, or orientation change it eases back to 0.

- [ ] **Step 1: Add the landscape media query constant**

In `src/ui/useMediaQuery.ts`, after `COARSE_POINTER_QUERY` (line 18), add:

```ts
/**
 * Whether the viewport is landscape. The mobile layout query matches both
 * phone orientations; this is the refinement that picks landscape out of
 * them — the landscape-only behaviours (the strip auto-shift, the deck's
 * right-side panel) branch on it. Unlike `MOBILE_LAYOUT_QUERY` it has no
 * CSS counterpart: the orientation is expressed inline in the landscape
 * `@media` block.
 */
export const LANDSCAPE_QUERY = '(orientation: landscape)'
```

- [ ] **Step 2: Rewrite `src/scene/GameScene.tsx`**

Replace the whole file (current content is 81 lines; the JSX between the hooks and `</>` is unchanged apart from nothing) with:

```tsx
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import { Vector3, type Camera } from 'three'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { Board } from './Board'
import { Core } from './Core'
import type { CoreFlash } from './coreFlash'
import { GameLoop } from './GameLoop'
import { PieceExits } from './PieceExits'
import { Pieces } from './Pieces'
import { easeOutCubic, panOffsetForStrip } from './stripOffset'
import { Towers } from './Towers'

// The drei OrbitControls ref type: the three-stdlib OrbitControlsImpl, whose
// `.target` (a Vector3) and `.update()` the pan clamp and the strip shift
// below read and write.
type OrbitControlsRef = React.ElementRef<typeof OrbitControls>

/** How long the board takes to glide clear of the strip (or back to centre). */
const STRIP_SHIFT_MS = 200

export function GameScene() {
  const board = useGameStore((store) => store.snapshot.board)
  const core = useGameStore((store) => store.snapshot.core)

  // Whether the pointer is a touch pointer. Pan is mobile-only: on a coarse
  // pointer a two-finger drag shifts the board out from under the HUD chrome;
  // a fine pointer keeps pan disabled exactly as it always was.
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)

  // Whether the viewport is landscape — the only orientation that auto-shifts
  // the board, because the selected-card strip floats over the board's right
  // side there.
  const landscape = useMediaQuery(LANDSCAPE_QUERY)

  // The Card selection that raises the strip, and the mode whose label sets
  // its width. A mode toggle re-measures so a wider label cannot re-cover the
  // board. Both are view state in `uiStore`, read without touching the
  // simulation snapshot.
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const playMode = useUiStore((store) => store.playMode)

  // Selectors, not a whole-store `useThree()`: the camera reference is stable
  // and only the viewport width is reactive here (canvas resize). Subscribing
  // to the whole store would re-render this scene on unrelated store updates.
  const camera = useThree((state) => state.camera)
  const sizeWidth = useThree((state) => state.size.width)

  // The pan clamp needs the live controls instance. A ref, not state: the
  // `onChange` handler reads it per gesture, and routing it through React
  // would be pointless churn.
  const controlsRef = useRef<OrbitControlsRef>(null)

  // The strip shift: the target x the frame loop glides `controls.target.x`
  // toward, then idles so a deliberate manual pan is never fought. Ref state,
  // not React state — this changes every frame while animating.
  const stripShift = useRef({ active: false, from: 0, to: 0, elapsedMs: 0 })

  // Shared by reference between the leak impact that stamps it and the Core
  // that reads it. A ref, not state: this is per-frame data and routing it
  // through React would be the per-frame render CLAUDE.md forbids. -1 is idle.
  const coreFlash = useRef<CoreFlash>({ startedAt: -1 })

  // Measure the strip and set the pan goal. Runs on every trigger that can
  // change the strip's size or the need for it: selection, mode toggle, the
  // board growing, and any resize (via `sizeWidth` and the landscape query).
  useEffect(() => {
    const anim = stripShift.current
    const controls = controlsRef.current

    // The goal: the world offset that moves the board's right edge onto the
    // strip's left edge — or 0 when the strip is not up (no Card selected),
    // not landscape, or not found (desktop). The live rect means a narrower
    // or wider strip needs exactly the pan it really covers, and none when
    // it does not overlap at all.
    let goal = 0
    if (landscape && selectedCardId !== null && controls) {
      const strip = document.querySelector<HTMLElement>('.mobileStrip')
      if (strip) {
        const rect = strip.getBoundingClientRect()

        // The same bound the pan clamp enforces below, so the shift can never
        // make the Core unreachable.
        const maxPan = 0.5 * Math.hypot(board.files, board.ranks) + 2

        // `OrbitControls` moves the camera on its own schedule, so refresh the
        // matrices before projecting the board's edges into screen pixels.
        camera.updateMatrixWorld(true)
        goal = panOffsetForStrip({
          stripLeftPx: rect.left,
          boardLeftPx: screenXOf(camera, sizeWidth, -board.files / 2),
          boardRightPx: screenXOf(camera, sizeWidth, board.files / 2),
          boardFiles: board.files,
          maxPan,
        })
      }
    }

    const from = controls ? controls.target.x : 0
    if (Math.abs(from - goal) < 0.001) {
      anim.active = false
      return
    }

    anim.from = from
    anim.to = goal
    anim.elapsedMs = 0
    anim.active = true
  }, [landscape, selectedCardId, playMode, board, camera, sizeWidth])

  useFrame((_, delta) => {
    const anim = stripShift.current
    if (!anim.active) return
    const controls = controlsRef.current
    if (!controls) return

    anim.elapsedMs += delta * 1000
    const t = Math.min(anim.elapsedMs / STRIP_SHIFT_MS, 1)
    controls.target.x = anim.from + (anim.to - anim.from) * easeOutCubic(t)
    controls.update()
    if (t >= 1) anim.active = false
  })

  return (
    <>
      <GameLoop />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} castShadow />

      <Board board={board} />
      <Core
        board={board}
        square={core.square}
        healthFraction={core.health / core.maxHealth}
        flash={coreFlash}
      />
      <Towers board={board} />
      <Suspense fallback={null}>
        <Pieces board={board} />
        <PieceExits board={board} flash={coreFlash} />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        enablePan={coarse}
        minDistance={6}
        maxDistance={22}
        maxPolarAngle={1.4}
        onChange={(event) => {
          // Clamp the pan so the board can never be pushed off-screen. A
          // two-finger drag moves `controls.target`; the target stays within a
          // radius of the board's centre that grows with the board (an Ace
          // adds a rank), so the Core is always reachable. Rotate and zoom do
          // not move the target, so this is a no-op during those gestures.
          const controls = event?.target
          if (!controls) return

          const maxPan = 0.5 * Math.hypot(board.files, board.ranks) + 2
          const distance = controls.target.length()
          if (distance > maxPan) {
            controls.target.setLength(maxPan)
            controls.update()
          }
        }}
      />
    </>
  )
}

/**
 * The screen x of a board-plane world x, in CSS pixels. Allocates a scratch
 * vector per call — the measurement this serves runs on selection changes,
 * never per frame, so the allocation is fine.
 */
function screenXOf(camera: Camera, width: number, worldX: number): number {
  const v = new Vector3(worldX, 0, 0)
  v.project(camera)
  return ((v.x + 1) / 2) * width
}
```

Notes:
- `screenXOf` returns a CSS-pixel x; `panOffsetForStrip` divides a px difference by the board's projected px-per-world, so the unit conversion is consistent even though `v.project` produces NDC — `((ndc.x + 1) / 2) * width` is the NDC→px step.
- `camera.updateMatrixWorld(true)` must run before each projection pair because `OrbitControls` mutates the camera after the last render and `Vector3.project` reads `camera.matrixWorldInverse`.
- The goal is recomputed with the strip's real rect, so Task 2's narrower strip produces a smaller (often zero) offset — the two compose automatically.
- `controls.update()` inside `useFrame` fires the `onChange` clamp; it is a no-op because the goal is already clamped to the same `maxPan`.
- `playMode` is an intentional dependency even though the body never reads it: toggling build/support changes the strip's width, which the measurement must see.

- [ ] **Step 3: Verify**

Run: `pnpm build && pnpm lint && pnpm test:run`
Expected: all clean (Task 1's 7 new tests included).

Manual playtest (phone, or DevTools responsive mode with `(pointer: coarse)` emulation where available):
- Landscape, pick a Card: the board glides left over ~200ms just enough that the strip's left edge meets the board's right edge; if the strip already fits in the gap, the board does not move.
- Toggle Build/Support: the strip re-measures; a longer label nudges the board a little further left, a shorter one lets it glide back.
- Cancel the Card or play it: the board glides back to centre.
- Two-finger drag still pans freely once the glide settles; one-finger still orbits; pinch still zooms.
- Portrait: no shift (the strip is above the bottom bar there). Desktop: no shift (no `.mobileStrip`).
- Flag the strip's resulting height for the user's playtest — wrapping makes it taller and the spec deliberately defers the height cap.

- [ ] **Step 4: Commit**

```bash
git add src/ui/useMediaQuery.ts src/scene/GameScene.tsx
git commit -m "feat(scene): auto-shift the board clear of the selected-card strip"
```

---

## Self-Review

**Spec coverage:**
- §1 (shift on selection in landscape, return on deselect/play, re-measure on mode toggle, two-finger pan untouched) → Task 3.
- §2 (measurement formula, `maxPan` reuse, degenerate-input guard) → Task 1, consumed by Task 3.
- §3 (~200ms `easeOutCubic` glide, ref state in `useFrame`, no React re-renders) → Task 3.
- §4 (fixed `min(14rem, …)` width, wrapping mode labels and hint, labels verbatim, landscape-only, no height cap) → Task 2.
- §5 (file list: `stripOffset.ts` + test, `GameScene.tsx`, `useMediaQuery.ts`, `index.css`) → Tasks 1–3. No engine, `structuralKey`, or store changes anywhere.
- Rejected items: none resurrected — no always-on offset, no instant snap, no fixed constant, no label rewrites, no portrait strip change.

**Placeholder scan:** No TBD/TODO. Every step has concrete code or exact commands. The height-cap deferral is stated as a spec decision, not a missing step.

**Type consistency:** `panOffsetForStrip({ stripLeftPx, boardLeftPx, boardRightPx, boardFiles, maxPan })` and `easeOutCubic(t)` are defined in Task 1 and called with identical names/shapes in Task 3. `LANDSCAPE_QUERY` is added in Task 3 Step 1 and imported in Task 3 Step 2. `STRIP_SHIFT_MS` is defined and used in the same task. The `maxPan` formula appears in the `onChange` clamp (unchanged) and in the Task 3 effect — both `0.5 * Math.hypot(board.files, board.ranks) + 2`.
