# Yellow Coverage Avoidance — Design

**Date:** 2026-08-08
**Status:** Agreed

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Issue #50 asks to make yellow Pieces smarter. Yellow already hunts the Core
from its first on-board hop. The ask: while hunting, yellow should also
**avoid landing on tiles the Towers can hit**, pathing toward the Core on the
safest available line.

The change is a direct inversion of the "fields never see Towers / no mazing"
invariant. Today the hunting fields are computed on an empty board, so Tower
placement cannot change which square a hunting Piece is aiming for, and a
blocked Piece grinds rather than trying another line. Red's Tower-seek is the
one deliberate carve-out: its fields are Tower-blind as geometry, but *seeded*
at Towers, letting placement attract a red Piece. Yellow's avoidance is the
mirror: placement *repels* yellow from a Tower's reachable footprint while it
closes on the Core. Both are deliberate, and both are documented as carve-outs.

## Decision

**Yellow-only, soft preference, occlusion-aware, landing-square only.**

- **Scope: yellow only.** Avoidance rides on the existing yellow hunt (non-Pawns;
  yellow Pawns still march and promote, and the promoted Queen inherits yellow —
  and thus hunts and avoids from spawn). Green Pieces that start hunting late stay
  dumb; red and black are untouched.
- **Footprint: occlusion-aware `reachableSquares`.** The avoid set is the union,
  over every Tower, of `reachableSquares(board, geometry, range, tower.square,
  blockers)` — exactly the footprint the firing overlays draw and a shot would
  actually land on. A Tile hidden behind another Tower is not avoided. The Wall
  contributes nothing (`geometry: 'none'` → empty footprint). Aura Towers
  (Amplifier, Freezer) contribute their firing footprint, which is also where
  their aura applies.
- **Soft preference, not hard avoidance.** Direction still comes from the
  Tower-blind distance field, and a hunting Piece still only ever lands on a
  `d−1` candidate, so distance strictly decreases every hop and the BFS
  termination argument — every Piece reaches the Core or dies — holds unchanged.
  Among the `d−1` candidates in the fixed scan order, yellow prefers the first
  that is not in the avoid set; if every `d−1` square is covered, it falls back
  to today's first-candidate behaviour. Avoidance never strands a Piece.
- **Landing square only.** The engine records a Piece's square once per hop and
  Towers fire between hops, so a slide's intermediate squares are positions no
  shot can reach. A slider picks a direction whose closer square (the slide cap)
  is uncovered; it may cross covered squares mid-slide.
- **The Core is never avoided.** A `d−1` candidate equal to the target — the
  Core, or a colour-locked Bishop's pre-Core target — always wins, even if a
  Tower's footprint covers it. Reaching the Core is the objective, not a hazard
  to dodge.
- **Tower-blocking candidates still grind.** A `d−1` candidate that is a Tower
  commits immediately, in fixed order, exactly as today. Yellow avoids *fire*,
  never *obstacles*: the anti-mazing invariant holds for blockers. A yellow
  Piece still grinds a wall rather than routing around it.

## Architecture

### Engine (`src/game/`)

- **`coverage.ts`**: a new `hittableSquares(board, towers): ReadonlySet<string>`
  — the union of `reachableSquares` across the Tower list, keyed by `squareKey`.
  This is the only new reachable-footprint code; the firing footprint and the
  avoidance footprint cannot drift because both come from `reachableSquares`.
  It lives beside `reachableSquares` so that overlap claim is visible next to
  the code that makes it true.
- **`movement.ts`**: `nextMove` gains an `avoid: ReadonlySet<string>` parameter —
  a tick-level context value (like `board` and `towerBySquare`), not per-Piece
  state, so it does **not** go on `MoveRequest`. It is threaded into
  `huntByOffsets` and `huntByField`, gated on `request.tier === 'yellow'`; the
  red Tower-seek and the green/march paths pass an empty set and behave
  identically. Both hunt functions scan the fixed order twice: the first pass
  prefers a `d−1` candidate not in `avoid` (Core and blocker candidates still
  commit in the first pass, in order); the second pass is today's logic
  unchanged. The distance-field cache in `distanceFields.ts` is untouched.
- **`tick.ts`**: `movePieces` computes `hittableSquares(board,
  [...towerBySquare.values()])` once per tick, before the Piece loop, and hands
  it to each `nextMove` call. `isStuck` passes an empty set: soft preference
  never changes a `stuck`/not-`stuck` outcome, so the termination check stays
  cheap.
- **`types.ts` / `data/`**: no new fields, no new tier flags. Avoidance is
  implicit in `tier === 'yellow'` plus the hunt already being live.

### State bridge (`src/state/`)

- **`structuralKey.ts`**: no change. The avoid set is derived from Towers
  already in the key, and the landing square a Piece moves to is already
  published.

### Renderer (`src/scene/`)

No change. Yellow Pieces keep their existing tier ring; no new visual is needed
for an internal pathing preference.

## Invariants affected

- **"The fields never see Towers"** gains a second carve-out, recorded in
  `game-design.md` beside the red one: the fields stay Tower-blind as *geometry*
  — a Tower is never an obstacle in them — but yellow's *choice among
  equal-distance candidates* is steered by the reachable footprint. Placement
  repels yellow; placement attracts red. Both are deliberate inversions of the
  no-mazing invariant, and both require the player to spend a Card.
- **"Pieces are forward-biased and deterministic"** keeps its meaning: direction
  still comes from the Tower-blind field, the fixed scan order, and the Piece's
  own carried state. The avoid set is a deterministic function of the Tower list
  and board, so seeded runs stay reproducible.
- **Round termination** is untouched: every hop still lands on a `d−1` square,
  so distance strictly decreases and every Piece still reaches the Core or dies.

## Testing

- `coverage.test.ts`: `hittableSquares` is the union of `reachableSquares`;
  occlusion-aware (a Tile behind another Tower is not in the set); the Wall
  contributes nothing.
- `movement.test.ts`: a yellow Knight / slider / King prefers an uncovered `d−1`
  candidate; falls back to today's first candidate when every `d−1` square is
  covered; never dodges the Core (or a colour-locked Bishop's pre-Core target);
  a green late-hunt Piece does not avoid; a Tower-blocking `d−1` candidate is
  still ground, not routed around (anti-mazing pinned); a red Piece's Tower-seek
  is unchanged.
- `tick.test.ts`: `movePieces` computes the set once per tick; a round in which
  every path to the Core is covered still terminates.

## Open questions

None. Scope is pinned by the issue and this decision: yellow only, soft
preference, occlusion-aware, landing-square only. Tuning questions that arise in
play — whether yellow is now *too* evasive against sparse coverage — are balance
decisions for later, not design decisions here.
