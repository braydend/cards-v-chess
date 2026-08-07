# Rank 10 Toll Gate Respects Tower Blocking — Design

**Date:** 2026-08-07
**Status:** Agreed
**Issue:** [#44](https://github.com/braydend/cards-v-chess/issues/44)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

The rank-10 toll gate (`band` geometry, range 1) bypasses the tower-blocking
rule off its own rank. `isOccluded` is geometry-blind: it only blocks a target
on one of the 8 compass rays from the shooter. A band target on a rank other
than the gate's own sits on no such ray, so it is never occluded — a wall of
Towers directly in front of the gate blocks only the single rank the gate
stands on (the "center line"), and Pieces on the band's other ranks are shot
through the same wall.

Example: a complete wall of three Towers spanning the band's full height (the
gate's rank ± 1) at some file, with a Piece on the far side. Only the Piece on
the gate's own rank is protected; the Pieces one rank above and below it are
still hit, despite the wall hiding them exactly as it hides the middle Piece.

This reverses a deliberate decision. The occlusion spec
(`2026-08-07-towers-block-each-other-design.md`) recorded: *"`band` | Only
ray-aligned targets are occludable; the toll gate's wide off-ray sweep is
unaffected"*. That reading is wrong on the game's own terms: the gate's selling
point is "nothing passes un-shot", but a Tower that hides what is behind it is
supposed to hide it from every Tower, and the player who builds a wall in front
of the gate expects the wall to do its job.

## Decision

**The toll gate's shots are occluded per rank line.** A band target on rank *r*
is blocked when some Tower stands on that same rank *r*, strictly between the
gate's file and the target's file. The band reads as one horizontal beam per
covered rank, each travelling from the gate's column across the board, and each
beam is blocked by whatever Tower stands in its way.

Concretely, in `src/game/coverage.ts`:

- `isOccluded` gains an optional `geometry: TowerGeometry` parameter.
- When `geometry === 'band'`, occlusion is the per-rank-line test above. The
  existing compass-ray test is unreachable for band targets in a way that
  matters — at the band's range of 1 the two tests agree on every band square
  (same-rank targets are caught by both, and the file and diagonal squares the
  ray test could see have no square strictly between) — so the band case stands
  alone. If the band's range is ever raised, this agreement breaks at diagonal
  distance 2 and the two tests would need merging again.
- Every other geometry (or an omitted argument) keeps the compass-ray test
  unchanged. The parameter is optional so no existing caller or test changes.

### What the rule covers

- The **three issue scenarios** all resolve correctly: a full-height wall blocks
  every band rank behind it, not just the gate's own.
- The gate's **own rank** behaves exactly as before — per-rank-line subsumes the
  old same-rank ray test.
- **Partial walls** block only the rank they cover. A single Tower on one band
  rank shields Pieces on that rank and nothing else; fully walling the gate
  takes one Tower per band rank. This is the asked-and-answered granularity.
- **Both directions** — the `between` predicate is symmetric, so the rule holds
  whether the wall is to the gate's left or right.
- **Strictly between** is load-bearing as ever: a Tower on the target's square
  or beyond it, or at the gate's own column, does not block.

## Engine shape

A signature change on one function, three call sites already holding the
geometry, and no new state:

- `isOccluded(from, target, blockers, geometry?)` — the single answer, band-aware.
- `reachableSquares(board, geometry, range, from, blockers)` — already receives
  `geometry`; it forwards it so the two overlays keep showing exactly what the
  engine will hit.
- `selectTargets` in `src/game/tick.ts` — passes `def.geometry`, so a band
  retargets to the next-nearest reachable Piece or holds fire when every Piece
  it covers is occluded. Neither behaviour is new logic; occlusion is a
  pre-filter and the existing hold-at-ready clamp already handles a band with no
  reachable targets.
- `src/scene/firePulse.ts` — already clips its sweep through `isOccluded` with
  the pulse's own geometry in hand; it forwards it so the animation cannot light
  a square the shot cannot reach.

No `GameState` field, no new Command, no `structuralKey` change — occlusion is
still derived from the standing Tower layout each tick.

## Testing

- **`coverage.test.ts`**: the three issue examples (full-height wall, each band
  rank); a partial-wall per-rank-line case (single Tower blocks only its own
  rank); strictly-between edges (blocker beyond the target, at the gate's
  column, or behind the gate does not block); both sweep directions; a band
  target with no blocker on its rank stays reachable.
- **`reachableSquares`**: a walled band footprint omits the occluded ranks'
  far-side squares and keeps the near side.
- **`tick.test.ts`**: a fully walled band holds fire; a band with one reachable
  Piece past a partial wall retargets to it.
- **`firePulse.test.ts`**: a band pulse does not light a square another Tower
  occludes, but keeps the near side.

## Consequences

- **The "preview cannot lie about a shot" property survives** and now covers
  the band: overlays, pulse, and targeting all read the same band-aware answer.
- **The band is weaker against walls**, which is the point: a Tower in front
  hides what is behind it from every Tower, and the toll gate is no longer the
  exception that shoots through the player's own wall.
- **Balance is otherwise untouched.** Numbers, coverage, targeting priority and
  the `targetsPerShot` cap are unchanged; occlusion only lowers the band's
  effective coverage where a wall actually stands.
- **The previous spec's `band` row is superseded.** `2026-08-07-towers-block-each-other-design.md`
  is frozen and never edited; this document is the reversal on record.

## Rejected

- **Requiring a full-height wall to block anything.** A partial wall should not
  be dead weight: a Tower on one band rank hides the Pieces on that rank, and
  each Tower the player commits earns its own line. (This was the other answer
  to issue #44's clarifying question; the issue's examples cannot distinguish
  them because they all use a complete wall, so the partial-wall case was asked
  explicitly.)
- **A separate `isBandOccluded` and branching callers.** Splitting the answer
  across two functions lets targeting, an overlay, or the pulse drift out of
  sync; one band-aware predicate keeps them lockstep.
- **Applying per-rank-line blocking to every geometry.** A global rule would let
  a Tower at (3,4) block a diagonal shot (2,2)→(4,4) — a "line" no other
  geometry shoots along. That is the Chebyshev overreach the occlusion spec
  already rejected; the band alone is the geometry whose shots genuinely
  travel a rank line.
