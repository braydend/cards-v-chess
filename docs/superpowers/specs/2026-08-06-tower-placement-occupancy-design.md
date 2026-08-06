# Tower Placement Occupancy — Design

**Date:** 2026-08-06
**Status:** Agreed
**Issue:** [#15](https://github.com/braydend/cards-v-chess/issues/15)

A frozen decision record. For current state, read
[`docs/design/game-design.md`](../../design/game-design.md).

## Problem

A Tower can be built on a square a Piece is standing on.

`canBuildOn` in `src/game/cardPlays.ts` gates every play that puts a Tower on
the board — a Card played for its rank, and a Queen's Echo. It checks three
things: the square is in bounds, it is not the Core's, and no Tower already
stands there. It never consults `state.pieces`.

The result contradicts an invariant rather than merely looking wrong. **Towers
block movement, and blocked Pieces attack them at half damage.** A Tower and a
Piece cannot legitimately share a square, because a Piece on a Tower's square is
one that walked through what should have stopped it. Building underneath a Piece
manufactures exactly that state.

## Decision

Occupancy joins the build rule, and the renderer shows it before the click.

### One predicate, in its own module

`canBuildOn` moves out of `cardPlays.ts` into a new `src/game/placement.ts`, and
gains the missing clause:

```ts
export function canBuildOn(state: GameState, square: Square): boolean {
  if (!isInBounds(state.board, square)) return false
  if (squaresEqual(square, state.core.square)) return false
  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return false

  return !state.pieces.some((piece) => squaresEqual(piece.square, square))
}
```

It moves rather than staying put because the renderer now asks the same question.
A rule with two callers should not live inside one of them. `cardPlays.ts`
imports it, so `buildTower` and `echoTower` are both fixed without either
function body changing, and `src/game/index.ts` re-exports it — the only route by
which `src/scene/` is permitted to see anything in the engine.

Refusal semantics are untouched: an illegal play returns the state unchanged,
never throws, and never consumes the Card.

### Occupancy means the current square only

The check reads `piece.square` and nothing else.

`prevSquare` exists purely so the renderer can interpolate a hop, and its type
comment states that the engine never reads it. That stays true. The cost is
visible and accepted: a Piece that has just hopped frees its old square
immediately, so a Tower can appear on a square the renderer is still animating a
Piece leaving.

Rejected: blocking `prevSquare` as well, so a Tower never appears under a Piece
mid-animation. It buys a smoother half-second and pays for it with an engine rule
that exists only to serve renderer interpolation — the wrong direction across the
boundary CLAUDE.md draws. The engine's `square` is the authority everywhere else
— `movement.ts` reads it both to pick a hop and to decide a Piece is blocked —
and placement should not be the one rule that disagrees.

### The marker answers the whole predicate, not just Pieces

`CoveragePreview` already draws the footprint a selected build Card would cover
from the hovered square. It starts reading the whole snapshot rather than only
`snapshot.deck`, calls `canBuildOn(snapshot, hoveredSquare)`, and when that is
false draws the origin square red while the rest of the footprint stays teal.

A single square needs a single `<mesh>`, not a second `Instances`. That is
deliberate: a new `Instances` would need a `limit` and a matching `key`, which is
the exact hazard that produced the Ace wedge. One mesh cannot have it.

The marker updates on its own as Pieces move, without a subscription of its own:
`structuralKey` includes every Piece's square, so the snapshot republishes on
each hop and the red clears when the Piece leaves.

Because the marker calls the same predicate the engine does, it lights up for the
Core square and for an occupied Tower square too — not only for a Piece. This is
a visible change beyond what issue #15 describes, and it is the point of having
one predicate: a marker with its own narrower rule would disagree with the engine
in two cases and would have to be kept in sync by hand.

Rejected: a silent refusal with no marker. The engine fix alone is correct and
two lines, but it makes the click a no-op with nothing on screen having said why.
Also rejected: marking every Piece-occupied square whenever a build Card is
selected. It answers a question the player has not asked yet, and it competes for
attention with the footprint, which is the thing the preview exists to show.

### The click path does not change

`Board.tsx` already treats a refused `dispatch` as "keep the Card selected",
precisely so a refusal costs the player nothing. A build aimed at an occupied
square now takes that existing path. No change to `Board.tsx`, `boardClick.ts`,
or `commandFor.ts`.

## Testing

Engine tests only, in `src/game/`. `CoveragePreview` stays untested, like the
rest of `src/scene/` — there is no jsdom, and the component is plumbing over a
predicate that is tested directly.

- A rank build aimed at a Piece-occupied square is refused, and the Card is still
  in the Deck afterwards.
- A Queen's Echo aimed at a Piece-occupied square is refused likewise, and the
  Echo source Tower is unchanged.
- The same square accepts a build once the Piece has hopped away, so the rule
  reads live state rather than latching.
- The pre-existing refusals — out of bounds, the Core square, an occupied Tower
  square — still hold after the move to `placement.ts`.

## Out of scope

**A Piece can still spawn on top of a Tower.** `drainDueSpawns` in
`src/game/tick.ts` places each new Piece at `rank = board.ranks - 1` without
consulting `state.towers`, and nothing stops the player building on the back
rank. That is the same invariant violated from the opposite direction.

It is deliberately not fixed here, because it needs a decision this spec has no
basis to make: a blocked spawn could be delayed, shifted to another file, damage
the Tower, or be prevented in advance by making the spawn rank unbuildable — and
the last of those is a balance change, not a bug fix. Filed as
[#22](https://github.com/braydend/cards-v-chess/issues/22).
