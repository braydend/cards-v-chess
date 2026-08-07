# Mobile HUD Landscape Deck Card Size — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The landscape deck overlay was turned into a right-side vertical panel with
cards in a single column (`grid-template-columns: 1fr`). But the card's own
rule is `width: 100%` (`src/index.css:173`), so each card fills the single
`1fr` column — which is the whole panel width (~26rem). Playtesting found the
cards absurdly large and hard to read.

## Decision

**Clamp the landscape deck card column to 5.5rem and center it in the panel.**
In the landscape `@media` block, the `.deck__cards--touch` rule changes from a
full-width single column to a capped auto-fill:

```css
.deck__cards--touch {
  grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr));
  justify-content: center;
}
```

- `repeat(auto-fill, minmax(5.5rem, 1fr))` caps each column at 5.5rem wide.
  The card's `width: 100%` then fills a 5.5rem cell — a real playing-card
  shape (5:7 aspect → ~7.7rem tall), readable at a glance.
- `justify-content: center` centers the column in the panel rather than
  hugging its left edge.
- The `1fr` max means a column can never stretch beyond 5.5rem even if the
  panel widens; the cap is structural, not a one-off value.

5.5rem is deliberately the same width as the desktop stats grid's minimum
(`minmax(5.5rem, 1fr)`, `src/index.css:57`) — a familiar, already-legible
size in this UI. The user will playtest the exact value.

## Rejected

- **Keeping `1fr` and putting a `max-width` on the card.** Leaves the grid
  column full-width with an orphaned card in it; the grid should be capped,
  not the card.
- **A fixed `grid-template-columns: 5.5rem`.** `auto-fill` with `1fr` keeps
  the card full-bleed within its cell; a fixed size risks the same shrink-fit
  surprises. The `minmax` is the established pattern in this file.

## Consequences

- **Landscape deck cards stop stretching** — capped at 5.5rem wide, centered
  in the right-side panel, still stacked vertically and scrolling.
- **CSS-only.** One rule in the landscape `@media` block; no JSX, store, or
  engine change. Portrait deck cards are untouched (`minmax(3rem, 1fr)`).
- **Testing** is bounded by the repo's constraint (no jsdom): pure layout CSS,
  verified by `pnpm build && pnpm lint && pnpm test:run` and the user's
  landscape playtest of the exact width.
