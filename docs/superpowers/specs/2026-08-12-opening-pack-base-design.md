# Opening Pack Becomes Base

**Status:** Approved design — implementation follows.
**Date:** 2026-08-12

## Change

A run opens with a **Base** pack (10 cards) instead of a Scrap pack (3 cards).

Everything else about the opening is unchanged: the deal is free (Ink starts at
zero), it never counts as a purchase toward the pack type's price escalation,
and 10 cards is still under the 30-card Deck cap, so there is still no cull
step and `packPurchases` is still untouched.

## Files

- `src/game/state.ts` — `OPENING_PACK` becomes `'base'`; reword the doc comment
  ("three cards, deliberately below the baseline" → ten cards).
- `src/game/packs.test.ts` — the run-opening block's `PACKS.scrap.size`
  assertions become `PACKS.base.size`; update test names that say "Scrap".
- `docs/design/game-design.md` — the "A run opens by opening a pack" paragraph
  (Base, ten cards).
- `src/data/deck.ts` — the doc comment referencing the Scrap opening.

## Consequence

The old rationale for Scrap was "below the baseline, so a run points the player
at the store almost immediately." A 10-card opening softens that pressure — the
player has real hands to work with from the start. This is a deliberate balance
choice.
