# Piece Exit Legibility — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#12](https://github.com/braydend/cards-v-chess/issues/12)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Issue #12: "When a piece attacks the core, it currently just shows the piece
disappearing. We should change this to show the piece hitting the core, then
disappearing."

The disappearance is worse than the issue describes, in a way that shapes the
whole design. **A leaking Piece never occupies the Core's square.** `nextMove`
returns `{ kind: 'reachCore' }` the moment the Core is the square it would step
to, and `movePieces` in `src/game/tick.ts` breaks out of the hop loop and drops
the Piece from `survivors` without ever assigning that square. So the Piece
vanishes from wherever it was standing — for a slider, from across the board
mid-slide — and the Core takes its 1 damage in the same tick. Nothing moves,
nothing lands, nothing on the Core reacts: `src/scene/Core.tsx` has no hit
feedback at all, only a colour swap below 30% health.

Widening the frame slightly, **every way a Piece leaves `state.pieces` looks
identical from outside the engine**, and only one of the five is currently
legible:

| Exit | Where | Shown today |
| --- | --- | --- |
| Leak | `movePieces`, `reachedCore` | Piece vanishes |
| Tower kill | `fireTowers`, health ≤ 0 | Piece vanishes |
| Promotion | `movePieces`, `isPromoted` | Pawn vanishes, Queen appears |
| Joker Clear | `clearPieces` in `cardPlays.ts` | Whole board vanishes |
| `reset()` | fresh state | Whole board vanishes |

Towers already have the legibility Pieces lack — `Towers.tsx` darkens one as
health drops, flashes it on a hit, pulses it at critical health, and flares a
ghost as it dies. A Piece only scales with health (`0.55 + healthFraction *
0.45` in `Pieces.tsx`) and then pops out of existence.

So this covers all four *deliberate* exits rather than the leak alone. Fixing
the leak in isolation would leave three exits sharing one non-signal, and the
leak impact would have to be told apart from them anyway — the discrimination
work is the same either way.

## Decision

The engine records the exits it already knows about. The renderer classifies
each departed Piece from those records and plays one of four effects. No
presentation timing enters the engine, and no publish is added.

### 1. The engine records exit facts

Three additions to `src/game/`, all read only by the renderer:

```ts
/**
 * Why a Piece left `state.pieces`, for the renderer.
 *
 * A KILL IS THE ABSENCE OF A RECORD. Kills are unbounded within a round, so
 * logging them would be the wrong shape; leaks and promotions are both rare,
 * so recording them and inferring the rest is sound rather than heuristic —
 * see decision 2.
 */
export interface ExitRecord {
  /** The DEPARTING Piece's id — for a promotion, the Pawn's, not the Queen's. */
  readonly pieceId: string
  readonly typeId: PieceTypeId
  readonly reason: 'leak' | 'promotion'
  /** The square it left FROM. A leaking Piece never occupies the Core's square. */
  readonly from: Square
}
```

- **`GameState.recentExits: readonly ExitRecord[]`** — appended by `movePieces`'
  `reachedCore` and `isPromoted` branches. A **32-entry ring**: never cleared,
  oldest dropped on overflow.
- **`GameState.clears: number`** — monotonic, incremented by `clearPieces`.
- **`Piece.promoted: boolean`** — false at spawn, true only on a Queen minted by
  promotion. Never read by the engine, exactly the category `buffed` already
  occupies ("Renderer-facing", `types.ts`).

`leaks: number` is untouched: it is the HUD's stat and it is in `structuralKey`.
`recentExits` deliberately duplicates part of what it counts, because a count
cannot say *which* Piece or *from where*.

#### Why the ring is never cleared

The obvious lifetime — clear `recentExits` at `startRound`, so it holds only the
current round — **loses records, and loses them in the most important case.**

`tick` auto-starts by calling `step(state, { kind: 'startRound' })` from inside
itself, and `advance` runs up to `MAX_CATCHUP_STEPS` (5) ticks before calling
`emit` once. So within a single frame: tick 1 leaks, tick 3 ends the round, tick
4 auto-starts and wipes the record — all before the renderer sees a publish. The
Piece would then match no record and burst in place instead of lunging.

That is not an exotic ordering. It is the *last Piece leaks and thereby ends the
round* case: the most dramatic leak in a round, silently downgraded to the wrong
effect, and only with auto-start on, so it would read as an intermittent glitch.

A never-cleared ring is immune by construction. Lookup is by `pieceId`, unique
within a run (`nextEntityId` only ever rises), and `reset()` mints a fresh state
with an empty ring — so a stale record can never match a live Piece.

The ring costs nothing per tick. `tick` spreads `GameState` every tick, which
copies the array *reference*; a new array is allocated only on a leak or a
promotion. The cap exists to bound memory over an unbounded run, not to bound
per-tick work: total leaks in a run are bounded by `CORE_MAX_HEALTH` plus every
King ever played, and Kings arrive from packs, so a long enough run has no fixed
ceiling.

32 is chosen against the observation window rather than by feel. A publish
observes at most one frame of simulation, and overflowing the ring before the
renderer reads it would need 32 exits inside that frame — which needs 32 Pieces
simultaneously one hop from the Core, a board state that would have ended the
run several times over.

### 2. Kills are inferred, and the inference is sound

The renderer's rule for a Piece that has left the snapshot:

| Signal | Effect |
| --- | --- |
| Id in `recentExits` as `leak` | Leak impact, lunging from the record's `from` |
| Id in `recentExits` as `promotion` | Nothing — it was not killed |
| `clears` rose this diff | Board flash, and **every** burst this diff suppressed |
| `nextEntityId` went backwards | `reset()` — suppress everything, drop live ghosts |
| None of the above | Kill burst |

This is exhaustive, not a guess: the five exits in the Problem table are the only
ways a Piece leaves `state.pieces`, four are positively identified, so the fifth
is what remains. `startRound` does not clear `pieces` — survivors persist through
the gap into the next round — so there is no sixth, round-boundary case.

`clears` is genuinely needed and cannot be inferred from an empty `pieces` array:
killing the last Piece on the board also empties it, and that one *should* burst.

**`clears` is checked as a monotonic counter rather than a per-tick flag**, which
is what makes it safe against the five-ticks-per-`emit` gap that
`2026-08-06-tower-firing-animation-design.md` documents for engine events. Two
Clears between two reads report `+2` and draw one flash; a flag would report the
same thing as one Clear, or be lost entirely.

### 3. The renderer classifies from the snapshot, in a pure module

`src/scene/pieceExit.ts` — new, pure, no React and no three.js, following
`towerDiff.ts` down to mutating its bookkeeping in place. Driven from a
`useGameStore.subscribe` callback exactly as `diffTowers` is, so it runs **per
publish** and cannot miss one.

```ts
export interface PieceGhost {
  readonly id: string
  /** `ghost:${id}` — namespaced because `reset()` rewinds ids and a ghost outlives its Piece. */
  readonly meshKey: string
  readonly typeId: PieceTypeId
  readonly reason: 'leak' | 'kill'
  readonly file: number
  readonly boardRank: number
}

/** Last known position per live Piece id, plus the two counters. Mutated in place. */
export interface ExitTracker {
  readonly seen: Map<string, { typeId: PieceTypeId; file: number; boardRank: number }>
  lastClears: number
  lastEntityId: number
}

/** Reconciles `tracker` against a published snapshot. Seeds silently on first call. */
export function diffPieceExits(tracker: ExitTracker, snapshot: GameState): PieceGhost[]
```

A ghost carries its own square and `typeId` for the reason `Ghost` and
`FirePulse` both do: once the Piece leaves `GameState`, this record is the only
place the renderer still knows what it was or where it stood.

#### The accepted imprecision

A kill burst is drawn at the Piece's **last published** square, which can be one
hop behind where the player last saw it: the ghost's position comes from the
snapshot, but `Pieces.tsx` draws from live state via `getState()`, so a Piece
that hopped during the frame it died was drawn at the newer square.

The error is bounded at exactly one square and cannot compound. A frame advances
at most `FIXED_DT_MS * MAX_CATCHUP_STEPS` = 83.3ms of simulation, and the fastest
hop on the roster is a Pawn's 900ms cut to 630ms by `KING_SPEED_MULTIPLIER` —
so at most one hop fits inside a frame, whatever the frame rate.

Tracking live positions in `useFrame` instead would remove it, at the cost of a
second source of truth for where a Piece is. One square of offset on a 180ms
burst is not worth that, and a leak — where position actually matters, because
the lunge must start somewhere true — is exact already, since the engine records
`from` at the moment it happens.

#### Why `reset()` is detected instead of gating on phase

`diffTowers` gates fallen Towers on `phase === 'inProgress'`, so that `reset()`
from the defeated screen does not flare every Tower the player built. **That gate
would be wrong here**, because the leak that fells the Core sets `phase` to
`'defeated'` in the same tick it happens — the one leak that most needs to be
seen would be the one suppressed.

So this diff uses `nextEntityId` going backwards, the detector `FirePulses.tsx`
and `Towers.tsx` already use, and the only way that counter can move backwards
within a run. It is strictly more precise than a phase gate: it catches `reset()`
without ever suppressing a leak.

### 4. Every fade is scale-based, never opacity

A ghost shrinks out rather than fading out, and ghosts of a type share one opaque
material.

Per-ghost opacity — or per-ghost emissive brightness — needs a material instance
per ghost, allocated on death and disposed on expiry. `targetsPerShot` is
unbounded at rank 10 (`src/data/towerRanks.ts`), so a volley can kill an
arbitrary number of Pieces at once and that churn has no ceiling. Sharing one
emissive material instead would force every simultaneous burst into lockstep at
whatever age the last one set, which is wrong the moment two bursts overlap.

Scale is per-mesh, so it is immune to both: one shared material per type, no
allocation on death, and each ghost keeps its own timing. It also matches
`Towers.tsx`, whose death ghost already "flares and shrinks".

Ghosts render as plain meshes, not instances — `Pieces.tsx` renders one `<mesh>`
per Piece today, so there is no `limit`/`key` hazard of the Ace-wedge kind here.

### 5. The four effects

Every constant below is a **placeholder**, in the category of `HIT_FLASH_MS` and
`PULSE_FADE_MS`: renderer feel, not game data, and it lives beside the code that
reads it rather than in `src/data/`.

**Leak impact** — `LEAK_LUNGE_MS` 180, then `LEAK_BURST_MS` 70. The ghost lunges
from the record's `from` to the Core's square, easing *in* so it accelerates into
the hit rather than drifting, and the existing hop's `sin` arc is dropped — a
leak is a strike, not another hop. At contact it stamps the Core flash and scales
to zero over the remaining 70ms.

It must **survive the flip to `defeated`**, per decision 3. Nothing else is
needed for that: the ghost's timing lives in `PieceExits.tsx` and its `useFrame`,
both of which keep running after `tick` starts early-returning on the defeated
phase, and expiry is a per-ghost `setTimeout` as in `Towers.tsx`. The HUD flips
to "The Core has fallen." immediately, because it is snapshot-driven — there is
no scene-level defeat presentation to hold back, and adding one is out of scope.

**Core flash** — `CORE_FLASH_MS` 200. `Core.tsx` gains a material ref and a
`useFrame`; the colour maths goes in a pure, tested `coreFlash.ts`, mirroring
`towerColour.ts`. `GameScene` creates the shared `{ startedAt: number }` ref
(-1 idle, like `TowerAnimation.flashStartedAt`) and hands it to both `Core` and
`PieceExits`, which already sit side by side there.

The flash is stamped **at impact by the ghost**, not by watching `core.health`
drop. Health drops the instant the leak resolves, 180ms before anything arrives —
flashing then would show the Core reacting to a blow that has not landed, which
is the exact desync this whole design exists to remove. Two impacts in one frame
restamp one flash rather than summing; a doubled flash is not worth per-leak
bookkeeping on a 200ms effect.

**Kill burst** — `KILL_BURST_MS` 180, in place, scale 1 → 1.35 at 40% → 0.

**Promotion pop** — `PROMOTION_POP_MS` 300, scale ×1.5 peak with a small lift,
applied to the **live Queen's** mesh, not a ghost. `Pieces.tsx` already renders a
`PieceMesh` per snapshot Piece keyed on `piece.id`, so a promoted Queen mounts
fresh; the mesh stamps its own first-seen time and multiplies the existing
health-derived scale for 300ms. The vanished Pawn is silenced by its `promotion`
record, so the pair reads as an upgrade rather than a death plus an arrival.

`Piece.promoted` and the `promotion` exit record are both needed and are not
redundant: the record silences the departing Pawn, the flag pops the arriving
Queen, and they are different Pieces with different ids.

**Clear flash** — `CLEAR_FLASH_MS` 300, one uniform white contribution to every
square, decaying. It is summed into the additive per-square layer
`FirePulses.tsx` already draws, from its own pure `boardFlash.ts` rather than by
bending `firePulse.ts`, whose entire contract is about shots. That component is
already the right host: it reads live state in `useFrame`, subscribes to nothing,
and its `nextEntityId`-backwards branch is where `lastClears` resets. Its
`visible` toggle becomes "a pulse or a flash is live", and its doc comment stops
being only about firing.

A second full-board additive layer would be cleaner naming and twice the
instances, permanently, for the rarest effect of the four. Packs deal Jokers —
`tierOf` in `src/data/packs.ts` ranks `'joker'` as `scarce` — so a run is not
capped at the standard deck's two, but a Clear is still the least frequent thing
on screen by a wide margin.

### 6. Where the code goes

| File | Change |
| --- | --- |
| `src/game/types.ts` | `ExitRecord`; `recentExits` and `clears` on `GameState`; `promoted` on `Piece` |
| `src/game/index.ts` | export `ExitRecord`, so `src/scene/` can name it without tripping the inbound lint |
| `src/game/state.ts` | `recentExits: []`, `clears: 0` |
| `src/game/tick.ts` | append on `reachedCore` and `isPromoted`; `promoted` on both mint sites |
| `src/game/cardPlays.ts` | `clears + 1` in `clearPieces` |
| `src/game/fixtures.ts` | `promoted: false` in `pieceAt` |
| `src/scene/pieceGeometry.ts` | new — `GEOMETRY_BY_TYPE` and `REST_Y_BY_TYPE`, lifted out of `Pieces.tsx` |
| `src/scene/pieceExit.ts` | new — decision 3 |
| `src/scene/coreFlash.ts` | new — decision 5 |
| `src/scene/boardFlash.ts` | new — decision 5 |
| `src/scene/PieceExits.tsx` | new — ghosts, plumbing only |
| `src/scene/Pieces.tsx` | promotion pop; imports the lifted tables |
| `src/scene/Core.tsx` | material ref, `useFrame`, flash ref prop |
| `src/scene/GameScene.tsx` | owns the flash ref; mounts `PieceExits` |
| `src/scene/FirePulses.tsx` | sums the board flash |

`PieceExits.tsx` is deliberately **not** folded into `Pieces.tsx`. `Pieces.tsx`
is 192 lines doing one job — draw and interpolate the live roster — and ghosts
are a second: a different lifetime, a different diff source (the store
subscription, not `getState()`), and their own React state and timers. CLAUDE.md's
"a file that has grown large is usually doing more than one job" applies before
the fact as well as after.

Each component builds its own geometries and materials from the shared factory
table and disposes them on unmount, as `Pieces.tsx` already does. Six extra
low-poly geometries is not worth a sharing mechanism.

**`structuralKey` is untouched.** Every exit already changes it through some
other field — a leak moves `leaks`, `core.health` and the pieces string; a kill
and a promotion move the pieces string; a Clear empties it and removes the
consumed Joker from the Deck's id list. So `recentExits` and `clears` need no
entry, and **this design adds zero publishes**: `simulation.test.ts`'s bound of
60 per 600 frames is unaffected.

## Testing

`src/scene/` is excluded from coverage thresholds in `vite.config.ts`, but
`towerDiff.ts`, `firePulse.ts`, `towerColour.ts` and `boardClick.ts` all carry
tests regardless. The three new pure modules follow that precedent and need no
new threshold entry. `src/game/` additions are measured.

`Piece` gains a required field rather than an optional one, following `hunting`'s
stated reasoning — "kept false rather than omitted so every Piece has the same
shape". The cost is `promoted: false` at eight literal construction sites: two in
`tick.ts`, one in `fixtures.ts`, and five across `auras.test.ts`,
`promotion.test.ts`, `termination.test.ts` and `tick.test.ts` (two there). All
mechanical, and `tsc` finds every one. `movement.test.ts` also builds a literal
with `hunting: false` and needs no change — that one is a `MoveRequest`, not a
`Piece`.

**The load-bearing tests drive the real engine**, because the whole design rests
on readings of `movePieces` and `clearPieces` rather than on hand-built state.

Engine (`tick.test.ts`, `cardPlays.test.ts`, `promotion.test.ts`):

- a leak appends one record carrying the leaker's id and typeId, and `from` is
  the square it left — **not** the Core's square
- a slider leaking mid-slide records the square it actually stopped on
- a promotion appends a `promotion` record for the Pawn, and the minted Queen
  carries `promoted: true`
- a spawned Piece has `promoted: false`, and a survivor keeps its flag across ticks
- a Tower kill appends nothing
- `clearPieces` increments `clears` and appends nothing
- the ring drops the oldest past 32 and keeps the newest
- `leaks` still counts what it counted

`state/structuralKey.test.ts`:

- a state differing only in `recentExits` or `clears` produces the same key,
  pinning the zero-new-publishes claim

`pieceExit.test.ts`:

- the first call seeds the tracker and returns nothing, as `diffTowers` does
- a vanished Piece recorded as `leak` yields a leak ghost at the record's `from`
- a vanished Piece recorded as `promotion` yields no ghost
- an unrecorded vanished Piece yields a kill ghost at its last published square
- a risen `clears` suppresses every ghost in that diff
- `nextEntityId` going backwards suppresses everything and reseeds
- a leak on the tick the Core falls still yields a ghost, with `phase` `'defeated'`
- a ghost's `meshKey` is namespaced, so a reused id after `reset()` cannot collide

`coreFlash.test.ts`:

- an idle flash returns the base colour exactly
- a flash decays back to the base colour over `CORE_FLASH_MS`
- the 30% critical threshold still holds underneath a flash

`boardFlash.test.ts`:

- a live flash contributes uniformly to every square
- it decays to zero at `CLEAR_FLASH_MS`
- it sums with fire pulses rather than replacing them
- it writes nothing outside the buffer, at any board size

## Rejected alternatives

**The renderer infers which Piece leaked, with no engine change.** Diff the
snapshot, and when `leaks` rises re-run the engine's own `nextMove` from each
vanished Piece's last square to find the one that was about to reach the Core.
Rejected on two reachable failures. A Piece killed on the same tick another leaks
is a coin flip. Worse, `advance` emits once per frame after up to 5 ticks, so a
Piece can leak from a square the renderer never observed — the lunge would start
from a stale square, and nothing could detect that it had. Recording the fact
where it happens costs three small fields and is exact.

**The engine keeps exiting Pieces alive for the animation's duration**, e.g.
`Piece.exiting: { reason, msRemaining }`. Rejected: it puts presentation timing
inside the pure engine, and `stillActive`, `selectTargets`, `buffedPieceIds` and
`movePieces` would each have to learn to skip these Pieces. That is real risk to
the round-termination invariant in exchange for nothing decision 1 does not
already provide.

**Clearing `recentExits` at `startRound`.** Covered in decision 1: auto-start
runs inside `tick`, so the clear can land in the same frame as the leak and
before the only publish.

**Logging kills alongside leaks**, for a fully explicit classification. Rejected
because kills are unbounded within a round while leaks and promotions are rare,
so the two want different shapes; and the inference that replaces the log is
exhaustive rather than heuristic (decision 2).

**Driving the Core flash from `core.health` decreasing.** Simpler — no shared ref
— and it needs no cooperation from the ghost. Rejected because health drops when
the leak resolves, 180ms before the ghost arrives, so the Core would flinch
before it was struck.

**Opacity fades with a material per ghost.** Rejected in decision 4: rank 10's
unbounded `targetsPerShot` puts no ceiling on the allocation, and the shared
alternative forces simultaneous bursts into lockstep.

**Per-Piece bursts for a Joker's Clear.** Considered and rejected in favour of one
board-wide flash, so a burst keeps meaning "a Tower did that" and the rarest card
in the Deck gets its own signal rather than fifteen copies of a common one.

**A second additive full-board layer for the Clear flash.** Cleaner naming than
extending `FirePulses.tsx`; rejected for doubling the permanent instance count to
serve an effect that fires at most twice a run.

**Growing `Pieces.tsx` to hold the ghosts.** Rejected in decision 6.

## Out of scope

- **Core recoil, shake, or an in-scene health readout.** The Core's reaction is a
  flash. A recoil competes with the impact for the same 200ms, and a numeric
  readout needs an in-scene text dependency `src/scene/` does not have.
- **A scene-level defeat presentation.** Defeat is HUD text and a "Play again"
  button today. The leak impact surviving the phase flip is all issue #12 needs;
  a defeat sequence is its own piece of work.
- **Instancing Pieces or ghosts.** `Pieces.tsx` renders a mesh per Piece today.
  Converting the roster to instances is a real improvement and an unrelated one —
  and it would pull the Ace-wedge `limit`/`key` hazard into both files.
- **Sound.** No audio exists in the project.
- **Tuning the six timing constants.** Placeholders, chosen to read at the
  extremes, not values anything prices.
- **The shadow-frustum band on a grown board.** A known, cosmetic, unrelated
  problem in `GameScene.tsx`, recorded in CLAUDE.md; touching `GameScene` here
  does not adopt it.
