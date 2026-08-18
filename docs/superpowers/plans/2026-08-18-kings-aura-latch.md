# King's Aura: Permanent, Stacking, Survivability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the King's aura latch permanently onto adjacent Pieces, stack per adjacency episode with compounding effects, and grant a survivability bonus — implementing issue #78.

**Architecture:** The aura stops being derived per tick from position and becomes **latched state on the Piece**. `Piece` swaps its renderer-facing `buffed: boolean` for `kingAuraStacks: number` (permanent, monotonic) plus `kingAuraKings: readonly string[]` (episode bookkeeping: which Kings were adjacent last tick). `src/game/auras.ts` replaces `buffedPieceIds`/`slideBonusFor` with `kingAdjacentKings`, `applyKingAura` (latches new episodes, applies the defense grant), `kingMoveInterval`, and `kingSlideBonus`. `tick.ts` runs `applyKingAura` once from tick-start positions before movement; `movePieces` reads `piece.kingAuraStacks` directly instead of a membership set. Promotion carries the Pawn's stacks into the Queen. The renderer shows the buff ring whenever `kingAuraStacks > 0` (scaled by the count, no longer gated on `inProgress`) and adds a faint radius ring under each King.

**Tech Stack:** TypeScript (strict), Vitest, React Three Fiber, three.js.

## Global Constraints

- `src/game/` must never import React or Three.js — enforced by ESLint.
- No `Math.random` in `src/game/` — runs are seeded and the simulation must stay deterministic. All randomness comes from the seeded PRNG carried in `GameState`.
- The renderer may import only the public surface at `src/game/index.ts`, never an internal module. `auras.ts` is deliberately **not** re-exported from `index.ts`.
- Do **not** add per-tick values to `structuralKey`. This plan adds none: the defense grant changes `health`, which is already in the pieces key (`${id}@${square}:${health}`), so a stack gain republishes. The buff ring is read per-frame from `getState()`, not from the snapshot.
- Hand-ladder ordering, pathfinding prohibitions, and `step`'s exhaustiveness guard are untouched.
- Exact values that must be preserved verbatim: `KING_SPEED_MULTIPLIER = 0.7`, `KING_SLIDE_BONUS = 1`, new `KING_HEALTH_BONUS = 1`.

---

### Task 1: The latched, stacking King aura (engine)

The whole engine behavior lands as one coherent change: the type, the aura module, and the tick wiring move together because they are one behavior, and no intermediate state compiles or passes. Test-driven within the task.

**Files:**
- Modify: `src/game/types.ts:139-159` (Piece `maxHealth` doc, `buffed` field → two new fields)
- Modify: `src/game/auras.ts` (full rewrite of the King half; Bishop half unchanged)
- Test: `src/game/auras.test.ts` (piece helper + "the King aura" block; Bishop block untouched)
- Modify: `src/game/tick.ts:5,107-148,530,561,571,582-586,651,693-702`
- Modify: `src/game/fixtures.ts:155`, `src/game/dev.ts:89` (Piece constructors)
- Test: `src/game/tick.test.ts` (three constructors + the "King aura" describe block)
- Test: `src/game/staging.test.ts:522-535`, `src/game/promotion.test.ts:22` (+ new inheritance test), `src/game/termination.test.ts:26`, `src/game/spawnScaling.test.ts:39`

**Interfaces:**
- Consumes: existing `Piece`, `Square`, `pieceType(typeId).slides`, `pieceType(typeId).moveIntervalMs`.
- Produces:
  - `Piece.kingAuraStacks: number` — permanent stack count. `Piece.kingAuraKings: readonly string[]` — Kings adjacent at the last aura computation.
  - `KING_HEALTH_BONUS = 1` (new export from `auras.ts`).
  - `kingAdjacentKings(pieces: readonly Piece[]): ReadonlyMap<string, readonly string[]>` — Piece id → adjacent King ids (excluding self).
  - `applyKingAura(pieces: readonly Piece[], adjacentKings: ReadonlyMap<string, readonly string[]>): Piece[]` — latches new episodes, applies the defense grant, refreshes `kingAuraKings`. Returns the input array unchanged when nothing changed.
  - `kingMoveInterval(baseIntervalMs: number, stacks: number): number` — `baseIntervalMs * KING_SPEED_MULTIPLIER ** stacks`.
  - `kingSlideBonus(typeId: PieceTypeId, stacks: number): number` — `KING_SLIDE_BONUS * stacks` for sliders, `0` otherwise.
  - `movePieces` drops its `buffed` parameter and returns `promotedFrom: { square: Square; tier: PieceTier; kingAuraStacks: number }[]`.
  - `buffedPieceIds` and `slideBonusFor` are **deleted** (only `tick.ts` and `auras.test.ts` import them; `index.ts` never re-exports them).

- [ ] **Step 1: Rewrite the failing tests — `auras.test.ts`**

Replace the import (line 3) with:

```ts
import {
  BISHOP_HEAL_AMOUNT,
  BISHOP_HEAL_INTERVAL_MS,
  KING_HEALTH_BONUS,
  KING_SLIDE_BONUS,
  KING_SPEED_MULTIPLIER,
  applyHealing,
  applyKingAura,
  kingAdjacentKings,
  kingMoveInterval,
  kingSlideBonus,
} from './auras'
```

Replace the `piece` helper's `buffed: false,` (line 19) with:

```ts
    kingAuraStacks: 0,
    kingAuraKings: [],
```

Replace the whole `describe('the King aura', ...)` block (lines 25-54) with:

```ts
describe('the King aura', () => {
  it('grants one stack, and the defense grant, to a Piece on an adjacent square', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 5, rank: 5 })]

    const adjacent = kingAdjacentKings(pieces)
    const applied = applyKingAura(pieces, adjacent)
    const rook = applied.find((each) => each.id === 'r')

    expect(adjacent.get('r')).toEqual(['k'])
    expect(rook?.kingAuraStacks).toBe(1)
    expect(rook?.maxHealth).toBe(5 + KING_HEALTH_BONUS)
    expect(rook?.health).toBe(5 + KING_HEALTH_BONUS)
    expect(applied.find((each) => each.id === 'k')?.kingAuraStacks).toBe(0)
  })

  it('does not reach two squares away', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 6, rank: 4 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'r')?.kingAuraStacks).toBe(0)
  })

  it('never buffs the King itself', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'k')?.kingAuraStacks).toBe(0)
  })

  it('buffs a King standing beside a different King — exclusion is per-Piece, not per-type', () => {
    const pieces = [piece('k1', 'king', { file: 4, rank: 4 }), piece('k2', 'king', { file: 5, rank: 5 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'k1')?.kingAuraStacks).toBe(1)
    expect(applied.find((each) => each.id === 'k2')?.kingAuraStacks).toBe(1)
  })

  it('is inert when no King is on the board — and returns the input array unchanged', () => {
    const pieces = [piece('r', 'rook', { file: 4, rank: 4 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied).toBe(pieces)
  })

  it('gives one stack per adjacency episode: sustained contact adds nothing, leaving and re-entering adds another', () => {
    const king = piece('k', 'king', { file: 4, rank: 4 })
    const rook = piece('r', 'rook', { file: 5, rank: 5 })

    const first = applyKingAura([king, rook], kingAdjacentKings([king, rook]))
    expect(first.find((each) => each.id === 'r')?.kingAuraStacks).toBe(1)

    const sustained = applyKingAura(first, kingAdjacentKings(first))
    expect(sustained.find((each) => each.id === 'r')?.kingAuraStacks).toBe(1)

    const separated = sustained.filter((each) => each.id !== 'k')
    const left = applyKingAura(separated, kingAdjacentKings(separated))
    expect(left.find((each) => each.id === 'r')?.kingAuraStacks).toBe(1)

    const together = [...left, king]
    const reentered = applyKingAura(together, kingAdjacentKings(together))
    expect(reentered.find((each) => each.id === 'r')?.kingAuraStacks).toBe(2)
  })

  it('stacks: two Kings at once grant two stacks', () => {
    const pieces = [
      piece('k1', 'king', { file: 4, rank: 4 }),
      piece('k2', 'king', { file: 6, rank: 4 }),
      piece('r', 'rook', { file: 5, rank: 4 }),
    ]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'r')?.kingAuraStacks).toBe(2)
    expect(applied.find((each) => each.id === 'r')?.maxHealth).toBe(5 + 2 * KING_HEALTH_BONUS)
  })

  it('compounds the move interval multiplier per stack', () => {
    expect(kingMoveInterval(900, 0)).toBe(900)
    expect(kingMoveInterval(900, 1)).toBe(900 * KING_SPEED_MULTIPLIER)
    expect(kingMoveInterval(900, 2)).toBe(900 * KING_SPEED_MULTIPLIER ** 2)
  })

  it('adds one slide per stack, to sliders only', () => {
    expect(kingSlideBonus('rook', 1)).toBe(KING_SLIDE_BONUS)
    expect(kingSlideBonus('rook', 2)).toBe(2 * KING_SLIDE_BONUS)
    expect(kingSlideBonus('pawn', 3)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the new auras tests to verify they fail**

Run: `pnpm test:run src/game/auras.test.ts`
Expected: FAIL — `applyKingAura`, `kingAdjacentKings`, `kingMoveInterval`, `kingSlideBonus`, `KING_HEALTH_BONUS` do not exist, and the `piece` helper's `kingAuraStacks`/`kingAuraKings` are not on `Piece`.

- [ ] **Step 3: Rewrite the failing tests — `tick.test.ts`, `staging.test.ts`, `promotion.test.ts`**

In `tick.test.ts`, replace `buffed: false,` with the new fields at all three constructors (`rookOnBackRank` line 51, `pieceAt` helper line 82, hand-built Bishop line 345):

```ts
        kingAuraStacks: 0,
        kingAuraKings: [],
```

Replace the whole `describe('tick: the King aura', ...)` block (lines 377-491) with:

```ts
describe('tick: the King aura', () => {
  it('speeds up a Piece standing beside a King', () => {
    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [pieceAt('king', 'king', { file: 0, rank: 7 }), pieceAt('pawn', 'pawn', { file: 1, rank: 7 })],
    }

    // The first tick latches a stack, so the Pawn's 900ms interval becomes
    // 900 * KING_SPEED_MULTIPLIER = 630ms (exact in IEEE754). Unstacked it
    // would need the full 900ms and would still be standing on rank 7 here.
    const buffedIntervalMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER
    const after = runFor(state, buffedIntervalMs + DT)

    expect(after.pieces.find((piece) => piece.id === 'pawn')?.square.rank).toBe(6)
  })

  it('grants extra slide distance to a stacked slider but not a stacked non-slider, and records both', () => {
    // A single tick, not runFor: the buffed threshold is crossed on this one
    // tick for both the Rook and the Pawn, and both slide away from the King
    // in that same hop. A single tick pins the stack count to the moment the
    // buffed hop actually happens.
    const rookBuffedMs = PIECE_TYPES.rook.moveIntervalMs * KING_SPEED_MULTIPLIER
    const pawnBuffedMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER

    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king', 'king', { file: 0, rank: 7 }),
        pieceAt('rook', 'rook', { file: 1, rank: 7 }, { moveCooldownMs: rookBuffedMs }),
        pieceAt('pawn', 'pawn', { file: 1, rank: 6 }, { moveCooldownMs: pawnBuffedMs }),
      ],
    }

    const after = tick(state, DT)

    const king = after.pieces.find((piece) => piece.id === 'king')
    const rook = after.pieces.find((piece) => piece.id === 'rook')
    const pawn = after.pieces.find((piece) => piece.id === 'pawn')

    // The Rook's hop covers 1 + KING_SLIDE_BONUS squares. The Pawn is stacked
    // too — equally adjacent to the King — but is not a slider, so
    // kingSlideBonus returns 0 for it regardless: it covers only one square.
    // That contrast is what pins "sliders only". The defense grant lands on
    // the same tick as the stack.
    expect(rook?.square).toEqual({ file: 1, rank: 5 })
    expect(pawn?.square).toEqual({ file: 1, rank: 5 })
    expect(rook?.kingAuraStacks).toBe(1)
    expect(rook?.health).toBe(PIECE_TYPES.rook.maxHealth + 1)
    expect(pawn?.kingAuraStacks).toBe(1)
    expect(king?.kingAuraStacks).toBe(0)
  })

  it('decides the first stack from tick-start positions, not per Piece mid-loop', () => {
    // The King is listed first, so it is processed first. Its moveCooldownMs
    // starts at exactly its own 1800ms interval, so it hops this very tick —
    // from (4,6) to (4,5). At tick start King and Pawn are Chebyshev distance
    // 1 apart; after the King's hop they would be distance 2 apart. The
    // Pawn's moveCooldownMs starts at 630, so +DT clears 630 but not 900
    // (630 + DT ≈ 646.67). The Pawn earns its FIRST stack — and hops — if
    // and only if adjacency was decided from tick-start positions rather than
    // recomputed after the King had already moved. Recomputing per Piece
    // mid-loop would see the King's post-move square, leave the Pawn
    // stackless (900ms interval), and it would not hop at all this tick.
    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king', 'king', { file: 4, rank: 6 }, { moveCooldownMs: PIECE_TYPES.king.moveIntervalMs }),
        pieceAt('pawn', 'pawn', { file: 5, rank: 7 }, { moveCooldownMs: 630 }),
      ],
    }

    const after = tick(state, DT)

    expect(after.pieces.find((piece) => piece.id === 'pawn')?.square.rank).toBe(6)
  })

  it('stacks — a Pawn beside two Kings moves at 0.7² the cadence of one', () => {
    // Start cooldown at exactly the TWO-King interval (900 * 0.7² ≈ 441ms).
    // Beside one King the interval is only 0.7× (630ms), so at 441 + DT the
    // Pawn has not crossed it and stays put; beside two Kings it hops. Same
    // cooldown, different outcome — pins the compounding interval directly,
    // and the stack counts and defense grants differ to confirm why.
    const twoKingIntervalMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER ** 2

    const oneKing: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king1', 'king', { file: 0, rank: 7 }),
        pieceAt('pawn', 'pawn', { file: 1, rank: 7 }, { moveCooldownMs: twoKingIntervalMs }),
      ],
    }

    const twoKings: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king1', 'king', { file: 0, rank: 7 }),
        pieceAt('king2', 'king', { file: 2, rank: 7 }),
        pieceAt('pawn', 'pawn', { file: 1, rank: 7 }, { moveCooldownMs: twoKingIntervalMs }),
      ],
    }

    const afterOne = tick(oneKing, DT).pieces.find((piece) => piece.id === 'pawn')
    const afterTwo = tick(twoKings, DT).pieces.find((piece) => piece.id === 'pawn')

    expect(afterOne?.square.rank).toBe(7)
    expect(afterTwo?.square.rank).toBe(6)
    expect(afterOne?.kingAuraStacks).toBe(1)
    expect(afterTwo?.kingAuraStacks).toBe(2)
    expect(afterOne?.health).toBe(PIECE_TYPES.pawn.maxHealth + 1)
    expect(afterTwo?.health).toBe(PIECE_TYPES.pawn.maxHealth + 2)
  })

  it('keeps the latched buff with no King in range — the stack, not the position, is what matters', () => {
    // The Pawn carries a stack with no King on the board at all. The buffed
    // cadence (630ms) still applies: the aura is permanent once latched, not
    // re-derived from position.
    const buffedIntervalMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER
    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [pieceAt('pawn', 'pawn', { file: 1, rank: 7 }, { kingAuraStacks: 1, kingAuraKings: [] })],
    }

    const after = runFor(state, buffedIntervalMs + DT)

    expect(after.pieces.find((piece) => piece.id === 'pawn')?.square.rank).toBe(6)
  })
})
```

In `staging.test.ts`, update the aura-reaches-Staging test (lines 522-535). The comment and the assertion both change:

```ts
  it("a King's aura reaches a Piece on the Staging rank", () => {
    const base = createInitialState()
    // `kingAdjacentKings` (auras.ts) reads Chebyshev distance 1 as adjacent;
    // this King sits diagonally one square from the Pawn's Staging square,
    // which is exactly that distance.
    const king = pieceAt('king', 'king-1', { file: 4, rank: base.board.ranks - 1 })
    const waiting = pawnAt('waiting', { file: 3, rank: stagingRank(base.board) })
    const state = liveRound(base, [king, waiting])

    const after = tick(state, DT)
    const pawn = after.pieces.find((piece) => piece.id === 'waiting')

    expect(pawn?.kingAuraStacks).toBe(1)
  })
```

In `promotion.test.ts`: replace `buffed: false,` (line 22) in `pawnOn` with the new fields, then add this test at the end of the `describe('pawn promotion', ...)` block:

```ts
  it('inherits the Pawn's King-aura stacks, and the defense grant they carry', () => {
    const state = withPawn(0, 0)
    const pawn = state.pieces[0]
    if (!pawn) throw new Error('expected a Pawn')

    // A single stack, not several: stacks speed a Piece up (move interval
    // × 0.7^N) as well as raising its ceiling. On the back rank a promoted
    // Queen hunts the Core along rank 0 — CORE_SQUARE is (3,0) — so a
    // heavily stacked Queen's first hop lands on the Core and she leaks,
    // `after.pieces` is empty, and there is nothing left to assert. One stack
    // keeps her first hop (1000 × 0.7 ms) outside the run window while still
    // proving the inheritance and the grant.
    const stackedPawn: GameState = {
      ...state,
      pieces: [
        {
          ...pawn,
          kingAuraStacks: 1,
          kingAuraKings: ['king-1'],
          maxHealth: pawn.maxHealth + 1,
          health: pawn.maxHealth + 1,
        },
      ],
    }

    const after = runFor(stackedPawn, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const queen = after.pieces[0]

    expect(queen?.typeId).toBe('queen')
    expect(queen?.kingAuraStacks).toBe(1)
    // Each inherited stack raises the Queen's ceiling above the authored stat,
    // and she spawns at full health against it — "spawns at full Queen health"
    // plus the stacks' defense grant.
    expect(queen?.maxHealth).toBe(PIECE_TYPES.queen.maxHealth + 1)
    expect(queen?.health).toBe(PIECE_TYPES.queen.maxHealth + 1)
  })
```

In `termination.test.ts` and `spawnScaling.test.ts`, replace `buffed: false,` (line 26 and line 39 respectively) with:

```ts
    kingAuraStacks: 0,
    kingAuraKings: [],
```

- [ ] **Step 4: Run the engine tests to verify they fail**

Run: `pnpm test:run src/game/auras.test.ts src/game/tick.test.ts src/game/staging.test.ts src/game/promotion.test.ts src/game/termination.test.ts src/game/spawnScaling.test.ts`
Expected: FAIL — the new functions/fields do not exist yet (TypeScript compile errors surfaced through esbuild, or assertion failures on missing stacks).

- [ ] **Step 5: Update `types.ts` — the Piece fields**

Replace the `maxHealth` doc (lines 139-145) with:

```ts
  /**
   * The health this Piece spawned with — the ceiling a Bishop's heal restores
   * to. Set at spawn to the authored `maxHealth` (see `pieceTypes`), so a heal
   * restores to what the Piece actually had. Raised permanently by each
   * King-aura stack's defense grant, so it can exceed the authored stat.
   */
  readonly maxHealth: number
```

Replace the `buffed` field (lines 158-159) with:

```ts
  /**
   * Permanent King-aura stacks. A Piece gains one per adjacency episode — a
   * contiguous period at Chebyshev distance 1 from one King — and never loses
   * them. Each stack re-applies the full aura: move interval ×0.7, +1 slide
   * to sliders, and +1 max health (healing current health by exactly the
   * increase) the moment the stack lands. `movePieces` reads this directly;
   * the renderer scales the buff ring by it.
   */
  readonly kingAuraStacks: number
  /**
   * The ids of the Kings this Piece was adjacent to at the last aura
   * computation, so a King newly present in this tick's adjacency is a new
   * episode worth one stack. Refreshed every tick to that tick's adjacency —
   * a King leaving clears it, so re-entering is a new episode. Engine-internal
   * episode bookkeeping; the renderer never reads it.
   */
  readonly kingAuraKings: readonly string[]
```

Also reword the `promoted` field's doc (line 183): "Renderer-facing and never read by the engine — the same category `buffed` occupies." becomes:

```ts
  /**
   * Whether this Piece is a Queen minted by Pawn promotion.
   *
   * Renderer-facing and never read by the engine. `Pieces.tsx` pops a Queen's
   * mesh once, on the first frame it sees one, which needs no diff: a promoted
   * Queen gets a fresh entity id, so React mounts a fresh mesh for it.
   *
   * False for every spawned Piece and every type that is not a promoted Queen,
   * kept false rather than omitted so every Piece has the same shape, exactly
   * as `hunting` is.
   */
  readonly promoted: boolean
```

- [ ] **Step 6: Rewrite the King half of `auras.ts`**

Replace the module doc (lines 4-17) and the King block (`KING_SPEED_MULTIPLIER` through `slideBonusFor`, lines 19-71) with:

```ts
import { pieceType } from '../data/pieceTypes'
import type { Piece, PieceTypeId, Square } from './types'

/**
 * Aura effects. The Bishop's healing is still derived per pulse from
 * positions; the King's is **latched** — a King-touch permanently grants a
 * stack, and the stack is what movement reads, never the current position.
 *
 * The episode bookkeeping lives on the Piece (`kingAuraStacks`,
 * `kingAuraKings`) rather than in a separate module map, so it survives in the
 * engine state and the renderer can read the permanent stacks without
 * re-deriving anything.
 */

/** Move interval multiplier per King-aura stack. Lower is faster. Compounding: 0.7^stacks. */
export const KING_SPEED_MULTIPLIER = 0.7

/** Extra squares per hop per King-aura stack, granted to sliders. */
export const KING_SLIDE_BONUS = 1

/** Max and current health gained per King-aura stack, the moment the stack lands. */
export const KING_HEALTH_BONUS = 1

/** Milliseconds between a Bishop's healing pulses. */
export const BISHOP_HEAL_INTERVAL_MS = 1500

/** Health restored to each Piece in range on a Bishop's pulse. */
export const BISHOP_HEAL_AMOUNT = 2

/** Chebyshev distance a Bishop's healing reaches, in squares. */
export const BISHOP_HEAL_RADIUS = 2

const EMPTY_ADJACENCY: ReadonlyMap<string, readonly string[]> = new Map()

/** Squares of king-move distance between two squares. */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank))
}

/**
 * The King ids adjacent to each Piece, read from the positions in `pieces`.
 *
 * Exclusion is per-Piece, not per-type: a King never buffers itself, but a
 * King standing beside a *different* King is a target like any other Piece.
 */
export function kingAdjacentKings(
  pieces: readonly Piece[],
): ReadonlyMap<string, readonly string[]> {
  const kings = pieces.filter((piece) => piece.typeId === 'king')
  if (kings.length === 0) return EMPTY_ADJACENCY

  const byPiece = new Map<string, string[]>()
  for (const king of kings) {
    for (const other of pieces) {
      if (other.id === king.id) continue
      if (chebyshev(king.square, other.square) === 1) {
        const list = byPiece.get(other.id)
        if (list) list.push(king.id)
        else byPiece.set(other.id, [king.id])
      }
    }
  }
  return byPiece
}

/**
 * Latches new King-aura episodes and applies the defense grant.
 *
 * For each Piece: every King in today's adjacency that was NOT adjacent on
 * the last computation is a new episode, worth one stack and one +1 to both
 * max and current health. The stored adjacency (`kingAuraKings`) is refreshed
 * to today's, so a King leaving clears it and re-entering counts fresh.
 *
 * Call once per tick, BEFORE movement, on tick-start positions (the freshly
 * spawned Pieces included, so a guard squad earns its first stack on entry).
 * Reads `pieces` as a frozen array and never its own output, so the result
 * cannot depend on processing order. Returns the input array unchanged when
 * no Piece gains or loses adjacency, so a steady state costs nothing.
 */
export function applyKingAura(
  pieces: readonly Piece[],
  adjacentKings: ReadonlyMap<string, readonly string[]>,
): Piece[] {
  let changed = false

  const updated = pieces.map((piece) => {
    const kings = adjacentKings.get(piece.id)
    if (kings === undefined) {
      if (piece.kingAuraKings.length === 0) return piece
      changed = true
      return { ...piece, kingAuraKings: [] }
    }

    const fresh = kings.filter((kingId) => !piece.kingAuraKings.includes(kingId))
    if (fresh.length === 0 && kings.length === piece.kingAuraKings.length) return piece

    changed = true
    return {
      ...piece,
      kingAuraStacks: piece.kingAuraStacks + fresh.length,
      kingAuraKings: kings,
      maxHealth: piece.maxHealth + fresh.length * KING_HEALTH_BONUS,
      health: piece.health + fresh.length * KING_HEALTH_BONUS,
    }
  })

  return changed ? updated : pieces
}

/** The move interval for a Piece with `stacks` King-aura stacks. 0.7^stacks compounding. */
export function kingMoveInterval(baseIntervalMs: number, stacks: number): number {
  return baseIntervalMs * KING_SPEED_MULTIPLIER ** stacks
}

/** Extra squares per hop from `stacks` King-aura stacks. Sliders only. */
export function kingSlideBonus(typeId: PieceTypeId, stacks: number): number {
  return pieceType(typeId).slides ? KING_SLIDE_BONUS * stacks : 0
}
```

Keep `applyHealing` and its doc comment (lines 73-121) exactly as they are. The stale `maxHealth` cap comment on `applyHealing`'s heal is still accurate — the cap is `piece.maxHealth`, which the defense grant has already raised.

- [ ] **Step 7: Update the Piece constructors — `fixtures.ts` and `dev.ts`**

In `src/game/fixtures.ts` line 155 and `src/game/dev.ts` line 89, replace `buffed: false,` with:

```ts
    kingAuraStacks: 0,
    kingAuraKings: [],
```

- [ ] **Step 8: Wire `tick.ts`**

Change the auras import (line 5) to:

```ts
import { KING_HEALTH_BONUS, applyHealing, applyKingAura, kingAdjacentKings, kingMoveInterval, kingSlideBonus } from './auras'
```

Replace the aura computation + `movePieces` call (lines 107-119) with:

```ts
  // Auras are derived once, from tick-start positions, for the same reason the
  // Tower map is: so no Piece's outcome depends on processing order. The King
  // aura latches new stacks onto this tick's adjacency BEFORE movement, so a
  // Piece that earns a stack this tick pays the buffed cadence this very hop.
  const allPieces = [...state.pieces, ...spawned]
  const adjacentKings = kingAdjacentKings(allPieces)
  const auraApplied = applyKingAura(allPieces, adjacentKings)

  const moved = movePieces(
    auraApplied,
    state.board,
    state.core.square,
    towerBySquare,
    dtMs,
  )
```

In the promoted-Queen minting (lines 124-148), replace `const health = pieceType('queen').maxHealth` and the `buffed: false,` line:

```ts
  const promotedQueens: Piece[] = moved.promotedFrom.map((entry, index) => {
    // The inherited stacks' defense grant applies to the Queen's own ceiling:
    // each stack she carries raises maxHealth (and therefore full health)
    // above the authored Queen stat, exactly as it would have on the Pawn.
    const maxHealth = pieceType('queen').maxHealth + entry.kingAuraStacks * KING_HEALTH_BONUS
    return {
      id: `piece-${nextEntityId + index}`,
      typeId: 'queen',
      tier: entry.tier,
      square: entry.square,
      prevSquare: entry.square,
      health: maxHealth,
      maxHealth,
      moveCooldownMs: 0,
      moveCount: 0,
      // Entity-id parity, same rule as drainDueSpawns, so promoted Queens weave
      // opposite ways from one another too.
      handedness: (nextEntityId + index) % 2 === 0 ? 1 : -1,
      auraCooldownMs: 0,
      // A fresh Piece: the stacks carry over, the episode bookkeeping does
      // not. If she spawns beside a King she earns her next stack on the
      // first tick, like any new arrival.
      kingAuraStacks: entry.kingAuraStacks,
      kingAuraKings: [],
      // A promoted Queen hunts from spawn when her tier says so — a yellow Pawn
      // becomes a yellow Queen that hunts from the moment she appears. She spawns
      // on the board, so the staging-rank carve-out never applies to her.
      hunting: tierDef(entry.tier).huntsFromSpawn,
      // Renderer-facing only. This is the one place it is ever true.
      promoted: true,
    }
  })
```

In `drainDueSpawns` (line 530), replace `buffed: false,` with:

```ts
      kingAuraStacks: 0,
      // A fresh Piece has no episode history; the first King it touches is a
      // new episode.
      kingAuraKings: [],
```

In `movePieces`, remove the `buffed: ReadonlySet<string>,` parameter (line 561) and change the `promotedFrom` return type (lines 566, 571) to `{ square: Square; tier: PieceTier; kingAuraStacks: number }[]`.

Replace the interval/slide computation (lines 582-586) with:

```ts
    const { moveIntervalMs: baseInterval, attackDamage } = pieceType(piece.typeId)
    const moveIntervalMs = kingMoveInterval(baseInterval, piece.kingAuraStacks)
    const slideBonus = kingSlideBonus(piece.typeId, piece.kingAuraStacks)
```

Replace the promotion push (line 651) with:

```ts
        promotedFrom.push({ square, tier: piece.tier, kingAuraStacks: piece.kingAuraStacks })
```

Remove `buffed: isBuffed,` from the survivors push (line 701) — `kingAuraStacks`/`kingAuraKings` ride along via the `...piece` spread, already updated by `applyKingAura`.

- [ ] **Step 9: Run the full engine suite, then typecheck and lint**

Run: `pnpm test:run src/game/auras.test.ts src/game/tick.test.ts src/game/staging.test.ts src/game/promotion.test.ts src/game/termination.test.ts src/game/spawnScaling.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (`pnpm lint` also confirms `buffedPieceIds`/`slideBonusFor` left no dangling imports.)

- [ ] **Step 10: Commit**

```bash
git add src/game/types.ts src/game/auras.ts src/game/auras.test.ts src/game/tick.ts src/game/tick.test.ts src/game/staging.test.ts src/game/promotion.test.ts src/game/termination.test.ts src/game/spawnScaling.test.ts src/game/fixtures.ts src/game/dev.ts
git commit -m "Latch the King aura: permanent, stacking stacks with a defense grant"
```

---

### Task 2: Renderer — permanent stack-scaled ring and the King's radius

The buff ring stops being gated on `inProgress` and scales with `kingAuraStacks`; a new faint ring under each King shows its aura radius; the health-fraction fix uses the Piece's own (possibly raised) `maxHealth`.

**Files:**
- Modify: `src/scene/Pieces.tsx` (resources, frame loop, JSX)
- Modify: `src/scene/TowerCoverage.tsx:41-43,63-65`, `src/scene/CoveragePreview.tsx:15-17`, `src/scene/SelectionMarker.tsx:9-11`, `src/scene/FirePulses.tsx:24-25` (ladder enumerations gain rung 0)

**Interfaces:**
- Consumes: `Piece.kingAuraStacks` (from Task 1), `Piece.maxHealth` (now possibly above the authored stat), `SQUARE_SIZE` from `./coords`, `BUFF_RING_COLOUR` from `./pieceColours`.
- Produces: a new flat-overlay rung **0** — the King's radius ring — documented in every overlay's ladder comment.

- [ ] **Step 1: Add the King radius ring to the shared resources**

In `src/scene/Pieces.tsx`, add `MeshBasicMaterial` to the three.js import and `SQUARE_SIZE` to the `./coords` import. Add this constant near the other module constants (after `HOP_ARC`, line 27):

```ts
/**
 * The King's radius ring sits at the BOTTOM of the flat-overlay ladder —
 * lowest renderOrder, so every interactive overlay paints over it — and is
 * the one overlay that is always present while its King lives. Ladder,
 * lowest first: this ring (0), TowerCoverage's amber footprint (1),
 * CoveragePreview's teal box (2) and illegal marker (3), SelectionMarker (4),
 * FirePulses (5). TowerCoverage.tsx carries the reasoning.
 */
const KING_RADIUS_RENDER_ORDER = 0
/** Height band of the King's radius ring, clear of the buff ring (0.02) and CoveragePreview's box (0.03+). */
const KING_RADIUS_Y = 0.026
```

In the `resources` `useMemo` (lines 42-52), add the two new shared objects:

```ts
    const ring = new RingGeometry(0.34, 0.42, 16)
    const ringMaterial = new MeshStandardMaterial({ color: BUFF_RING_COLOUR, emissive: BUFF_RING_COLOUR })
    // The King's radius: a faint ring wider than the buff ring, at its own
    // height band so it is coplanar with nothing, and the lowest renderOrder
    // rung so it never covers an interactive overlay.
    const radiusRing = new RingGeometry(SQUARE_SIZE * 0.44, SQUARE_SIZE * 0.52, 32)
    const radiusMaterial = new MeshBasicMaterial({
      color: BUFF_RING_COLOUR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
```

and return them: `return { byTier, ring, ringMaterial, radiusRing, radiusMaterial }`.

Add both to the cleanup effect (lines 54-63):

```ts
      resources.ring.dispose()
      resources.ringMaterial.dispose()
      resources.radiusRing.dispose()
      resources.radiusMaterial.dispose()
```

- [ ] **Step 2: Pass the radius resources through and fix `healthFraction`**

In the `pieces.map` (lines 67-85), pass the new props to `PieceMesh`:

```tsx
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
            radiusGeometry={resources.radiusRing}
            radiusMaterial={resources.radiusMaterial}
```

Add `radiusGeometry: BufferGeometry` and `radiusMaterial: Material` to `PieceMesh`'s prop type and destructure them.

Fix the health fraction (line 180) — a Piece's ceiling may now exceed the authored stat via the defense grant:

```ts
    const healthFraction = piece.health / piece.maxHealth
```

`pieceType` is then unused in this file; remove the `import { pieceType } from '../data/pieceTypes'` line (10).

- [ ] **Step 3: Frame-loop ring and radius toggling**

In `PieceMesh`, add `const radiusRef = useRef<Mesh>(null)`. Replace the buff-ring block (lines 194-208) with:

```ts
    // Toggling `visible` rather than mounting conditionally — mounting would
    // recompile the material. No state is set here.
    //
    // The buff is PERMANENT once latched, so the ring shows whenever the Piece
    // carries a stack — including the gap between rounds, and after the King
    // that granted it is long gone. (The old per-tick positional aura had to
    // gate on `inProgress` because a stranded flag would otherwise linger over
    // a dead King; a latched stack is the feature, not a stale read.) Scale
    // grows with the stack count so intensity reads as strength.
    const ring = ringRef.current
    if (ring) {
      ring.visible = piece.kingAuraStacks > 0
      if (ring.visible) {
        const ringScale = 1 + 0.1 * (piece.kingAuraStacks - 1)
        ring.scale.set(ringScale, ringScale, ringScale)
        ring.position.set(mesh.position.x, 0.02, mesh.position.z)
      }
    }

    // The King's radius ring: faint, always on while the King lives, toggled
    // like the buff ring. Its own height band and renderOrder rung keep it
    // ordered against the other flat overlays.
    const radius = radiusRef.current
    if (radius) {
      radius.visible = piece.typeId === 'king'
      if (radius.visible) {
        radius.position.set(mesh.position.x, KING_RADIUS_Y, mesh.position.z)
      }
    }
```

- [ ] **Step 4: Mount the radius mesh**

In `PieceMesh`'s JSX (lines 211-222), add the third mesh:

```tsx
      <mesh
        ref={radiusRef}
        geometry={radiusGeometry}
        material={radiusMaterial}
        renderOrder={KING_RADIUS_RENDER_ORDER}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
```

- [ ] **Step 5: Update the overlay ladder enumerations**

Every file that enumerates the flat-overlay ladder gains rung 0 at the lowest position:

- `src/scene/TowerCoverage.tsx` lines 41-43 (band list) and 63-65 (rung list): prepend "the King's radius ring (0)" / "the King's radius ring at 0.026".
- `src/scene/CoveragePreview.tsx` lines 15-17: prepend "the King's radius ring (0)".
- `src/scene/SelectionMarker.tsx` lines 9-11: prepend "the King's radius ring (0)".
- `src/scene/FirePulses.tsx` lines 24-25: prepend "the King's radius ring (0)".

- [ ] **Step 6: Verify — typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. (The renderer is deliberately untested; no test command applies.)

- [ ] **Step 7: Commit**

```bash
git add src/scene/Pieces.tsx src/scene/TowerCoverage.tsx src/scene/CoveragePreview.tsx src/scene/SelectionMarker.tsx src/scene/FirePulses.tsx
git commit -m "Scale the buff ring by stacks and render the King's radius"
```

---

### Task 3: Docs — design doc, CLAUDE.md, Guard-round comment, decision spec

Update the canonical design doc and CLAUDE.md to the latched design, fix the Guard-round code comment, and record the reversal decision in a dated spec.

**Files:**
- Modify: `docs/design/game-design.md` (line 286, 329, 188, 321)
- Modify: `CLAUDE.md` (line 25, plus a new invariant bullet)
- Modify: `src/data/guardRounds.ts:8-10` (comment)
- Create: `docs/superpowers/specs/2026-08-18-kings-aura-latch-design.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update `docs/design/game-design.md`**

Replace the Auras King bullet (line 329) with:

```md
**The King** grants every *other* Piece at Chebyshev distance 1 (the eight surrounding squares) a permanent, stacking aura. A King-touch **latches**: a Piece earns one stack per adjacency *episode* — a contiguous period in range of one King — and never loses it; leaving and re-entering, or touching a different King, earns another, and two Kings at once grant two. Each stack re-applies the full aura, compounding: move interval ×0.7 per stack (0.7^N), **+1 slide** per stack to sliders (Bishop, Rook, Queen), and **+1 max health** per stack, healing current health by exactly the increase the moment the stack lands (a Bishop's heal caps against the raised ceiling). It never buffs itself, but King-to-King adjacency stacks on each King exactly as it does on any other Piece. A promoted Queen inherits her Pawn's stacks. Because the buff latches, standing beside a King once is a decision the player answers for the rest of the march — the Commander's presence outlives its square.
```

Replace the slider grant in the King section (line 286): "**+1 while adjacent to a King**" becomes "**+1 per King-aura stack**".

Update the Guard-round blurb (line 188): after "spawning together so the King's aura fires as the squad enters", append "and the latched buff stays with the squad for the whole march".

Update the roster King row (line 321): "**Commander** — slow, tough, buffs adjacent Pieces" becomes "**Commander** — slow, tough, latches permanent buffs onto adjacent Pieces".

- [ ] **Step 2: Update `CLAUDE.md`**

On line 25, change "the King's move-speed/slide aura" to "the King's permanent, stackable move-speed/slide/health aura".

Add an invariant bullet under "Invariants that constrain code" (near the Pieces-spawn-onto-Staging bullet):

```md
- **The King's aura latches and stacks; it is never re-derived from position.** A King-touch (Chebyshev distance 1) permanently grants one stack per adjacency episode — one King, one touch, forever; leaving and re-entering, or touching a different King, adds another. Each stack compounds the move interval (×0.7), adds +1 slide to sliders, and grants +1 max health while healing current health by exactly that increase. The stacks live on the Piece (`kingAuraStacks`, `kingAuraKings` in `types.ts`); `applyKingAura` in `src/game/auras.ts` is the only writer, and `movePieces` reads them directly. A promoted Queen inherits the Pawn's stacks. This reverses the frozen Guard-round spec's "cannot be made to stick" choice — see `docs/superpowers/specs/2026-08-18-kings-aura-latch-design.md`.
```

- [ ] **Step 3: Update the `guardRounds.ts` comment**

Replace lines 8-10 with:

```ts
 * Every 8th round starting at round 15 is a Guard round: it replaces the
 * normal pool composition with clustered King+slider squads, so the King's
 * aura — which now latches permanently and stacks per touch — actually fires
 * on entry, and the squad keeps its buff for the whole march. See the design
 * spec, docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md.
```

- [ ] **Step 4: Write the decision spec**

Create `docs/superpowers/specs/2026-08-18-kings-aura-latch-design.md` — a dated, frozen decision record. Title "King's aura: permanent, stacking, survivable". Content: the problem (entry-burst-only, movement-only aura, Guard rounds expose it), the decision (latched episode-per-touch stacks, compounding 0.7^N + N slide + N health with heal-on-land mirroring Tower upgrades, King-King stacks, promotion inherits, episode bookkeeping via `kingAuraKings`, one stack per adjacency episode to keep "standing next to a King forever" from farming stacks), what it reverses (`docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md`'s positional non-stacking "cannot be made to stick" choice and the resulting Guard-round tuning), the rejected alternatives (per-tick re-derivation as today; a duration-based buff that expires; one-stack lifetime cap), and the consequence (Guard rounds get strictly scarier, intended). Reference issue #78.

- [ ] **Step 5: Verify and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: PASS.

```bash
git add docs/design/game-design.md CLAUDE.md src/data/guardRounds.ts docs/superpowers/specs/2026-08-18-kings-aura-latch-design.md
git commit -m "Document the latched King aura"
```