# Piece Staging Rank — Design

**Date:** 2026-08-07
**Status:** Agreed
**Issue:** [#22](https://github.com/braydend/cards-v-chess/issues/22)

**Revised 2026-08-07, after the repo owner's review of PR #34.** This spec
originally recorded "a Piece in the Staging rank is an ordinary Piece" as the
chosen design and rejected making the rank safe from damage. The repo owner
reversed that during review, before this branch merged: the Staging rank
should be "safe from all damage except from a joker's clear," and it "should
only allow pieces to leave it — pieces cannot return to it once they've
entered the true board." The section below now records the shipped design; the
original reasoning is kept as the rejected alternative, because it is genuine
design context a future reader should see both sides of. (Normally a decision
record is frozen and never updated once written — this one is edited in place
because it was still unmerged, and had shipped, briefly, arguing for the
opposite of what the code now does.)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

A Piece can spawn on top of a Tower.

`drainDueSpawns` in `src/game/tick.ts` places every new Piece at
`rank = board.ranks - 1` without consulting `state.towers`, and nothing stops the
player building a Tower on that rank. Build one there and the next spawn on that
file lands on its square.

This is the same invariant violated as in
[#15](https://github.com/braydend/cards-v-chess/issues/15), from the opposite
direction. **Towers block movement, and blocked Pieces attack them at half
damage.** A Piece sharing a Tower's square is one that walked through what should
have stopped it. #15 closed the placement route onto that state — `canBuildOn`
refuses a square a Piece occupies. The spawn route is still open.

The two are not one fix because this one needs a decision, and the issue lists
four candidates that are not equivalent. They are answered in "Rejected
alternatives" below.

## Decision

**Pieces spawn onto a Staging rank, one rank beyond the board, and step onto the
board on their own move interval like any other hop.**

The collision is not arbitrated — it is removed. A spawn square that is not a
board square can never hold a Tower, so there is nothing to arbitrate. And
because entry to the board is now a *move* rather than a placement, a Tower on
the entry square is handled by the rule that already exists: the Piece is
blocked, so it grinds the Tower at half damage from the Staging rank, exactly as
it would anywhere else on the board.

That is the whole appeal. No new rule enters the engine, no existing rule gains
an exception, and round termination keeps its current bound for the current
reason — a blocked Piece returns `attackTower` rather than `stuck`, so it counts
as acting; ♥ repair is finite within a round because packs are refused while a
round is live; the Tower falls; the round resumes.

It is also the shape [the issue's own
comment](https://github.com/braydend/cards-v-chess/issues/22#issuecomment-5200619158)
asked for — a pre-board row Pieces enter from, the way Plants vs Zombies gives
you a beat of warning before a zombie sets foot on the lawn.

### Off the board means out of bounds

The Staging rank is `board.ranks` — one past the last valid rank.

```ts
// src/game/board.ts
/** The off-board rank Pieces spawn onto. Never a board square. */
export function stagingRank(board: BoardSpec): number {
  return board.ranks
}
```

Deriving it from `state.board` rather than a constant is the same rule the Ace
already forces: the board grows, so the Staging rank moves with it.

Being out of bounds is not incidental — it is the entire safety property, and it
is why this fix is small:

- **`canBuildOn` needs no new clause.** Its first line already refuses anything
  `isInBounds` rejects, so a Tower on the Staging rank is unreachable without a
  rank-based placement rule — which is what made "make the spawn rank
  unbuildable" a balance change.
- **`CoveragePreview` needs no change.** It already returns `null` for a hovered
  square that is not in bounds, so hovering the strip previews nothing rather
  than drawing a footprint from a square no Tower can occupy.
- **Movement into the board already works.** Every Piece type's forward
  candidate from the Staging rank lands in bounds, so no type needs a special
  case:

  | Type | First hop from the Staging rank |
  | --- | --- |
  | Pawn | `(file, ranks − 1)` — the far rank |
  | Rook, King | `rookStep` forward to `(file, ranks − 1)` |
  | Queen | `moveCount` 0, so `rookStep`, same as a Rook |
  | Bishop | diagonal to `(file ± handedness, ranks − 1)`, mirroring at a file edge |
  | Knight | `(file ± zig, ranks − 2)`, skipping the far rank entirely |

- **No Piece in the Staging rank is ever `stuck`.** `lateralStep` is the only
  stepper that could fail there, and it is unreachable: it is a fallback for when
  forward is off the board, and forward from the Staging rank never is. A Knight
  commits to its first in-bounds candidate, and on any board with at least two
  files one of `file ± zig` is in bounds. A Tower on the chosen square yields
  `attackTower`, which is acting, not `stuck`.

### Damage cannot reach the Staging rank, and it is one-way

**This is the design the repo owner chose on review of PR #34**, reversing the
"ordinary Piece" decision this spec originally recorded — preserved below as
the rejected alternative. Framed as one rule, not two carve-outs: **damage
cannot reach the Staging rank, and a Joker's Clear is not damage** — it is a
board wipe, and the designed safety valve for the repair-versus-the-wall
stall. Auras are not damage either, and were never in question either way — a
King's buff still speeds a Piece's entry, and a Bishop's heal on a Piece
nothing can hurt is simply a harmless no-op.

`selectTargets` in `src/game/tick.ts` is the entire mechanism: it skips any
Piece that fails `isInBounds` before it ever asks whether a Tower's geometry
covers the square, and `fireTowers` is the only place in the engine that
reduces a Piece's health — so that one clause is the whole immunity rule, and
it holds regardless of a Tower's range or shape. `clearPieces` in
`src/game/cardPlays.ts` gets no equivalent clause, deliberately: it wipes
`state.pieces` wholesale, staged Pieces included, which is exactly what keeps
it the safety valve. `auras.ts` is untouched too — neither aura function
consults `isInBounds`.

**The rank is also one-way.** Once a Piece has entered the true board, no
movement rule can put it back on the Staging rank. `rookStep`, `bishopStep`,
and `lateralStep` (`movement.ts`) only ever decrease or hold a Piece's rank;
the Knight's zig-zag candidates are `rank − 2` or `rank − 1`; and `huntCore`'s
rank-increasing candidates are bounds-checked before one is ever committed to.
Nothing had to change in `movement.ts` to make this true — it already held
structurally, as a side effect of how forward-bias was built, not as a rule
written for this purpose. What is new is a test that pins it exhaustively
rather than leaving it to be trusted from reading the code — see Testing,
below.

**The objection that killed the safe-zone option, under the reasoning this
spec originally gave, no longer applies.** It was rejected below for needing
"two carve-outs pointing opposite ways" — Tower fire excluded, Clear included
— each to be remembered and kept in sync forever. Under the owner's framing
there is only one carve-out, not two: nothing that counts as *damage* reaches
the Staging rank, full stop, and Clear was never subject to it because Clear
was never damage in the first place. What reads as two exceptions to "ordinary
Piece" is one exception to "nothing reaches the Staging rank" — the same shape
the rest of the engine already uses, where Tower fire and Clear have never
shared a code path or a rule.

### Rejected: a Piece in the Staging rank is an ordinary Piece

This was the design this spec originally recorded and briefly shipped with,
before the repo owner's review reversed it. Kept here because the reasoning is
genuine design context — a future reader should see why this looked right
before seeing why it was wrong.

No combat carve-outs. A Tower whose geometry reaches into the Staging rank may
fire at a Piece standing there. A Joker's Clear destroys it. A Bishop's aura
heals it and a King's aura buffs and speeds it. `selectTargets` still sorts by
distance to the Core, so a Piece in the Staging rank is the furthest thing on
screen and the last thing any Tower prefers.

Being off the board is a **placement** fact, not a combat fact. It says where a
Tower may stand, because that is what `isInBounds` is asked in `canBuildOn`. It
says nothing about what a Tower may shoot, because nothing asks `isInBounds`
there.

The argument against the alternative, at the time, was: making the Staging
rank a safe zone excluded from Tower fire costs a bounds clause in
`selectTargets`, and — this was the part that was thought to kill it — to be
coherent it would have to exclude Clear too, which reads as two carve-outs
pointing opposite ways (Towers cannot reach in, Clear can) rather than none.
The owner's review is what dissolved that objection: see the section above.

**Cost that no longer applies:** `accumulatePulses` in `src/scene/firePulse.ts`
paints board tiles and clamps its writes to the board, so the fire-pulse glow
stops at the board's edge. Under the "ordinary Piece" design above, a shot into
the Staging rank still landed despite the glow stopping short of it — a real
but faint asymmetry, since the pulse already lights a Tower's footprint rather
than tracing a shot to its target. That asymmetry is now moot rather than
merely small: nothing is shootable on the Staging rank any more, so a shot
never lands there to be under-drawn, and the clamp to the board is simply
correct. No change to `firePulse.ts` was needed to arrive at that; the
reversal made the existing code right by removing the case it used to fall
short on.

### The wait is the telegraph

A spawned Piece keeps `moveCooldownMs: 0`, so it waits one of its own move
intervals in the Staging rank before entering. That wait is the feature: the
player sees what is coming and which file it will enter on, for a beat, before it
can be blocked or shot at close range.

One consequence, deliberate and small:

- Every Piece's journey to the Core is one hop longer. Knights excepted — a
  Knight's hop crosses two ranks, so it enters at `ranks − 2` and loses nothing.

That makes the game marginally easier — one extra hop of build time before a
Piece is even shootable — and is not a regression against an authored number:
round pacing, Piece move intervals, and every Ink value are placeholders, and
the joint Ink-and-packs tuning pass is already open.

**A second consequence this spec originally claimed no longer holds.** This
section used to also list "a far-rank Tower whose geometry reaches up gets a
rank of extra reach it did not have" as a second, deliberate easing. That was
true only under the "ordinary Piece" design rejected above: since damage
cannot reach the Staging rank at all under the shipped design, no Tower's
geometry reaches it either, extra or otherwise. Net against `main`, the only
change left is that a Piece arrives one hop later, at full health — more build
time for the player, no change to combat once the Piece is on the board.
Setting a
spawn's cooldown to a full interval so a Piece stepped onto the board on the very
next tick was considered and rejected — it would preserve the old timing exactly
and reduce the Staging rank to a single-tick flicker, which is to build the thing
and then hide it.

### The renderer draws a ledge, not a rank of squares

A new `src/scene/StagingRank.tsx`, mounted from `Board.tsx` beside the other
overlays:

- **One `<mesh>`**, spanning the full file width and one square deep, at
  `rankToWorldZ(board, stagingRank(board))`. Not `Instances` — a single mesh has
  no `limit` and so cannot acquire the `limit`/`key` defect, which is the same
  reasoning that keeps `CoveragePreview`'s illegal-square marker a plain mesh.
- **Visibly not the board.** No checkerboard, and a darker desaturated slate than
  either square colour. Its top face stays coplanar with the board's at `y = 0`
  so Pieces standing on it rest correctly, and it is drawn slightly shallower
  than a full square so a seam separates it from the far rank.
- Always mounted, including through the gap between rounds. It is furniture: it
  says where Pieces come from even when none are there.

`Pieces.tsx` needs no change at all. It positions Pieces through
`rankToWorldZ`, which is linear in the rank and extrapolates past the board on
its own.

`PlacementSurface`'s raycast plane is sized to the board, so it does not extend
over the strip: hovering or clicking the Staging rank produces no square. The one
boundary pixel where the plane's far edge rounds to `board.ranks` degrades into
the refusal that already exists — `canBuildOn` says no and the Card is not
consumed.

## Rejected alternatives

The four candidates the issue lists, and why the Staging rank beats each:

- **Delay the spawn until the square is clear.** Terminates only if the Tower
  eventually falls, and a Tower the player keeps repaired never does — the round
  stalls with a Piece that has not entered and cannot be shot or Cleared, since
  it is not on the board at all. The Staging rank produces the *opposite*
  outcome from the same board position: the Piece exists, grinds the wall, and is
  a legal target.
- **Shift the spawn to another file.** Needs a file-choice rule, and a second
  rule for a fully walled spawn rank. Worse, it lets Tower placement decide where
  Pieces appear — which is herding by another name, one step from the mazing the
  design rejects outright.
- **Let the spawn damage or destroy the Tower.** A real balance lever dressed as
  a bug fix. It makes the far rank a Tower-shredder and quietly answers a
  question nobody has asked: what the far rank is *for*.
- **Make the spawn rank unbuildable.** Simplest, and it does prevent the
  collision — at the price of a whole rank of the player's board, which is the
  most expensive fix on the list. The Staging rank keeps the far rank buildable
  and lets a wall there work: Pieces queue up outside it and grind, which is what
  a wall should do.

Also rejected: **a Staging rank several ranks deep**, so a queue is visible.
One rank answers the issue and gives the telegraph; depth is a pacing lever
nobody has asked for.

## Testing

Engine tests only, in `src/game/`. `StagingRank.tsx` stays untested like the rest
of `src/scene/` — there is no jsdom, and it is one mesh with no branching.

- A Piece spawns at `stagingRank(state.board)`, not at `board.ranks - 1`.
- **The invariant, pinned directly:** with the entire far rank walled, a full
  round ticked to completion never produces a Piece whose square equals a
  Tower's — asserted every tick, not only at the end. This is the regression test
  for the issue, and it should fail against the current `drainDueSpawns`.
- A Piece spawned behind a walled far-rank square damages that Tower rather than
  standing on it, and does not advance while it stands.
- A Piece spawned behind a clear far-rank square enters the board on its first
  hop, at the rank its own type reaches — the far rank for everything except a
  Knight, which reaches `ranks − 2`.
- `isInBounds` is false for every file on the Staging rank, and `canBuildOn`
  refuses every square on it. These pin the property the whole fix rests on, so
  that a later change to `isInBounds` cannot quietly re-open the collision.
- No Piece standing on the Staging rank is `stuck`, for every Piece type, both
  with the square ahead clear and with it walled.
- A round whose every spawn sits behind a wall still terminates once the wall
  falls, extending the existing `roundTermination.test.ts` argument to Pieces
  that never got onto the board.
- An Ace played while Pieces stand in the Staging rank admits them to the board —
  the rank they occupy becomes the new far rank — and they are not overlapping a
  Tower afterwards, because the new rank is new space no Tower could have been
  built on.

**Added for the reversal above, all in `src/game/staging.test.ts`:**

- **Immunity.** A rank-3 (vertical) Tower on the far rank, whose geometry is
  first confirmed to genuinely cover the Staging square directly up-file,
  cannot kill a Pawn grinding it from there — the Pawn survives at full
  health for far longer than its `maxHealth` would allow if any of that fire
  landed, while the Tower visibly takes damage from the Pawn's own blocked
  attacks in return, proving the grind is real and one-sided.
- **Clear's exception.** A Joker's Clear destroys Pieces standing on the
  Staging rank and pays its usual quarter-share Ink reward for them — using
  four Pawns rather than one so the reward floors to a non-zero number,
  proving Clear actually processed them rather than the array merely ending
  up empty for an unrelated reason.
- **Auras still reach.** A King's aura still buffs a Pawn waiting on the
  Staging rank, kept passing on purpose so the immunity rule above never
  grows a second carve-out to exclude auras too.
- **The wall-falls case is now load-bearing, not incidental.** A second
  round-termination test uses a rank-3 Tower — geometry that genuinely
  reaches the Staging square, unlike the rank-5 diagonal the walled tests
  elsewhere in this file use — and the round still only ends once the grind
  wears the Tower down. Under the design this spec now records, a Tower's
  fire can never break this stall from the Piece's side; the earlier
  rank-5 version of this test no longer proves that on its own, because no
  Tower's geometry could reach the Staging rank regardless of which rank
  built the wall.
- **The Staging rank is one-way, pinned exhaustively.** Every square, Piece
  type, handedness, `moveCount`, `hunting` state, and `slideBonus` — 6,144
  combinations — is fed through `nextMove`, and every resulting `move`
  outcome's destination is asserted in bounds. Zero violations, confirming
  the property already held structurally in `movement.ts` before this test
  existed; no runtime guard was added, per this project's preference for a
  build-time guarantee over defensive code.

## Out of scope

- **The fixed shadow frustum** in `src/scene/GameScene.tsx`, which a board
  growing past 8x8 already outgrows. The strip adds a rank of visible depth and
  so may widen the existing faint dark band by a little. Cosmetic, pre-existing,
  and unrelated — see the Ace wedge note in CLAUDE.md for why this problem
  should not be allowed to absorb blame for anything else.
- **Caps on King and Ace accumulation**, still open, still uncapped.
- **The Ink and pack pricing pass.** The one balance consequence remaining
  above — a Piece's journey to the Core being one hop longer — lands in its
  lap rather than being pre-empted here.
