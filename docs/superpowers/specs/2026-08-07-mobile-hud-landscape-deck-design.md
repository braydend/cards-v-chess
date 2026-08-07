# Mobile HUD Landscape Deck Panel — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The mobile deck overlay (`DeckOverlay.tsx`) is a bottom sheet: full-width
panel sliding up from the bottom, with the card grid wrapping into rows
(`grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr))`). In landscape
a wide bottom sheet still covers the board horizontally, which is the same
real-estate problem the stats/actions split and the stacked strip solved for
the HUD proper.

## Decision

**In landscape, the deck overlay becomes a full-height right-side panel with
cards in a single vertical column.** It sits beside the actions rail, where
the deck content naturally belongs, and stacks the deck as a list rather than
a grid, so a single glance reads every card.

### 1. Right-side panel, not a bottom sheet

In the landscape `@media` block, `.deckOverlay` changes from
`align-items: flex-end` (centered modal, panel pushed to the bottom) to a
right-anchored full-height panel:

```css
.deckOverlay {
  justify-content: flex-end;
  align-items: stretch;
}
```

and `.deckOverlay__panel`:

```css
.deckOverlay__panel {
  width: min(26rem, 85vw);
  height: 100%;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
```

The scrim keeps dimming and dismissing the whole screen behind the panel, so
the board remains visible but clearly modal. `useDialogFocus` still traps
Tab and closes on Escape; `selectCard` on pick is unchanged.

### 2. Cards as a single vertical column

`.deck__cards--touch` changes from the wrapping grid to a single column:

```css
.deck__cards--touch {
  grid-template-columns: 1fr;
}
```

Cards stack vertically at full panel width (~5–6rem each), keeping their touch
target sizing. The panel is already `overflow-y: auto`, so a deck past the
screen height (the 30-card cap easily is) scrolls within the panel.

### 3. Portrait is untouched

The portrait `.deckOverlay` and `.deckOverlay__panel` rules keep the bottom
sheet. These changes live entirely inside the landscape `@media` block.

## Rejected

- **Left-side vertical panel.** Mirrors the stats rail but puts the deck far
  from the thumb that just tapped the Deck button on the right.
- **Bottom sheet with vertical cards.** Keeps the wide sheet covering the
  board horizontally — the exact problem being solved.
- **Move the panel to the right but keep the grid.** Cards stay tiny (~3rem);
  doesn't use the vertical space.

## Consequences

- **The landscape deck becomes a readable list beside the actions**, matching
  the HUD's right-side cluster, and the board keeps its width.
- **CSS-only.** No JSX, store, or engine change; pick/close/focus behavior is
  identical.
- **Portrait unchanged by construction** — the change is inside the landscape
  `@media` block.
- **Testing** is bounded by the repo's constraint (no jsdom): pure layout CSS,
  verified by `pnpm build && pnpm lint && pnpm test:run` and the user's
  landscape playtest.
