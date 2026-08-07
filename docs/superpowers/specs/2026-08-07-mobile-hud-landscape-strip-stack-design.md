# Mobile HUD Landscape Strip Stack — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The landscape selected-card strip was moved to vertically-centered, just left
of the right actions rail, but it stayed a wide horizontal bar (`[card] [mode
toggle buttons] [Play/hint]`, up to 24rem). Playtesting found it covers too
much of the board. The fix is to stop stacking the strip's items horizontally
and stack them vertically instead, so the strip becomes a narrow column beside
the rail and the board keeps the width.

## Decision

**Stack the landscape strip's items vertically into a narrow column.** The
card goes on top, the build/support mode buttons below it, and Play/hint
underneath, all centered in the column. The column hugs its widest child — the
mode buttons, ~8–9rem — rather than the 24rem cap.

### 1. One CSS block in the landscape `@media`

The landscape `.mobileStrip` rule gains:

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

- `flex-direction: column` re-stacks the strip's children — card, modes, Play
  or hint — vertically.
- `align-items: center` centers each item in the column.
- `width: auto` lets the column hug its widest child (the mode buttons) instead
  of spanning `min(24rem, …)`; `max-width` is kept as a safety bound against
  the mode labels ever outgrowing the board width.
- Position is unchanged from the previous adjustment: vertically centered,
  just left of the right rail.

The inner pieces are already flexible: `mobileStrip__modes` is already a
`flex-direction: column`, and the mode buttons keep their current landscape
font size (0.7rem), so the labels stay on one line and define the column
width.

### 2. Portrait is untouched

The portrait `.mobileStrip` rule keeps its horizontal bar above the bottom
actions. This change lives entirely inside the landscape `@media` block.

## Rejected

- **Card-width column with wrapping labels.** Narrowest possible, but the mode
  labels ("Build — vertical (R6, 2 dmg)") wrap into tall, wordy buttons.
- **Hybrid — buttons side by side, card and Play above/below.** A middle
  ground that still spans ~17rem; the user chose the full vertical stack.

## Consequences

- **CSS-only.** No JSX, component, store, or engine change; the strip's
  toggle/Play/hint behavior is identical.
- **The landscape strip shrinks from up to 24rem wide to ~8–9rem**, freeing the
  board — the specific complaint.
- **Portrait unchanged by construction** — the change is inside the landscape
  `@media` block.
- **Testing** is bounded by the repo's constraint (no jsdom): pure layout CSS,
  verified by `pnpm build && pnpm lint && pnpm test:run` and the user's
  landscape playtest.
