# King's aura: permanent, stacking, survivable

**Date:** 2026-08-18
**Status:** Agreed
**Issue:** [#78](https://github.com/braydend/cards-v-chess/issues/78)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The King's aura — 0.7× move interval and +1 slide to every *other* Piece at
Chebyshev distance 1 — is derived per tick from the current Piece list
(`buffedPieceIds` in `src/game/auras.ts`): positional, non-stacking, and
non-persistent. A Piece that leaves the King's radius loses the buff
immediately. King's Guard rounds
([`docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md`](../../superpowers/specs/2026-08-08-kings-guard-rounds-design.md))
were built around this aura, and they expose two structural weaknesses:

- **The buff window is too brief.** A squad spawns adjacent so the aura fires
  on entry, but the King marches at 1800ms while a buffed slider moves at 0.7×
  its own interval — the guard outpaces the King within a few hops, and the
  aura evaporates. Its value is only an entry burst.
- **The effect set is too narrow.** Speed and slide are both movement grants.
  Nothing makes the King's presence felt in a fight.

The result: the Chess faction's commander is a slow tank whose aura rarely
matters.

## Decision

A King-touch now **latches**. A Piece that becomes adjacent to a King
(Chebyshev distance 1) permanently gains a stack of the aura, and the stack is
what movement reads — never the current position. The stacks live on the Piece
(`kingAuraStacks`, `kingAuraKings` in `src/game/types.ts`); `applyKingAura` in
`src/game/auras.ts` is the only writer, and `movePieces` reads them directly.

### Stacking — one stack per adjacency episode

A Piece earns exactly one stack per adjacency *episode*: a contiguous period in
range of one King. Leaving and re-entering, or touching a different King,
earns another; adjacent to two Kings at once earns two; the count never
decays.

The episode is bookkept as `kingAuraKings` — the ids of the Kings adjacent on
the last computation — refreshed every tick, so a King leaving clears it and
re-entering counts fresh. **One stack per episode**, rather than one per tick
of contact, is what keeps "standing next to a King forever" from farming
stacks: sustained contact adds nothing.

### Compounding effects

Each stack re-applies the full aura:

- **Move interval ×0.7 per stack**, compounding (0.7^N);
- **+1 slide per stack** to sliders (Bishop, Rook, Queen);
- **+1 max health per stack**, healing current health by exactly the increase
  the moment the stack lands — mirroring the Tower health-upgrade rule, so the
  grant is a heal, never just a raised ceiling. A Bishop's heal caps against
  the raised ceiling.

### Kings and promotion

A King never buffs itself, but King-to-King adjacency stacks on each King
exactly as it does on any other Piece — today's exclusion is per-Piece, not
per-type. A promoted Queen inherits her Pawn's stacks, gaining the slide and
defense grants she could not use as a Pawn.

### Legibility

A buffed Piece keeps a persistent, stack-scaled ring; the King itself shows a
faint radial for its current radius. The aura must still reach the Staging rank
as before (pinned in `src/game/staging.test.ts`): a guard squad spawns adjacent
on the Staging rank, so its members earn their first stack before stepping onto
the board.

## What this reverses

The frozen
[`docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md`](../../superpowers/specs/2026-08-08-kings-guard-rounds-design.md)
chose a positional, per-tick aura that "cannot be made to stick" to a squad as
it travels, and tuned Guard rounds around that entry-burst assumption — the
squad's contiguity preserving the aura, the guard outpacing the King within a
few hops, the cluster buffed for only the first hops of the march, and the
entry burst being the whole difficulty. That choice is reversed: the buff now
latches and stays with the squad for its whole march, so the Guard-round
tuning built on the burst being the entire effect is superseded.

## Rejected alternatives

- **Per-tick re-derivation (status quo).** Keeps movement reading a live
  membership set, but keeps both weaknesses: the buff still evaporates the
  moment a slider outpaces its King, and the Commander's effect still ends at
  the board's geometry rather than persisting into the fight. This is the
  design issue #78 set out to fix.
- **A duration-based buff that expires.** Adds a per-Piece timer that changes
  every tick — the exact class of value `structuralKey` excludes to keep React
  renders rare — and re-introduces the window problem in a different form: the
  player could wait the buff out, and the "answer a King once, pay for the
  march" decision disappears.
- **A one-stack lifetime cap.** Permanent but capped at one, so a squad
  touched by two Kings or re-touched is no stronger than a squad touched once.
  It fixes the evaporation but abandons the compounding — multiple Kings and
  repeated contact should matter, and the cap would make Guard rounds a fixed,
  one-time bump.

## Consequence

Guard rounds get **strictly scarier**, and that is intended. The old design's
entry burst was the whole difficulty; now the buff stays with the squad for
the whole march and compounds across a squad's King-touches, so a Guard round
punishes the player who fails to meet the squad early. That is the point of
issue #78: the Commander is meant to be a threat the player must answer.
