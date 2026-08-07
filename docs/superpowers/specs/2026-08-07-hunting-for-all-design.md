# Hunting for All — Design

**Date:** 2026-08-07
**Status:** Agreed
**Supersedes part of:** [`2026-08-06-hunting-knights-design.md`](2026-08-06-hunting-knights-design.md), specifically its "not in scope" decision to leave the other five Piece types unchanged, and the Lateral fallback section of [`game-design.md`](../../design/game-design.md).

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

When a slider or the King runs out of forward board, it sweeps sideways along
the back rank, reflecting off the file edges. Two costs come with it (issue #13):

- **It looks odd.** Pieces march to the far corner of the board and pace there,
  rather than pressing the defence they were invoked against.
- **It breaks the Bishop.** A sideways step changes square colour, so a Bishop
  sweeping the back rank violates the one property that defines it — a Bishop
  stays on its own colour.

Knights already have a better answer: once their forward hops run out they
hunt the Core, guided by a distance field. This design extends that answer to
the remaining four types — Bishop, Rook, Queen, and King — and deletes the
lateral sweep entirely. Pawns keep promoting; they never sweep.

## Decision

**When a Bishop, Rook, Queen, or King's forward move would leave the board, it
latches into hunting the Core, moving by its own chess movement the rest of the
way.** Direction comes from a per-type distance field, exactly as the Knight's
does. Two properties carry over unchanged from the Knight's design — the state
latches, and the field never sees Towers. The third, convergence by strictly
decreasing distance, keeps its shape — structural, not hoped for — but sliders
argue it in two levels; see Hunt movement per type, below.

### The trigger is the sweep's old trigger

Hunting begins at exactly the moment the lateral fallback began: when the
Piece's forward move would leave the board. For all four types that is rank 0.
The Queen hunts regardless of which line — rook's or bishop's — her next hop
would have used.

### The hunting state latches

`hunting: boolean` on the Piece extends from Knight-only to all five hunting
types. It is set the moment hunting starts and never cleared.

The latch is load-bearing for the Bishop, for the same shape of reason as the
Knight: a same-colour Bishop's first hunting hop goes *away* from rank 0, up to
the diagonal intersection that routes it back down to the Core. At that
intersection it has a legal forward diagonal again; unlatched, it would revert
to forward marching, reach rank 0 elsewhere, hunt again, and oscillate forever.

### Direction comes from per-type distance fields

`knightDistance.ts` generalises into one module of per-type BFS distance
fields — rook, bishop, king, and queen — built over each type's move offsets.
Each field is seeded at a target square — the Core, except for the
colour-locked Bishop's field, below — and cached per board, seed square, and
type. All four move sets are symmetric — every move is its own inverse — so
one BFS from the seed covers the whole board for each type, exactly as knight
moves do.

Field values count *moves*, not squares: a Rook or Queen slide of any length is
one move. Rook and Queen fields hold 0, 1, or 2; the Bishop field holds 0, 1,
or 2 for squares of the Core's colour and nothing at all for the opposite
colour; the King field is Chebyshev distance.

The fields never see Towers, for the same reason the knight field does: Tower
placement must not be able to redirect a hunting Piece. A hunting Piece blocked
by a Tower grinds it, exactly as every other blocked Piece does — it never
tries a different square. The player can wall a hunting Piece; the player still
cannot herd one.

### Hunt movement per type

- **King.** Steps onto the first of its eight neighbours, in a fixed offset
  order, whose field distance is exactly one less — the same shape as the
  Knight's `huntCore`.
- **Sliders — Rook, Bishop, Queen.** Pick the first direction, in a fixed
  order, whose line reaches a square one field-move closer, then slide along
  it with the existing `travel()` semantics: one square at a time, one
  committed line, a Tower on the line is attacked, the Core on the line is
  leaked into. The slide advances at most `1 + slideBonus` squares (the King's
  aura still applies while hunting), and it also **stops early the moment the
  field distance drops** — that square is the phase target, the intersection
  square at distance 2→1 or the Core at 1→0. Without that cap a long slide
  could pass straight through the target and land beyond it, still at distance
  2, and overshoots like that are exactly the oscillation the latch exists to
  prevent. A slide is one field-move regardless of its length, so a short slide
  may fall short of the target; convergence is therefore argued in two levels.
  Field distance strictly decreases between phases (2→1→0). Within a phase,
  every hop advances along a shortest-path line toward that phase's target —
  arriving on it, exhausting the slide count en route, or grinding the Tower
  blocking the line, still acting and never rerouting. The walk's arrival from
  every square is pinned exhaustively by tests, the same way the Knight's
  "strictly decreases" test pins his. The Queen hunts with full queen
  movement; her rook/bishop alternation is forward-march behaviour only.
- **Colour-locked Bishop.** If the Core sits on a colour the Bishop can never
  reach, the Core's field does not cover the Bishop at all. It instead follows
  a bishop field seeded at the square directly *behind* the Core —
  `(core.file, core.rank + 1)` — which is always the opposite colour from the
  Core and therefore always on the Bishop's colour. On arrival the Core is
  directly in front, and each move interval the Bishop attacks the square
  directly ahead at `attackDamage × BLOCKED_ATTACK_MULTIPLIER` — half damage,
  the same multiplier every blocked Piece uses — hitting whatever occupies it.
  In practice that is always the Core: the square ahead is the Core's own
  square, which no Tower can occupy, and any Tower on the approach path is
  ground down by the usual blocking rule before the Bishop arrives. The rule is
  nonetheless "attack whatever is ahead", so the two cases stay one code path.
  The attack is an attack, not a leak: the Bishop stays where it stands, and
  the leaks counter does not count it. Core health can therefore go
  fractional; the HUD shows `Math.ceil`.

## Invariant change

`game-design.md` and `CLAUDE.md` state that Knights hunt and nothing else does,
and that sliders and the King sweep laterally at the board's end. Both are
rewritten: hunting is now the universal answer to running out of board, and the
lateral sweep is gone.

The reason the no-goal-seeking rule existed still holds. Its stated fear is
mazing — Tower placement steering Pieces — and mazing needs routing *around*
Towers. Nothing here routes around anything: every field is Tower-blind and a
blocked hunting Piece grinds. **The "no pathfinding" invariant is untouched.**
What changes is the source of a Piece's direction once forward motion runs out,
now for every type instead of just the Knight.

## Consequences, accepted

- **Every Piece now converges on the Core** unless killed. The lateral sweep
  already got sliders and the King there eventually — they crossed the Core's
  file while pacing the back rank — but by a long, visible detour. Hunting goes
  straight.
- **The Bishop keeps its colour.** Its hunt is diagonal-only; the colour-lock
  exception attacks from a distance rather than ever stepping onto a wrong
  colour.
- **A colour-locked Bishop is a slow siege, not a leak.** At 0.5 Core damage
  per move interval it is the weakest threat on the roster, but it is a threat
  that never stops, and several of them stack. It is acting the whole time, so
  a round with one still standing cannot end early either.
- **Core health can go fractional**, from the Bishop's half-damage attacks.
  Displayed rounded up; kept fractional underneath rather than inventing a
  rounding rule for damage.

## Rejected alternatives

- **Rank-0 geometry.** Hunting always starts on rank 0, so each type's route to
  the Core could be hardcoded: slide along the rank toward the Core's file,
  Bishop via a closed-form diagonal intersection. Less code than four BFS
  fields, but it bakes "the Core sits on rank 0" into several movement rules,
  the intersection math needs its own deterministic tie-breaks to stay total,
  and it leaves two divergent hunting mechanisms — the Knight's field and the
  geometry — for one behaviour.
- **Fix the Bishop only.** Keep the sweep for Rook, Queen, and King and give
  only the Bishop a hunt, since only the Bishop's sweep breaks a chess
  property. Rejected because the sweep looks odd for every type, and the issue
  asks for the rest to follow the Knight too.

## Not in scope

- Any change to Pawn or Knight movement. Pawns still promote; Knights hunt
  exactly as they do today.
- Any change to forward-march movement for the four types. Hunting begins only
  once forward motion runs out.
- A visual tell for hunting Pieces. As with the Knight, deliberately left
  alone until play shows it is needed.
