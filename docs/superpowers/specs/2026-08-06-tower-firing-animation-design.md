# Tower Firing Animation — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#23](https://github.com/braydend/cards-v-chess/issues/23)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

A Tower fires silently. Damage lands, Pieces shrink and die, and nothing on
screen says a shot happened — so the player cannot read **where** a Tower
reaches or **how often** it shoots.

Everything a Tower currently communicates is about its own condition:
`Towers.tsx` darkens it as health drops, flashes and squashes it on a hit,
pulses it at critical health, and flares a ghost as it dies. None of that is
about output. The one signal about reach is `CoveragePreview`, and it exists
only while the player hovers a build Card — once the Tower is placed, its
footprint becomes invisible again.

Issue #23 proposes an expanding arc over the affected tiles. Two details of the
proposal do not survive contact with the engine:

- **The sketch contradicts its own example.** It names rank 4, whose geometry is
  `cross` — a plus sign reaching 4 squares each way (`src/data/towerRanks.ts`).
  The sketch draws a full ring at radius 1, then radius 2, which is `adjacent`
  geometry. Five geometries are live across the ladder: `adjacent`, `vertical`,
  `cross`, `diagonal`, `star`.
- **"Covering the tiles that are being affected" only literally matches rank
  10.** A shot hits at most `targetsPerShot` Pieces — 1 for ranks 2–7, 3 at rank
  8, 5 at rank 9, unlimited at rank 10 — and `selectTargets` in
  `src/game/tick.ts` picks the ones *nearest the Core*, breaking ties on id, not
  everything in the footprint.

## Decision

An expanding ring of lit squares, clipped to the Tower's real firing geometry,
drawn entirely in the renderer from a signal the engine already carries.

### 1. The pulse follows the geometry footprint, not a ring

A shot lights only the squares the Tower genuinely covers. Rank 4 expands as a
cross, rank 5 as a diagonal X, rank 3 as a line up and down the file, rank 6 and
8 as a star, and ranks 2, 7, 9 and 10 as a filled disc — the last being the only
shape the issue's sketch actually depicts.

This is chosen over a generic radial ring because a ring would teach the player a
footprint the Tower does not have, and would contradict the footprint
`CoveragePreview` shows at build time. The two now reinforce one another: the
shape you were shown while placing is the shape you see firing.

It is achieved by calling the engine's own `coversSquare`, not by reimplementing
the shapes. That is the point — the pulse cannot disagree with what the Tower
hits, or with the build preview, because all three go through one predicate.

The footprint pulse does over-promise in one direction: it sweeps squares whose
Pieces a low-rank Tower did not hit. That is accepted, and partly answered
already — `Pieces.tsx` scales a Piece by `0.55 + healthFraction * 0.45`, read
live from `getState()` in `useFrame`, so the Piece that actually took the damage
visibly changes. The alternative, a tracer per real target, is rejected below.

### 2. Constant propagation speed, overlap allowed

Every pulse steps outward at the same fixed rate, whatever the Tower's rank or
fire interval. Range then reads as reach, and cadence reads as how often a new
ring leaves. A Tower firing fast has several rings in flight at once, and that
is itself the signal that it is fast — no cap on concurrent pulses is needed.

The constants are guesses, but they were checked at the extremes rather than
assumed. Sweep is `range / speed`; lifetime is sweep plus the outermost square's
fade:

| Case | Sweep | Lifetime | Fire interval | Result |
| --- | --- | --- | --- | --- |
| rank 2 — range 1 | 45ms | 205ms | 600ms | one clean blip, 395ms dark |
| rank 8 — range 6 | 273ms | 433ms | 420ms | 13ms of tail overlap — effectively one ring at a time |
| rank 10, ♦ to the floor — range 4 | 182ms | 342ms | 100ms | ~3.4 rings in flight, spaced 2.2 squares |

`MIN_FIRE_INTERVAL_MS` is 100 (`src/data/cards.ts`), so the last row is the true
worst case. Rings 2.2 squares apart on a 4-square footprint stay distinguishable,
and the overlap reads as firing hard — the behaviour this decision wants.

Rejected: scaling the sweep to `fireIntervalMs` so pulses never overlap. It makes
propagation speed meaningless, crawls at rank 2 (600ms to cross one square), and
at the 100ms floor gives each ring under two frames of life, which strobes.

### 3. Rank colour, additively blended

The pulse uses `RANK_COLOURS`, so a ring traces back to the Tower that fired it
when footprints overlap. This extends that module's stated purpose — "so a
Tower's firing geometry is readable at a glance."

It is drawn with `AdditiveBlending`. Board squares alternate cream `#e6e0cf` and
slate `#3c4655`, and the rank palette has uneven contrast against them: yellow
rank 5 is weak on cream, grey rank 10 is weak on slate. Additive blending
brightens whatever square the pulse sits on, which removes the contrast problem
outright rather than working around it with a per-rank correction. Overlapping
rings then read as hotter for free, and summing contributions is what makes the
single-instance-per-square draw in decision 5 possible.

Rank colour also keeps the pulse distinct from `CoveragePreview`'s teal
`#4fd1c5`, so hovering a build Card over a firing Tower stays unambiguous — one
colour meaning both "could cover" and "just fired" would be unreadable.

### 4. The renderer detects a shot from `fireCooldownMs`

No engine change. `Towers`' sibling reads `getState().towers` in `useFrame` and
compares each Tower's `fireCooldownMs` to the previous frame's. **A decrease is a
shot.**

That is exact for almost every case. On exit from `fireTowers`, a Tower's stored
cooldown is either below `fireIntervalMs` (it fired, subtracting one whole
interval) or exactly `fireIntervalMs` (no target, clamped to "ready"). Ordinarily
the stored value never *exceeds* the interval, so that clamp can only hold or
raise it.

**♦ Speed is the one case that defeats this on its own.** `applySupport` in
`src/game/support.ts` lowers `fireIntervalMs` directly and never touches
`fireCooldownMs`. A Tower idling at the OLD clamp is left holding a cooldown
*above* its NEW interval, and the very next tick — even with nothing in range —
clamps that value DOWN to the new interval. That is a decrease with no shot
behind it, reproduced by the reviewer through the real engine: a rank 2 Tower, a
Pawn out of range, a 10♦ played on the Tower. Stored cooldown/interval went
600/600 → (♦) → 600/500 → next tick 500/500 — a decrease `detectShots` would
otherwise report as a shot. The renderer guards this explicitly: it skips a
decrease when the *previous* reading already exceeded the *current* interval and
the *new* reading has only caught back up to it, which a genuinely firing tick
can never produce (a shot always drains the cooldown strictly below the
interval).

The count cannot be short. `FIXED_DT_MS` is 1000/60 and `MAX_CATCHUP_STEPS` is 5,
so a frame advances at most 83.3ms of simulation; at the 100ms floor a Tower
would need a stored cooldown of 116.7ms to fire twice in one frame, and the
stored value never exceeds the interval. **At most one shot per Tower per frame**,
so one pulse per observed decrease is right.

#### The accepted false negative

If a Tower fires in one tick and then loses every target in a later tick of the
**same frame**, the clamp raises its stored cooldown back to exactly
`fireIntervalMs` — at or above where the frame started — and the decrease is
erased. That pulse is missed.

This is the killing-blow shot: the one that clears the last Piece in range. It is
**unreachable today**, and the bound is not "frame rate" — 2-tick frames happen
at nominal 60fps too, from accumulator drift or one long frame (a GC pause, any
hitch), so "below roughly 30fps" was the wrong invariant regardless of whether it
were true. The real reason it cannot happen: after a shot, the stored cooldown is
at most one `FIXED_DT_MS` (16.67ms), so climbing back up to `fireIntervalMs`
before the frame ends needs `MAX_CATCHUP_STEPS * FIXED_DT_MS >= fireIntervalMs`,
i.e. `83.3ms >= 100ms` — false, confirmed by the reviewer with an exhaustive
sweep across every interval, start value, frame length and target pattern. The
actual invariant that makes this safe is `MIN_FIRE_INTERVAL_MS > FIXED_DT_MS *
MAX_CATCHUP_STEPS`. It is also, pointedly, the same failure mode `Towers.tsx`
documents for engine events — "anything the engine wrote per-tick and cleared
per-tick would be lost exactly when the frame rate drops" — just not one that
this codebase's actual numbers let happen.

It is accepted rather than fixed, on the strength of that invariant holding
today — not because the gap is provably impossible in general. Lowering
`MIN_FIRE_INTERVAL_MS` below roughly 84ms, or raising `MAX_CATCHUP_STEPS`, would
open it for real, and nothing today would flag that; a future change to either
constant should re-check this section. The only clean fix if it ever opens is the
engine event rejected below.

The same class of gap does **not** lose the first shot of a Tower built between
frames, despite an earlier draft of this document claiming otherwise. A new
Tower starts at `fireCooldownMs: 0` (`src/game/cardPlays.ts`) and needs at least
`fireIntervalMs` — at minimum 100ms — of simulation to fire, which is more than
one frame's 83.3ms worth of catch-up. Seeding a first-seen Tower without
reporting a shot is still correct — there is genuinely no previous cooldown to
compare, so the renderer cannot honestly claim a shot it never observed — the
justification is just that seeding never actually costs a real shot, not that it
would be acceptable if it did.

### 5. One instance per square, colour-summed

The pulse layer is a fixed set of instances, one per board square, mounted once
and never remounted for a shot. Each frame, every live pulse's contribution to
every square is summed into a reused `Float32Array`, and those sums are written
to the instance colours.

Additive blending is what makes this work: black contributes nothing, so an unlit
square needs no special case, and overlapping pulses sum naturally. The
alternative — one instance per lit square per pulse — would need a `limit` guessed
from concurrent pulse count, which nothing bounds.

Consequences that matter:

- **`limit` is the board's square count, and `key` must match it.** This is the
  Ace wedge's exact shape, and it is genuinely reachable here in a way it is not
  in `CoveragePreview`: that component unmounts whenever nothing is hovered, so
  it reallocates by accident. This one never unmounts, so an Ace really would
  grow `limit` past buffers allocated at the old size.
- **The mesh handles live in an array, not a `Map`.** `squareKey(square)` in the
  frame loop would allocate a string per square per frame. `allSquares` is
  row-major (rank outer, file inner), so one index serves both the mesh array
  and the colour buffer.
- **`toneMapped={false}` on the material.** `App.tsx` passes no `gl` override, so
  R3F applies its default ACES tone mapping, which rolls off precisely the bright
  end additive blending produces.
- **The layer sits at y = 0.07 with an explicit `renderOrder`.** Current layering
  is board top 0, placement surface 0.02, coverage preview box 0.02 tall centred
  at 0.04, selection marker 0.06. Nothing among these writes depth, so there is
  no z-fight against the board — but coplanar transparent quads sort unstably by
  camera distance, so the pulse gets its own height and an explicit order rather
  than relying on that sort. A pulse brightening a hovered build preview beneath
  it is fine; additive on teal lightens it, briefly.
- **The group toggles `visible`, never unmounts**, so no material recompiles when
  firing stops.
- **The live-pulse list is compacted in place, not with `Array.prototype.filter`.**
  The component never unmounts, so its `useFrame` callback runs for the
  lifetime of the run, and `filter` allocates a fresh array on every call —
  including the idle frames where nothing needs filtering. A swap-write
  compaction (walk the array, keep what's still live, truncate `.length`)
  drops that allocation without changing behaviour. The two allocations Task 1
  keeps — the array `detectShots` returns, and the `FirePulse` record per shot
  — are unavoidable because a shot must allocate a record regardless; this one
  was not, so it does not get the same exemption.

### 6. Where the code goes

`src/scene/` has no jsdom and no component tests, so a decision left in a `.tsx`
cannot be tested. The logic goes in a pure module beside the component, following
`towerDiff.ts` — mutate-in-place, no React, no three.js.

**`src/scene/firePulse.ts`** — new. Holds `FirePulse`, `detectShots`,
`isPulseLive`, `accumulatePulses`, and the two feel constants.

```ts
/**
 * One shot's expanding ring. Carries its own square and card rank rather than a
 * Tower id, for the same reason `Ghost` does: a Tower can be destroyed while its
 * last shot is still travelling, and once it leaves `GameState` this record is
 * the only place the renderer still knows where the shot came from.
 */
export interface FirePulse {
  readonly file: number
  readonly boardRank: number
  readonly cardRank: BuildableRank
  /** Clock seconds when the shot happened. */
  readonly startedAt: number
}

/** Squares the ring crosses per second. PLACEHOLDER. */
export const PULSE_SQUARES_PER_SECOND = 22
/** How long a square stays lit after the ring passes. PLACEHOLDER. */
export const PULSE_FADE_MS = 160

/** Mutates `lastCooldownMs`: seeds unseen Towers, updates, prunes departed ones. */
export function detectShots(
  lastCooldownMs: Map<string, number>,
  towers: readonly Tower[],
  now: number,
): FirePulse[]

export function isPulseLive(pulse: FirePulse, now: number): boolean

/** Sums live pulses into `out`, 3 floats per square. Zeroes it first, allocates nothing. */
export function accumulatePulses(
  out: Float32Array,
  board: BoardSpec,
  pulses: readonly FirePulse[],
  now: number,
): void
```

Per-square intensity is the only real arithmetic. `origin` is the pulse's own
square, and `geometry` and `range` come from `towerRank(pulse.cardRank)` — which
is why the record stores only the rank. Those two are pure functions of the card
rank: no support touches them (♥ repairs, ♦ lowers the interval, ♠ moves health,
♣ raises damage), and `Tower` carries no geometry or range field at all —
`fireTowers` itself looks them up the same way.

```
d         = max(|Δfile|, |Δrank|)      // Chebyshev — the measure coversSquare uses
arrival   = d / PULSE_SQUARES_PER_SECOND
age       = now - startedAt - arrival
fadeSec   = PULSE_FADE_MS / 1000
intensity = coversSquare(geometry, range, origin, sq) && age >= 0
              ? max(0, 1 - age / fadeSec)
              : 0
```

The constants live here rather than in `src/data/`, following `towerColour.ts`'s
`HIT_FLASH_MS`, `DEATH_FLARE_MS` and `CRITICAL_PULSE_HZ`. They are renderer feel,
not game data.

**`src/scene/FirePulses.tsx`** — new. Mounted in `Board.tsx` beside
`CoveragePreview` and `SelectionMarker`; it is a ground overlay, and `Towers.tsx`
is already carrying health, hit, critical and death. It subscribes to nothing:
`board` arrives as a prop, everything else is read live in `useFrame`.

It handles `reset()` the way `Towers.tsx` does, by watching for `nextEntityId`
going backwards — the only way it can within a run. Without that, a remembered
high cooldown against a fresh `tower-1` at 0 reads as a spurious shot. Read from
live state in the frame loop rather than from a store subscription, since this
component needs no snapshot at all.

`GameScene` selects `core`, which `tick` rebuilds every tick, so `Board` and
therefore this component re-render on every publish. That makes drei's `Instance`
ref callbacks detach and reattach constantly — the footgun `Towers.tsx` documents
for ghosts. This design is immune by construction, because all timing lives on
the `FirePulse` records and none of it per-mesh; a mesh handle going briefly null
is absorbed by a null guard. The component is wrapped in `memo` to stop the churn
regardless, which `board`'s stable identity makes effective.

**Nothing else changes.** No engine change, no `src/data/` change, no
`src/state/` change. `coversSquare`, `allSquares` and the types needed are already
exported from `src/game/index.ts`, so the inbound lint rule is satisfied without
touching the engine's public surface. `structuralKey` is untouched, so
`simulation.test.ts`'s bound of 60 publishes per 600 frames is unaffected — this
adds zero publishes.

## Testing

`src/scene/` is excluded from coverage thresholds in `vite.config.ts`, but
`towerDiff.ts`, `towerColour.ts` and `boardClick.ts` all carry tests regardless.
`firePulse.test.ts` follows that precedent and needs no new threshold entry.

**The load-bearing test drives the real engine.** Everything here rests on "a
decrease in `fireCooldownMs` means a shot," which was established by reading
`fireTowers`. A test that hand-rolls `Tower` objects would only re-assert that
reading. So at least one test builds a Tower and a Piece, calls real `tick` until
a shot lands, and asserts `detectShots` reports it — then runs `tick` with the
Piece out of range and asserts it reports nothing. If anyone changes
`fireTowers`'s cooldown bookkeeping, that test fails rather than the animation
silently dying.

`detectShots`:

- fires on a decrease
- stays silent while the cooldown accumulates
- stays silent when the cooldown holds at `fireIntervalMs` — the idle clamp
- seeds a first-seen Tower without firing it
- prunes a Tower that has left state
- carries the Tower's square and `cardRank` onto the pulse, so a Tower destroyed
  mid-flight still draws

`accumulatePulses`:

- zeroes the buffer before summing, so a departed pulse leaves no residue
- lights nothing outside the footprint — a rank 4 cross leaves its diagonal
  neighbour at 0
- lights nothing the wave has not reached yet
- decays a square to 0 once `PULSE_FADE_MS` has passed since arrival
- sums two pulses covering one square
- never writes outside the buffer, at any board size

`isPulseLive`:

- true while the ring is travelling
- true through the outermost square's fade
- false after `range / speed + fade`
- gives rank 2 (range 1) and rank 8 (range 6) different lifetimes

## Rejected alternatives

**A generic radial ring, as sketched.** One shared animation for every rank,
simplest to build. Rejected because it tells the player nothing true about where
a Tower can shoot, and contradicts the build-time preview.

**A tracer per Piece actually hit.** Honest about the damage model, and it would
show that a rank 2 Tower hits one Piece rather than its whole footprint.
Rejected because it shows nothing about coverage — which is half of what #23
asks for — and because it needs the engine to surface targets.

**An engine-surfaced shot event**, e.g. `Tower.lastShotAtMs`. More explicit, and
it would extend to tracers later. Rejected because it adds a per-tick-changing
field that has to be kept out of `structuralKey` by hand — a fresh footgun for
the next person — and buys nothing the chosen design uses. A per-tick *flag*
instead would be lost outright when `advance()` runs five ticks per `emit()`,
which is exactly why `Towers.tsx` diffs snapshots for hits and deaths.

**A sweep scaled to `fireIntervalMs`**, so pulses never overlap. Covered in
decision 2.

**Reusing `CoveragePreview`'s teal.** One colour for every "this square is
covered" signal. Rejected because a firing pulse would then look identical to a
build preview, and the two can be on screen together.

## Out of scope

- **A muzzle flash or recoil on the Tower body.** `Towers.tsx` already flashes and
  squashes a Tower when it *takes* a hit; a similar flash when it *fires* would
  make the two unreadable. #23 asks for the arc, not the Tower.
- **A sharper per-Piece hit signal.** Pieces already scale with health. Adding a
  flash is a separate legibility question about Pieces, not about firing.
- **An idle "ready" indicator.** A Tower with nothing in range does not fire at
  all — `fireTowers` holds its cooldown at ready rather than banking shots — so
  there is no shot to show. Reach while nothing is in range remains
  `CoveragePreview`'s job.
- **Sound.** No audio exists in the project.
- **Tuning `PULSE_SQUARES_PER_SECOND` and `PULSE_FADE_MS`.** They are placeholders
  chosen to hold at the extremes, not values anything prices.
