# King's Guard Rounds — Design

**Date:** 2026-08-08
**Status:** Agreed
**Issue:** [#49](https://github.com/braydend/cards-v-chess/issues/49)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The King's aura — 0.7× move interval and +1 slide to every *other* Piece at
Chebyshev distance 1 — is almost never seen in play. Normal rounds are composed
by `roundSpec` in `src/data/rounds.ts`, which spreads spawns across files
(`file: (i * 3 + roundNumber) % files`) at one per 1200ms. Pieces are never
adjacent to a King, so the Chess faction's commander does nothing but march and
tank.

The issue asks for "extra hard rounds that spawn every 5-10 or so rounds,"
built around leveraging the King's aura to buff the incoming pieces. The issue
itself is open-ended on the shape: "this may mean spawning more kings, or
specifically spawning kings with multiple pieces near them at once. we can
discuss options."

## Decision

**Every 8th round starting at round 15 (15, 23, 31, …) is a King's Guard round
that replaces the normal composition. A Guard round is one or more squads, each
a single green King flanked by sliders on adjacent files, spawning together so
the aura actually fires on entry.**

This is a new *composition*, not a new game system. A Guard round produces the
same `RoundSpec` shape as any other round, so the engine (`tick`, spawn
draining, Ink, movement) is untouched — a Guard round is just a different list
of spawns.

### Scheduling

- `isGuardRound(roundNumber)` is pure arithmetic: `roundNumber >= 15 &&
  (roundNumber - 15) % 8 === 0`. No PRNG, no seeded stream — the same run seed
  reproduces the same guard cadence for free, keeping the determinism that
  `rounds.ts` documents.
- Guard rounds start at 15 because Kings join the pool at round 11 and the
  issue asks for rounds that are genuinely hard; 15 gives the player a few
  rounds to meet the King before a round built around it appears. Every 8 is
  the rarest cadence the issue offered ("every 5-10 or so"), making a Guard
  round feel like an event.
- A Guard round **replaces** the normal composition for that round number. It
  does not add spawns on top.

### The squad

- **1 King + N sliders, all on adjacent files, all spawning at the same
  `atMs`.**
- The King is always **green**. Its tier behaviour is not the point of the
  round — its aura is. A green King also never hunts early or detours to
  Towers, so the squad advances as a coherent march rather than scattering.
- The sliders are **Bishop, Rook, Queen only** — the `slides: true` types.
  Only they receive the +1 slide from the aura, so only they get the full
  effect. Pawns and Knights never appear: they have no slide bonus, so they
  would ride along unbuffed and dilute the round's identity.
- Slider **tiers come from the normal tier pool** for that round number
  (`tierPoolFor`). A late Guard round's sliders can be yellow, red, or black —
  a red slider seeking Towers while King-buffed is a layered threat. The tier
  mix stays in step with the run's escalation; the King being green is the one
  deliberate deviation.
- Slider types are weighted by the existing `WEIGHT` table (restricted to the
  slider subset), so a Queen is rarer than a Bishop.

### Scale

Both the number of squads and the size of each squad grow with round number.
The exact counts are **placeholder tuning** living in `guardRounds.ts`; the
shape is design:

- Round 15: 1 squad, King + 2 sliders
- Round 23: 2 squads, King + 2 sliders each
- Round 31: 3 squads, King + 3 sliders each
- … continuing to grow both dimensions.

### File layout

Squads occupy contiguous file bands across the 8 files — squad 0 at
files `[0, 1, 2]`, squad 1 at `[4, 5, 6]`, etc. (placeholder offsets). The King
sits in the middle of its band so both flanking sliders are at Chebyshev
distance 1 from it. On the Staging rank, adjacent files are Chebyshev 1, and
spawns stack freely on the Staging rank (only Towers block squares), so a
same-time, adjacent-file squad spawns already inside the aura.

**Bands wrap modulo the file count when they overflow the 8 files.** Round 31's
three squads of King + 3 sliders need 12 file slots against only 8 files, so a
later squad's band wraps onto files already claimed by an earlier one. This is
legal — spawns stack freely on the Staging rank, and only Towers block squares
— and it preserves each squad's internal contiguity, which is what keeps the
aura live for that squad. Whether squads should be kept apart instead (fewer,
larger squads) is a tuning question, not a design one; the placeholder formula
currently prefers to let bands wrap rather than to shrink a squad.

### Why the aura matters in practice

The aura is positional and derived per tick from the current piece list
(`buffedPieceIds` in `src/game/auras.ts`), so it cannot be made to "stick" to
a squad as it travels. Because movement is deterministic chess movement with no
pathfinding, a squad cannot hold formation: the King marches at 1800ms while a
buffed slider moves at 0.7× its own interval, so the guard outpaces the King
within a few hops.

The value is therefore an **entry burst**, and it is real:

- A slider spawns adjacent to its King on the Staging rank, so it is already
  buffed before it steps on.
- Its first hop — with the 0.7× interval and the +1 slide already applied —
  carries it **one square deeper onto the board** than a normal slider's entry.
- The cluster stays buffed for the first few hops of the march before the
  King's cadence leaves it behind.

That burst is the whole difficulty: several sliders closing fast and deep
together, on adjacent files, in a round where the player knows the aura is
live.

### Ink

A Guard round pays like any other. Kill rewards come from each slider's and
King's `inkReward`; the round-completion lump sum is unchanged. No special
Ink treatment — the difficulty is the composition, not a richer payout. This
stays within the "Ink income is event-driven" invariant: nothing here is
time-based.

### Approach chosen

Option B from brainstorming: a **separate `src/data/guardRounds.ts`** module
owning `isGuardRound`, `guardRoundSpec`, and the placeholder tuning constants,
with a thin dispatcher in `rounds.ts`. `rounds.ts`'s exported `roundSpec`
becomes the dispatcher: when `isGuardRound(roundNumber)` it delegates to
`guardRoundSpec`, otherwise it runs the existing normal composition. `step.ts`
keeps calling `roundSpec` unchanged and never learns a guard round exists.

Rejected:

- **Branch inside `roundSpec`** — keeps one entry point but makes `rounds.ts`
  own two composition algorithms, and mixes guard tuning into the normal-round
  file.
- **Archetype system** — a pluggable round-kind framework is more machinery
  than one new kind justifies (YAGNI).

## Testing

`src/data/guardRounds.test.ts`, mirroring the existing `rounds.test.ts`
patterns:

- `isGuardRound`: 15, 23, 31 true; 14, 16, 22 false; rounds before 15 false.
- Determinism: `guardRoundSpec(n)` equals itself (same input, same output).
- Squad invariants, per guard round:
  - every squad has exactly one King;
  - every non-King is a slider (bishop, rook, or queen);
  - each squad's files are contiguous;
  - each squad's members share a single `atMs`.
- The King is green; slider tiers equal `tierPoolFor(roundNumber)` exactly.
- Scale: squad count and sliders-per-squad are non-decreasing with round
  number.
- No pawns or knights anywhere in `guardRoundSpec(15)`.

The engine needs no new tests — it never sees a difference between a Guard
round and any other `RoundSpec`. The staging immunity, aura behaviour, and
round termination are all already pinned.
