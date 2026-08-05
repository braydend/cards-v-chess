# Hunting Knights — Design

**Date:** 2026-08-06
**Status:** Agreed
**Supersedes part of:** [`2026-08-05-chess-piece-roster-design.md`](2026-08-05-chess-piece-roster-design.md), specifically its decision that Knights strand permanently on rank 0.

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

A Knight's hops only ever go forward, so on rank 0 every candidate leaves the
board and it has no lateral fallback. The roster design accepted that: Knights
strand there permanently, deliberately, because a Knight allowed to keep acting
would hold `stillActive` true and the round would never end.

Two costs came with it. A stranded Knight is **permanently harmless** — it can
never threaten the Core again — and stranded Pieces are left standing rather
than deleted, so they **accumulate across rounds** as clutter. The roster spec
parked "whether stranded Knights want an answer of their own" as an open
question. This is that answer.

## Decision

A Knight that runs out of forward hops starts **hunting the Core**, using
knight moves the whole way.

Three properties make that safe.

### The hunting state latches

Once a Knight starts hunting it hunts for the rest of its life, recorded as
`hunting: boolean` on the Piece.

This is not bookkeeping convenience — without it the feature hangs the round.
A hunting Knight's first hop necessarily goes *backwards*, since every knight
move from rank 0 does. Landing on rank 2 it would once again have forward hops
available, revert to zig-zagging, march back down to rank 0, strand, hunt
backwards again, and repeat forever. The latch is what breaks that cycle.

### Direction comes from a knight-distance field, and it strictly decreases

Distance to the Core is a breadth-first search over knight moves across the
board's squares, memoised per board and Core square. A hunting Knight takes a
hop whose distance is exactly one less than its own.

Convergence is therefore structural rather than hoped for: in a BFS distance
field every square at distance `d > 0` has a neighbour at `d − 1`, so the
Knight arrives within `d` hops — at most six on an 8x8. Because the distance
strictly decreases on every hop, a cycle is impossible by construction, not
merely absent from the tests.

Rejected: greedy minimisation of straight-line distance. It needs no distance
field, but knight moves under a greedy Euclidean rule are a textbook source of
two-cycles, where each hop is locally optimal and the pair repeats forever.
That is precisely the failure this design has to exclude.

### The distance field ignores Towers

This is what keeps the anti-mazing property intact. The field is computed on an
empty board, so **Tower placement cannot redirect a hunting Knight**. If the
chosen square holds a Tower, the Knight attacks it and grinds, exactly as every
other blocked Piece does — it never selects a different square to get around
the obstruction. The player can wall a Knight; the player still cannot herd one.

## Invariant change

`game-design.md` and `CLAUDE.md` both state that a Piece's direction must never
be chosen because the Core lies that way. That rule now carries an explicit
carve-out for hunting Knights.

The carve-out is narrow on purpose, and the reason the rule existed still holds.
Its stated fear is mazing — Tower placement steering Pieces — and mazing needs
routing *around* Towers. Nothing here routes around anything: the distance
field is Tower-blind and a blocked hunting Knight grinds. **The "no pathfinding"
invariant is untouched.**

## Rejected alternatives

- **Promote stranded Knights**, as Pawns promote. Reuses machinery already
  proven to terminate and breaks no invariant, but it discards the Knight's
  identity at the moment the player is watching it, and the roster already has
  one promotion mechanic.
- **Give Knights the lateral sweep** that sliders and the King use. Cheapest and
  provably terminating, but a Knight shuffling one square sideways is not a
  knight move.
- **Delete stranded Pieces at round end.** Fixes the clutter and preserves every
  invariant, but leaves Knights permanently harmless — it addresses the mess
  rather than the wasted threat.

## Consequences, accepted

- **Knights become genuinely lethal.** Every Knight now reaches the Core
  eventually unless something kills it. Previously every Knight that reached
  rank 0 was harmless for the rest of the run.
- **Pressure rises against an incomplete defence.** Measured while raising Core
  health: a Tower line missing a single file already loses every point of Core
  health, and this adds a threat that no longer removes itself.
- **A hunting Knight looks identical to a normal one** while behaving completely
  differently. Deliberately left alone for now; a visual tell is available if
  play shows it is needed.

## Not in scope

- Any change to normal Knight movement. The zig-zag forward hop is untouched;
  hunting begins only once forward hops are exhausted.
- Any change to the other five Piece types.
- Deleting stranded Pieces. Knights are now the last type that could strand,
  and they no longer do.
