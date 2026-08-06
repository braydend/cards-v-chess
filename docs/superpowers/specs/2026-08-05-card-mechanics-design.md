# Cards V Chess — Card Mechanics

**Date:** 2026-08-05
**Status: FROZEN decision record. Not the current design.**

> This records the decisions taken on 2026-08-05 for GitHub issue #5, the reasoning behind them, and what was rejected. It is **not updated** as the design evolves.
>
> **For what the game is now, read [`docs/design/game-design.md`](../../design/game-design.md).** That is the single source of truth and holds the only canonical open-questions list.

Implements the card system designed in [2026-08-05-card-system-and-roster-design.md](2026-08-05-card-system-and-roster-design.md) and resolves three rows from the open-questions list.

## Scope

**In:** the Card, the Deck, modality (rank builds / suit supports), consumption, the full rank ladder including ranks 6–10, the face cards, the Ace, and the Jokers.

**Out:** Ink, packs, pack weighting and prices, the cull flow, and the seeded PRNG. The Deck for this slice is a fixed authored list.

Deliberately so: the modality is the part that has been designed longest and played least. The economy can be added on top without revisiting anything here, provided the Deck is modelled correctly now — see "The Deck is pack-shaped".

## The Card

```ts
export type Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs'

/** Ranks that build a Tower. 2–10 carry the geometry ladder. */
export type BuildableRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** Every rank on a standard card. Face ranks act instead of building. */
export type CardRank = BuildableRank | 'J' | 'Q' | 'K' | 'A'

export type Card =
  | { readonly id: string; readonly kind: 'standard'; readonly rank: CardRank; readonly suit: Suit }
  | { readonly id: string; readonly kind: 'joker' }
```

Two properties are load-bearing and both are enforced by the type rather than by a comment:

**A Joker has no suit and no rank.** It is a separate variant, so "play a Joker for its suit" is not expressible. This was the single most-missed consequence of using a real 54-card deck.

**A Card has an `id` independent of its rank and suit.** The Deck is a **multiset** — cards are gained from random packs, so holding three 5♦ is normal and expected, not an edge case. Playing one must consume that instance and leave the others. Identifying a card by `rank + suit` would be a bug the moment a duplicate exists.

`BuildableRank` is split out from `CardRank` so `TOWER_RANKS` is a `Record<BuildableRank, TowerRankDef>` and `towerRank()` cannot be called with a face card. Passing `'K'` where geometry is expected is a type error, not a runtime surprise.

## The Deck is pack-shaped

The Deck is an ordered list of `Card` instances, capped at 30. It is **not** a subset of 54 distinct cards.

For this slice it is a hand-authored list in `data/deck.ts`, chosen to exercise every mechanic — every buildable rank, all four suits, each face card, and a Joker — with **deliberate duplicates**, because duplicates are what packs produce and the code must handle them from day one.

No shuffling, no draw, no randomness: there is no PRNG in scope, and `Math.random` is banned in `src/game/` regardless.

The 30-cap is not enforced by a cull flow in this slice, because there is no way to acquire cards. It is asserted on the authored deck by a test, so the cap cannot be quietly exceeded later.

## Modality

> **Rank builds. Suit supports.**

Every standard Card offers exactly two plays, chosen at play time. Playing a Card **consumes it** — removed from the Deck, nothing returns, no discard pile.

A Joker is not modal. It has one action.

## The rank ladder

Ranks 2–5 are unchanged. Ranks 6–10 are new.

| Rank | Geometry | Range | Damage | Interval | Health | Targets/shot |
| --- | --- | --- | --- | --- | --- | --- |
| **2** | adjacent | 1 | 1 | 600 ms | 8 | 1 |
| **3** | vertical | 4 | 1 | 600 ms | 12 | 1 |
| **4** | cross | 4 | 2 | 550 ms | 16 | 1 |
| **5** | diagonal | 5 | 3 | 500 ms | 20 | 1 |
| **6** | **star** | 5 | 3 | 480 ms | 24 | 1 |
| **7** | **adjacent** | 3 | 4 | 450 ms | 28 | 1 |
| **8** | **star** | 6 | 4 | 420 ms | 32 | **3** |
| **9** | **adjacent** | 3 | 5 | 400 ms | 36 | **5** |
| **10** | **adjacent** | 4 | 6 | 380 ms | 40 | **all** |

Ranks 2–5 are the existing values, restated so the ladder reads as one table. Ranks 6–10 are new and are **placeholder balance values** in `data/`, not design: the agreed principle is only that power rises with rank.

Two properties the numbers must hold, which the placeholders do:

- **Every fire interval stays under the Pawn's 900 ms move cadence**, so a Tower gets at least one shot at a Piece crossing its coverage. This is why rank 2 was moved off horizontal in the first place.
- **Range is not comparable across geometries.** It counts squares along the pattern, so `adjacent` range 3 is a 7×7 disc of 49 squares while `vertical` range 4 is 8 squares. Rank 7's range of 3 is not a downgrade from rank 5's 5.

`targetsPerShot: 'all'` is represented as `Number.POSITIVE_INFINITY` in `data/`. The field is a plain `number`, `Infinity` compares correctly against any candidate count, and it never leaves `data/` — `GameState` does not carry it — so there is nothing to serialise.

Shape remains the rank's identity through 6–7. From 8 upward the ladder scales on **how many Pieces a shot hits**, not on stranger patterns.

That choice was deliberate. After adjacent, vertical, cross and diagonal, the supply of generic non-chess silhouettes is nearly exhausted, and the candidates that remain are contrived — a "ring" that only fires at exact range is *weaker* up close, which fights the power curve, and "the whole board" is a ceiling with nothing above it. Scaling on target count has no ceiling problem, is legible at a glance, and answers the Pawn swarm the roster is built around.

**Only one new geometry is needed: `star`.** Two facts make the rest free:

- `coversSquare('adjacent', N, …)` is already a Chebyshev disc, so "area" is `adjacent` at range > 1. No new pattern, no new code.
- `star` is `cross ∪ diagonal` — one added case in `coverage.ts`.

### Rejected: `pierce` as a separate concept

Ranks 8–10 were first sketched as `star + pierce` (hit every Piece along each ray) and `disc + multi-target`. Both collapse into a single `targetsPerShot: number` on `TowerRankDef`, which delivers the same feel — a high Tower mowing through a swarm — with one field instead of two mechanics. `targetsPerShot: 1` is the existing behaviour, so ranks 2–7 are unchanged by construction.

`selectTarget` in `tick.ts` currently returns the single covered Piece nearest the Core. It becomes "the N nearest", keeping the existing distance metric and the id tie-break so the simulation stays deterministic.

### `horizontal` stays orphaned

`horizontal` is implemented in `coverage.ts`, tested, and used by **no rank** — rank 2 moved to adjacent after measurement. It is left in place: it costs nothing, it is covered by tests, and deleting working tested code to tidy a union is churn. Noted so its absence from the ladder reads as intentional.

## Face cards, the Ace, and the Jokers

These **act instead of building**. The agreed direction was "a Tower upgrade or evolution"; the governing principle settled on is sharper:

> **Suits tune numbers. Face cards change kind.**

♥ ♦ ♠ ♣ already cover the entire stat quartet and their magnitude scales with rank, so a K♥ is *already* a large repair with no new design. A face card whose rank mode merely bumped a stat would be a fifth suit.

| Card | Action | Needs a Tower? |
| --- | --- | --- |
| **Jack — Shield** | Grant a Tower a shield of **10**, absorbed before health | Yes |
| **Queen — Echo** | Build a copy of an existing Tower's rank on an empty square | Yes |
| **King — Reinforce** | Raise Core current **and** maximum health by **1** | No |
| **Ace — Expand** | Grow the board by one rank, lengthening the run to the Core | No |
| **Joker — Clear** | Destroy every Piece on the board | No |

Each touches a different layer — a Tower's durability, the number of Towers, the Core, the battlefield, the Pieces. None of them duplicates a suit.

### Jack — Shield

Flat **10**, additive across multiple Jacks, absorbed before health, and it never regenerates.

Grounded rather than guessed: a blocked Pawn deals `attackDamage 2 × BLOCKED_ATTACK_MULTIPLIER 0.5` = **1 damage per 900 ms**, so 10 shield absorbs about **9 seconds** of grinding. Against Tower health of 8 / 12 / 16 / 20 at ranks 2–5, that more than doubles a rank 2 and adds half again to a rank 5.

Flat rather than rank-scaled on purpose: it is worth proportionally more on a cheap Tower, which gives low ranks a reason to still matter once the player holds 9s and 10s.

Damage hits the shield first and **overflow carries into health** — a shield of 2 taking a 5-damage hit leaves 0 shield and costs 3 health. A single hit is never wasted, and a shield never blocks more than it is worth.

A shield is distinct from ♥ repair in kind, not just in magnitude: **repair is reactive and can be out-paced; a shield is pre-emptive and cannot.**

### Queen — Echo

Copies the source Tower's **rank only**, onto an empty in-bounds square, at full health for that rank. Accumulated ♦ / ♠ / ♣ supports and any shield are **not** copied — otherwise Echo becomes the strongest support-multiplier in the game rather than a second Tower.

### King — Reinforce

Raises Core current and maximum health by 1. Both, not just the cap, so it helps when the player is actually hurt.

**This is the only card in the game that touches the Core, and the only Core recovery that exists** — `tick.ts` otherwise only ever subtracts from it. Each leak costs exactly 1 Core health, so +1 buys exactly one extra leak.

The Core must therefore carry its own `maxHealth` in `GameState`, mirroring the split `Tower` already has. `Hud.tsx` currently renders `{core.health} / {CORE_MAX_HEALTH}` from a static import, which would read `21 / 20` after a King.

**Known weakness, accepted:** support magnitude scales with rank, so K♥ is a top-of-scale repair and +1 Core health may not compete. The counterweight is that Core health is otherwise unrecoverable and is the only thing that ends a run. The value lives in `data/` and is tunable without touching logic. Revisit with play.

**Note for when packs land:** copies are unlimited by design, so a King-heavy Deck means unbounded Core health. Not reachable in this slice; it will want a cap then.

### Ace — Expand

Adds one rank to the board. The Core stays at rank 0 and Pieces spawn from the far rank, so the run to the Core lengthens and Towers get more shots.

This is cheap because the renderer is **already** board-size-driven: every scene component takes `board: BoardSpec` and derives world position through `fileToWorldX(board, …)` / `rankToWorldZ(board, …)`, `Board.tsx` builds from `allSquares(board)`, and its placement plane is sized `board.files * SQUARE_SIZE`. Nothing in `src/scene/` needs changing.

The engine has one hard coupling to fix: `SPAWN_RANK` in `data/board.ts` is a module constant `BOARD.ranks - 1`, used at `tick.ts:206`. It must become `state.board.ranks - 1`, read from state.

**This closes an open question by fiat.** *"Board geometry — still a literal 8x8"* becomes false: the board grows to 8×9, 8×10 and beyond. Mechanically that is safe — square colour is `(file + rank)` parity, so the checker pattern and the Knight's light-square vulnerability survive a rectangular board. What it retires is the *thematic* claim to a true chessboard. Accepted deliberately.

**Growth is unbounded and uncapped in this slice**, which is safe only because the Deck is authored: it holds a known, small number of Aces. Once packs land, unlimited copies mean an arbitrarily long board — which is not merely a balance problem but a rendering and camera-framing one. It will want a cap then, alongside the King's.

Only ranks grow, never files. `data/rounds.ts` derives spawn files from `BOARD.files`, and leaving files fixed keeps that correct without change.

### Joker — Clear

Destroys every Piece standing on the board. It does **not** touch Towers, because Towers are permanent once placed and only ever destroyed by Pieces. It does **not** drain `pendingSpawns`, so a round that is still spawning continues rather than ending early.

Being suitless, this is a Joker's only play.

It is also **the one card that can always break a grind**, which makes it a genuine safety valve for the stall described below.

**Note for when Ink lands:** clearing twenty Pawns must not pay twenty kill rewards, or the Joker becomes an income exploit.

## Suit support actions

Applied to one existing Tower. Magnitude scales with rank: `2–10` by face value, `J` 11, `Q` 12, `K` 13, `A` 14.

| Suit | Action | Magnitude |
| --- | --- | --- |
| ♥ Hearts | **Repair** — restore health, clamped to `maxHealth` | `+magnitude` health |
| ♦ Diamonds | **Speed** — shorten the fire interval | `−(magnitude × 10)` ms, floored at 100 ms |
| ♠ Spades | **Health** — raise the health ceiling | `+magnitude` `maxHealth` only |
| ♣ Clubs | **Damage** — raise damage | `+max(1, round(magnitude / 3))` |

All values are placeholders in `data/`, not balance decisions.

Two rules worth stating explicitly:

**♠ raises `maxHealth` only, not current health.** That keeps ♠ and ♥ genuinely distinct — ♠ grows the ceiling, ♥ fills it — and matches the design's wording exactly. A ♠ on a damaged Tower gives headroom for a later ♥.

**♦ is floored at 100 ms** so stacked Diamonds cannot drive the fire interval to zero or negative, which would make `fireTowers`' `while (cooldown >= fireIntervalMs)` loop forever.

Supports **stack additively with no cap**, as do shields.

### Consequence: a Tower carries its own stats

`Tower` currently stores only `cardRank` and derives everything through `towerRank(cardRank)`. Once ♦ ♠ ♣ can modify a specific Tower, the Tower must own its mutable stats:

```ts
export interface Tower {
  readonly id: string
  readonly square: Square
  readonly cardRank: BuildableRank
  readonly fireCooldownMs: number
  readonly health: number
  readonly maxHealth: number
  readonly damage: number          // seeded from rank, raised by ♣
  readonly fireIntervalMs: number  // seeded from rank, lowered by ♦
  readonly shield: number          // granted by Jack, absorbed before health
}
```

`range`, `geometry` and `targetsPerShot` stay derived from `cardRank` — no support modifies them, so duplicating them onto every Tower would invite drift.

## Commands

One command per action, each carrying exactly the payload it needs. Every command names a `cardId`, and the engine validates that the card exists in the Deck and is the kind the command expects, so an illegal play returns state unchanged rather than throwing — the existing `step` contract.

```ts
| { kind: 'buildTower';    cardId: string; square: Square }
| { kind: 'supportTower';  cardId: string; towerId: string }
| { kind: 'shieldTower';   cardId: string; towerId: string }          // Jack
| { kind: 'echoTower';     cardId: string; sourceTowerId: string; square: Square }  // Queen
| { kind: 'reinforceCore'; cardId: string }                           // King
| { kind: 'expandBoard';   cardId: string }                           // Ace
| { kind: 'clearPieces';   cardId: string }                           // Joker
```

The existing `placeTower` command — which builds from a bare rank at no cost by clicking the board — is **replaced**. Building now requires spending a Card.

Commands stay valid both during a round and in the gap, unchanged.

## UI

The whole Deck is always visible — there is no hand and no drawing, so nothing is hidden. Play is three steps:

1. **Select a card** from the Deck.
2. **Choose its mode** — Build or Support for a standard card. A face card offers its action in place of Build. A Joker offers only Clear.
3. **Click the target** — a square for Build and Echo, a Tower for Support and Shield. King, Ace and Joker have no target and resolve on confirm.

Duplicates must be individually selectable, since three 5♦ are three distinct cards and playing one leaves two.

`CoveragePreview` already previews a rank's coverage on hover and is driven by `selectedRank` in `uiStore`. That becomes driven by the selected *card* instead, and it is the reason Build should preview before committing — it is what makes the 6–10 ladder judgeable rather than guesswork.

`Hud.tsx`'s "Build rank" button row, which currently picks a bare rank from `BUILDABLE_RANKS`, is replaced by the Deck. This is where the visual design effort belongs, as the file's own comment says.

## Repair versus the wall

`game-design.md` flags this as *"not yet reachable, but will be the moment ♥ repair lands."* It lands here. **The decision is to defer it deliberately**, and this section records why, plus what was built so the deferral is safe.

### The problem, measured

The round-end rule at `tick.ts:83` ends a round when no Piece can still act. `isStuck` is `nextMove(...).kind === 'stuck'`, and a blocked Piece returns `attackTower` — **not** `stuck`. So a Piece grinding a Tower counts as active and the round cannot end while it grinds.

That is correct today only because of an invariant nothing states: **Towers only ever lose health**, so a grind is always a countdown and a blocked Piece always unblocks eventually. Round termination is *accidental*. ♥ Repair is the first mechanic that breaks it.

The sharpest case was built and run. `coverage.ts` requires `fileDistance === rankDistance` for a diagonal, so a Piece directly ahead on the same file (`fileDistance 0`, `rankDistance 1`) is **never covered** by a rank-5 Tower — the best thing a player could previously build:

| | |
| --- | --- |
| Tower max health | 20 |
| Pawn blocked-attack damage | 1 per 900 ms hop |
| Hops to destroy the Tower | 20 |
| Real time to destroy | **18 s** |
| Pawn health throughout | **3 / 3 — never shot once** |

Holding that Tower at full health for **120 seconds** of simulated time: phase still `inProgress`, Tower alive, Pawn alive and undamaged, Core untouched. Neither side can resolve it.

### Why deferring is safe

In this slice cards are consumed and there are no packs, so **repair is finite**. ♥ runs out, the Tower falls, the round resumes. No permanent stall is reachable until packs land.

### What was built to keep it safe

1. **A test pins the bound** — exhaust the ♥ supply, confirm the Tower falls and the round ends. The safety property is asserted, not assumed.
2. **A comment at `tick.ts:83` names the invariant** the round-end rule leans on, so whoever adds packs sees what they are removing.
3. **The Joker is a hard counter** — it always breaks a grind.

### What raises the odds of meeting it

♥ repair and Jack's shield both mitigate Tower damage. Stacked on a rank-5 diagonal Tower in its own blind spot, they extend the stall well past a minute. This makes the wall likelier to be *encountered* in play than first estimated — which is an argument for deferring, not against it: it will be met early and decided with experience, exactly as the design doc asks.

Moving King from "temporary regeneration" to "+1 Core health" removed a third mitigation source and its own hazard — a regeneration effect would have had to tick only while `phase === 'inProgress'`, since the gap between rounds is untimed and CLAUDE.md forbids any engine value accruing with elapsed time. Free healing by idling in the gap.

## The never-stuck hole

`game-design.md` states: *"because every card can always build, the player can never be stuck"*, and asks that the property be preserved. **This design does not fully preserve it, and that is accepted.**

Jack and Queen both require a Tower already standing. King, Ace, Joker and every buildable rank do not. So the dead-hand case is a Deck worn down to **only Jacks and Queens with no Tower on the board**.

Because cards come from random packs and duplicates are unlimited, that is genuinely reachable rather than theoretical. It is **not a softlock** — rounds still start, existing Towers still fire, and the run continues — but those cards are dead until a Tower exists.

Recorded rather than closed. Closing it would mean giving Jack and Queen a build fallback, which would blur "face cards change kind" for a rare case.

## Open questions

**Closed by this design:**

- **Ranks 6–10** — the ladder is complete.
- **Ace, face cards, Jokers** — all five actions are specified.
- **Board geometry** — no longer a literal 8×8; the Ace grows it.

**Still open, untouched:**

- Which pack opens a run; pack weighting and prices; PRNG streams — all out of scope.
- Run length and loss condition.
- Running out of cards — this slice makes it *more* reachable, since there is no pack to replenish from. Still undecided.
- Repair versus the wall — deferred deliberately, with the bound tested. See above.
- How far sliding Pieces move; stranded Pieces; the Core being hard to reach — all Piece-side, untouched here.
- Multiplayer scope.

## Testing

The engine carries the coverage, as CLAUDE.md requires — pure, deterministic, no browser.

- **`coverage.ts`** — `star` against cross and diagonal; `adjacent` at range 3 and 4 as a Chebyshev disc.
- **Targeting** — `targetsPerShot` of 1, N, and all; the id tie-break holds so results stay deterministic.
- **Consumption** — playing a card removes that instance and leaves its duplicates. This is the test that would fail under a `rank + suit` identity.
- **Every command** — each of the seven, plus its rejection cases: unknown `cardId`, wrong card kind for the command, occupied square, out of bounds, no such Tower.
- **Suit supports** — magnitude by rank; ♠ raises `maxHealth` without healing; ♦ floors at 100 ms under stacked Diamonds.
- **Jack** — shield absorbs before health, stacks additively, does not regenerate.
- **Queen** — Echo copies rank and not accumulated supports or shield.
- **King** — raises current and max together.
- **Ace** — the board grows, spawns arrive from the new far rank, the Core stays at rank 0, existing Pieces and Towers keep their squares.
- **Joker** — clears Pieces, spares Towers, leaves `pendingSpawns`, and breaks a grind.
- **The wall bound** — exhaust ♥, Tower falls, round ends.
- **Deck** — the authored deck is within the 30-cap and contains duplicates.

`src/state/simulation.test.ts` guards the store-publish count. Card play goes through `step`, not through per-frame state, so it should be unaffected — worth confirming rather than assuming.

## Documentation to update

- **`game-design.md`** — the rank ladder table; the face card and Joker actions; board geometry no longer 8×8; close three open-question rows; note the never-stuck exception.
- **`CLAUDE.md`** — "Current state" claims no Deck, no modality, and Towers placed by clicking; the test count is stale at 38 (currently 101); add the round-termination invariant to the invariants list.
- **`tick.ts:17-19`** — the doc comment claims Towers have no health and Pieces do not attack them. Both were true before the tower-firing merge and are false now.
- **`Hud.tsx`** — `GEOMETRY_LABELS` needs `star`, and the `adjacent` label ("Hits the eight squares around it") is wrong at range 3 or 4; it should read from range.
- **`data/towerRanks.ts`** — its comment says ranks 6–10 are undesigned and must not be added.
- **`data/pieceTypes.ts`** — its comment says "what remains genuinely undecided is which Pieces attack Towers", which the emergent-targeting decision settled.
