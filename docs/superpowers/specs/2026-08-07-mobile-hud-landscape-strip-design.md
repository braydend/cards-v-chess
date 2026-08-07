# Mobile HUD Landscape Strip Centering — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

In landscape, the selected-card strip (the "menu for piece placement/boosting"
— the build/support mode toggle, Play, and hint) floats just left of the right
actions rail but is bottom-aligned, hugging the bottom edge. The user wants it
beside the rail rather than at the bottom of the screen; portrait already
looks fine and is unchanged.

## Decision

**Vertically center the landscape strip against the screen's midpoint, just
left of the right actions rail.** One CSS rule change in the landscape `@media`
block in `src/index.css`:

```css
.mobileStrip {
  left: auto;
  right: calc(var(--mobile-rail) + 0.7rem);
  top: 50%;
  bottom: auto;
  transform: translateY(-50%);
  width: min(24rem, calc(100% - var(--mobile-rail) - 1.4rem));
}
```

- `top: 50%` + `transform: translateY(-50%)` replaces `bottom: 0.7rem`, so the
  strip sits at the screen's vertical midpoint beside the actions rail.
- The `right` rail-clearance offset and the `width` bound are unchanged.
- Portrait is untouched (the portrait `.mobileStrip` rule keeps its
  above-the-bottom-bar placement).

## Rejected

- **Top-right, mirroring the TowerPanel.** Symmetric but farthest from the
  thumb.
- **Bottom, tucked to the rail.** Barely a change; still reads as "at the
  bottom".

## Consequences

- **One CSS rule.** No component, store, or engine change; no behavior change
  to the strip's toggle/Play/hint.
- **Portrait unchanged** by construction — the change is inside the landscape
  `@media` block.
- **Testing** is bounded by the repo's constraint (no jsdom): the change is
  pure layout CSS, verified by `pnpm build && pnpm lint && pnpm test:run` and
  the user's playtest in landscape.
