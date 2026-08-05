# Chess Piece Roster — Design

**Date:** 2026-08-05
**Issue:** [#3 — implement the other chess pieces](https://github.com/braydend/cards-v-chess/issues/3)
**Status:** Agreed, not implemented

A frozen decision record. It explains *why* the roster works the way it does and
what was rejected. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

Only the placeholder Pawn exists. `PieceTypeId` is the single-member union
`'pawn'`, `movement.ts` has one resolver, and `roundSpec` spawns nothing else.
The roster — Knight, Bishop, Rook, Queen, King — is designed in prose but has no
code.

Implementing it was blocked by an open question the design doc flagged as
blocking three of the five Pieces:

> **How far do sliding Pieces move?** Blocks Bishop, Rook, and Queen. In chess
> these slide any distance along a line, which here would carry them most of the
> way to the Core in a single move.

Resolving that surfaced four more decisions, all settled below.

## Decisions

### Sliding distance: base 1, raised only by a King

Bishop, Rook, and Queen move **one square per hop**, exactly like the Pawn,
**+1 while adjacent to a King**.

Rejected: full chess slide (a Rook reaches the Core in one hop — the doc's own
note calls this unplayable); a fixed per-type cap (a Piece skips over covered
squares between ticks, so Tower coverage stops being reliable); long slides on a
slow cadence (same skipping problem, dressed differently).

Rejected as the scaling source: a ramp on round number. It is invisible — the
player has no on-board cue for why sliders suddenly got faster — and it adds a
balance knob that interacts with every other value. Round difficulty comes from
spawn counts and piece mix instead.

Tying the increase to the King instead does three things at once: the player can
*see* the cause, can *answer* it by killing the King, and it finally defines what
"buffs adjacent Pieces" means — previously undesigned.

### Direction: forward-biased and deterministic

Every Piece travels down-board, rank 7 toward rank 0, as the Pawn already does
(`FORWARD = -1`). Direction is a pure function of Piece type and state. No PRNG.

**This does not violate the no-goal-seeking invariant.** Moving down-board is
not the same as moving toward the Core: a Rook on file 2 still never threatens a
Core on file 4. What the invariant forbids is *choosing a line because the Core
is on it*, and nothing here does that.

Rejected: a direction dealt from a seeded PRNG at spawn. It is the most
chess-faithful, but `GameState` has no PRNG field today and **PRNG streams** is
itself an unresolved open question — so it would drag a second design decision
into this work. It also worsens stranding, since sliders dealt a sideways or
backward line never threaten anything.

Rejected outright: moving along whichever line holds a Tower or the Core. That
is goal-seeking, and it means Tower placement steers Pieces — mazing, which
`game-design.md` explicitly rejects ("the player can *wall*, but cannot *herd*").

### The Knight loses colour-vulnerability

**The Knight is damageable on every square.** Its movement is its whole
identity.

This reverses `game-design.md`, which had the Knight damageable only on light
squares. Three consequences, all of which land in this change:

1. **Square colour stops being mechanically load-bearing.** It was an invariant
   in `CLAUDE.md` and the stated argument for keeping a literal 8×8 board in the
   **Board geometry** open question. Colour becomes decoration; the board stays
   8×8 for chess-authenticity alone.
2. **The rank-5 rationale dies.** The doc justified rank 5 being diagonal
   because "diagonals preserve square colour… which is exactly the Knight's
   vulnerability window". With no window, rank 5 is diagonal because it is
   diagonal. The rank ladder is unchanged; only its stated reasoning was.
3. **The Knight's counter changes** from "coverage of the right colour at the
   right moment" to "coverage that can catch an L-hop" — which line geometries
   are famously bad at. Still a real threat, a different one.

The Knight zig-zags: it alternates `(file−1, rank−2)` and `(file+1, rank−2)`,
with which side it starts on set at spawn so Knights weave opposite ways. It
advances two ranks per hop and never sits still long enough for a vertical or
horizontal Tower to land repeat shots.

Rejected: always taking the same L-hop (a Knight becomes a diagonal Pawn on
rails, undercutting the point of making movement its identity); a seeded random
hop (needs the PRNG that does not exist).

### Lateral fallback, and what it costs

When forward is off-board, **sliders and the King move sideways along their
rank**, reflecting at file 0. This is required, not decorative: without it a
Pawn promoting on rank 0 becomes a Queen whose forward move is off-board —
instantly stuck, so promotion would achieve nothing.

**Knights are the exception and strand.** Every Knight move from rank 0 goes
backwards. A Knight bouncing back up the board could always act, so
`stillActive` would never go false and **the round would hang forever**. Round
termination is why this exception exists.

Two consequences, accepted deliberately:

- **The Core is at `(3, 0)`, so anything sweeping rank 0 reaches file 3 within
  ~8 hops and leaks.** Every non-Knight either leaks or dies, which is what
  keeps rounds terminating. It also means promoted Queens *will* reach the Core
  unless killed — promotion becomes genuinely frightening, as intended.
- **This resolves the "Core is hard to reach" open question in the harshest
  direction.** Previously only three of eight files threatened the Core at all.
  Now rank-0 coverage is mandatory. This is a real difficulty increase and was
  accepted with eyes open.

### Promotion happens on the back rank

`game-design.md` contradicted itself. The roster table said the Pawn "promotes
to a Queen **if it survives long enough**" — a timer. The Movement section said
"in chess a pawn promotes on reaching the far rank, and here the back rank is
exactly where they pile up" — a position.

**Settled: position.** A Pawn reaching rank 0 becomes a Queen at full Queen
health. This is chess-exact and it converts the stranded-Pawn pile-up from
visible clutter into the threat, which is what the Movement section was reaching
for. The timer framing is removed from the doc.

Rejected: a timer. It promotes mid-board with room to move, but it decouples
promotion from the pile-up it was meant to answer — Pawns would still sit inert
on rank 0 until their timer happened to fire. Rejected: both triggers, where the
timer is largely redundant once the back rank promotes.

### The Rook's armour is just health

**No armour stat, no damage reduction, nothing new in the damage path.** The
Rook is slow and very tough.

The doc lists the Rook's counter as "piercing or sustained damage", but
`coverage.ts` states plainly that "piercing and blocking are not part of the
design", so only the sustained half exists. High health satisfies it.

Rejected: flat damage reduction. Only four ranks are buildable and they deal 1,
1, 2, 3 — so armour 1 would make ranks 2 **and** 3 literally useless against
Rooks, a hard counter to half the pool. Rejected: percentage reduction, which on
integer damage of 1–3 rounds badly and amounts to doubling health with extra
code.

### The Bishop heals an aura, never itself

Every *other* Piece within Chebyshev distance 2, on a fixed cadence, capped at
the target's max health.

An aura catches the cluster the Bishop travels with, which is what "sustains the
wave" means in practice, and the player can see damaged Pieces near it
recovering.

Excluding itself is deliberate: the designed counter is "kill it first", and a
self-healing Bishop blunts exactly that. It would also risk the unkillable-wall
failure mode the doc already worries about for repaired Towers.

Rejected: healing along its diagonals. This is thematic ("Bishop: diagonals,
thematically a cleric") and would reuse `coversSquare('diagonal', range)`, which
the codebase already speaks. But everything else travels down files, so the beam
would almost never catch anything — a Bishop that heals nobody. Rejected:
single-target healing, the least legible option.

### The King buffs movement, universally

Pieces at Chebyshev distance 1 get a shorter move interval; Bishop, Rook, and
Queen additionally get +1 slide. Never itself.

Two effects, but one idea — *move more* — applied to whatever each Piece has.
Making it universal matters: a slider-only buff leaves a King escorting Pawns
completely inert, which sits badly against "buffs adjacent Pieces" and makes the
King's threat depend entirely on round composition.

Rejected: a damage-and-toughness aura. Arguably better commander flavour, but it
drops the slide scaling, leaving sliders permanently at one square.

### Progressive round introduction

One new type unlocks every couple of rounds: Pawn from 1, Knight 3, Bishop 5,
Rook 7, Queen 9, King 11. Counts scale as they already do and the generator stays
deterministic.

The player meets one threat at a time and learns its counter before the next
arrives. Rejected: all types weighted from round 1, which can hand the player a
Queen before they own a single Tower.

## Movement summary

| Piece | Forward move |
| --- | --- |
| **Pawn** | One square down its file; captures the Core diagonally *(unchanged)* |
| **Knight** | Zig-zag L-hop, `(file−1, rank−2)` / `(file+1, rank−2)`, handedness set at spawn, mirrored at file edges |
| **Bishop** | Forward diagonal, reflecting off the side edges — which keeps it on its colour, as in chess |
| **Rook** | Straight down its file |
| **Queen** | Alternates straight-forward and forward-diagonal, the diagonal side given by `handedness` — the only Piece that both advances *and* changes files under her own steam. This is the "flexible" in her roster entry |
| **King** | One square straight forward |

`handedness` is `+1` or `−1`, set at spawn from the parity of the assigned
entity id, so consecutively spawned Pieces weave opposite ways. It drives both
the Knight's zig-zag and the Queen's diagonal.

A slide of N resolves as **N single-square steps** along the committed line,
stopping early on a Tower (which it attacks) or the Core (which it leaks into).
A slide can never jump over a Tower, so blocking still works and the
no-pathfinding invariant holds.

**Lateral fallback direction** is toward file 0, reflecting at file 0 to travel
back up the files. This guarantees a sweeping Piece crosses file 3 — the Core's
file — within eight hops from anywhere on the rank, which is what makes rounds
terminate. The direction is fixed, not chosen: picking the side the Core happens
to be on would be goal-seeking.

**Neither aura stacks.** Adjacency to two Kings buffs exactly as much as one.
Multiple Bishops *do* each heal independently, since they are separate sources
rather than one effect applied twice.

## Placeholder balance

Tuning, not design. The Pawn row is unchanged from the existing placeholder.

| Piece | `moveIntervalMs` | `maxHealth` | `attackDamage` | Note |
| --- | --- | --- | --- | --- |
| Pawn | 900 | 3 | 2 | unchanged |
| Knight | 1100 | 4 | 2 | slower cadence offsets two ranks per hop |
| Bishop | 1000 | 5 | 1 | feeble attacker; healing is the job |
| Rook | 1600 | 14 | 4 | high health *is* the armour |
| Queen | 1000 | 9 | 5 | elite |
| King | 1800 | 12 | 3 | slow, tough, commander |

Bishop heal: 2 health every 1500 ms, radius 2. King buff: move interval × 0.7,
radius 1.

## Implementation notes

**Aura evaluation order.** Both auras are computed once per tick from the state
at tick start, before any Piece moves, and passed into movement as a lookup.
This keeps the outcome independent of the order Pieces are processed in — the
same discipline `tick.ts` already applies to `towerBySquare`.

**Promotion must mint a new entity id.** `structuralKey` tracks
`id@file,rank:health` per Piece and does **not** include `typeId`. Mutating a
Pawn's type in place would leave the renderer drawing a Pawn forever. Consuming
the Pawn and spawning a Queen with a fresh id makes it a clean unmount/mount.

**New `Piece` fields:** `moveCount` and `handedness`, driving the Knight's
zig-zag and the Queen's alternation. `structuralKey` is an allowlist, so neither
is included by default — which is correct, and must stay that way. Adding
`moveCount` to that key would push a React render on every hop and destroy the
measured 28-publishes-per-600-frames property that
`src/state/simulation.test.ts` guards.

**`nextMove` signature widens** to take the per-tick slide-bonus lookup.

**Rendering.** One shared geometry and material *per type* via `useMemo`, with
distinct low-poly silhouettes. Bishop and King get their own colour, both being
priority targets. Pieces under an aura get an emissive tint applied by mutation
inside `useFrame` — no state, no allocation, per `CLAUDE.md`.

## Testing

Engine-level, no browser. Per-type movement including edge reflection; slide
blocking against Towers; both auras; promotion minting a new id.

**Most important: a round-termination test per Piece type.** The lateral
fallback is what stops rounds hanging, and the Knight's stranding exception
exists solely to protect it. That property is load-bearing and easy to break.

## Documentation changes

`docs/design/game-design.md`:

- Remove the Knight's colour-vulnerability; restate its threat as movement.
- Rewrite the rank-5 rationale, which depended on that vulnerability.
- Fix the promotion contradiction in favour of the back-rank trigger.
- Resolve and remove two open questions: **How far do sliding Pieces move?** and
  **The Core is hard to reach**.
- Narrow, do not remove, **Stranded Pieces**. Pawns promote and everything else
  sweeps laterally, but **Knights still strand on rank 0** and that is
  deliberate — see the lateral-fallback decision. The remaining question is
  whether stranded Knights want an answer of their own.
- Update **Board geometry**, whose argument for a literal 8×8 was that square
  colour is load-bearing.

`CLAUDE.md`:

- Drop the "square colour is mechanically load-bearing" invariant.
- Add the forward-bias and lateral-fallback rules as invariants, including why
  Knights strand.
- Update the "what does not exist yet" section.

## Deliberately not in scope

- Ranks 6–10, face cards, Aces, Jokers — still undesigned.
- Any card, Ink, pack, or Deck mechanic.
- A seeded PRNG in `GameState`. Every decision here is deterministic without
  one, leaving **PRNG streams** open for whoever needs it first.
- Piercing, armour, or any change to the damage path.
