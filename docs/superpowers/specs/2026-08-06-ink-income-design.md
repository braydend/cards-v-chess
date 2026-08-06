# Ink Income — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#9 — add ink](https://github.com/braydend/cards-v-chess/issues/9)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Scope

Ink is the run currency: earned by playing, spent on packs, never spent to play
a card. This spec covers the **income half only** — the two ways Ink is earned
and the readout that shows it. Packs, prices, the cull flow and the seeded PRNG
are out of scope and remain unbuilt.

That leaves Ink a number that only goes up, which is the accepted cost of
building the economy in two stages. The consequence is stated plainly under
"Balance is deferred" below, because it decides what the numbers in this spec
are worth.

## Decisions

### 1. Ink is an integer on `GameState`, starting at 0

`ink: number`, part of the simulation state like `leaks` or `roundNumber`, reset
with the run. It has no persistence and does not survive `reset()`.

Integer because the player reads it. A currency displayed with decimals is
noise, so every calculation that could produce a fraction floors — see decision
5, where that rule is load-bearing rather than cosmetic.

It joins `structuralKey`, which costs nothing: kill Ink only moves when a Piece
dies, and a death already changes the key's `pieces` string; round income only
moves at the `gap` transition, which is already keyed on `phase` and
`roundNumber`. No new React publishes.

### 2. Only Tower fire pays a kill reward

`fireTowers` in `src/game/tick.ts` is the one place a Piece is removed for
dying — it partitions Pieces into survivors and dead in a single filter. It
starts returning what it destroyed; `tick` banks the reward.

Two other exits from `pieces` pay nothing, and both fall out of that seam
rather than needing a rule of their own:

- **A leak pays nothing.** The player did not kill it, and it has already cost
  Core health.
- **A promotion pays nothing.** A Pawn reaching the back rank is not destroyed,
  it becomes a Queen. The Queen pays when the Queen dies.

Neither passes through `fireTowers`'s filter, so neither can pay by accident.

### 3. Kill rewards are authored per Piece type

`inkReward` becomes a field on `PieceTypeDef`, filled in `src/data/pieceTypes.ts`
beside the existing stats:

| Pawn | Knight | Bishop | Rook | Queen | King |
| --- | --- | --- | --- | --- | --- |
| 1 | 2 | 3 | 5 | 8 | 10 |

Authored rather than derived from an existing stat. Deriving from `maxHealth`
would rank a Rook (14 HP) above a Queen (9 HP), which inverts the design's own
statement that a Pawn trickles and a Queen pays properly — a Rook is a wall,
not an event. It would also mean retuning a Piece's durability silently retunes
the economy.

Values reflect threat and scarcity, and they live in `data/` so a balance pass
never touches logic.

### 4. Round income scales with the round number

`ROUND_INCOME_BASE = 10`, `ROUND_INCOME_PER_ROUND = 5`, in a new
`src/data/ink.ts`. Round 1 pays 15, round 10 pays 60.

Flat income was rejected: rounds grow — round 11 spawns 13 Pieces — so a fixed
payout shrinks in real terms exactly as the pressure rises. A no-leak bonus was
also rejected, because leaking already costs Core health and a second penalty
on the same mistake compounds a bad round into an unrecoverable one.

Two boundaries:

- The payout uses **`state.roundNumber` read before the increment**, so it pays
  for the round just played rather than the one about to start. The gap branch
  in `tick.ts` increments on the same object, which makes this the easiest
  thing in the feature to get wrong by one.
- **Defeat pays no round income.** The `defeated` branch returns earlier than
  the gap branch, so this needs no explicit guard — but it is a decision, not
  an accident of ordering, and a future reordering must preserve it.

### 5. A Joker pays 25% of the kills, and the round prize in full

Clearing the board with a Joker pays `floor(total kill reward of everything
cleared × 0.25)`.

This answers the standing note in `src/game/cardPlays.ts`: clearing twenty
Pawns must not pay twenty kill rewards, or Clear becomes an income exploit —
hold a Joker, let the board fill, cash out. A quarter share keeps the play
feeling like it accomplished something without ever being the best way to earn.

**The floor applies to the total, not to each Piece.** At 25% a Pawn is worth
0.25, so per-Piece flooring pays zero for every Pawn — nothing, for exactly the
chaff a Clear is used on. Flooring the total pays 5 for those twenty Pawns.
This is the reason decision 1 fixed a single rounding rule rather than leaving
it to each call site.

**The round-completion lump sum is unaffected.** If a Clear empties the board
and nothing is pending, the next `tick` takes the gap branch and pays the round
prize whole. That needs no code: `clearPieces` leaves `pendingSpawns` alone, so
a round still spawning simply carries on, and a round that ends pays what any
other completed round pays.

### 6. The arithmetic lives in a pure module

`src/game/ink.ts` — `killReward`, `totalKillReward`, `roundIncome`,
`clearReward`. `tick.ts` and `cardPlays.ts` read it and apply the result.

This keeps two already-large files from absorbing a third responsibility, and
puts every rule in this spec behind a function that can be tested directly.

### 7. Display is one HUD tile

A sixth tile in `src/ui/Hud.tsx`, after **Round**. Round and Ink are run-level
state; Core, Leaks, Pieces and Towers describe the board.

A plain number, with no gain animation. There is nothing to spend Ink on yet,
so drawing the eye to each gain would be emphasis without a payoff.

## Balance is deferred

**The numbers in decisions 3 and 4 cannot be validated by this work.** Ink's
worth is set by what it buys, and it buys nothing yet. They are placeholders in
the same sense that `src/data/pieceTypes.ts` already labels its own stats, and
the first real tuning pass belongs with packs, alongside prices.

`docs/design/game-design.md` gains an open question for Ink income values, next
to the existing one for pack weighting and prices. Neither is resolved here.

## Not in scope

- **Packs and spending.** No pack types, no prices, no pack-opening UI, no cull
  flow, no seeded PRNG.
- **The Ink floor for running out of cards.** The design's open question asks
  whether a guaranteed Ink floor covers a player who reaches zero cards. That
  needs packs to mean anything.
- **Which pack opens a run.** Unchanged and still open.
- **Persistence.** Ink dies with the run, like every other value in
  `GameState`.

## Verification

- New `src/game/ink.test.ts` covers the arithmetic, including the twenty-Pawn
  case that fixes the flooring rule.
- Tick tests: a kill pays, a leak does not, a promotion does not, completion
  pays for the round just played, defeat pays no round income.
- A Joker test for the 25% share.
- A `structuralKey` test that an Ink change publishes.
- Expectations derive from the data tables rather than hardcoding `8` for a
  Queen, so a balance pass does not break unrelated tests.
- `src/game/` carries coverage thresholds of 85/85/85/90, so the new engine
  code is measured.
