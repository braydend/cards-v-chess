# Deck Sort Buttons

**Status:** Approved design — implementation follows.
**Date:** 2026-08-12

## Feature

Two small buttons in the Deck view sort the visible cards by **suit** or by
**value**. The buttons appear in both Deck views — the desktop HUD panel
(`src/ui/Deck.tsx`) and the mobile full-screen picker
(`src/ui/DeckOverlay.tsx`) — and the active choice is shared between them.

## Behaviour

- **Default** is raw deal order (no button active).
- Clicking **Suit** sorts by suit in the fixed order **hearts, diamonds,
  spades, clubs**; ties broken by value ascending; Jokers last.
- Clicking **Value** sorts by value ascending (**2 → A**, Jokers last); ties
  broken by the same fixed suit order.
- Clicking the active button again returns to raw order.
- The two buttons are **mutually exclusive** — activating one clears the
  other.
- The choice lives in `uiStore` (view state), shared by both views and
  persistent within a run. It is never part of `GameState` — sorting is a
  rendering concern, not a simulation one.

## Architecture

- **`src/ui/deckSort.ts`** (new, pure): `sortDeck(cards, sort): Card[]`
  where `sort` is `'none' | 'suit' | 'value'`, plus the comparators.
  Jokers (no rank, no suit) always sort last under both non-`none` sorts.
- **`src/state/uiStore.ts`**: add `deckSort: 'none' | 'suit' | 'value'` and
  `setDeckSort`, defaulting to `'none'`.
- **`src/ui/Deck.tsx`** and **`src/ui/DeckOverlay.tsx`**: map over
  `sortDeck(deck, deckSort)` instead of `deck`; render the two buttons in the
  header row.
- **CSS**: a small two-button control in the deck header.

## Testing

- `src/ui/deckSort.test.ts`: unit tests for `sortDeck` — suit order,
  value order, tie-breaks, Jokers last, `'none'` identity, stable within
  equal keys, cards untouched (each card's `id` preserved). Pure module
  per the no-jsdom rule; the buttons themselves are plumbing.

## Non-goals

- No search, filter, grouping headers, or count badges.
- No persistence across runs — the choice resets with the run's view state.
- Sorting never affects what is playable: a Joker is never hand material.
