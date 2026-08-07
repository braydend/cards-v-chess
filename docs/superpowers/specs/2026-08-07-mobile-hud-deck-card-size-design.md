# Mobile HUD Deck Card Size — Design

**Date:** 2026-08-07
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The deck overlay's cards stretch to fill their container. The pack reveal
(`.modal__reveal`) renders small, identical cards whether a 3-card Scrap or
10-card Base pack is opened, because its grid is `repeat(auto-fill, minmax(2.4rem, 1fr))`
in a wide modal — ~11 tracks, each stretched barely past 2.4rem. The deck
overlay's shared rule is `repeat(auto-fill, minmax(3rem, 1fr))` and the
landscape override is `repeat(auto-fill, minmax(5.5rem, 1fr))` in a ~26rem
panel — only 4 tracks, each stretched to ~6.5rem. The `1fr` in both makes the
tracks grow to fill the container, so cards change size with the panel and the
deck, and the landscape cards render oversized.

## Decision

**Give the mobile deck overlay cards a fixed width that cannot stretch,
matching the pack reveal's consistency.** The deck cards stay the same size
regardless of panel width or deck size.

### 1. Fixed 3.5rem tracks in the shared rule

The shared `.deck__cards--touch` rule (both orientations) changes from
`repeat(auto-fill, minmax(3rem, 1fr))` to:

```css
.deck__cards--touch {
  grid-template-columns: repeat(auto-fill, 3.5rem);
  justify-content: center;
}
```

- `repeat(auto-fill, 3.5rem)` fixes each track at exactly 3.5rem — there is no
  `1fr` left to grow, so cards cannot stretch. At the 5:7 aspect, a 3.5rem card
  is ~4.9rem tall, comfortably tappable.
- `justify-content: center` centers the row(s) in the panel when the fixed
  rows fall short of the panel edge, so there is no dead gap on one side.

### 2. The landscape override is deleted

The landscape `@media` block's `.deck__cards--touch` override
(`minmax(5.5rem, 1fr)`) is removed, so the shared fixed-width rule applies in
landscape too. The right-side panel shows the same 3.5rem cards, centered,
roughly seven per row at its ~26rem width.

### 3. Everything else is untouched

- The pack reveal keeps its `minmax(2.4rem, 1fr)` — the reference look, not a
  target to change.
- The desktop Deck panel keeps its small grid, which already renders near the
  pack reveal's size.
- Portrait and landscape panel shapes (bottom sheet vs right-side panel) are
  unchanged; only the card size is fixed.

## Rejected

- **Matching the pack reveal exactly at 2.4rem.** The deck is the interactive
  picker (up to 30 cards, tap targets); 2.4rem is under the ~44px touch-target
  guideline and would feel fiddly. 3.5rem is the pack reveal's consistency at
  a deck-appropriate scale.
- **Keeping `1fr` and adding `max-width` on the card.** The grid column stays
  full-width with an orphaned card in it; the grid itself must be fixed.
- **Fixing at 5.5rem.** Largest option, but well above the pack reveal's look
  the user asked to match.

## Consequences

- **Deck cards render fixed at 3.5rem in both orientations** — identical
  whether the deck holds 3 cards or 30, no stretching with panel width.
- **CSS-only.** One shared rule edit, one landscape override deleted. No JSX,
  store, or engine change.
- **Desktop and pack reveal unchanged** by construction.
- **Testing** is bounded by the repo's constraint (no jsdom): pure layout CSS,
  verified by `pnpm build && pnpm lint && pnpm test:run` and the user's
  playtest of the exact width.
