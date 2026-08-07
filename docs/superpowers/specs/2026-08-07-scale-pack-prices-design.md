# Scale Pack Prices — Design

**Date:** 2026-08-07
**Status:** Agreed
**Issue:** [#35 — scale pack prices](https://github.com/braydend/cards-v-chess/issues/35)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Scope

Pack prices escalate so they stay meaningful as the run progresses. This covers
the **price half of the economy only** — base prices, escalation, the purchase
counter that drives it, the opening deal that now points players at the store,
and the shop readout. **Ink income values stay untouched** — the design doc's
open question asks for them to be resolved *jointly* with pack prices, and this
spec deliberately leaves that for a separate pass; see "Deferred" below.

This spec **overturns** a written design decision: game-design.md said "Prices
are fixed per pack type. Packs do not escalate in price." That was the settled
position when packs were built. Issue #35 revisits it, and this spec replaces
it. The doc is updated to match.

## Decisions

### 1. Base prices rise, and stop being placeholders

New base prices in `src/data/packs.ts`, replacing the placeholders:

| Pack | Old | New |
| --- | --- | --- |
| Scrap | 15 | 50 |
| Base | 40 | 100 |
| Suited | 60 | 200 |
| Court | 85 | 400 |

The ordering scrap < base < suited < court is preserved. These are now real
bases — the escalation starts from them — so the "PLACEHOLDER price" labels on
the prices go away. The **tier weights are still placeholders** and keep their
label; only the prices resolve here.

### 2. Escalation is compounding, per pack type, unbounded

The price of a pack type is a function of how many of *that* type the player has
already bought in this run. A purchase multiplies that type's current price by
1.10, rounding **up** to the next integer at every step:

```
count 0 → base
count n → ceil(previous × 1.10)
```

Scrap, starting at 50: 50 → 55 → 61 → 68 → 75 → 83 → 92 → 102 → …

**The rounding must be exact, never a floating-point ceil.** `50 × 1.1`
evaluates to `55.00000000000001` in IEEE 754, so `Math.ceil(50 * 1.1)` is 56,
not the 55 the issue's example demands. Compute the multiply in integers:
`next = floor((price × 11 + 9) / 10)`, which is exactly `ceil(price × 11 / 10)`
for the integer prices involved and cannot drift. This matters on every step,
not just the first — `Math.ceil` on floats drifts forever after the first
off-by-one.

Three properties follow from the issue's example, where buying three Scraps
raises only Scrap and a Base pack bought next still costs 100:

- **Per type.** Each pack type escalates off its own purchase count. Buying
  Scraps never raises Base, Court or Suited.
- **Compounding, not additive.** Each step multiplies the *current* price by
  1.10 and rounds up — the issue's "55 × 1.1 = 60.5 → 61".
- **Unbounded.** No cap on price or count. A type the player keeps buying
  eventually prices itself out of reach. That is the intent: early packs are
  cheap, later ones are a decision. If the player can no longer afford any
  pack, the run continues under whatever the "running out of cards" open
  question resolves to; this spec does not add a floor.

### 3. `packPurchases` lives on `GameState`

`GameState` gains `packPurchases: Record<PackType, number>`, initialized to all
zeros in `createInitialState`. It is simulation state like `ink` — per run,
seeded, no persistence, not in `DEV_SEED`'s output beyond determinism.

The count is what the price reads, so it must be on the same object as the
Ink it is spent with. A run's `structuralKey` gains `packPurchases`: in practice
a purchase already moves `ink` and the deck ids, so this adds no publishes, but
keying it is the explicit guarantee that a price-only-visible change publishes.

### 4. One pure price function, read by engine and UI

The escalation math lives once, in `src/game/packs.ts`:

```
packPrice(pack: PackType, count: number): number
```

The base prices stay in `src/data/packs.ts`; the escalation is logic and belongs
with the engine. `buyPack`, `canAfford`, the shop's price readout, and the
commit-button label all call it, so a stale base or a divergent rounding rule
cannot creep in at one call site.

`canAfford(ink, pack)` gains the count: `canAfford(ink, pack, count)`. The
single current caller, `buyPack`, passes `state.packPurchases[pack]`; the UI
callers pass the same value read from the zustand snapshot.

### 5. `buyPack` charges the current price and bumps the counter

In `src/game/packs.ts`, on a successful purchase:

- deduct `packPrice(pack, state.packPurchases[pack])` from `state.ink` (was
  `PACKS[pack].price`);
- return `state` with `packPurchases[pack]` incremented by one.

Refusal checks keep their existing order — phase first, then affordability.
`canAfford` now takes the count, so the affordability check at `buyPack` is
against the current, escalated price.

### 6. The opening deal becomes a free Scrap, and never escalates

`OPENING_PACK` in `src/game/state.ts` changes from `'base'` to `'scrap'`, so a
run opens with 3 cards and the player has to reach the store almost immediately.
This is the issue's requested side effect ("force players into the store
earlier").

The opening deal is dealt directly by `createInitialState` via `dealPack` — it
does **not** go through `buyPack`, so it never reads `packPurchases` and never
increments it. The first *bought* Scrap costs 50; the free opening one is free
and costs nothing, and does not make the second Scrap cost 55.

### 7. The shop shows the current price, nothing more

`PackShop.tsx` and `packPurchase.ts` replace their `def.price` reads with
`packPrice(pack, packPurchases[pack])`, where `packPurchases` comes from the
same zustand snapshot the shop already subscribes to. The player sees the price
they would actually pay right now — 61 for a third Scrap, say.

Deliberately **no** escalation hint, no "next price" readout, no history. The
issue asked only that prices scale; surfacing the mechanic beyond the number
itself is deferred UI polish and would make the shop busier than the design
wants. The current price alone is the honest minimum and what the affordance
check needs.

## Deferred

- **Ink income values.** game-design.md's open question says pack prices and ink
  income must be resolved *together*. This spec resolves prices only; the income
  values (round lump sum, kill rewards, Joker share) remain placeholders and the
  open-question row stays open, now noting that prices have moved. Tuning income
  against the new prices is the follow-up this deliberately leaves.
- **Capping the escalation.** None by decision, see decision 2. Revisit only with
  play experience that says a run can price itself into a dead end.
- **Showing the escalation.** No UI affordance beyond the current price, see
  decision 7.
