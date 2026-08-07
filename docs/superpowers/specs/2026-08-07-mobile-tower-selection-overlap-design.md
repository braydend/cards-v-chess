# Mobile Tower-Selection Board Overlap — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

On mobile in landscape, selecting a Card raises the selected-card strip
(`mobileStrip`) — the tower-placing menu — which floats vertically centred just
left of the right actions rail and covers the board's right side. The board is
otherwise clear of the rails, so this is the one chrome the player must work
around: today they two-finger pan the board out from under it
([`2026-08-07-mobile-two-finger-pan-design.md`](./2026-08-07-mobile-two-finger-pan-design.md)).
Issue #45 calls that manual nudge clunky and asks for the board to move itself.

Two facts compound the problem. The strip hugs its widest child, and its widest
children are the mode-toggle labels — `Build — Fires along rank, file and
diagonals (R3, 1 dmg)` and `Speed 65ms faster — any Tower` — so a long label
stretches the strip across a large slice of the board.

## Decision

**While a Card is selected in landscape, auto-pan the board left just enough
that its right edge clears the strip's left edge; return it to centre when the
Card is deselected or played. In the same orientation, stop letting the strip
hug its widest line — constrain it to a fixed narrow width and let the mode
labels wrap.**

The narrower strip is not a cosmetic extra: it is what makes the auto-shift
mostly a no-op. A strip that fits in the gap between the board and the right
rail covers nothing, the measurement below returns zero, and the board never
moves. The auto-shift is the safety net for the phones and labels that do not
fit. Both changes live in the landscape mobile layout; portrait and desktop are
untouched by construction.

### 1. Trigger and return

- **Shift on:** a Card is selected (`selectedCardId` non-null) while the
  viewport matches `(orientation: landscape)` and the strip element is present.
- **Shift off:** the Card is deselected or played, or the orientation stops
  matching — the board returns to centre.
- The shift is re-measured when the strip's width changes — the mode toggle
  flips (`playMode`), a resize, a relayout — so a label that grows re-triggers
  the pan rather than re-covering the board.
- Two-finger pan remains available (touch-only, existing clamp). While a Card
  is selected the animation settles and then goes idle, so a deliberate manual
  pan is not fought; the auto-shift only pulls during the transition.

### 2. Measurement

The goal is the world-space x offset for `controls.target` such that the
board's right edge lands on the strip's left edge. All input is pixels on the
same screen; the world conversion uses the board's own projected width, so no
raycasting is needed.

```
panOffsetForStrip({ stripLeftPx, boardLeftPx, boardRightPx, boardFiles, maxPan })
  pxPerWorld = (boardRightPx - boardLeftPx) / boardFiles
  overlapWorld = (boardRightPx - stripLeftPx) / pxPerWorld
  return clamp(overlapWorld, 0, maxPan)
```

- `stripLeftPx`: `document.querySelector('.mobileStrip').getBoundingClientRect().left`.
- `boardLeftPx` / `boardRightPx`: the world points `±boardFiles/2` on the board
  plane, projected through the camera. The board spans `±files/2` world units
  because squares are 1 unit and the board is centred on the origin.
- `maxPan`: the existing pan clamp, `0.5 * Math.hypot(board.files,
  board.ranks) + 2` — the same bound `GameScene` already enforces, so the
  auto-shift can never push the Core out of reach.
- Degenerate input (`pxPerWorld` zero or non-finite, or a strip already left of
  the board) yields `0` — no pan.

The target moves by `+offset` in x. Pushing `controls.target` right moves the
board left on screen (the same world-space direction as a two-finger drag to
the left), which is exactly the direction that clears a right-side menu.

### 3. Smooth transition

The pan eases over ~200ms with `easeOutCubic` rather than snapping. The
animation is ref state mutated in `useFrame` — `controls.target.x` lerped
toward the goal and `controls.update()` when it moves — never React state, so
no re-renders and no structural-key traffic. The existing `onChange` clamp
still runs and is a no-op during the ease because the goal is already clamped.

### 4. The narrower strip

In the landscape `@media` block, the strip stops hugging content:

```css
.mobileStrip {
  width: min(14rem, calc(100% - var(--mobile-rail) - 1.4rem));
  max-width: none;
}

.mobileStrip__modes {
  width: 100%;
}

.mobileStrip .hud__hint {
  width: 100%;
}
```

The mode buttons and hint now wrap to several lines within the fixed width
instead of stretching the strip to the longest unbreakable line. Labels are
unchanged verbatim — `GEOMETRY_LABELS` and the support text keep their single
copies; this is text flow, not new copy.

The exact width (14rem, roughly 40% narrower than the current 24rem cap) is a
playtest-tunable value. **Flagged for playtest:** wrapping makes the strip
taller, and it is vertically centred — on a short phone it could crowd the
top-right TowerPanel or exceed the viewport. If it does, cap the strip's height
and scroll its content; the two are independent decisions and this spec does
not settle the cap.

### 5. Scope

| File | Change |
| --- | --- |
| `src/scene/stripOffset.ts` | **New.** Pure `panOffsetForStrip` and `easeOutCubic`, both unit-tested. No three.js imports — numbers in, number out. |
| `src/scene/stripOffset.test.ts` | **New.** Overlap → positive offset; no overlap → 0; clamp at `maxPan`; degenerate `pxPerWorld` → 0; easing bounds. |
| `src/scene/GameScene.tsx` | Read `selectedCardId` + `playMode` from `useUiStore` and a new landscape query; measure and animate. The projection of the board's edges is a small local function — three.js-dependent, so deliberately untested (repo convention). |
| `src/ui/useMediaQuery.ts` | Add `LANDSCAPE_QUERY = '(orientation: landscape)'` alongside the existing query constants. |
| `src/index.css` | The landscape strip-width block above. |

No engine, no `structuralKey`, no store changes. The renderer already owns both
the pan clamp and the strip, so nothing crosses a boundary.

## Rejected

- **Always offset in landscape, selected or not.** The rails sit beside the
  board; the strip is the only chrome that overlaps, and it only exists while a
  Card is selected. A permanent offset would push the board toward the left
  rail for no reason, and the snap-back-to-centre expectation (below) is only
  coherent if the resting state is centred.
- **Snap instead of easing.** A hard jump of several world units each time the
  strip opens is jarring; ~200ms of ref-mutating lerp costs nothing and reads
  as deliberate.
- **A fixed offset constant.** The strip's width varies with the label and the
  device; a constant either over-shifts most phones or leaves a column covered
  on the rest. Measuring the live rect is a dozen lines and adapts to both.
- **Shorten the labels.** The geometry sentence is `GEOMETRY_LABELS` verbatim
  by rule, and the support text is its own tested copy — forking either just to
  shrink the strip duplicates copy that the repo deliberately keeps singular.
  Wrapping preserves the words while reclaiming the space.
- **Move the strip further off the board instead of narrowing it.** The strip
  is already pinned against the right rail; there is no free horizontal room
  left of it except the board's own, so the only lever is its width.
- **Narrowing the strip in portrait too.** Portrait's strip is a full-width bar
  above the actions; wrapping there would leave a stub bar. The change lives
  inside the landscape block, so portrait is unchanged by construction.

## Consequences

- **Selecting a Card on a phone in landscape clears the board automatically** —
  the strip, if it still covers anything, is cleared by a short eased pan, and
  the board returns to centre when the Card goes away.
- **The strip takes roughly 40% less horizontal room** in landscape, so on
  most phones the auto-shift is a no-op and the board never moves.
- **Two-finger pan is untouched** and remains the manual fallback for anything
  the auto-shift cannot fit.
- **Desktop and portrait are byte-identical**: the media-query gate mirrors
  the existing mobile query, and every change sits inside it.
- **Testing** is bounded by the repo's constraint: the numeric core is
  unit-tested (`stripOffset.test.ts`); the projection and animation are
  verified by `pnpm build && pnpm lint && pnpm test:run` and a manual landscape
  playtest on a phone, with the strip width and its height cap flagged for the
  user.
