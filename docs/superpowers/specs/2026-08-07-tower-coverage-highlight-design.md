# Tower Coverage Highlight — Design

**Date:** 2026-08-07
**Status:** Agreed
**Issue:** [#29](https://github.com/braydend/cards-v-chess/issues/29)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

> "once a tower is placed, you cant see it's range, so being able to click it and
> see the range would be very useful" — issue #29

The game already answers "where would this Tower shoot?" — but only for a Tower
that does not exist yet. `src/scene/CoveragePreview.tsx` lights the footprint of
the **selected Card** under the **hovered square**, and its own doc comment says
why: "This exists to make the rank ladder judgeable." The moment the Card is
played, that answer disappears and never comes back.

So the player can compare *candidate* Towers and cannot read the board they have
actually built. That is backwards. Placement is a one-off decision; living with
the placement is the whole rest of the run, and every subsequent decision —
where the next Tower goes, which Tower is worth a ♠, whether a file is covered
at all — depends on footprints that are currently invisible.

Three existing signals get close and all miss:

- **`TowerPanel`** already prints the geometry in words (`GEOMETRY_LABELS`) and
  the range as a number. "Fires along diagonals — one colour only, range 5" is
  accurate and still does not tell you which squares those are on *this* board
  from *this* square, which is the only form of the question that helps.
- **`FirePulses`** lights the real footprint on every shot — but only for the
  instant of a shot, only while a round is live, and only for a Tower that has
  something in range. It is feedback, not a reference. Between rounds, when
  placement decisions are actually made, the board is silent.
- **`CoveragePreview`** computes exactly the right thing from exactly the right
  predicate, and is wired to a hovered *Card*, not to a placed Tower.

The gap is narrow and the machinery to close it already exists.

## Decision

**Selecting a Tower lights every square it covers.**

Clicking a Tower already opens the inspect panel. That same selection now also
draws the Tower's footprint on the board, in a colour distinct from the build
preview, and clears when the selection clears.

### 1. Selection is the trigger, not hover

Hover was considered and rejected. Selection wins on three counts:

- **It already exists.** `selectedTowerId` in `src/state/uiStore.ts`, set by
  `resolveBoardAction` in `src/scene/boardClick.ts`, is exactly the gesture the
  issue asks for — "being able to click it".
- **It is sticky.** A footprint you can orbit the camera around, read against
  the Pieces walking into it, and compare with a build preview is worth more
  than one that vanishes when the pointer moves. A diagonal footprint in
  particular is hard to read in a single glance from one angle.
- **Hover would need new plumbing and would be worse.** Towers have no pointer
  handlers today; the board is hit-tested by one transparent `PlacementSurface`
  plane. Adding per-Tower hover means either handlers on every Tower mesh or
  deriving a Tower from `hoveredSquare` — and then the footprint flickers on and
  off as the pointer crosses the board, competing with the build preview which
  is *also* driven by hover.

Nothing about this precludes adding hover later. It is deliberately not in this
change.

### 2. The highlight is coverage, not targeting

The lit squares are every square `coversSquare` returns true for — the same
predicate, from the same module, that `fireTowers` in `src/game/tick.ts` tests
before it shoots. The highlight and the shot cannot disagree, because there is
only one answer and both read it.

It deliberately does **not** show which squares a shot will actually hit.
`selectTargets` caps a shot at `targetsPerShot` and picks the Pieces nearest the
Core, so at rank 8 (3 targets) a 27-square star resolves to three Pieces.
Lighting only those would be a different feature — "what is this Tower about to
do" — and it would change every tick, which is not what a reference overlay is
for.

One engine test pins this rather than leaving it as a comment
(`src/game/coverage.test.ts`): it walks a board square by square, puts a Pawn on
each, runs the real `tick`, and asserts that the Pieces that take damage are
exactly the ones standing on squares `coveredSquares` returned. Both functions
look their geometry up from `towerRank(cardRank)` independently, so without that
test a support that moved range onto the Tower instance could update firing and
leave the overlay quietly lying.

The panel carries the other half instead: **a line for targets per shot**, with
rank 10's `Number.POSITIVE_INFINITY` rendered as "all". This is the one figure
on `TowerRankDef` the panel omits, and it is precisely the number a player needs
once they can see how many squares are lit. A rank-9 disc lighting 48 squares
while hitting 5 Pieces per shot is legible; the same disc with no figure beside
it over-promises.

### 3. Amber for what exists, teal for what is proposed

The build preview keeps teal (`#4fd1c5` at opacity 0.42). The selected Tower's
coverage is amber (`#ffb84a` at 0.46).

Two footprints of the same colour would be unreadable the moment they overlap,
and they will overlap constantly — placing a second Tower beside the first is
the normal case. The split is semantic, not decorative: **teal is a promise
about a Card you have not played; amber is a fact about a Tower you own.**

**The strength was measured against screenshots of the real scene, not reasoned
about.** The first pass took `#f6ad55` at 0.34, on the argument that a sticky
overlay should sit quieter than a transient one. That argument is wrong in two
ways a screenshot shows immediately: a warm hue that weak barely moves the light
squares (`#e6e0cf`), and on the dark squares it reads as dirt rather than light.
It also broke section 4 — an amber square under teal looked identical to a teal
square with nothing beneath it. At 0.46 the overlap resolves to a distinct
yellow-green, which is what makes all four states legible: amber only, teal only,
both, neither.

### 4. Both draw at once, deliberately

No suppression rule. A selected Tower's amber footprint stays lit while a build
Card's teal preview follows the pointer.

This is the feature's second use, and arguably its better one: the question
"where is my coverage thin?" is answered by seeing the new footprint against the
existing one. Hiding either while the other is up would make the comparison
impossible, which is the comparison the player is actually trying to make.

Overlap is resolved by an **explicit `renderOrder` ladder**. Separate height
bands keep the overlays from being coplanar, which is a different job — see
below:

| Overlay | `renderOrder` | y span | Note |
| --- | --- | --- | --- |
| Board squares | — | −0.12 … 0.00 | opaque |
| **Tower coverage (new)** | **1** | **0.009 … 0.019** | amber |
| `PlacementSurface` | — | 0.02 | invisible, `depthWrite: false` |
| `CoveragePreview` box | 2 | 0.03 … 0.05 | teal |
| `CoveragePreview` illegal marker | 3 | 0.04 | red |
| `SelectionMarker` ring | 4 | 0.06 | |
| `FirePulses` | 5 | 0.065 … 0.075 | was 1, the only one that had any |

Teal draws over amber — the active decision on top — and `renderOrder` is what
makes that true.

**The first version of this spec claimed the height bands did that job, and they
do not.** three.js sorts the transparent list on the projected z of each object's
**world origin**, and drei's `Instances` keeps every instance's position in
`instanceMatrix` while leaving the `InstancedMesh` itself at the origin. Measured
in the running scene: both footprint overlays report a world position of exactly
`(0, 0, 0)`, so their y values are invisible to the sort. Forcing `renderOrder`
one way and then the other visibly changes the composite, which is how much this
matters — amber over teal is a different colour from teal over amber, and §3's
measured palette assumes the latter.

The ordering the code happened to produce before was in fact the intended one,
which is exactly why this was worth fixing rather than leaving: it was right by
accident, and nothing in the scene stated it. `FirePulses` had already reached
this conclusion on its own and set `renderOrder={1}`; the whole stack now does the
same, and every value must stay distinct because a tie falls back to the sort this
exists to escape.

What the bands still buy is narrower and real: two genuinely coplanar quads with
`depthWrite: false` z-fight. Do not close the gaps.

### 5. It disappears with the Tower

A destroyed Tower's footprint clears itself the way its panel and its selection
ring already do: the id stops being found in `state.towers`, and the overlay
renders nothing. No cleanup, no effect, no stale id to invalidate — Tower ids
are never reused within a run.

### 6. One footprint function, shared

`coveredSquares(board, geometry, range, from)` joins `coversSquare` in
`src/game/coverage.ts` and is exported from the engine barrel.
`CoveragePreview` is refactored onto it.

Two independently written `allSquares(board).filter(...)` loops are two places
for the clipping to drift, and the whole point of section 2 is that there is one
answer about coverage. **`src/scene/firePulse.ts` keeps its scratch-object
loop** — it runs inside `useFrame` and must not allocate an array of `Square`
objects per Tower per frame. That is not duplication to be tidied away; the
comments there say so.

## Rejected

- **A ring or radius circle.** A Tower's footprint is a shape, not a radius —
  vertical range 4 covers 8 squares, and a disc of range 3 covers 48. A circle
  would teach a footprint no Tower on the ladder has. This is the same reasoning
  that shaped `FirePulses` (see the firing-animation spec).
- **Lighting only squares that currently hold a Piece.** That is targeting
  feedback, changes every tick, and `FirePulses` already covers the moment of a
  shot.
- **Range rings on every Tower, always on.** Eight overlapping footprints is
  noise. Selection is the filter.
- **Suppressing the build preview while a Tower is selected** (or the reverse).
  Kills the gap-finding use in section 4.
- **Putting the footprint in the panel as a mini-diagram.** A grid drawn in DOM
  would be a second implementation of the board's geometry, in a second
  coordinate system, guaranteed to drift from `coversSquare` — and it cannot
  show the footprint's position relative to the Core or the Pieces, which is
  most of what the player wants to know.

## Consequences

- **The Ace still grows the board**, so the overlay's `Instances` is keyed on
  its slot count exactly like `Board.tsx` and `CoveragePreview.tsx`. See the Ace
  wedge in CLAUDE.md; this is the third instance of the same load-bearing `key`.
- **`targetsPerShot` becomes player-visible**, which makes ranks 8–10 legible
  and also exposes their placeholder values to judgement for the first time.
  That is a feature: the numbers are on the design doc's open-questions list.
- **No engine behaviour changes.** `coveredSquares` is a new pure helper over an
  existing predicate. `step`, `tick`, `GameState` and `structuralKey` are
  untouched, so nothing about determinism, publishing cadence, or round
  termination moves.
