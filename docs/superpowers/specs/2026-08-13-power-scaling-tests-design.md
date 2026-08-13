# Power scaling test suite

Issue #72 asks for a test suite that simulates the game to check whether the
power balance is sound, and to define criteria for what a balanced game looks
like. This spec designs that suite: scripted bots drive full honest runs
through the real engine, metrics are collected per run and per round, and CI
asserts those metrics against a ratchet of thresholds.

## What the suite is

A pure-TypeScript harness — no React, no browser, no `Math.random` — that
plays the game the way a human would (through `step` commands) and measures
the outcome. It lives beside the engine, not inside it.

### Why

The game is mid-tuning: pack weights, ink income, tier numbers, and the spawn
ramp are all placeholders awaiting a joint tuning pass. A balance suite is the
measurement instrument that pass needs. It answers, deterministically:

- Is the game winnable at all? (win rate)
- Is a win a squeaker or a stomp? (margin)
- Where does difficulty break, if it breaks? (failure-round distribution)
- Can the player get permanently stuck? (starvation)
- Which rounds are brutal, per bot? (per-round traces)

## Directory layout

A new top-level `src/balance/`, sibling to `src/game/` and `src/state/`:

```
src/balance/
  bots.ts          bot policies: (state: GameState) => Command | null
  driver.ts        runSimulation(seed, bot): RunResult — the honest full loop
  metrics.ts       metrics + aggregation: RunResult[] -> BalanceMetrics
  thresholds.ts    the ratchet thresholds + the pass/fail check
  seeds.ts         the pinned seed list
  balance.test.ts  the CI gate
  driver.test.ts   unit tests for the driver
  metrics.test.ts  unit tests for the metrics/aggregation
```

Coverage: a new top-level directory is included by the `include` glob but has
no threshold of its own, per `vite.config.ts`'s documented behavior. Add a
`src/balance/**` entry to the coverage thresholds to keep the ratchet
philosophy consistent — the harness is exercised heavily by its own tests, so
the numbers should sit high.

## The driver — the honest full loop

`driver.ts` owns `runSimulation(seed, bot, options): RunResult`.

It drives the real engine and nothing else — the whole point is that a
balance result is only meaningful if it comes from the actual rules:

1. `createInitialState(seed)` — same opening Base pack, same seeded rng
   streams as production.
2. In the `gap` phase, poll the bot for a command. Dispatch it through `step`.
   A refused command returns the same state object by identity; detect that,
   skip the command, and keep polling — a confused bot cannot deadlock the
   driver.
3. When the bot returns `null` (nothing more to do), issue `startRound`.
4. Mid-round, advance with `tick(state, FIXED_DT)` where `FIXED_DT` is the
   engine's real `1000 / 60`. Give the bot one command opportunity per tick —
   face cards and upgrades are legal mid-round, and the bot needs that window.
   Same identity-detection skip for refused mid-round commands.
5. Stop at `defeated` or `victory`. A `maxRounds` option bounds free play for
   metric runs (the win gate stops at round 100; free play would otherwise run
   forever).

**Options** — `maxRounds` (default `VICTORY_ROUND`) and `seed`. Everything
else comes from `createInitialState`.

## The bots

A bot is a pure function `(state: GameState) => Command | null`. `null` means
"nothing to do". Bots are policy only — they decide, the driver executes.

Every bot shares a **hand-picker**: scan the Deck for the highest-value legal
hand it can commit, checking patterns strongest-to-weakest rather than
enumerating subsets. Placement goes through the engine's `canBuildOn`, so a
bot never tries to build where the game refuses. Hand evaluation goes through
`evaluateHand` / the `HAND_TOWER` table — the same single answers the engine
and the Deck UI use, so a bot's hand choice can never disagree with what the
engine would accept.

Three bots in v1, parameterized so tuning nudges strategy without rewriting:

1. **Value** — the sensible-player baseline. Strongest hand available, Towers
   placed to maximize covered squares (via the engine's `coveredSquares`),
   best-value pack it can afford, upgrade as kills accrue, spend face cards on
   the strongest Tower.
2. **Aggro** — spend-early: prefers cheap packs and cheap early Towers placed
   near the spawn ranks to maximize kills, spending Ink as it comes in.
3. **Conservative** — hoard: saves Ink for Court packs and rare hands, plays
   fewer but rarer hands, upgrades sparingly.

**Face-card timing rule**: bots use face cards in the gap only (reinforce and
expand are build-phase thinking). The Joker is the single deliberate
mid-round exception — an emergency response to a board the bot can't
otherwise resolve. Mid-round upgrades are allowed (the engine allows them and
the heal matters when it matters).

## Metrics

**Per-run `RunResult`** (from the driver, one per bot × seed):

- outcome (`won` / `defeated`), final round reached, whether free play was
  entered
- core health at win, ink at end (win or loss)
- leaks, clears, total kills
- **per-round traces**: round number, spawned, killed, leaked, clear time —
  the data behind failure-round distribution and per-round performance. Stored
  compactly (100 rounds × bots × seeds should not be a memory problem).

**`BalanceMetrics`** (aggregated across the matrix):

- **Win rate** — fraction of bot×seed runs reaching round 100
- **Margin** — median core health at win, and ink at end (win and loss)
- **Failure-round distribution** — the round runs ended on; a difficulty cliff
  (everything dying around round N) is visible as a spike
- **Starvation** — a run is flagged if it ever hits a gap with **both** an
  empty deck **and** no affordable pack — the precise version of "can't do
  anything"
- **Per-round** — mean kills / leaks / clear time per round across runs, so a
  single brutal round is visible

## Thresholds and the CI gate

`thresholds.ts` holds a record of thresholds keyed by metric (and where it
matters, by bot), plus the pass/fail function. `balance.test.ts` runs the full
bot × seed matrix and asserts the thresholds pass.

The thresholds are a **ratchet, not a target** — same philosophy as the
existing coverage thresholds in `vite.config.ts`. They get measured from
today's game during bootstrap and set with slack, then raised by hand as
tuning lands. The file documents that they are a ratchet. A red `balance.test`
means balance moved; whether the move is good or bad is read from the report,
not the threshold.

The test also prints a human-readable report table on every run, so a failure
shows the actual numbers and which bot × seed crossed which threshold — not
just "threshold crossed".

**CI time**: the file gets a per-file timeout (Vitest docblock or
`describe.timeout`); a 100-round run at 16.7ms dt × 3 bots × seeds is not
instant and the default 5s timeout will not survive it.

## Seed corpus

A pinned list in `seeds.ts` — deterministic forever, so a win-rate change is a
real balance change, never noise. v1 starts at **5 seeds × 3 bots**. The only
run-to-run randomness in the engine is pack deals and the red/black miss, so 5
seeds covers meaningful variety without a multi-minute CI step. The list is
meant to be extended, not replaced, when more coverage is wanted.

## Bootstrap sequence

1. Implement the harness with thresholds in "no assertion" placeholder mode.
2. Run the full matrix, capture the actual current metrics.
3. Write the real thresholds from those numbers, with slack.
4. Commit the ratchet. From then on CI enforces it.

The report table is printed as part of test output; no separate `pnpm balance`
script is needed in v1.

## Testing the harness

- `driver.test.ts` — drives a full sim to a known outcome on a fixed seed;
  refused commands are skipped without looping; the run stops on defeat/victory;
  `maxRounds` bounds free play.
- `metrics.test.ts` — aggregation math, starvation detection, threshold
  pass/fail against a fixture matrix.

## Non-goals

- No `Math.random` anywhere in `src/balance/` — the suite must be
  reproducible, exactly like the engine it measures.
- No search/lookahead player. Bots are scripted policies; a search-based
  "optimal play" bot is a different tool and a much bigger one.
- No changes to game balance itself. This suite measures; tuning is a
  separate pass that raises the ratchet.
- No report file artifact in v1; stdout from the test run is the report.
