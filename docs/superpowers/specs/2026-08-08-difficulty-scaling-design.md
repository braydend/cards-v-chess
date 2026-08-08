# Difficulty Scaling — Design

**Date:** 2026-08-08
**Status:** Agreed (direction); tuning numbers are placeholders
**Issue:** none yet — raised from playtesting the current build's difficulty curve

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Background — the snowball

The game gets easy and stays easy. A run buys one pack, the towers built from it
out-stat every wave, and Ink then piles up because nothing forces reinvestment.
The cause decomposes into three flat lines:

1. **Enemy bulk never grows.** `drainDueSpawns` in `src/game/tick.ts` builds
   every spawn with `health: pieceType(spawn.typeId).maxHealth` — a Pawn has 3
   health in round 3 and in round 30. Rounds grow only in *count* (2 +
   `roundNumber` Pieces) and in the roster unlock schedule, never in the bulk of
   any one Piece.
2. **Defense power only grows.** Towers come from a Deck capped at 30 that only
   ever grows; nothing in the game degrades. A fixed board-state defense that
   clears round N clears round N+1 the same way, forever.
3. **Income is unconditional.** Kill rewards (flat, per type) and the round lump
   sum (10 + 5·round) both pay in full whether the round was a formality or a
   fight. The only sink — pack prices escalating 10% per purchase — is
   per-type, and rotating between the four types defeats it for a long time.

These three flat lines are the classic tower-defense snowball, and the genre has
a canonical answer to it. The research below is what that answer is, in the
games that established it.

## Research

### Bloons TD 6 — enemy bulk scales with round

MOAB-class blimp health scales *by round number*, "scaling infinitely into
freeplay". The design rationale is community-quoted and matches the observation
here exactly: *"If they didn't scale, it would be basically impossible to lose
after a few tier 5 towers."* Two further dials follow in the same game:

- **Speed ramps in freeplay**, so the same towers get fewer shots per crossing.
- **Hand-authored "important rounds"** — round 40 introduces the MOAB, round
  80+ spikes with Super Ceramics — make difficulty *rhythmic*: named pressure
  points, not a smooth line.
- The economy is a **cost-per-pop race**: income must outpace the escalating
  cost of towers that can actually handle the next spike. Top towers cost
  $20k–35k+ and force saving; farm income is an *investment* that pays back over
  10–15 rounds.

### Plants vs Zombies — fixed economy, rhythmic waves

- Each level's sun income is time-capped, so **player power growth is bounded
  per level** — the player literally cannot out-grow the level.
- Difficulty is **rhythmic**: hand-authored "surge waves" concentrate density at
  set points in a level rather than ramping smoothly.
- The accepted criticism of PvZ 1's late game is the *opposite* of the snowball
  here: it becomes too *easy* because a few overpowered plant combos dominate.
  The proposed fixes are **counter-meta enemy types** and limits on stacking —
  diversification-forcing design, not more numbers.

### General tower-defense literature

- A **health scaling factor per round** is the genre baseline; this game has
  none.
- **DDA** (dynamic difficulty adjustment — scaling waves to player performance)
  is repeatedly noted to *smooth away* difficulty and to break reproducible
  runs. Rejected here; see "Considered and rejected".

## Decisions

### 1. Enemy bulk scales with the round — the primary fix

Each spawn's health is multiplied by a **round factor** at spawn time. The
authored `maxHealth` on `PieceTypeDef` stays the base; scaling is a function of
`state.roundNumber` applied where the Piece is built:

- `src/game/tick.ts`, `drainDueSpawns` (line ~485):
  `health: spawnHealth(pieceType(spawn.typeId).maxHealth, state.roundNumber)`.
- A promoted Queen (`tick.ts`, line ~139) gets the **same round factor** — she
  spawns in round N, so she is a round-N Queen. This also widens the
  withhold-to-promote income play already flagged in the design doc's "Ink
  income values" row: the promoted Queen is a round-scaled fight, worth the same
  flat 8 Ink but harder to kill and easier to leak. The trade-off belongs to the
  joint tuning pass, not to this spec.

The arithmetic lives in one pure place, mirroring `src/game/ink.ts`:

- `src/data/spawnScaling.ts` — the **schedule** (see shape below).
  **PLACEHOLDER**, labelled as such.
- `src/game/spawnScaling.ts` — `spawnHealth(baseHealth, roundNumber): number`,
  pure, seeded by construction (no `Math.random`), integer-rounded with a floor
  at 1. Health in this game is integer, so the scale rounds.

**Why this fixes the snowball.** Coverage now serves *fewer kills per round*: a
Pawn that used to die in one rank-2 shot needs two, then three. The only way to
restore the kill rate is more Towers, which means more Cards, which means more
packs — Ink finds its sink. And a settled income rule does the rest of the
economy's work for free: **leaks pay nothing**, so as the line starts leaking
income *self-dampens*. Coupling without touching a single income rule.

**Why it is safe.** Deterministic — the round number is already in `roundSpec`
and `GameState`, and nothing random is introduced. The DPS / coverage /
`targetsPerShot` invariants in `src/data/towerRanks.test.ts` are untouched.
Round termination is untouched structurally — higher HP means a longer round and
more ♥ consumed by grinding, which only *tightens* the existing
repair-versus-the-wall bound. The Staging rank's damage immunity is a damage
rule, not a health rule, and is unaffected.

**Shape — a stepped schedule, authored as data.** The curve is a lookup table of
`round → multiplier`, in `data/`, so tuning is table-editing rather than
re-writing logic. Stepping (BTD6's round 40/80 rhythm, and a sibling of this
game's own `TIER_INTRODUCED_AT` milestones) makes the difficulty *named* and
legible, and answers the design doc's "Run length and loss condition" open
question — per round or in stages — with a concrete hybrid. A starting schedule,
placeholder and for feel only:

```
rounds 1–4    ×1.0
rounds 5–9    ×1.3
rounds 10–14  ×1.6
rounds 15–19  ×2.0
rounds 20+    ×2.5, rising one step every 5 rounds
```

Flat additive and exponential curves were considered as alternatives; both are
valid shapes and the schedule is chosen for legibility and data-driven tuning,
not because the numbers are settled. The exact curve is the joint tuning pass,
not this decision.

### 2. Spawn density ramps — the second dial

Rounds currently spawn `2 + roundNumber` Pieces at a flat `atMs: i × 1200`
(`src/data/rounds.ts`). Two density dials:

- **Spacing ramp**: `i × spawnGap(roundNumber)`, the gap shrinking a few percent
  per round, so the same round presses harder without adding Pieces.
- **Surge rounds**: stepped spacing on a schedule — every Nth round is a burst,
  PvZ-style. The interleaved pool (`poolFor` in `src/data/rounds.ts`) already
  makes any prefix representative, so a denser round is a *denser* version of
  the same mix, not a harder mix; the roster-learning curve stays intact.

Both are deterministic data changes in `rounds.ts` / a small pure helper;
neither touches movement, income, or termination. Density is adopted as the
second dial because the existing termination rule handles the failure case: a
burst that overruns the line leaks and forfeits rewards, self-dampening income
under the same settled rule decision 1 relies on.

### 3. Speed ramp — deferred

Shrinking `moveIntervalMs` per round (`src/game/tick.ts` reads it at line ~538)
is BTD6's freeplay dial and the least invasive possible change, but it is a pure
*feel* dial: a defense that was sufficient is now sufficient over fewer frames,
which reads as arbitrary if the ramp outpaces the player's ability to respond
mid-round. Defer until bulk and density land and play experience asks for a
third axis.

## Considered and rejected

- **Income farms (BTD6 banana-farm analog).** A per-round investment that
  produces Ink. Rejected twice over: it *increases* income — the problem is
  excess income, not scarcity — and the three settled income paths are
  deliberately the only ones (see "Ink and packs" in game-design.md). A
  difficulty problem is not fixed by adding a spending problem.
- **Tower selling / refunds.** BTD6 sells towers at partial value as a pressure
  valve. Not applicable: a Tower is a consumed Card, and Cards are the Deck's
  only source. There is no asset to sell.
- **Leak-linked income penalties** (a reduced round lump sum when the round
  leaked). **Already rejected by the ink-income spec**: "a second penalty on the
  same mistake compounds a bad round into an unrecoverable one." The
  self-dampening in decision 1 uses a *settled* rule (kills pay, leaks do not)
  rather than a new one, and stays the only income coupling.
- **Dynamic Difficulty Adjustment.** Scaling waves to player performance was
  rejected: runs are seeded and shareable ("same seed, same round
  composition"), and DDA both breaks that identity and smooths difficulty
  toward a flat experience — the PvZ late-game criticism from the research. The
  challenge is a property of the run, not of the player.
- **Steepening the pack escalation** (above the settled 10%, compounding,
  per-type) is **not** decided here. The mechanics are settled; if decision 1's
  self-dampening proves insufficient after play experience, re-opening the rate
  is a legitimate follow-up — but it is the design's last-resort price lever,
  not a difficulty dial.

## Deferred

- **The tuning numbers.** The health schedule, the density schedule, and any
  future speed ramp are placeholders pending the joint pass the design doc's
  open questions demand — "Ink income values" and "Pack weighting and prices"
  resolve together with these. This spec settles direction only.
- **Tier-based diversification** (a Piece type or tier that ignores certain rank
  Towers — the PvZ counter-meta lesson and BTD6's camo/lead/purple). This game
  has no damage types, so an immunity system is a *content* decision, not a
  balance knob; the tier system is the natural hook. Listed here so it is not
  confused with balance tuning.
- **game-design.md updates.** No settled text lands in the design doc with this
  spec because no number is settled. When the tuning pass resolves the numbers,
  the doc gains the shape — enemy bulk scales with round — and its open-question
  rows note the resolution.

## Verification (when implemented)

- New `src/game/spawnScaling.test.ts` covers the scaling function: the floor at
  1, integer rounding, and deterministic output.
- A tick test: a round-N spawn's health equals the scaled value; a promoted
  Queen carries the same round factor.
- `roundSpec` determinism is preserved — density changes are pure functions of
  `roundNumber`.
- Engine coverage thresholds in `src/game/` and `src/state/` measure the new
  code.
- Data-derived expectations rather than hardcoded numbers, so a tuning pass does
  not break unrelated tests.
