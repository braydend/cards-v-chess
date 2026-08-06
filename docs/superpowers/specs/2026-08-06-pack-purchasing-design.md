# Pack Purchasing — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#10 — add pack purchasing](https://github.com/braydend/cards-v-chess/issues/10)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Scope

Ink became spendable. This spec covers the **spending half** of the economy: the
seeded PRNG that packs need, the four pack types, buying one with Ink, culling to
stay inside the 30-card cap, and the run's opening pack.

[`2026-08-06-ink-income-design.md`](2026-08-06-ink-income-design.md) built the
income half and said plainly what it left behind: "Ink a number that only goes
up". This closes that loop.

Two notes on the issue text, which uses vocabulary the design does not. It says
"hand" twice — there is no hand in this game, and both readings are the **Deck**.
And its link (`openfront.io/w2/game/…`) is an OpenFront lobby rather than a
design document; the pack types under "Ink and packs" in `game-design.md` are
what this spec builds against.

All four ship. Sizes are taken from that table and are **not** placeholders — the
exact-cull arithmetic in decision 3 depends on them:

| Pack | Size | Contents |
| --- | --- | --- |
| Scrap | 3 | Random |
| Base | 10 | Random |
| Court | 10 | Weighted toward the scarce tier |
| Suited | 10 | All one suit, the player's choice |

## Decisions

### 1. Packs are bought only in the gap between rounds

`buyPack` is refused while a round is live. This is the **one** deliberate
exception to "commands are valid both between rounds and mid-round", and it is
not a convenience — it is what keeps round termination bounded.

`game-design.md`'s "Repair versus the wall" entry states the hazard: Towers
block, there is no pathfinding, and a ♥-repaired Tower a Piece cannot break is a
permanent wall against which a round never ends. What bounds it today is that
cards are consumed and cannot be replaced, so ♥ runs out, the Tower falls, and
the round resumes. That entry has said since it was written that "**adding packs
removes the bound**".

Gap-only purchasing means it does not. The ♥ supply is fixed for the whole
duration of a round, so the existing argument survives intact and
`src/game/roundTermination.test.ts` keeps its meaning.

The alternative — allowing mid-round purchase for consistency with every other
command — requires resolving "Repair versus the wall" in the same change, and
that question wants play experience rather than a paper decision.

**This is an invariant, not a preference.** It earns an entry in CLAUDE.md's
"Invariants that constrain code" and a test in `roundTermination.test.ts`.
Without the test the invariant is only a comment.

### 2. Cull happens before the pack opens, and the whole purchase is one command

The player frees space first, then the pack deals into the room made.

The rejected alternative was showing the pull and then culling across the
combined 35 cards, which lets a bad pull be its own cull candidate. That reads
better on paper, and it was declined: culling before the reveal keeps the
transaction atomic.

Atomicity is what this decision buys, and it is worth more than the reveal-first
ordering:

- `GameState` never holds a half-finished purchase. No `pendingPack` field, no
  `phase: 'culling'`, nothing for `tick` to know about, no new state for a
  `structuralKey` to track.
- `deck.length <= DECK_CAP` stays a hard invariant, true at every observable
  moment, so `DECK_CAP`'s test can keep asserting it.
- The purchase is **free to abandon**. No Ink is spent and no card destroyed
  until the single command commits, so Cancel needs no rollback path.

The in-progress cull selection is therefore view state, and lives in
`src/state/uiStore.ts` — which is what that file is for, and why it stays
coverage-exempt.

```ts
| {
    readonly kind: 'buyPack'
    readonly pack: PackType              // 'scrap' | 'base' | 'court' | 'suited'
    readonly suit?: Suit                 // required iff pack === 'suited'
    readonly cullCardIds: readonly string[]
  }
```

`step` refuses the command — returning state unchanged, as the existing plays
do — unless all of:

- `phase === 'gap'` (decision 1)
- `ink >= price(pack)`
- `suit` is present if and only if `pack === 'suited'`
- every `cullCardIds` entry is a real Deck card id, with no duplicates
- the cull is **exactly** `max(0, deck.length + size(pack) - DECK_CAP)`

On success, in one step: spend the Ink, remove the culled cards through the
existing `removeCard`, deal `size(pack)` cards from the `packs` PRNG stream,
append them, and advance the stream.

New card ids come from `nextEntityId`, the counter Pieces and Towers already
share, so ids are unique for the whole run and `reset()` rewinds them for free.

### 3. Culling is exactly what the cap demands — never more

Over-culling is refused, not merely discouraged.

Letting the player destroy eight cards to open a three-card pack would hand them
Deck **thinning** as a strategy, and the design never grants it: `game-design.md`
defines Cull only as "destroying cards to stay within the 30-card Deck cap". A
smaller, denser Deck is a real strategic want, but it is a design change and
belongs to a decision of its own rather than arriving as a side effect of the
purchase screen.

The rule lives once, in `src/game/packs.ts`, exported as a query that answers how
many cards this pack forces you to destroy and whether you can afford it. `step`
validates against it and the UI renders from it. Neither re-derives it.

### 4. Named PRNG streams, not one

This closes the **PRNG streams** open question.

One run seed, hashed together with a stream name to derive an independent
generator per purpose. `GameState.rng` holds `{ packs }` today.

Packs are the only consumer, so a single stream would work right now. Named
streams cost a few lines and buy the property that makes a shared seed worth
having: adding a second random consumer later — round composition, anything —
cannot shift the pack sequence. Retrofitting this after seeds have been shared
invalidates every one of them.

The generator is immutable, like the rest of the engine: `next(rng)` returns
`[value, nextRng]`, and the drawn-from stream is written back into the new
`GameState`. `Math.random` stays banned in `src/game/`, enforced by ESLint.

**The algorithm itself is an implementation detail**, left to the plan. Any small
well-known 32-bit generator will do; the requirements are that it be
deterministic, hold its whole state in a plain serialisable value, and add no
dependency. Statistical quality beyond "the distribution looks flat" is not
needed — this deals cards, it does not run a simulation.

### 5. The seed is supplied from outside the engine, and stays internal

`createInitialState(seed)` takes a seed. `src/state/simulation.ts` generates one
and re-seeds on `reset()` — `Math.random` is legal there, and the boundary is
exactly why the engine cannot generate its own.

Nothing surfaces in the UI. The run is reproducible in tests and the seed already
lives in `GameState`, so displaying or entering one is a later feature that
nothing here blocks.

### 6. A run opens by dealing a Base pack

This closes the **Which pack opens a run** open question as Base.

`STARTING_DECK` is deleted. `src/data/deck.ts` has anticipated this since it was
written — "when packs land, this is replaced by a pack opening" — and keeps
`DECK_CAP`.

The cost is real and accepted: that authored list deliberately exercised every
mechanic (all nine buildable ranks, all four suits, each face rank, both Jokers,
and a triple), which made manual testing of unrelated features reliable. A random
opening deal does not. Keeping it as a named dev fixture was offered and
declined — a second concept of "the deck you start with" is not worth carrying.

The opening pack is free. Ink starts at 0, and an empty Deck plus ten cards
cannot breach the cap, so the opening deal has no cull step and no purchase flow.

### 7. Rarity has three tiers, and 2–10 are flat

This **amends** `game-design.md`'s "Rarity is rank. Low numbers common, high
numbers scarce, face cards and Aces precious."

| Tier | Cards | Note |
| --- | --- | --- |
| Common | 2–10 | **Equal weight.** A 10 is no scarcer than a 2. |
| Scarce | J, Q, K, Joker | |
| Rarest | A | Alone, for the reason below. |

Flat across 2–10 makes the ladder a genuine choice of geometry rather than a
scarcity gradient — the rank ladder already differentiates those nine cards by
shape, range and damage, so pricing them by rarity too would double-count.

The Ace gets its own tier because **caps on the King and Ace hazards were
deliberately deferred** (decision 8), which leaves scarcity as the only
restraint on board growth.

The Joker sits with the face cards rather than in the rarest tier. It is the only
answer to a repair-versus-the-wall stall, and making the escape hatch the hardest
card in the game to obtain is a trap.

`Court` is defined as "weighted toward high ranks", which with a flat 2–10 can no
longer mean 9s and 10s: it shifts probability mass into the **scarce** tier. It
shifts rather than excludes — a Court pack still deals 2–10, just less often —
so a Court is never a guarantee, only better odds.

### 8. Prices and weights are placeholders, and the King/Ace caps are deferred

**Pack weighting and prices** and **Ink income values** both stay open. Numbers
have to exist for a purchase to happen at all, so `src/data/packs.ts` carries
prices and tier weights labelled as loudly as `src/data/ink.ts` already labels
its own. Neither question is closed by their existence.

The two must be resolved together — Ink's worth is set by what it buys — and now
can be, since packs finally price it. That joint tuning pass is its own work,
informed by play.

`game-design.md` lines 118–123 name two hazards that arrive with packs: a
King-heavy Deck means unbounded Core health, an Ace-heavy Deck means an
arbitrarily long board. Both become reachable here. Neither is capped.

Scarcity is the whole mitigation: Kings sit in the scarce tier, Aces alone in the
rarest. The board hazard is the more pressing of the two, because it is technical
as well as balance — `src/scene/GameScene.tsx` casts shadows on three.js's
default frustum, already visibly wrong at 8×8 — but a cap sets a number with no
play data behind it, which is the guess the open-questions list exists to
prevent.

### 9. The shop is a modal that owns the whole flow

A `Buy a pack` button joins `hud__actions`, disabled unless `phase === 'gap'`.
`src/ui/PackShop.tsx` mounts only when open, from a flag in `uiStore.ts`.

One screen with progressive sections: four pack tiles with price and
affordability → a suit picker once Suited is chosen → the cull grid when the cap
demands one → commit. On success the body is replaced by the reveal. Cancel and
Escape cost nothing (decision 2).

Chosen over two alternatives, both of which reused existing surfaces more
cheaply. Inline in the HUD panel was rejected because that panel already scrolls
at 30 cards. A right-hand dock beside `TowerPanel` was rejected because it splits
one decision across two screen edges. What the modal buys is that shop, cull and
reveal read as a **single framed commitment**, with a stage the stretch-goal
opening animation can later use. It costs a new surface and hides the board while
open.

**The reveal needs nothing from `GameState`.** The modal captures the Deck's id
set before dispatching and diffs afterwards, so no `lastPackCardIds` field is
required.

`Deck.tsx` already renders mini card faces — the corner index with its suit pip
bled off the bottom edge. That face is extracted into a shared component the
modal also uses, so the game never carries two card renderers.

Per CLAUDE.md's no-jsdom rule, the decisions leave the `.tsx`:
`src/ui/packPurchase.ts` (beside `formatStat.ts` and `supportLabel.ts`) decides
the commit button's label, whether it is enabled, and why not.

### 10. The Deck's `structuralKey` entry is keyed on card ids, not length

A bug found while designing this, fixed as part of it.

`src/state/structuralKey.ts` keys the Deck on `state.deck.length` alone, and says
why: "Every card play removes exactly one card, so length alone is a faithful
trigger."

Packs falsify that premise. With cull-before-open, a player at the cap must
destroy exactly as many cards as the pack deals — so buying a Scrap while holding
30 goes 30 → 30. The key does not move, the store never publishes, and three new
cards stay invisible until something unrelated changes the key. That is the
**most common** cull case, not an edge one: it is what culling at the cap always
looks like.

Fixed by keying the joined card ids. Thirty short strings a couple of dozen times
a second is nothing, and it adds no publishes, so `simulation.test.ts`'s bound of
60 per 600 frames is untouched. Derived from the Deck rather than a `deckRevision`
counter, so there is no bookkeeping to get wrong.

`structuralKey.test.ts` gains a test that a cull-and-open of equal size changes
the key, so nobody optimises the join back to a length.

## Tests

The engine carries this, as always.

| File | What it pins |
| --- | --- |
| `src/game/rng.test.ts` | Same seed, same sequence. A draw on one stream cannot shift another — the property decision 4 exists for. |
| `src/game/packs.test.ts` | Exact pack sizes. Suited is one suit. 2–10 come out flat. Court skews toward the scarce tier, asserted as distribution **ordering** over many seeded deals, so a balance tweak cannot break it. The opening Base deal. |
| `src/game/buyPack.test.ts` | Every refusal branch. Ink spent exactly. Culled cards gone **by id, with duplicates in the Deck**, pinning the multiset rule. The exact-cull rule of decision 3. |
| `src/game/roundTermination.test.ts` | `buyPack` refused while a round is live. Holds up decision 1. |
| `src/state/structuralKey.test.ts` | A cull-and-open of equal size changes the key. Holds up decision 10. |
| `src/ui/packPurchase.test.ts` | The commit button's enabled state and its reason. |

`src/data/deck.test.ts` is rewritten. All six of its current tests assert
every-mechanic coverage on the authored list that decision 6 deletes. `DECK_CAP`
keeps a test; the coverage assertions move to `packs.test.ts`, where the opening
deal now happens.

`src/data/packs.ts` is constant tables and stays coverage-excluded like the rest
of `data/`. Everything new in `src/game/` is measured and needs real coverage —
the thresholds in `vite.config.ts` are a regression ratchet, not a baseline.

## Out of scope

Each a follow-up, none blocked by anything here:

- **The pack-opening animation** — issue #10's own stretch goal. Decision 9
  leaves it a stage.
- **Seed display or entry** (decision 5).
- **King and Ace caps** (decision 8).
- **The joint price and Ink-income tuning pass** (decision 8).
- **Deck thinning** as a deliberate mechanic (decision 3).

## Phasing

The implementation plan follows this order. Each step leaves the build green.

1. `src/game/rng.ts`, the seed on `GameState`, and seeding from
   `src/state/simulation.ts`. No behaviour change yet.
2. `src/data/packs.ts` and `src/game/packs.ts` — the tables and pure dealing.
3. The opening Base pack replaces `STARTING_DECK`; `deck.test.ts` rewritten.
4. The `buyPack` command, its refusals, and the `structuralKey` fix.
5. The UI — shared card face, `PackShop.tsx`, `packPurchase.ts`.
6. Documentation.

## Documentation changes

Two passages become **wrong** and are edited in place rather than appended to:

- **`game-design.md:199`** — "Rarity is rank. Low numbers common, high numbers
  scarce" contradicts decision 7. Rewritten to the three tiers.
- **`game-design.md:336`** — "**Adding packs removes the bound**" is falsified by
  decision 1. Rewritten: packs landed, and gap-only purchasing is what preserves
  the bound.

Open questions: **Which pack opens a run** and **PRNG streams** close. **Pack
weighting and prices** and **Ink income values** stay open, annotated to say
placeholders now exist and where they live.

Lines 118–123's King and Ace hazards move from unreachable to
reachable-but-uncapped, recording that scarcity is the only mitigation and that
caps were deferred on purpose.

`CLAUDE.md` loses its "Packs do not exist" section, refreshes its test count from
a real `pnpm test:run`, and gains one invariant: **packs are bought only in the
gap, and that is what keeps round termination bounded.**
