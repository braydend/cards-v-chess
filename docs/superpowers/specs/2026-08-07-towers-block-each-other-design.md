# Towers Block Each Other's Fire — Design

**Date:** 2026-08-07
**Status:** Agreed
**Issue:** [#37](https://github.com/braydend/cards-v-chess/issues/37)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

> "currently there is no mechanism to force the player to place towers
> strategically, allowing the player to create quite overpowered builds early on.
> preventing towers from firing through eachother may work as a decent balancing
> mechanic to force the player to place towers strategically instead of spamming
> down their initial towers and progressing quite far." — issue #37

Today nothing blocks line of fire. `src/game/coverage.ts` states it outright:
"Nothing blocks line of fire — a Tower hits any covered square regardless of
what sits between. Piercing and blocking are not part of the design." A player
can stack a dense, overlapping wall of Towers whose shots all pass straight
through the Towers in front of them, and every square in a Tower's geometric
footprint is a square it can actually hit.

The issue proposes making Towers occlude each other's fire as the missing
strategic pressure: a Tower in front hides what is behind it, so placement
stops being "spam everywhere" and starts being "shape the line".

## Decision

**A Tower blocks the shots of every Tower behind it.** Occlusion is derived from
the standing Tower layout each tick and stored nowhere. Blocking is one uniform
rule, not a per-rank property.

### 1. The occlusion rule: strictly between, on a compass ray

A Tower *S*'s shot at target *T* is blocked when some Tower *B* stands
**strictly between *S* and *T* on one of the 8 compass rays** — the same file,
the same rank, or the same diagonal — that is, *B* is collinear with *S* and *T*
and `0 < dist(S, B) < dist(S, T)`.

This is a single rule with a natural reading per geometry:

| Geometry | Rank | Reads as |
| --- | --- | --- |
| `vertical` | 3 | *T* is on the same file by construction; a Tower between on that file blocks |
| `diagonal` | 5 | *T* is on the same diagonal; a Tower between on that diagonal blocks |
| `cross` | 4 | *T* is on a cardinal ray; a Tower between on that ray blocks |
| `star` | 6 | *T* is on a cardinal or diagonal ray; a Tower between on that ray blocks |
| `adjacent` (range 1) | 2 | Targets are the 8 neighbours at distance 1 — no square is strictly between, so **never blocked** |
| `adjacent` (range 2) | 9 | The 5x5 disc. The 8 immediate neighbours are never blocked; on-ray squares at distance 2 *are* (a Tower at (0,1) blocks (0,2)); off-ray squares like (2,1) are never blocked |
| `ring` | 8 | Only ring targets *on a cardinal or diagonal ray* can be occluded; off-ray ring squares are never blocked |
| `band` | 10 | Only ray-aligned targets are occludable; the toll gate's wide off-ray sweep is unaffected |
| `none` | 7 | Never fires, so never a shooter to block — but **as a blocker it occludes fire behind it** |

**The rank-8 hollow core survives.** The Amplifier's ring covers the outer two
squares of its reach; a rank 2 socketed in the hollow centre fires at adjacent
squares. Adjacent shots are never occluded — nothing lies strictly between — so
the socket synergy the rebalance design relies on is untouched by this change.

**The rule is order-independent.** `isOccluded` reads only the *positions* of
the blocker set, and a Tower is never strictly between itself and a target, so
the outcome cannot depend on which Tower a caller happens to process first. That
matches the existing discipline in `tick.ts` and `towerAuras.ts`: no Piece's (or
Tower's) outcome depends on processing order.

### 2. Targeting: filter, then retarget

`selectTargets` in `src/game/tick.ts` gains the standing Tower list and filters
each candidate through the occlusion rule **before** the existing distance-to-Core
sort and `targetsPerShot` cap:

- A Tower whose nearest-to-Core Piece is occluded **retargets to the next-nearest
  reachable Piece**. Shots are never wasted because a single candidate is blocked.
- A Tower holds fire only when **every** Piece it covers is occluded — nothing
  it can reach is in range. The existing "hold at ready rather than bank shots"
  clamp already does this for a Tower with no targets; a fully occluded Tower is
  just the same case under a different cause.

Targeting priority, tie-breaking on id, and the `targetsPerShot` cap are
unchanged. Occlusion is a pre-filter, not a new prioritisation axis.

### 3. Auras are not blocked

Rank 8's Amplify and rank 9's Freeze keep using the geometric `coversSquare`
predicate. They are fields — "while a Piece stands in the coverage" — not
projectiles, so a Tower between an aura Tower and a Piece does nothing to the
aura. This keeps the Amplifier's hollow-core socket fully functional (a rank 2
beside it is still amplified) and keeps the Freezer's slow positional rather
than beam-like.

### 4. The preview shows reachable squares only

Both coverage overlays switch from `coveredSquares` to a new `reachableSquares`
that filters through the occlusion rule, threading the current Tower layout as
the blocker set:

- **`src/scene/towerCoverage.ts`** — the amber selected-Tower footprint draws
  only squares the Tower can actually hit given the layout.
- **`src/scene/CoveragePreview.tsx`** — the teal build preview draws only
  squares the candidate would actually hit once placed.

**The previewed Tower never occludes its own preview.** "Strictly between"
excludes the origin by construction, so the Tower being placed or inspected
cannot block its own shots — which is exactly right.

**Memoisation is preserved.** `selectedFootprint` is deliberately memoised on
scalars so that a cooldown or damage change — which refreshes the towers array
on every publish — costs the overlay nothing. Tower *squares* never move, so the
blocker set changes only on build and destroy. The memo dependency therefore
becomes a **blocker signature**: the sorted list of occupied square keys, cheap
to compare, and unchanged by a hit or a cooldown tick.

**The negative footprint is not surfaced.** Placing a Tower also occludes shots
of Towers *behind* it; the preview does not dim or mark those newly lost
squares. The player discovers that through gameplay and the Tower panel. This
was asked and answered: surfacing it made the preview a two-layer computation
that gets busy on crowded boards, for a consequence that is the point of the
mechanic.

**`src/scene/firePulse.ts` is unchanged.** It animates a cosmetic expanding
ring over the geometric footprint and mints a pulse only when a Tower actually
fires (`fireCooldownMs` decreases). An occluded Tower holds fire, so no pulse is
created to suppress — the animation loop never needs to know about occlusion.

### 5. Engine shape

Two new pure functions in `src/game/coverage.ts`, exported from the engine
barrel `src/game/index.ts`:

- `isOccluded(from: Square, target: Square, blockers: readonly Square[]): boolean`
  — the compass-ray strictly-between test. Pure, deterministic, allocation-free.
- `reachableSquares(board, geometry, range, from, blockers): Square[]` —
  `coveredSquares(...)` filtered through `isOccluded`. The list form the
  overlays call.

`selectTargets` uses `isOccluded` directly against the standing Towers. Auras
continue to call `coversSquare` and are untouched.

**No `GameState` field, no new Command, no `structuralKey` change.** Occlusion
is derived from the existing Tower layout each tick, exactly like the auras, so
nothing about determinism, publishing cadence, or round termination moves.

### 6. The Wall gains a second role

Rank 7's Wall never fires, so it has no shots to occlude. But as a blocker it
occludes fire behind it, exactly like any other Tower. Placing a Wall in front
of a gunline now shields the Pieces behind it from that line — the Wall's
identity as "blocks and soaks" extends to blocking shots, which is consistent
with its design rather than a new behaviour to learn.

## Testing

- **`isOccluded`** (`src/game/coverage.test.ts`): a Tower directly between on
  the same file / rank / diagonal blocks; a Tower strictly *behind* the target
  does not; a Tower off the ray does not; the shooter never occludes itself; a
  target with nothing between is reachable; **adjacent range 1 is never
  occluded** (no square strictly between); a ring's off-ray square stays
  reachable through a Tower *inside* the ring (the hollow-core socket case).
- **`reachableSquares`**: equals `coveredSquares` with an empty blocker list;
  is a subset given blockers.
- **Retargeting** (`src/game/tick.test.ts`): a Tower whose nearest-to-Core
  Piece is occluded shoots the next-nearest reachable one; a fully occluded
  Tower holds fire; a partly occluded multi-target shot hits exactly the
  reachable targets.
- **Auras unaffected** (`src/game/towerAuras.test.ts`): a Tower between an
  Amplifier and a Piece does not cut the amplification; the Freezer still slows
  through a Tower.
- **Agreement test** (`coverage.test.ts`, currently "coveredSquares agrees with
  what a Tower shoots"): re-pointed at `reachableSquares` so the preview/engine
  agreement now covers occlusion. A plain-`coveredSquares` characterisation
  guard is kept.

## Consequences

- **The "preview cannot lie about a shot" property survives**, and now means
  *reachable* squares, not *covered* ones — pinned by the re-pointed agreement
  test.
- **`towerAuras.test.ts` gains coverage** that pins the "fields are not blocked"
  decision, so a future change cannot quietly make auras beam-like.
- **The rank ladder's coverage ceiling is now a *reachable* ceiling, not a
  geometric one** — `towerRanks.test.ts`'s per-height coverage measurements
  describe the un-occluded footprint and remain valid as the geometric bound;
  occlusion can only lower effective coverage, never raise it.
- **Balance is not re-tuned here.** Occlusion is a new strategic pressure that
  changes which placements are strong, but the ladder's placeholder numbers and
  the "coverage rises, single-target DPS falls" trade are untouched. Whether
  occlusion alone fixes early-game spamming is a play-experience question, not a
  paper one.

## Rejected

- **Blocking as a per-rank flag.** "Every Tower blocks" is one rule the player
  can state in one sentence; a flag on `TowerRankDef` makes each rank a special
  case and rebuilds the cover-your-ears tuning surface the ladder just
  shed. The Wall's blocking role falls out of the uniform rule for free.
- **Holding fire on a single blocked first choice.** Retargeting keeps shots
  useful, so a Tower in a crowd is weakened only where it is actually
  occluded, not where a single intervening Tower happens to sit in front of
  its nearest threat.
- **Blocking auras.** Making the Amplifier's ring beam-like through a blocker
  would turn the hollow-core socket into a liability and put a second,
  positional reading of "blocked" in the player's head. Fields pass through;
  shots do not.
- **Showing the negative footprint in the preview.** Two-layer computation,
  busy on crowded boards, and it surfaces the mechanic's *point* as if it were
  a cost to be avoided.
- **Occlusion by arbitrary straight-line (Chebyshev) geometry rather than the
  8 rays.** A uniform Chebyshev rule would let a Tower at (1,2) block a shot to
  (2,4) — a "line" no Tower on the ladder shoots along. The rays are exactly the
  directions the ladder actually fires, so "between on a ray" is the minimal
  rule that never blocks a shot that would not have travelled that way.
