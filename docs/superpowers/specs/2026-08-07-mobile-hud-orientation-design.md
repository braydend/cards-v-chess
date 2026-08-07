# Mobile HUD Orientation Layout — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The mobile HUD (from [`2026-08-07-mobile-ui-design.md`](./2026-08-07-mobile-ui-design.md))
renders stats and round controls together in one thin bar pinned to the bottom
of the screen, regardless of how the phone is held. On a landscape phone that
bar spans the whole width, so the board — which the player must see — is
hemmed in vertically, and the stats sit on the opposite side of the screen
from the thumb. The two halves of the bar have nothing in common but the
container: the stats are read-only state, the actions are buttons.

The fix is to stop treating them as one unit. Split the bar into two
independent clusters and let orientation decide where each lives: in portrait,
stats top and actions bottom (the two natural thumb/eye zones); in landscape,
stats on the left and actions on the right, each as a full-height rail, so the
board keeps the full vertical centre.

## Decision

**Split `mobileBar` into `mobileStats` and `mobileActions`, and position them
by `orientation`.** The component keeps rendering both clusters and the
selected-card strip; CSS alone moves them.

### 1. One DOM structure, placed by orientation

`MobileHud.tsx` stops wrapping stats and actions in a single `mobileBar` div.
It renders `mobileStats` (the `dl`) and `mobileActions` (the buttons) as two
sibling chrome-bearing groups. The `mobileStrip` and `DeckOverlay` are
unchanged.

The component still expresses *what* exists; CSS decides *where*. The
orientation media features are added as sub-blocks inside the existing mobile
`@media (max-width: 28rem), (max-height: 30rem)` block — the mobile query
already matches both phone orientations (portrait via `max-width`, landscape
via `max-height`), so the orientation split is a refinement, not a new
breakpoint:

| Orientation | Stats | Actions | Strip | TowerPanel |
| --- | --- | --- | --- | --- |
| `orientation: portrait` | top bar | bottom bar | above the bottom bar (as today) | above the bottom bar (as today) |
| `orientation: landscape` | full-height left rail | full-height right rail | floats left of the right rail, bottom-aligned | top-right, left of the right rail |

### 2. Chrome travels with each cluster

The background, `pointer-events: auto`, and border that `.mobileBar` carried
move onto both `mobileStats` and `mobileActions` (shared base rules), so each
cluster is independently tappable and visually bounded.

- **Portrait:** stats pin `top/left/right: 0` with
  `padding-top: env(safe-area-inset-top)` (the notch); actions pin
  `bottom/left/right: 0` with `padding-bottom: env(safe-area-inset-bottom)`
  (the home indicator). Stats lay out horizontally (row), actions in a row.
- **Landscape:** stats pin `left/top/bottom: 0` with
  `padding-left: env(safe-area-inset-left)`; actions pin `right/top/bottom: 0`
  with `padding-right: env(safe-area-inset-right)`. Both stack vertically
  (column) so the three stats and four buttons each form a tidy rail.

### 3. The selected-card strip follows the actions

The strip stays with the actions cluster. In portrait that is above the bottom
bar — the same position it has today. In landscape the mode-toggle labels
("Build — vertical (R6, 2 dmg)") are far too wide for a narrow rail, so the
strip cannot live *inside* the right rail; it floats just **left of the right
rail, bottom-aligned**, spanning over the board's bottom-right corner, thumb-
near the actions. This is the one position the user flagged for playtesting.

### 4. The TowerPanel avoids the rails

- **Portrait:** above the bottom bar, exactly as today.
- **Landscape:** the right rail is full-height, so there is no literal
  "above" it. The panel anchors **top-right, left of the right rail**, clear
  of the bottom-aligned action buttons. Content is unchanged.

### 5. Touch hygiene moves with the class names

The touch-hygiene `@media` block in `index.css` currently targets `.mobileBar`
and `.mobileStrip` for `touch-action: manipulation` and `user-select: none`.
`.mobileBar` no longer exists, so the selector becomes `.mobileStats,
.mobileActions` (plus `.mobileStrip`, unchanged). Everything else in that
block — the scrollable chrome and the portrait TowerPanel offset — stays.

## Rejected

- **Two orientation-specific components** (`MobileHudPortrait` /
  `MobileHudLandscape`). Duplicates the stats + actions + strip JSX and
  re-shares the deck-overlay/modal wiring for no benefit; the placement is
  pure CSS.
- **A single bar with `flex-direction` reordering.** Can move stats to the
  top in portrait but leaves actions in the *same* bar, which is exactly the
  split this change is for.
- **Full-height stats/actions rails in portrait too.** Portrait height is the
  scarce dimension; full-height rails would bury the board. Top/bottom bars
  are the fit for portrait.
- **Moving the strip into the right rail in landscape.** The mode-toggle
  labels cannot fit a narrow rail; the strip spans wider by design.

## Consequences

- **Pure CSS + a two-line JSX restructure.** `MobileHud.tsx` drops the
  `mobileBar` wrapper; `index.css` gains an `orientation` refinement. No
  engine, no state, no store changes.
- **Desktop is untouched.** The orientation rules live inside the mobile
  media query; the desktop panel never mounts on mobile, and vice versa.
- **The deck overlay, modals, and all interaction logic are unchanged.** The
  strip's build/support toggle, Play, and cancel behave exactly as before,
  only positioned differently.
- **Testing is bounded by the repo's constraint** (no jsdom, no component
  tests): the verifiable logic is unchanged, so nothing new is unit-testable;
  the layout is verified by `pnpm build` / `pnpm lint` / `pnpm test:run` and
  manual smoke in both orientations. The landscape strip and TowerPanel
  positions are flagged for the user's playtest.
