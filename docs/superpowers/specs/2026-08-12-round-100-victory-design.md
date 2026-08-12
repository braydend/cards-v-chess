# Round 100 Victory and Free Play — Design

**Date:** 2026-08-12
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

A run has no goal. It begins, and it ends only when the Core falls
(`RoundPhase` is `'gap' | 'inProgress' | 'defeated'`, and `defeated` is the only
terminal state). There is no moment of winning, and the design doc's
"Run length and loss condition" open question — *how long a run is, what ends
it* — has no answer. The game needs an objective: beating round 100 is the goal
of a run, and once it is beaten the player may keep playing in **free play**,
which is the same game continuing without a further objective.

## Decision

**Beating round 100 is the goal of a run. Surviving round 100 — the round
completes, nothing on the board can still act — records a win. The player then
continues into free play: the same game, the difficulty curve still escalating,
until the Core falls.**

The decision has four parts.

### 1. A run's goal is round 100

`VICTORY_ROUND = 100` lives as a constant in `src/data/rounds.ts`, next to the
other round-numbered design facts (`INTRODUCED_AT`, `TIER_INTRODUCED_AT`).
Anything referencing the round-100 threshold reads the constant, never a
literal 100.

There is no pre-100 goal indicator beyond the round counter itself. The counter
already is the goal counter — a run reads round 100 as a number, and the win is
the event at the end of it.

### 2. A new `'victory'` phase

`RoundPhase` gains `'victory'`. Completing round 100 — the same
`!stillActive && pendingSpawns.length === 0` transition that completes every
round — lands on `'victory'` instead of `'gap'` when
`state.roundNumber === VICTORY_ROUND`, and sets a new sticky
`won: boolean` on `GameState` to `true`.

In `'victory'`:

- `roundNumber` stays **100** — the round just beaten. The screen says "you beat
  round 100", and the engine is not asked to derive it backwards from 101.
- `tick` is inert, exactly as it is in `'defeated'`: the auto-start branch only
  fires from `'gap'`, and a `'victory'` guard returns state unchanged.
- Every existing command is refused, exactly as in `'defeated'`.
- The round-100 completion income is paid in the transition, like any other
  round's.

`continueToFreePlay`, a new `Command` variant, is the only command valid in
`'victory'`. It moves to `'gap'` with `roundNumber: 101` — a normal, startable
round. `won` stays `true`. If the player has auto-start on, round 101 then
auto-starts on the next `tick` from the gap, exactly as free play promises.

Why a real phase rather than a UI overlay sitting on the round-101 gap:
**auto-start fires from the gap.** A victory rendered as a gap would immediately
chain round 101 under the overlay — the "continue" choice would have already
been made for the player. A phase freezes the engine until the player actually
chooses to continue, and it reuses the `'defeated'` machinery (tick guard,
command guards) that already exists.

### 3. Free play is the same game, without a further goal

Free play changes nothing mechanical. The difficulty curve keeps escalating —
`spawnHealthMultiplier`'s tail is already unbounded, the spawn gap is floored,
the tier mix keeps shifting — and cards, packs, Ink, and the roster all behave
identically. The only difference between free play and the pre-100 game is that
there is no next goal: the run continues until the Core falls.

The `won` flag is what free play's end state reads. A run-outcome fact like
`leaks`, it lives on `GameState`, latches at the victory transition, and never
clears within the run.

### 4. Defeat acknowledges the win

When the Core falls in free play, the defeat hint — today "The Core has fallen."
— gains a victory line when `won` is true: the run beat round 100 and reached
round N (the `roundNumber` at the time of defeat). Pre-100 defeat is unchanged.

## The victory screen

A full-screen overlay (`src/ui/VictoryScreen.tsx`) shown when
`phase === 'victory'`, mounted in `Hud.tsx` alongside the other shared modals so
both the desktop and mobile HUD branches get it. It reads: round 100 complete,
the goal of the game reached, and a single **Continue to free play** button that
dispatches `{ kind: 'continueToFreePlay' }`.

There is deliberately **no "end run" option**. The win is the goal; stopping at
it would just start a fresh run, which the existing "Play again" already does,
and there is no run-recording to preserve a stopped win for. Continue-only keeps
the screen to one decision.

## Approach chosen

A new phase plus a sticky flag, reusing the `'defeated'` machinery. Rejected:

- **UI-only overlay on the round-101 gap, with victory derived from
  `roundNumber > VICTORY_ROUND`.** No new phase and no flag. Rejected because
  auto-start would immediately chain round 101 underneath the overlay, and the
  "derived" victory needs a separate carve-out in every `phase === 'defeated'`
  guard to treat the victory gap as frozen. A real phase is less special-casing,
  not more.
- **A `'victory'` phase without a `won` flag, deriving "has won" from
  `phase === 'victory' || roundNumber > VICTORY_ROUND`.** Fewer state fields,
  but the predicate re-encodes round-number conventions in every consumer (the
  victory screen, the defeat hint), and a future consumer can get it subtly
  wrong. A sticky flag is a run-outcome fact in the same class as `leaks`, and
  it is the thing the defeat screen asks — "did this run beat round 100?" — not
  a number comparison.
- **Free play with the difficulty curve flattened at round 100.** Rejected as a
  sandbox the user did not ask for. "Progresses as usual" means the curve keeps
  escalating; a flat free play would be a separate tuning decision, not this one.

## Testing

The engine carries the new tests; the renderer (the victory screen) is
deliberately untested, like the rest of `src/ui/`.

- `src/game/tick.test.ts` or a dedicated victory test:
  - Completing round 100 lands on `phase: 'victory'` with `won: true` and
    `roundNumber` 100, and pays the round-100 completion income.
  - `tick` is inert in `'victory'` — returns the same state.
  - Completing round 99 lands on `'gap'` with `roundNumber` 100 and `won` false,
    unchanged.
- `src/game/step.test.ts`:
  - `continueToFreePlay` in `'victory'` moves to `'gap'` with `roundNumber` 101,
    `won` still true.
  - `continueToFreePlay` anywhere else is refused (returns state unchanged).
  - The existing `'defeated'` guard tests extend to `'victory'`: every existing
    command is refused there.
- The exhaustiveness of `step`'s switch (`TS2366`) is itself the test that the
  new `Command` variant is wired into a `case`.

Tests reference `VICTORY_ROUND` (e.g. reach it by fabricating state, not by
simulating 100 rounds), so the threshold is a data value that a tuning pass can
change without rewriting tests.

`structuralKey` already keys on `state.phase`, so the transition to `'victory'`
publishes through the existing path and the victory screen mounts with no key
change. `won` only ever changes in the same breath as `phase`, so it adds no
publishes and needs no key entry.
