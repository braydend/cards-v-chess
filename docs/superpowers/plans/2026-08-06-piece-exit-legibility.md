# Piece Exit Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Piece leaving the board reads as what actually happened to it — a leak lunges into the Core and flashes it, a Tower kill bursts in place, a Joker's Clear flashes the whole board, and a promotion pops the new Queen.

**Architecture:** The engine records the two exits it cannot be inferred from (leaks, promotions) in a never-cleared 32-entry ring, plus a monotonic `clears` counter and a renderer-facing `promoted` flag. The renderer diffs published snapshots against those records in a pure, tested module and infers a Tower kill as the only remaining case. No presentation timing enters the engine, and `structuralKey` is untouched so no publish is added.

**Tech Stack:** TypeScript (strict), React Three Fiber, three.js, zustand, Vitest, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-06-piece-exit-legibility-design.md`](../specs/2026-08-06-piece-exit-legibility-design.md) — read it first. Issue [#12](https://github.com/braydend/cards-v-chess/issues/12).

## Global Constraints

Every task's requirements implicitly include all of these.

- **`src/game/` and `src/data/` must never import React or three.js.** ESLint-enforced; a violation fails `pnpm lint` and therefore CI.
- **`src/scene/`, `src/ui/` and `src/state/` import engine code only from `src/game/index.ts`**, never a module inside `src/game/`. ESLint-enforced. **Test files are exempt** — `pieceExit.test.ts` may import `src/game/fixtures` directly.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** ESLint-enforced.
- **Never call `setState` inside `useFrame`**, and never allocate in the frame loop. No `new Vector3()` / `new Color()` per frame — construct once, mutate with `.set()` / `.copy()`.
- **Vitest runs through esbuild and does not typecheck.** A passing suite is not a passing typecheck. Run `pnpm typecheck` to verify any type-level claim.
- **Use `pnpm test:run` in automation.** `pnpm test` is watch mode and will hang.
- **Coverage thresholds** (`vite.config.ts`): `src/game/**` 85/85/85/90, `src/state/**` 90/95/85/90. `src/scene/**` is excluded from coverage entirely — new modules there still get tests, following `towerDiff.ts`, `firePulse.ts` and `towerColour.ts`, but they move no threshold.
- **Renderer feel constants live beside the code that reads them**, in `src/scene/`, never in `src/data/`. Precedent: `HIT_FLASH_MS` in `towerColour.ts`, `PULSE_FADE_MS` in `firePulse.ts`. Every timing constant in this plan is a **placeholder** and must say so.
- **Commit messages end with:**
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- **Full check before any commit that touches production code:** `pnpm lint && pnpm typecheck && pnpm test:run`.

## One refinement on the spec

The spec's §3 sketches `diffPieceExits` returning `PieceGhost[]`. **It returns a `PieceExitDiff` object instead**, carrying `ghosts` plus a `runReset` flag. The reason: the component has to drop live ghosts and cancel their timers when `reset()` is detected, and if the diff returned only ghosts the component would have to re-derive the rewind by watching `nextEntityId` itself — putting a decision back inside a `.tsx` file where it cannot be tested. Everything else follows the spec as written.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/types.ts` | **Modify.** `ExitRecord`; `recentExits` and `clears` on `GameState`; `promoted` on `Piece` |
| `src/game/index.ts` | **Modify.** Export `ExitRecord` onto the public surface |
| `src/game/state.ts` | **Modify.** Initialise `recentExits` and `clears` |
| `src/game/tick.ts` | **Modify.** `EXIT_RING_SIZE`, `appendExits`, record leaks and promotions, flag the promoted Queen |
| `src/game/cardPlays.ts` | **Modify.** Count a Clear |
| `src/game/fixtures.ts` | **Modify.** `promoted: false` in `pieceAt` |
| `src/scene/pieceGeometry.ts` | **Create.** Silhouette factories and rest heights, lifted out of `Pieces.tsx` so ghosts can share them |
| `src/scene/pieceExit.ts` | **Create.** Exit classification, ghost records, and ghost timing maths — every decision, all pure |
| `src/scene/coreFlash.ts` | **Create.** The Core's colour and emissive intensity, including the impact flash |
| `src/scene/boardFlash.ts` | **Create.** The Clear's board-wide additive contribution |
| `src/scene/promotionPop.ts` | **Create.** The promoted Queen's scale multiplier and lift |
| `src/scene/PieceExits.tsx` | **Create.** Ghost lifetime and meshes. Plumbing only |
| `src/scene/Pieces.tsx` | **Modify.** Import the lifted tables; apply the promotion pop |
| `src/scene/Core.tsx` | **Modify.** Material ref, `useFrame`, flash ref prop |
| `src/scene/GameScene.tsx` | **Modify.** Own the shared flash ref; mount `PieceExits` |
| `src/scene/FirePulses.tsx` | **Modify.** Sum the board flash into the existing additive layer |
| `src/game/tick.test.ts` | **Modify.** Exit records for leaks and kills, ring cap |
| `src/game/promotion.test.ts` | **Modify.** Promotion record and the `promoted` flag |
| `src/game/faceCards.test.ts` | **Modify.** `clears` counting |
| `src/state/structuralKey.test.ts` | **Modify.** Pin that the new fields add no publish |
| `src/scene/pieceExit.test.ts` | **Create.** All five classification branches, driven through the real engine |
| `src/scene/coreFlash.test.ts` | **Create.** Flash decay and the preserved critical threshold |
| `src/scene/boardFlash.test.ts` | **Create.** Uniformity, decay, summing, bounds |
| `src/scene/promotionPop.test.ts` | **Create.** Pop shape and its return to neutral |
| `CLAUDE.md` | **Modify.** Current state, and the live test count |

Task order matters: Tasks 1–3 add the engine facts that Task 6 consumes; Task 5 extracts what Task 9 shares; Tasks 6–8 and 11 supply the pure modules the `.tsx` tasks plumb.

---

### Task 1: Record leaks in a never-cleared exit ring

**Files:**
- Modify: `src/game/types.ts` — add `ExitRecord` near `Piece`; add `recentExits` to `GameState`
- Modify: `src/game/index.ts:20-39` — export `ExitRecord`
- Modify: `src/game/state.ts:29-46` — initialise `recentExits`
- Modify: `src/game/tick.ts` — `EXIT_RING_SIZE`, `appendExits`, record in `movePieces`, thread through `tick`'s three returns
- Test: `src/game/tick.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ExitRecord { pieceId: string; typeId: PieceTypeId; reason: 'leak' | 'promotion'; from: Square }`, exported from `src/game/index.ts`. `GameState.recentExits: readonly ExitRecord[]`. `EXIT_RING_SIZE: number` (32), exported from `src/game/tick.ts`.

- [ ] **Step 1: Write the failing tests**

Add this block at the end of `src/game/tick.test.ts`. `EXIT_RING_SIZE` comes from `./tick` directly — a test importing an internal module is established here (`tick.test.ts` already imports `./auras` and `./ink`).

Add to the existing imports at the top of the file:

```ts
import { CORE_SQUARE } from '../data/board'
import { EXIT_RING_SIZE } from './tick'
```

Then append:

```ts
describe('tick: exit records', () => {
  /** A lone Pawn one square up-file from the Core, so its next hop leaks. */
  function oneLeakAway(state: GameState = createInitialState()): GameState {
    return liveRound(state, [pawnAt('leaker', { file: 3, rank: 1 })])
  }

  it('records a leak with the leaker id, type, and the square it left from', () => {
    const after = runFor(oneLeakAway(), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.recentExits).toEqual([
      { pieceId: 'leaker', typeId: 'pawn', reason: 'leak', from: { file: 3, rank: 1 } },
    ])
  })

  it("never records the Core's own square, which a leaking Piece never occupies", () => {
    // `nextMove` returns `reachCore` for the square it WOULD step to, and
    // `movePieces` drops the Piece without ever assigning it — so the renderer
    // has to lunge from the square recorded here to a Core square the engine
    // never wrote.
    const after = runFor(oneLeakAway(), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.recentExits[0]?.from).not.toEqual(CORE_SQUARE)
  })

  it('records the square reached mid-tick, not the square the Piece began the tick on', () => {
    // One tick, two hops: the Pawn steps rank 2 -> 1 and then leaks, so `from`
    // must be rank 1. Reading `piece.square` instead of the hop loop's own
    // `square` would report rank 2, and the renderer would lunge from a square
    // the Piece had already left.
    const state = liveRound(createInitialState(), [pawnAt('leaker', { file: 3, rank: 2 })])
    const after = tick(state, PIECE_TYPES.pawn.moveIntervalMs * 2)

    expect(after.recentExits[0]?.from).toEqual({ file: 3, rank: 1 })
  })

  it('records nothing when a Tower kills a Piece, since a kill is the absence of a record', () => {
    // Rank 7 deals 4 to a Pawn's 3 health, so one shot at 450ms kills it well
    // inside the Pawn's 900ms hop — no movement, no leak, nothing recorded.
    const armed = withTower(7, { file: 0, rank: 4 })
    const state = liveRound(armed, [pawnAt('victim', { file: 0, rank: 5 })])
    const after = runFor(state, TOWER_RANKS[7].fireIntervalMs + DT)

    expect(after.pieces).toHaveLength(0)
    expect(after.recentExits).toEqual([])
  })

  it('drops the oldest record past the ring size and keeps the newest', () => {
    const filled = Array.from({ length: EXIT_RING_SIZE }, (_, index) => ({
      pieceId: `old-${index}`,
      typeId: 'pawn' as const,
      reason: 'leak' as const,
      from: { file: 0, rank: 0 },
    }))
    const state = oneLeakAway({ ...createInitialState(), recentExits: filled })
    const after = runFor(state, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.recentExits).toHaveLength(EXIT_RING_SIZE)
    expect(after.recentExits[0]?.pieceId).toBe('old-1')
    expect(after.recentExits.at(-1)?.pieceId).toBe('leaker')
  })

  it('keeps records across a round boundary, because auto-start can wipe them mid-frame', () => {
    // The load-bearing lifetime test. `tick` auto-starts by calling `step` from
    // inside itself, and `advance` runs up to five ticks per emit — so a leak,
    // the round ending, and the auto-start can all land inside one frame. If
    // `startRound` cleared the ring, the record would be gone before the
    // renderer's only publish, and the last leak of a round would burst in
    // place instead of lunging.
    const base = createInitialState()
    const after = runFor(
      oneLeakAway({ ...base, autoStart: true }),
      PIECE_TYPES.pawn.moveIntervalMs + DT * 4,
    )

    expect(after.phase).toBe('inProgress')
    expect(after.roundNumber).toBe(2)
    expect(after.recentExits.map((exit) => exit.pieceId)).toContain('leaker')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/tick.test.ts`
Expected: FAIL. The `EXIT_RING_SIZE` import is unresolved and every assertion on `recentExits` reads `undefined`.

- [ ] **Step 3: Add `ExitRecord` and `recentExits` to the types**

In `src/game/types.ts`, add immediately **above** `export interface Piece {`:

```ts
/**
 * Why a Piece left `state.pieces`, recorded for the renderer.
 *
 * A KILL IS THE ABSENCE OF A RECORD. Kills are unbounded within a round, so
 * logging them would be the wrong shape; leaks and promotions are both rare, so
 * recording those two and inferring the rest is exhaustive rather than a guess —
 * `reset()` and a Joker's Clear are the only other ways a Piece leaves, and the
 * renderer detects both separately. See `src/scene/pieceExit.ts`.
 */
export interface ExitRecord {
  /** The DEPARTING Piece's id — for a promotion, the Pawn's, not the Queen's. */
  readonly pieceId: string
  readonly typeId: PieceTypeId
  readonly reason: 'leak' | 'promotion'
  /**
   * The square it left FROM.
   *
   * For a leak this is NEVER the Core's square: a leaking Piece never occupies
   * it. `nextMove` returns `reachCore` for the square it would step to, and
   * `movePieces` drops the Piece without ever assigning it — so this is the
   * only record of where the impact should start.
   */
  readonly from: Square
}
```

In the same file, add to `GameState` directly after `readonly leaks: number` (around line 228):

```ts
  /**
   * The most recent leaks and promotions, for the renderer to animate. Kills
   * are deliberately absent — see `ExitRecord`.
   *
   * NEVER CLEARED. Capped at `EXIT_RING_SIZE` in `tick.ts` instead, because
   * clearing it at `startRound` loses records: `tick` auto-starts by calling
   * `step` from inside itself, and `advance` runs up to five ticks before
   * emitting once, so a leak, the round ending and the auto-start can all land
   * inside a single frame — wiping the record before the renderer's only
   * publish. That is the last-Piece-leaks-and-ends-the-round case, the most
   * important leak in a round.
   *
   * Lookup is by `pieceId`, unique within a run because `nextEntityId` only
   * rises, so a stale record can never match a live Piece. Deliberately
   * duplicates part of what `leaks` counts: a count cannot say WHICH Piece or
   * FROM WHERE.
   */
  readonly recentExits: readonly ExitRecord[]
```

- [ ] **Step 4: Export it and initialise it**

In `src/game/index.ts`, add `ExitRecord` to the `export type { ... } from './types'` block, keeping it alphabetical — between `Command` and `FaceRank`:

```ts
  Command,
  ExitRecord,
  FaceRank,
```

In `src/game/state.ts`, add to the returned object after `leaks: 0,`:

```ts
    recentExits: [],
```

- [ ] **Step 5: Record leaks in `tick.ts`**

In `src/game/tick.ts`, add `ExitRecord` to the type import on line 9:

```ts
import type { BoardSpec, ExitRecord, GameState, Piece, Square, Tower } from './types'
```

Add below the imports, above `export function tick`:

```ts
/**
 * How many exit records `GameState.recentExits` keeps.
 *
 * Sized against the observation window, not by feel. A publish observes at most
 * one frame of simulation, so overflowing before the renderer reads the ring
 * would take 32 exits inside one frame — which needs 32 Pieces simultaneously
 * one hop from the Core, a board state that would have ended the run several
 * times over.
 */
export const EXIT_RING_SIZE = 32

/**
 * Appends to the exit ring, dropping the oldest past `EXIT_RING_SIZE`.
 *
 * Returns the SAME array when there is nothing to append, so the overwhelming
 * majority of ticks allocate nothing here.
 */
function appendExits(
  current: readonly ExitRecord[],
  added: readonly ExitRecord[],
): readonly ExitRecord[] {
  if (added.length === 0) return current

  const next = [...current, ...added]

  return next.length > EXIT_RING_SIZE ? next.slice(next.length - EXIT_RING_SIZE) : next
}
```

In `movePieces`, widen the return type and collect the records. Change the signature's return type to:

```ts
): {
  pieces: Piece[]
  leaked: number
  towerDamage: Map<string, number>
  promoted: Square[]
  exits: ExitRecord[]
} {
```

Add beside the other accumulators at the top of the body:

```ts
  const exits: ExitRecord[] = []
```

Replace the `reachedCore` handling near the end of the per-Piece loop:

```ts
    if (reachedCore) {
      leaked += 1
      // `square`, not `piece.square`: the hop loop above can have advanced the
      // Piece more than once within this tick, and the renderer must lunge from
      // where it actually was, not where it started the tick.
      exits.push({ pieceId: piece.id, typeId: piece.typeId, reason: 'leak', from: square })
      continue
    }
```

And extend the return:

```ts
  return { pieces: survivors, leaked, towerDamage, promoted, exits }
```

In `tick`, add directly after `const leaks = state.leaks + moved.leaked`:

```ts
  const recentExits = appendExits(state.recentExits, moved.exits)
```

Then add `recentExits,` to **all three** returns that follow — the `coreHealth === 0` branch, the `!stillActive` branch, and the final return. Put it next to `leaks,` in each.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:run src/game/tick.test.ts`
Expected: PASS, including the pre-existing tests in the file.

- [ ] **Step 7: Run the full check**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all pass. `pnpm typecheck` is the one that proves `recentExits` reached every construction site of `GameState`.

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/game/index.ts src/game/state.ts src/game/tick.ts src/game/tick.test.ts
git commit -m "$(cat <<'EOF'
Record leaks in a never-cleared exit ring

A leaking Piece never occupies the Core's square — movePieces drops it on
the reachCore outcome without ever assigning that square — so the renderer
has no way to know which Piece leaked or where from. GameState now carries
recentExits, capped at 32 and never cleared.

Never cleared rather than reset at startRound: tick auto-starts by calling
step from inside itself and advance runs up to five ticks per emit, so a
leak, the round ending and the auto-start can all land in one frame and
wipe the record before the renderer's only publish.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Record promotions and flag the promoted Queen

**Files:**
- Modify: `src/game/types.ts` — `promoted` on `Piece`
- Modify: `src/game/tick.ts` — record the promotion; `promoted` on both Piece mint sites
- Modify: `src/game/fixtures.ts:64-81` — `promoted: false` in `pieceAt`
- Modify: `src/game/auras.test.ts`, `src/game/termination.test.ts`, `src/game/tick.test.ts` (two literals) — `promoted: false`
- Test: `src/game/promotion.test.ts`

**Interfaces:**
- Consumes: `ExitRecord` and `GameState.recentExits` from Task 1.
- Produces: `Piece.promoted: boolean` — true only on a Queen minted by promotion. A `reason: 'promotion'` `ExitRecord` for the departing Pawn.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/promotion.test.ts`, inside the existing `describe('pawn promotion', ...)` block:

```ts
  it('flags the promoted Queen, so the renderer can pop it once', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.promoted).toBe(true)
  })

  it("records the Pawn's exit as a promotion, so the renderer does not burst it", () => {
    // A promoted Pawn was not destroyed but transformed. Without this record it
    // matches nothing in the ring, and the renderer's default — a kill burst —
    // would read as "the Pawn died and a Queen arrived".
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.recentExits).toEqual([
      { pieceId: 'piece-1', typeId: 'pawn', reason: 'promotion', from: { file: 0, rank: 0 } },
    ])
  })

  it('leaves a spawned Piece unflagged', () => {
    // Round 1's first spawn is at atMs 0, so one tick is enough.
    const started = step(createInitialState(), { kind: 'startRound' })
    const after = tick(started, DT)

    expect(after.pieces).toHaveLength(1)
    expect(after.pieces[0]?.promoted).toBe(false)
  })

  it('leaves a Piece that merely moves unflagged', () => {
    const state = runFor(withPawn(0, 5), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.square).toEqual({ file: 0, rank: 4 })
    expect(state.pieces[0]?.promoted).toBe(false)
  })
```

The third test needs `step` on the import line, which currently reads
`import { createInitialState, tick } from './index'`. Change it to:

```ts
import { createInitialState, step, tick } from './index'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/promotion.test.ts`
Expected: FAIL — `promoted` is `undefined` rather than `true`/`false`, and `recentExits` is empty.

- [ ] **Step 3: Add the flag to `Piece`**

In `src/game/types.ts`, add to `Piece` directly after the `hunting` field's block (around line 103):

```ts
  /**
   * Whether this Piece is a Queen minted by Pawn promotion.
   *
   * Renderer-facing and never read by the engine — the same category `buffed`
   * occupies. `Pieces.tsx` pops a Queen's mesh once, on the first frame it sees
   * one, which needs no diff: a promoted Queen gets a fresh entity id, so React
   * mounts a fresh mesh for it.
   *
   * False for every spawned Piece and every type that is not a promoted Queen,
   * kept false rather than omitted so every Piece has the same shape, exactly
   * as `hunting` is.
   */
  readonly promoted: boolean
```

- [ ] **Step 4: Set it at both mint sites and record the exit**

In `src/game/tick.ts`, in the `promotedQueens` mapping (around line 52), add after `hunting: false,`:

```ts
    // Renderer-facing only. This is the one place it is ever true.
    promoted: true,
```

In `drainDueSpawns` (around line 306), add after `hunting: false,`:

```ts
      promoted: false,
```

In `movePieces`, replace the promotion branch inside the hop loop:

```ts
      if (outcome.kind === 'promote') {
        promoted.push(square)
        isPromoted = true
        exits.push({
          pieceId: piece.id,
          typeId: piece.typeId,
          reason: 'promotion',
          from: square,
        })
        break
      }
```

- [ ] **Step 5: Add the field to every remaining literal**

`pnpm typecheck` lists them. There are five:

- `src/game/fixtures.ts` in `pieceAt` — add `promoted: false,` after `hunting: false,`
- `src/game/auras.test.ts` in the `piece` helper
- `src/game/termination.test.ts` in its Piece helper
- `src/game/tick.test.ts` in **both** literals — the `rookOnBackRank` inline Piece and the typed Piece helper below it

Do **not** touch `src/game/movement.test.ts`. Its `hunting: false` literal is a `MoveRequest`, not a `Piece`, and needs no change.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:run && pnpm typecheck`
Expected: both pass. Typecheck is what proves no literal was missed.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/tick.ts src/game/fixtures.ts src/game/promotion.test.ts src/game/auras.test.ts src/game/termination.test.ts src/game/tick.test.ts
git commit -m "$(cat <<'EOF'
Record promotions and flag the promoted Queen

A promoting Pawn leaves state exactly as a killed one does, so without a
record the renderer would burst it and the pair would read as "the Pawn
died and a Queen arrived" rather than as an upgrade.

The record silences the departing Pawn; the flag pops the arriving Queen.
They are different Pieces with different ids, so both are needed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Count Clears, and pin that none of this publishes

**Files:**
- Modify: `src/game/types.ts` — `clears` on `GameState`
- Modify: `src/game/state.ts` — initialise `clears`
- Modify: `src/game/cardPlays.ts:219-231` — increment in `clearPieces`
- Test: `src/game/faceCards.test.ts`, `src/state/structuralKey.test.ts`

**Interfaces:**
- Consumes: `GameState.recentExits` from Task 1.
- Produces: `GameState.clears: number` — monotonic count of resolved Joker Clears.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/faceCards.test.ts`. Check its existing imports first and add only what is missing — this block needs `createInitialState` and `step` from `./index`, and `jokerCard`, `liveRound`, `pawnAt`, `withDeck` from `./fixtures`.

```ts
describe('Joker Clear: the renderer signal', () => {
  function clearable(): GameState {
    return withDeck(
      [jokerCard('joker-1')],
      liveRound(createInitialState(), [
        pawnAt('a', { file: 0, rank: 5 }),
        pawnAt('b', { file: 1, rank: 5 }),
      ]),
    )
  }

  it('counts the Clear, so the renderer flashes the board instead of bursting every Piece', () => {
    // Monotonic on purpose. The renderer compares this per frame, and a
    // per-tick flag would be lost when `advance` runs five ticks per emit.
    const state = clearable()
    const after = step(state, { kind: 'clearPieces', cardId: 'joker-1' })

    expect(after.pieces).toEqual([])
    expect(after.clears).toBe(state.clears + 1)
  })

  it('records no per-Piece exits for a Clear', () => {
    // A Clear is one board-wide event, not fifteen exits. The renderer needs
    // the count and nothing else.
    const after = step(clearable(), { kind: 'clearPieces', cardId: 'joker-1' })

    expect(after.recentExits).toEqual([])
  })

  it('does not count a refused Clear', () => {
    const state = clearable()
    const refused = step(state, { kind: 'clearPieces', cardId: 'no-such-card' })

    expect(refused).toBe(state)
    expect(refused.clears).toBe(0)
  })
})
```

Append to `src/state/structuralKey.test.ts`, inside the existing `describe('structuralKey', ...)`:

```ts
  it('ignores recentExits and clears, which add no publish of their own', () => {
    // Every real exit already changes this key some other way: a leak moves
    // `leaks` and `core.health`, a kill and a promotion move the pieces string,
    // and a Clear empties it and removes the consumed Joker from the deck ids.
    // Keying these two as well would add a per-leak string for no new publish —
    // and `simulation.test.ts`'s bound of 60 publishes per 600 frames depends on
    // this design adding none.
    const base = createInitialState()
    const recorded: GameState = {
      ...base,
      recentExits: [
        { pieceId: 'leaker', typeId: 'pawn', reason: 'leak', from: { file: 3, rank: 1 } },
      ],
      clears: base.clears + 1,
    }

    expect(structuralKey(recorded)).toBe(structuralKey(base))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/faceCards.test.ts src/state/structuralKey.test.ts`
Expected: FAIL — `clears` is `undefined`, so `after.clears` does not equal `1`. The `structuralKey` test may pass already; that is fine, it is a regression pin, but it must not be committed before `clears` exists or it pins nothing.

- [ ] **Step 3: Add and initialise `clears`**

In `src/game/types.ts`, add to `GameState` directly after the `recentExits` block:

```ts
  /**
   * How many Joker Clears have resolved this run. Monotonic.
   *
   * The renderer's signal to flash the whole board rather than burst every
   * Piece it just saw vanish, and it cannot be inferred from an empty `pieces`
   * array — killing the last Piece on the board also empties it, and that one
   * SHOULD burst.
   *
   * A counter rather than a flag deliberately: `advance` runs up to five ticks
   * per emit, so anything written and cleared per tick can be lost, while a
   * monotonic count read per frame cannot.
   */
  readonly clears: number
```

In `src/game/state.ts`, add after `recentExits: [],`:

```ts
    clears: 0,
```

In `src/game/cardPlays.ts`, in `clearPieces`, add to the returned object:

```ts
    clears: state.clears + 1,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/faceCards.test.ts src/state/structuralKey.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full check**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/state.ts src/game/cardPlays.ts src/game/faceCards.test.ts src/state/structuralKey.test.ts
git commit -m "$(cat <<'EOF'
Count Joker Clears for the renderer

A Clear empties the board, and the renderer needs to tell that from fifteen
simultaneous kills. It cannot be inferred from an empty pieces array, since
killing the last Piece empties it too and that one should burst.

A monotonic counter rather than a per-tick flag, which advance would lose
when it runs five ticks per emit. structuralKey is deliberately untouched:
every real exit already publishes through some other field, so this design
adds no publish, and there is now a test pinning that.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Lift the Piece silhouette tables into their own module

**Files:**
- Create: `src/scene/pieceGeometry.ts`
- Modify: `src/scene/Pieces.tsx:1-52` — import instead of define

**Interfaces:**
- Consumes: nothing.
- Produces: `GEOMETRY_BY_TYPE: Record<PieceTypeId, () => BufferGeometry>`, `REST_Y_BY_TYPE: Record<PieceTypeId, number>`, `PIECE_TYPE_IDS: PieceTypeId[]`.

This is a pure move with no behaviour change, so it has no test of its own — the existing suite plus `pnpm typecheck` and `pnpm build` are the verification.

- [ ] **Step 1: Create the module**

```ts
import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import type { PieceTypeId } from '../game'

/**
 * One silhouette factory per Piece type.
 *
 * Shared by `Pieces.tsx` and `PieceExits.tsx`, which each call these and dispose
 * their own instances. Six low-poly geometries is not worth a sharing
 * mechanism, and a ghost's material differs from a live Piece's regardless.
 *
 * In its own module rather than exported from a component file: mixing
 * component and non-component exports breaks React Fast Refresh, which shows up
 * as a full reload on every edit instead of a hot update. Same precedent
 * `pieceColours.ts` and `rankColours.ts` already set.
 */
export const GEOMETRY_BY_TYPE: Record<PieceTypeId, () => BufferGeometry> = {
  pawn: () => new ConeGeometry(0.28, 0.55, 6),
  knight: () => new BoxGeometry(0.4, 0.6, 0.3),
  bishop: () => new ConeGeometry(0.2, 0.8, 6),
  rook: () => new CylinderGeometry(0.32, 0.32, 0.45, 6),
  queen: () => new ConeGeometry(0.3, 0.9, 8),
  king: () => new CylinderGeometry(0.26, 0.3, 0.85, 8),
}

/**
 * Where each silhouette's origin sits so the Piece rests on the board rather
 * than in it — half its height, rounded to the nearest hundredth. The Pawn is
 * the exception: it keeps the existing hand-tuned 0.35 (not a half-height value
 * at all) so it looks unchanged from before that task.
 */
export const REST_Y_BY_TYPE: Record<PieceTypeId, number> = {
  pawn: 0.35,
  knight: 0.3,
  bishop: 0.4,
  rook: 0.23,
  queen: 0.45,
  king: 0.43,
}

export const PIECE_TYPE_IDS = Object.keys(GEOMETRY_BY_TYPE) as PieceTypeId[]
```

- [ ] **Step 2: Point `Pieces.tsx` at it**

Delete `GEOMETRY_BY_TYPE`, `REST_Y_BY_TYPE` and `PIECE_TYPE_IDS` from `src/scene/Pieces.tsx` (lines 20–44, including the `REST_Y_BY_TYPE` doc comment), and replace the three-file import block at the top. The `three` import narrows to what remains in use:

```ts
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import { pieceType } from '../data/pieceTypes'
import type { BoardSpec, PieceTypeId } from '../game'
import { getState } from '../state/simulation'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { PIECE_COLOURS } from './pieceColours'
import { GEOMETRY_BY_TYPE, PIECE_TYPE_IDS, REST_Y_BY_TYPE } from './pieceGeometry'
```

Leave `HOP_ANIMATION_MS` and `HOP_ARC` where they are — they are this component's own feel constants, not shared silhouette data.

- [ ] **Step 3: Verify nothing changed**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all pass. `pnpm build` is included because this task's only risk is an import that typechecks but fails to bundle.

- [ ] **Step 4: Commit**

```bash
git add src/scene/pieceGeometry.ts src/scene/Pieces.tsx
git commit -m "$(cat <<'EOF'
Lift the Piece silhouette tables into their own module

Ghosts need the same geometries and rest heights as live Pieces, and a
component file cannot export them without breaking Fast Refresh — the same
reason pieceColours.ts and rankColours.ts already stand alone.

Pure move, no behaviour change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Classify Piece exits in a pure module

**Files:**
- Create: `src/scene/pieceExit.ts`
- Test: `src/scene/pieceExit.test.ts`

**Interfaces:**
- Consumes: `GameState.recentExits`, `GameState.clears` and `GameState.nextEntityId` from Tasks 1–3.
- Produces:
  - `PieceGhost { id, meshKey, typeId, reason: 'leak' | 'kill', file, boardRank }`
  - `PieceExitDiff { ghosts: readonly PieceGhost[], runReset: boolean }`
  - `ExitTracker` and `createExitTracker(): ExitTracker`
  - `diffPieceExits(tracker: ExitTracker, snapshot: GameState): PieceExitDiff`
  - `LEAK_LUNGE_MS`, `LEAK_BURST_MS`, `KILL_BURST_MS`, `GHOST_LIFETIME_MS`
  - `lungeProgress(ageMs: number): number`, `ghostScale(reason, ageMs): number`, `hasLanded(ageMs): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/scene/pieceExit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { createInitialState, step, tick, type GameState } from '../game'
import { jokerCard, liveRound, pawnAt, withDeck, withTower } from '../game/fixtures'
import {
  KILL_BURST_MS,
  LEAK_BURST_MS,
  LEAK_LUNGE_MS,
  createExitTracker,
  diffPieceExits,
  ghostScale,
  hasLanded,
  lungeProgress,
} from './pieceExit'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A tracker already seeded on `snapshot`, as the component seeds it on mount. */
function seededOn(snapshot: GameState) {
  const tracker = createExitTracker()
  diffPieceExits(tracker, snapshot)
  return tracker
}

function oneLeakAway(state: GameState = createInitialState()): GameState {
  return liveRound(state, [pawnAt('leaker', { file: 3, rank: 1 })])
}

describe('diffPieceExits', () => {
  it('reports nothing on the first call, seeding instead', () => {
    const diff = diffPieceExits(createExitTracker(), oneLeakAway())

    expect(diff.ghosts).toEqual([])
    expect(diff.runReset).toBe(false)
  })

  it('reports a leak at the square the engine recorded', () => {
    const before = oneLeakAway()
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const diff = diffPieceExits(seededOn(before), after)

    expect(diff.ghosts).toEqual([
      {
        id: 'leaker',
        meshKey: 'ghost:leaker',
        typeId: 'pawn',
        reason: 'leak',
        file: 3,
        boardRank: 1,
      },
    ])
  })

  it('reports a Tower kill in place, at the Piece last published square', () => {
    // Rank 7 deals 4 to a Pawn's 3 health, so the shot at 450ms kills it inside
    // the Pawn's 900ms hop — the Piece never moves, so "last published" and
    // "where the player last saw it" are the same square here.
    const before = liveRound(withTower(7, { file: 0, rank: 4 }), [
      pawnAt('victim', { file: 0, rank: 5 }),
    ])
    const after = runFor(before, TOWER_RANKS[7].fireIntervalMs + DT)
    const diff = diffPieceExits(seededOn(before), after)

    expect(diff.ghosts).toEqual([
      {
        id: 'victim',
        meshKey: 'ghost:victim',
        typeId: 'pawn',
        reason: 'kill',
        file: 0,
        boardRank: 5,
      },
    ])
  })

  it('reports nothing for a promoted Pawn, which was transformed rather than killed', () => {
    const before = liveRound(createInitialState(), [pawnAt('promoter', { file: 0, rank: 0 })])
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces.map((piece) => piece.typeId)).toEqual(['queen'])
    expect(diffPieceExits(seededOn(before), after).ghosts).toEqual([])
  })

  it('suppresses every burst when a Joker Clear empties the board', () => {
    const before = withDeck(
      [jokerCard('joker-1')],
      liveRound(createInitialState(), [
        pawnAt('a', { file: 0, rank: 5 }),
        pawnAt('b', { file: 1, rank: 5 }),
      ]),
    )
    const after = step(before, { kind: 'clearPieces', cardId: 'joker-1' })
    const diff = diffPieceExits(seededOn(before), after)

    expect(after.pieces).toEqual([])
    expect(diff.ghosts).toEqual([])
  })

  it('reports a run reset and suppresses everything when nextEntityId rewinds', () => {
    // `reset()` rewinds the counter to 1 — the only way it goes backwards
    // within a run. Chosen over gating on `phase === 'inProgress'` the way
    // `diffTowers` does; see the fatal-leak test below for why that matters.
    const before = { ...oneLeakAway(), nextEntityId: 9 }
    const diff = diffPieceExits(seededOn(before), createInitialState())

    expect(diff.runReset).toBe(true)
    expect(diff.ghosts).toEqual([])
  })

  it('still reports the leak that fells the Core, on the tick the phase turns defeated', () => {
    // The load-bearing case for not gating on phase. `diffTowers` suppresses
    // fallen Towers outside `inProgress`; copying that here would drop the
    // single most important impact in a run.
    const base = createInitialState()
    const before = oneLeakAway({ ...base, core: { ...base.core, health: 1 } })
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const diff = diffPieceExits(seededOn(before), after)

    expect(after.phase).toBe('defeated')
    expect(diff.ghosts.map((ghost) => ghost.reason)).toEqual(['leak'])
  })

  it('forgets a Piece once its ghost is emitted, so it is never reported twice', () => {
    const before = oneLeakAway()
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const tracker = seededOn(before)

    expect(diffPieceExits(tracker, after).ghosts).toHaveLength(1)
    expect(diffPieceExits(tracker, after).ghosts).toEqual([])
  })

  it('namespaces the mesh key, because reset() reuses Piece ids', () => {
    const before = oneLeakAway()
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const [ghost] = diffPieceExits(seededOn(before), after).ghosts

    expect(ghost?.meshKey).not.toBe(ghost?.id)
    expect(ghost?.meshKey).toBe('ghost:leaker')
  })
})

describe('ghost timing', () => {
  it('holds a leak at full size through the lunge, so the strike lands with weight', () => {
    expect(ghostScale('leak', 0)).toBe(1)
    expect(ghostScale('leak', LEAK_LUNGE_MS)).toBe(1)
  })

  it('collapses a leak to nothing over the burst that follows the lunge', () => {
    expect(ghostScale('leak', LEAK_LUNGE_MS + LEAK_BURST_MS / 2)).toBeCloseTo(0.5)
    expect(ghostScale('leak', LEAK_LUNGE_MS + LEAK_BURST_MS)).toBe(0)
  })

  it('swells a kill before collapsing it', () => {
    expect(ghostScale('kill', 0)).toBe(1)
    expect(ghostScale('kill', KILL_BURST_MS * 0.4)).toBeGreaterThan(1.3)
    expect(ghostScale('kill', KILL_BURST_MS)).toBe(0)
  })

  it('accelerates the lunge rather than easing it, because a leak is a strike', () => {
    // Eased in: at the halfway point in time it has covered less than half the
    // distance. A linear lunge would read as another hop.
    expect(lungeProgress(LEAK_LUNGE_MS / 2)).toBeLessThan(0.5)
    expect(lungeProgress(LEAK_LUNGE_MS)).toBe(1)
    expect(lungeProgress(LEAK_LUNGE_MS * 2)).toBe(1)
  })

  it('lands exactly at the end of the lunge, so the Core flash is not early', () => {
    expect(hasLanded(LEAK_LUNGE_MS - 1)).toBe(false)
    expect(hasLanded(LEAK_LUNGE_MS)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/pieceExit.test.ts`
Expected: FAIL — `Failed to resolve import "./pieceExit"`.

- [ ] **Step 3: Write the module**

Create `src/scene/pieceExit.ts`:

```ts
import type { GameState, PieceTypeId } from '../game'

/**
 * A Piece that has left `GameState`, held briefly so its exit is visible.
 *
 * Carries its own square and type for the reason `Ghost` in towerDiff.ts and
 * `FirePulse` in firePulse.ts both do: once the Piece leaves state, this record
 * is the only place the renderer still knows what it was or where it stood.
 */
export interface PieceGhost {
  readonly id: string
  /**
   * The ghost's React key, precomputed. Namespaced away from live Piece ids
   * because `reset()` rewinds the entity counter to 1: a ghost outlives its
   * Piece, so an unprefixed key could collide with a freshly spawned Piece that
   * reuses the id.
   */
  readonly meshKey: string
  readonly typeId: PieceTypeId
  readonly reason: 'leak' | 'kill'
  readonly file: number
  readonly boardRank: number
}

export interface PieceExitDiff {
  readonly ghosts: readonly PieceGhost[]
  /**
   * `reset()` was detected. The caller must drop every live ghost and cancel
   * their expiry timers, or a previous run's ghosts ride into the new one.
   */
  readonly runReset: boolean
}

interface SeenPiece {
  readonly typeId: PieceTypeId
  readonly file: number
  readonly boardRank: number
}

/**
 * Per-run bookkeeping. Lives in a ref, never in state: it is written from a
 * store subscription and routing it through React would buy nothing.
 */
export interface ExitTracker {
  readonly seen: Map<string, SeenPiece>
  lastClears: number
  lastEntityId: number
}

export function createExitTracker(): ExitTracker {
  return { seen: new Map(), lastClears: 0, lastEntityId: 0 }
}

/**
 * Reconciles bookkeeping against a published snapshot and returns the Pieces
 * that left, tagged with why. Mutates `tracker` in place — seeding Pieces it has
 * not seen, updating their squares, and deleting the departed — but touches no
 * React and no three.js, which is what makes it testable without a renderer.
 *
 * The first call on a fresh tracker necessarily returns nothing: no Piece can
 * have left a map that was empty a moment ago.
 *
 * **A KILL IS THE ABSENCE OF A RECORD, and that is exhaustive rather than a
 * guess.** There are exactly five ways a Piece leaves `state.pieces` — a leak, a
 * Tower kill, a promotion, a Joker's Clear, and `reset()`. The engine records
 * the first and third in `recentExits`; `clears` catches the fourth and
 * `nextEntityId` the fifth. A Tower kill is what remains. `startRound` does not
 * clear `pieces` — survivors persist through the gap — so there is no sixth,
 * round-boundary case.
 *
 * A kill burst is drawn at the Piece's LAST PUBLISHED square, which can be one
 * hop behind where the player last saw it: `Pieces.tsx` draws from live state,
 * so a Piece that hopped during the frame it died was drawn at the newer square.
 * The error is bounded at exactly one square and cannot compound — a frame
 * advances at most 83.3ms of simulation, and the fastest hop on the roster is a
 * Pawn's 900ms cut to 630ms by a King aura. A leak, where the start position
 * actually matters, is exact: the engine records `from` as it happens.
 */
export function diffPieceExits(tracker: ExitTracker, snapshot: GameState): PieceExitDiff {
  // `reset()` rewinds `nextEntityId` to 1 — the only way it can go backwards
  // within a run. Deliberately NOT a `phase === 'inProgress'` gate, which is
  // how `diffTowers` suppresses `reset()`: the leak that fells the Core sets
  // `defeated` in the same tick, so a phase gate would drop the single most
  // important impact in a run. This detector catches `reset()` without that
  // cost.
  const runReset = snapshot.nextEntityId < tracker.lastEntityId
  tracker.lastEntityId = snapshot.nextEntityId

  // Monotonic, so a comparison cannot miss one the way a per-tick flag would
  // when `advance` runs five ticks per emit.
  const cleared = snapshot.clears > tracker.lastClears
  tracker.lastClears = snapshot.clears

  const live = new Set<string>()

  for (const piece of snapshot.pieces) {
    live.add(piece.id)
    tracker.seen.set(piece.id, {
      typeId: piece.typeId,
      file: piece.square.file,
      boardRank: piece.square.rank,
    })
  }

  const ghosts: PieceGhost[] = []

  for (const [id, seen] of tracker.seen) {
    if (live.has(id)) continue
    // Deleting the current entry while iterating a Map is safe, and is what
    // `diffTowers` already does.
    tracker.seen.delete(id)

    if (runReset || cleared) continue

    const record = snapshot.recentExits.find((candidate) => candidate.pieceId === id)

    if (record?.reason === 'promotion') continue

    if (record?.reason === 'leak') {
      ghosts.push({
        id,
        meshKey: `ghost:${id}`,
        typeId: record.typeId,
        reason: 'leak',
        // From the record, not from `seen`: the Piece can have hopped more than
        // once inside the tick it leaked, and the engine recorded where it
        // actually was.
        file: record.from.file,
        boardRank: record.from.rank,
      })
      continue
    }

    ghosts.push({
      id,
      meshKey: `ghost:${id}`,
      typeId: seen.typeId,
      reason: 'kill',
      file: seen.file,
      boardRank: seen.boardRank,
    })
  }

  return { ghosts, runReset }
}

/**
 * Presentation constants, tunable by feel — the same category as `HIT_FLASH_MS`
 * in towerColour.ts and `PULSE_FADE_MS` in firePulse.ts. Nothing in the engine
 * reads them and none is a balance value. All PLACEHOLDERS.
 */
export const LEAK_LUNGE_MS = 180
export const LEAK_BURST_MS = 70
export const KILL_BURST_MS = 180

/** How much a kill swells before collapsing, and how far through it peaks. */
const KILL_PEAK = 1.35
const KILL_PEAK_AT = 0.4

/** How long each kind of ghost stays mounted. */
export const GHOST_LIFETIME_MS: Record<PieceGhost['reason'], number> = {
  leak: LEAK_LUNGE_MS + LEAK_BURST_MS,
  kill: KILL_BURST_MS,
}

/**
 * How far along its lunge a leak ghost is, 0..1.
 *
 * Squared, so it accelerates into the Core. A leak is a strike, not another hop
 * — which is also why the caller drops `Pieces.tsx`'s `sin` arc for these.
 */
export function lungeProgress(ageMs: number): number {
  const linear = Math.min(1, Math.max(0, ageMs / LEAK_LUNGE_MS))

  return linear * linear
}

/** Whether the impact has landed, so the Core flash is stamped exactly once. */
export function hasLanded(ageMs: number): boolean {
  return ageMs >= LEAK_LUNGE_MS
}

/**
 * A ghost's scale this frame, 0 once it is spent.
 *
 * Scale rather than opacity, and one shared material per Piece type rather than
 * one per ghost. Rank 10's `targetsPerShot` is unbounded, so a volley can kill
 * an arbitrary number of Pieces at once and per-ghost material churn has no
 * ceiling; sharing one emissive material instead would force every simultaneous
 * burst into lockstep at whatever age the last one set. Scale is per-mesh, so it
 * is immune to both.
 *
 * A leak holds full size through the lunge and then collapses, so the strike
 * lands at full weight. A kill swells and then collapses.
 */
export function ghostScale(reason: PieceGhost['reason'], ageMs: number): number {
  if (reason === 'leak') {
    if (ageMs <= LEAK_LUNGE_MS) return 1

    return Math.max(0, 1 - (ageMs - LEAK_LUNGE_MS) / LEAK_BURST_MS)
  }

  const progress = Math.min(1, Math.max(0, ageMs / KILL_BURST_MS))

  if (progress < KILL_PEAK_AT) {
    return 1 + (KILL_PEAK - 1) * (progress / KILL_PEAK_AT)
  }

  return KILL_PEAK * (1 - (progress - KILL_PEAK_AT) / (1 - KILL_PEAK_AT))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/pieceExit.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Run the full check**

Run: `pnpm lint && pnpm typecheck && pnpm test:run`
Expected: all pass. Lint matters here: `pieceExit.test.ts` imports `src/game/fixtures`, which only the test-file exemption to the inbound boundary rule permits.

- [ ] **Step 6: Commit**

```bash
git add src/scene/pieceExit.ts src/scene/pieceExit.test.ts
git commit -m "$(cat <<'EOF'
Classify Piece exits in a pure module

Diffs a published snapshot against the engine's exit records and tags each
departed Piece: recorded leaks lunge, recorded promotions are silent, a
risen clears count suppresses everything, a rewound nextEntityId means
reset(), and a Tower kill is what remains. That inference is exhaustive
rather than heuristic — those five are the only ways a Piece leaves state.

Detects reset() rather than gating on phase, unlike diffTowers: the leak
that fells the Core sets defeated in the same tick, so a phase gate would
suppress the most important impact in a run.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The Core's colour, including the impact flash

**Files:**
- Create: `src/scene/coreFlash.ts`
- Test: `src/scene/coreFlash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CoreFlash { startedAt: number }`, `CORE_FLASH_MS`, `CORE_CRITICAL_FRACTION`, `coreColour(target: Color, healthFraction: number, flashProgress: number): Color`, `coreEmissiveIntensity(healthFraction, flashProgress): number`, `flashProgressAt(startedAt: number, now: number): number`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/coreFlash.test.ts`:

```ts
import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CORE_CRITICAL_FRACTION,
  CORE_FLASH_MS,
  coreColour,
  coreEmissiveIntensity,
  flashProgressAt,
} from './coreFlash'

/** The declarative values `Core.tsx` used before this module existed. */
const HEALTHY = '#f4d03f'
const CRITICAL = '#7b241c'

describe('coreColour', () => {
  it('returns the healthy colour untouched when nothing is flashing', () => {
    const colour = coreColour(new Color(), 1, 0)

    expect(colour.getHexString()).toBe(new Color(HEALTHY).getHexString())
  })

  it('returns the critical colour below the threshold, preserving the old behaviour', () => {
    const colour = coreColour(new Color(), CORE_CRITICAL_FRACTION - 0.01, 0)

    expect(colour.getHexString()).toBe(new Color(CRITICAL).getHexString())
  })

  it('keeps the threshold exclusive, exactly as the declarative version did', () => {
    // `Core.tsx` used `healthFraction > 0.3`, so 0.3 itself was already critical.
    const atThreshold = coreColour(new Color(), CORE_CRITICAL_FRACTION, 0)

    expect(atThreshold.getHexString()).toBe(new Color(CRITICAL).getHexString())
  })

  it('brightens toward the flash colour at full flash progress', () => {
    const flashed = coreColour(new Color(), 1, 1)
    const resting = coreColour(new Color(), 1, 0)

    expect(flashed.b).toBeGreaterThan(resting.b)
  })

  it('mutates and returns the target rather than allocating', () => {
    const target = new Color()

    expect(coreColour(target, 1, 0)).toBe(target)
  })

  it('clamps a nonsense health fraction rather than producing nonsense', () => {
    expect(coreColour(new Color(), 5, 0).getHexString()).toBe(
      new Color(HEALTHY).getHexString(),
    )
    expect(coreColour(new Color(), -1, 0).getHexString()).toBe(
      new Color(CRITICAL).getHexString(),
    )
  })
})

describe('coreEmissiveIntensity', () => {
  it('matches the declarative formula when nothing is flashing', () => {
    // Core.tsx used `0.25 + healthFraction * 0.5`.
    expect(coreEmissiveIntensity(1, 0)).toBeCloseTo(0.75)
    expect(coreEmissiveIntensity(0, 0)).toBeCloseTo(0.25)
  })

  it('rises with the flash', () => {
    expect(coreEmissiveIntensity(1, 1)).toBeGreaterThan(coreEmissiveIntensity(1, 0))
  })
})

describe('flashProgressAt', () => {
  it('reports nothing while idle', () => {
    expect(flashProgressAt(-1, 12)).toBe(0)
  })

  it('is full at the instant of impact', () => {
    expect(flashProgressAt(4, 4)).toBe(1)
  })

  it('decays to nothing across CORE_FLASH_MS', () => {
    const halfway = CORE_FLASH_MS / 2000

    expect(flashProgressAt(0, halfway)).toBeCloseTo(0.5)
    expect(flashProgressAt(0, CORE_FLASH_MS / 1000)).toBe(0)
  })

  it('never goes negative once the flash is spent', () => {
    expect(flashProgressAt(0, 10)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/coreFlash.test.ts`
Expected: FAIL — `Failed to resolve import "./coreFlash"`.

- [ ] **Step 3: Write the module**

Create `src/scene/coreFlash.ts`:

```ts
import { Color } from 'three'

/**
 * When the Core was last struck, in clock seconds. -1 means idle, exactly as
 * `TowerAnimation.flashStartedAt` does.
 *
 * Mutable, and shared by reference: `GameScene` owns it, a leak impact stamps it
 * at the moment it lands, and `Core` reads it in its own frame loop. Stamped by
 * the impact rather than derived from `core.health` deliberately — health drops
 * the instant the leak resolves, a whole lunge before anything arrives, so
 * flashing on it would show the Core flinching from a blow that has not landed.
 */
export interface CoreFlash {
  startedAt: number
}

/**
 * Presentation constants, tunable by feel. PLACEHOLDERS, and nothing in the
 * engine reads them.
 *
 * `CORE_CRITICAL_FRACTION` is not a placeholder in the same sense: it preserves
 * the 0.3 threshold `Core.tsx` already used, so an unflashed Core looks exactly
 * as it did before this module existed.
 */
export const CORE_FLASH_MS = 200
export const CORE_CRITICAL_FRACTION = 0.3

const HEALTHY = new Color('#f4d03f')
const CRITICAL = new Color('#7b241c')
const FLASH = new Color('#fff8e0')

/**
 * The colour the Core should be this frame.
 *
 * Mutates and returns `target` rather than allocating, exactly as `towerColour`
 * does — this runs once a frame for the lifetime of the run. The module-level
 * Colours above are constructed once and only ever read.
 *
 * `healthFraction` is `health / maxHealth`, clamped here so a caller cannot
 * produce nonsense from a transient out-of-range value. `flashProgress` is 1 at
 * the instant of impact and 0 once the flash expires.
 */
export function coreColour(target: Color, healthFraction: number, flashProgress: number): Color {
  const health = Math.min(1, Math.max(0, healthFraction))

  // `>`, not `>=`: the declarative version this replaces read
  // `healthFraction > 0.3`, so the threshold itself was already critical.
  target.copy(health > CORE_CRITICAL_FRACTION ? HEALTHY : CRITICAL)

  if (flashProgress > 0) target.lerp(FLASH, Math.min(1, flashProgress))

  return target
}

/**
 * `emissiveIntensity` for the Core.
 *
 * The unflashed term is preserved exactly from the declarative version:
 * `0.25 + healthFraction * 0.5`. The flash adds on top, so a strike reads as a
 * burst of light rather than only a hue change.
 */
export function coreEmissiveIntensity(healthFraction: number, flashProgress: number): number {
  const health = Math.min(1, Math.max(0, healthFraction))
  const flash = Math.min(1, Math.max(0, flashProgress))

  return 0.25 + health * 0.5 + flash * 1.5
}

/** Flash progress from a stamp: 1 at impact, 0 once spent, 0 while idle. */
export function flashProgressAt(startedAt: number, now: number): number {
  if (startedAt < 0) return 0

  return Math.max(0, 1 - (now - startedAt) / (CORE_FLASH_MS / 1000))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/coreFlash.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/coreFlash.ts src/scene/coreFlash.test.ts
git commit -m "$(cat <<'EOF'
Add the Core's colour maths, including the impact flash

Pulls the Core's colour and emissive intensity out of Core.tsx's JSX and
into a tested module, mirroring towerColour.ts, and adds a flash on top.
The unflashed values are preserved exactly, including the exclusive 0.3
critical threshold, so an unstruck Core looks as it did.

The flash is stamped by the impact rather than derived from core.health:
health drops the instant a leak resolves, a whole lunge before anything
arrives, so flashing on it would show the Core flinching early.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Clear's board-wide flash

**Files:**
- Create: `src/scene/boardFlash.ts`
- Test: `src/scene/boardFlash.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BoardFlash { startedAt: number }`, `CLEAR_FLASH_MS`, `isFlashLive(flash, now): boolean`, `accumulateBoardFlash(out: Float32Array, board: BoardSpec, flash: BoardFlash | null, now: number): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/boardFlash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { BoardSpec } from '../game'
import { CLEAR_FLASH_MS, accumulateBoardFlash, isFlashLive } from './boardFlash'

const BOARD: BoardSpec = { files: 8, ranks: 8 }
const FLASH_SECONDS = CLEAR_FLASH_MS / 1000

function buffer(board: BoardSpec, extra = 0): Float32Array {
  return new Float32Array(board.files * board.ranks * 3 + extra)
}

describe('accumulateBoardFlash', () => {
  it('lights every square equally, since a Clear is one board-wide event', () => {
    const out = buffer(BOARD)
    accumulateBoardFlash(out, BOARD, { startedAt: 0 }, 0)

    expect(out.every((channel) => channel === out[0])).toBe(true)
    expect(out[0]).toBeGreaterThan(0)
  })

  it('decays to nothing across CLEAR_FLASH_MS', () => {
    const half = buffer(BOARD)
    accumulateBoardFlash(half, BOARD, { startedAt: 0 }, FLASH_SECONDS / 2)

    const spent = buffer(BOARD)
    accumulateBoardFlash(spent, BOARD, { startedAt: 0 }, FLASH_SECONDS)

    expect(half[0]).toBeCloseTo(0.5)
    expect(spent[0]).toBe(0)
  })

  it('adds to the buffer rather than zeroing it, so fire pulses survive', () => {
    // `accumulatePulses` owns zeroing and runs first. Zeroing here would erase
    // every pulse in flight the moment a Joker was played.
    const out = buffer(BOARD)
    out[0] = 0.25
    accumulateBoardFlash(out, BOARD, { startedAt: 0 }, 0)

    expect(out[0]).toBeCloseTo(1.25)
    expect(out[1]).toBeCloseTo(1)
  })

  it('does nothing with no flash', () => {
    const out = buffer(BOARD)
    accumulateBoardFlash(out, BOARD, null, 4)

    expect(out.every((channel) => channel === 0)).toBe(true)
  })

  it('writes nothing outside the board region, at any board size', () => {
    // An Ace grows the board, so the buffer is reallocated and this must never
    // reach past what the current board owns.
    const grown: BoardSpec = { files: 8, ranks: 9 }
    const out = buffer(grown, 6)
    accumulateBoardFlash(out, grown, { startedAt: 0 }, 0)

    const guard = out.subarray(grown.files * grown.ranks * 3)

    expect(guard.every((channel) => channel === 0)).toBe(true)
  })
})

describe('isFlashLive', () => {
  it('is live from the instant it starts until CLEAR_FLASH_MS has passed', () => {
    expect(isFlashLive({ startedAt: 0 }, 0)).toBe(true)
    expect(isFlashLive({ startedAt: 0 }, FLASH_SECONDS / 2)).toBe(true)
    expect(isFlashLive({ startedAt: 0 }, FLASH_SECONDS)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/boardFlash.test.ts`
Expected: FAIL — `Failed to resolve import "./boardFlash"`.

- [ ] **Step 3: Write the module**

Create `src/scene/boardFlash.ts`:

```ts
import type { BoardSpec } from '../game'

/**
 * Presentation constant, tunable by feel. PLACEHOLDER, and nothing in the
 * engine reads it.
 */
export const CLEAR_FLASH_MS = 300

const FLASH_SECONDS = CLEAR_FLASH_MS / 1000

/**
 * A Joker's Clear, as one white pulse over the whole board.
 *
 * A board-wide flash rather than a burst per Piece, so a burst keeps meaning
 * "a Tower did that" and the rarest card in the Deck gets its own signal rather
 * than fifteen copies of a common one.
 */
export interface BoardFlash {
  /** Clock seconds when the Clear resolved. */
  readonly startedAt: number
}

/** Whether this flash still has anything to draw. */
export function isFlashLive(flash: BoardFlash, now: number): boolean {
  return now - flash.startedAt < FLASH_SECONDS
}

/**
 * Adds a uniform white contribution to every square in `out`, three floats per
 * square, indexed row-major by board rank then file — the same layout
 * `accumulatePulses` writes, so the two sum into one buffer and one draw.
 *
 * ADDITIVE, and it deliberately does NOT zero the buffer: `accumulatePulses`
 * owns that and runs first, so zeroing here would erase every pulse in flight
 * the moment a Joker was played. Writes only within the board's own region,
 * which is what keeps it inside the buffer at any board size. Allocates nothing.
 */
export function accumulateBoardFlash(
  out: Float32Array,
  board: BoardSpec,
  flash: BoardFlash | null,
  now: number,
): void {
  if (!flash) return

  const age = now - flash.startedAt
  if (age < 0 || age >= FLASH_SECONDS) return

  const intensity = 1 - age / FLASH_SECONDS
  // White, so all three channels take the same value and one loop covers them.
  const channels = board.files * board.ranks * 3

  for (let index = 0; index < channels; index += 1) {
    // `?? 0` because `noUncheckedIndexedAccess` types this read as
    // `number | undefined`, and this codebase has no non-null assertions.
    out[index] = (out[index] ?? 0) + intensity
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/boardFlash.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/boardFlash.ts src/scene/boardFlash.test.ts
git commit -m "$(cat <<'EOF'
Add the Joker Clear's board-wide flash

One white additive pulse over every square, summing into the same buffer
accumulatePulses writes so it costs no extra instances. Deliberately does
not zero the buffer: accumulatePulses owns that and runs first, so zeroing
here would erase every shot in flight the moment a Joker was played.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: The promoted Queen's pop

**Files:**
- Create: `src/scene/promotionPop.ts`
- Test: `src/scene/promotionPop.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PROMOTION_POP_MS`, `promotionPopScale(ageMs: number): number`, `promotionPopLift(ageMs: number): number`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/promotionPop.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PROMOTION_POP_MS, promotionPopLift, promotionPopScale } from './promotionPop'

describe('promotionPopScale', () => {
  it('is neutral at the instant the Queen appears, so nothing snaps', () => {
    expect(promotionPopScale(0)).toBe(1)
  })

  it('swells partway through', () => {
    expect(promotionPopScale(PROMOTION_POP_MS * 0.35)).toBeGreaterThan(1.4)
  })

  it('returns to neutral, so it multiplies the health scale rather than replacing it', () => {
    // `Pieces.tsx` already scales a Piece by its health. A pop that did not
    // return to exactly 1 would leave every promoted Queen permanently the
    // wrong size.
    expect(promotionPopScale(PROMOTION_POP_MS)).toBe(1)
    expect(promotionPopScale(PROMOTION_POP_MS * 10)).toBe(1)
  })

  it('is neutral for a negative age, which a clock stamp can briefly produce', () => {
    expect(promotionPopScale(-5)).toBe(1)
  })
})

describe('promotionPopLift', () => {
  it('starts and ends on the board', () => {
    expect(promotionPopLift(0)).toBe(0)
    expect(promotionPopLift(PROMOTION_POP_MS)).toBe(0)
  })

  it('rises in between, so the pop reads as an upgrade rather than a wobble', () => {
    expect(promotionPopLift(PROMOTION_POP_MS / 2)).toBeGreaterThan(0)
  })

  it('is flat outside the pop', () => {
    expect(promotionPopLift(-5)).toBe(0)
    expect(promotionPopLift(PROMOTION_POP_MS * 10)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/promotionPop.test.ts`
Expected: FAIL — `Failed to resolve import "./promotionPop"`.

- [ ] **Step 3: Write the module**

Create `src/scene/promotionPop.ts`:

```ts
/**
 * Presentation constants, tunable by feel. PLACEHOLDERS, and nothing in the
 * engine reads them.
 */
export const PROMOTION_POP_MS = 300

const PEAK = 1.5
const PEAK_AT = 0.35
const LIFT = 0.35

/**
 * A multiplier on a freshly promoted Queen's scale, 1 once the pop is spent.
 *
 * A MULTIPLIER, not a replacement: `Pieces.tsx` already scales a Piece by its
 * health, and a promoted Queen that is shot immediately must still shrink. It
 * therefore has to return to exactly 1, or every promoted Queen ends the pop
 * permanently the wrong size.
 *
 * Applied to the live Queen's own mesh rather than to a ghost. A promoted Queen
 * gets a fresh entity id, and `Pieces` keys each mesh on `piece.id`, so the
 * first frame a mesh sees IS the promotion — no diff is needed to detect it.
 */
export function promotionPopScale(ageMs: number): number {
  if (ageMs < 0 || ageMs >= PROMOTION_POP_MS) return 1

  const progress = ageMs / PROMOTION_POP_MS

  if (progress < PEAK_AT) {
    return 1 + (PEAK - 1) * (progress / PEAK_AT)
  }

  return PEAK - (PEAK - 1) * ((progress - PEAK_AT) / (1 - PEAK_AT))
}

/**
 * A brief lift above the board, so the pop reads as an upgrade rising rather
 * than a wobble in place. Sine, so it eases at both ends and lands flat.
 */
export function promotionPopLift(ageMs: number): number {
  if (ageMs < 0 || ageMs >= PROMOTION_POP_MS) return 0

  return Math.sin((ageMs / PROMOTION_POP_MS) * Math.PI) * LIFT
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/promotionPop.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/scene/promotionPop.ts src/scene/promotionPop.test.ts
git commit -m "$(cat <<'EOF'
Add the promoted Queen's pop

A scale multiplier and a lift, applied to the live Queen's own mesh rather
than to a ghost: a promoted Queen gets a fresh entity id and Pieces keys on
it, so the first frame a mesh sees is the promotion.

A multiplier rather than a replacement, returning to exactly 1, because
Pieces.tsx already scales a Piece by its health and a Queen shot during her
pop must still shrink.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Draw the ghosts and flash the Core

**Files:**
- Create: `src/scene/PieceExits.tsx`
- Modify: `src/scene/Core.tsx` (whole file)
- Modify: `src/scene/GameScene.tsx` (whole file)

**Interfaces:**
- Consumes: `createExitTracker`, `diffPieceExits`, `GHOST_LIFETIME_MS`, `ghostScale`, `hasLanded`, `lungeProgress`, `PieceGhost` (Task 5); `CoreFlash`, `coreColour`, `coreEmissiveIntensity`, `flashProgressAt` (Task 6); `GEOMETRY_BY_TYPE`, `PIECE_TYPE_IDS`, `REST_Y_BY_TYPE` (Task 4).
- Produces: `PieceExits({ board, flash }: { board: BoardSpec; flash: RefObject<CoreFlash> })`. `Core` gains a required `flash: RefObject<CoreFlash>` prop.

**There is no jsdom and no component tests in this project, so this task has no automated test.** Every decision it needs is already tested in Tasks 4–6; this task is plumbing, and its verification is `pnpm build` plus the manual pass in Step 5.

- [ ] **Step 1: Create `src/scene/PieceExits.tsx`**

```tsx
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MeshStandardMaterial, type BufferGeometry, type Material, type Mesh } from 'three'
import type { BoardSpec, PieceTypeId, Square } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import type { CoreFlash } from './coreFlash'
import { PIECE_COLOURS } from './pieceColours'
import { GEOMETRY_BY_TYPE, PIECE_TYPE_IDS, REST_Y_BY_TYPE } from './pieceGeometry'
import {
  GHOST_LIFETIME_MS,
  createExitTracker,
  diffPieceExits,
  ghostScale,
  hasLanded,
  lungeProgress,
  type PieceGhost,
} from './pieceExit'

/**
 * A Piece's exit, held on screen briefly after it leaves `GameState` — a leak
 * lunging into the Core, a Tower kill bursting where it stood.
 *
 * Every decision lives in `pieceExit.ts` and is unit-tested; this is plumbing.
 * Separate from `Pieces.tsx` on purpose: these have a different lifetime, a
 * different source (the store subscription, not `getState()`), and their own
 * React state and timers.
 *
 * Promotions are absent by design. A promoted Pawn is silenced by its exit
 * record, and the arriving Queen pops in `Pieces.tsx`, on the mesh that already
 * exists for her.
 */
export function PieceExits({
  board,
  flash,
}: {
  board: BoardSpec
  flash: RefObject<CoreFlash>
}) {
  const coreSquare = useGameStore((store) => store.snapshot.core.square)
  const [ghosts, setGhosts] = useState<readonly PieceGhost[]>([])
  const tracker = useRef(createExitTracker())
  const expiryTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  // One geometry and one material per type, shared across every ghost of it,
  // per CLAUDE.md. Ghosts fade by scale rather than opacity, which is what lets
  // them share an opaque material at all — see `ghostScale`.
  const resources = useMemo(() => {
    const byType = new Map<PieceTypeId, { geometry: BufferGeometry; material: Material }>()

    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: GEOMETRY_BY_TYPE[typeId](),
        material: new MeshStandardMaterial({
          color: PIECE_COLOURS[typeId],
          emissive: PIECE_COLOURS[typeId],
          emissiveIntensity: 0.6,
          flatShading: true,
        }),
      })
    }

    return byType
  }, [])

  useEffect(
    () => () => {
      for (const { geometry, material } of resources.values()) {
        geometry.dispose()
        material.dispose()
      }
    },
    [resources],
  )

  useEffect(() => {
    // Captured once so the cleanup below reads the same Set this effect
    // populated, which is what the lint rule for refs-in-cleanup wants.
    const timers = expiryTimers.current
    const exits = tracker.current

    // Seed from whatever is already on the board. The returned list is
    // necessarily empty — no Piece can have left a map that was empty a moment
    // ago — which is why no state update belongs here.
    diffPieceExits(exits, useGameStore.getState().snapshot)

    const unsubscribe = useGameStore.subscribe((store) => {
      const { ghosts: fresh, runReset } = diffPieceExits(exits, store.snapshot)

      // `reset()` clears the whole board at once. Drop any ghost still riding
      // out its burst rather than leaving a previous run's Piece on screen, and
      // cancel their timers so none later filters an already-cleared array.
      if (runReset) {
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
        setGhosts([])
      }

      if (fresh.length === 0) return

      setGhosts((current) => [...current, ...fresh])

      // Each ghost expires on its own timer rather than a shared batch one. A
      // batch timer restarts on every death, so sustained fire would keep an
      // already-invisible ghost mounted until a quiet gap. Filtering by object
      // identity rather than id is deliberate: a `PieceGhost` is a unique object
      // that survives the spread above untouched, so identity can never match a
      // Piece id that a later `reset()` happens to reuse.
      for (const ghost of fresh) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          setGhosts((current) => current.filter((candidate) => candidate !== ghost))
        }, GHOST_LIFETIME_MS[ghost.reason])
        timers.add(timer)
      }
    })

    return () => {
      unsubscribe()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  return (
    <>
      {ghosts.map((ghost) => {
        const shared = resources.get(ghost.typeId)
        if (!shared) return null

        return (
          <GhostMesh
            key={ghost.meshKey}
            ghost={ghost}
            board={board}
            coreSquare={coreSquare}
            geometry={shared.geometry}
            material={shared.material}
            flash={flash}
          />
        )
      })}
    </>
  )
}

function GhostMesh({
  ghost,
  board,
  coreSquare,
  geometry,
  material,
  flash,
}: {
  ghost: PieceGhost
  board: BoardSpec
  coreSquare: Square
  geometry: BufferGeometry
  material: Material
  flash: RefObject<CoreFlash>
}) {
  const ref = useRef<Mesh>(null)
  const startedAt = useRef(-1)
  const stamped = useRef(false)

  // Mutates the mesh transform directly. No state is set here and nothing is
  // allocated — the sanctioned way to do per-frame work in R3F.
  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return

    const now = state.clock.elapsedTime
    // The mesh's own mount is the start of its burst, so nothing needs to carry
    // a timestamp through React.
    if (startedAt.current < 0) startedAt.current = now
    const ageMs = (now - startedAt.current) * 1000

    const restY = REST_Y_BY_TYPE[ghost.typeId]
    const fromX = fileToWorldX(board, ghost.file)
    const fromZ = rankToWorldZ(board, ghost.boardRank)

    if (ghost.reason === 'leak') {
      // No `sin` arc, unlike a hop: a leak is a strike, and `lungeProgress`
      // accelerates into it.
      const progress = lungeProgress(ageMs)
      const toX = fileToWorldX(board, coreSquare.file)
      const toZ = rankToWorldZ(board, coreSquare.rank)

      mesh.position.set(fromX + (toX - fromX) * progress, restY, fromZ + (toZ - fromZ) * progress)

      // Stamped once, at contact — not when the engine resolved the leak, which
      // was a whole lunge earlier. `stamped` is what keeps a 200ms flash from
      // being re-stamped every frame after impact.
      if (!stamped.current && hasLanded(ageMs)) {
        stamped.current = true
        flash.current.startedAt = now
      }
    } else {
      mesh.position.set(fromX, restY, fromZ)
    }

    const scale = ghostScale(ghost.reason, ageMs)
    mesh.scale.set(scale, scale, scale)
  })

  return <mesh ref={ref} geometry={geometry} material={material} castShadow />
}
```

- [ ] **Step 2: Rewrite `src/scene/Core.tsx`**

```tsx
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { Color, type MeshStandardMaterial } from 'three'
import type { BoardSpec, Square } from '../game'
import { fileToWorldX, rankToWorldZ } from './coords'
import {
  coreColour,
  coreEmissiveIntensity,
  flashProgressAt,
  type CoreFlash,
} from './coreFlash'

/**
 * What the player defends.
 *
 * Colour and emissive intensity are driven from `coreFlash.ts` in the frame
 * loop rather than from JSX, so a leak impact can flash the Core at the moment
 * it lands. The resting appearance is unchanged: `coreColour` preserves the same
 * two colours and the same exclusive 0.3 threshold the declarative version used.
 *
 * `flash` is written by a leak ghost in `PieceExits`, not derived from
 * `core.health` — health drops when the leak resolves, a whole lunge before
 * anything arrives.
 */
export function Core({
  board,
  square,
  healthFraction,
  flash,
}: {
  board: BoardSpec
  square: Square
  healthFraction: number
  flash: RefObject<CoreFlash>
}) {
  const material = useRef<MeshStandardMaterial>(null)
  // Constructed once and mutated, never per frame.
  const colour = useMemo(() => new Color(), [])

  useFrame((state) => {
    const target = material.current
    if (!target) return

    // `RefObject<CoreFlash>.current` is non-nullable in React 19 — the ref is
    // created with an initial value — so this needs no guard.
    const progress = flashProgressAt(flash.current.startedAt, state.clock.elapsedTime)

    coreColour(colour, healthFraction, progress)
    target.color.copy(colour)
    target.emissive.copy(colour)
    target.emissiveIntensity = coreEmissiveIntensity(healthFraction, progress)
  })

  return (
    <mesh
      position={[fileToWorldX(board, square.file), 0.4, rankToWorldZ(board, square.rank)]}
      castShadow
    >
      <octahedronGeometry args={[0.45]} />
      <meshStandardMaterial ref={material} flatShading />
    </mesh>
  )
}
```

- [ ] **Step 3: Wire it up in `src/scene/GameScene.tsx`**

```tsx
import { OrbitControls } from '@react-three/drei'
import { useRef } from 'react'
import { useGameStore } from '../state/store'
import { Board } from './Board'
import { Core } from './Core'
import type { CoreFlash } from './coreFlash'
import { GameLoop } from './GameLoop'
import { PieceExits } from './PieceExits'
import { Pieces } from './Pieces'
import { Towers } from './Towers'

export function GameScene() {
  const board = useGameStore((store) => store.snapshot.board)
  const core = useGameStore((store) => store.snapshot.core)

  // Shared by reference between the leak impact that stamps it and the Core
  // that reads it. A ref, not state: this is per-frame data and routing it
  // through React would be the per-frame render CLAUDE.md forbids. -1 is idle.
  const coreFlash = useRef<CoreFlash>({ startedAt: -1 })

  return (
    <>
      <GameLoop />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} castShadow />

      <Board board={board} />
      <Core
        board={board}
        square={core.square}
        healthFraction={core.health / core.maxHealth}
        flash={coreFlash}
      />
      <Towers board={board} />
      <Pieces board={board} />
      <PieceExits board={board} flash={coreFlash} />

      <OrbitControls enablePan={false} minDistance={6} maxDistance={22} maxPolarAngle={1.4} />
    </>
  )
}
```

- [ ] **Step 4: Run the full check**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all pass. `pnpm build` is the real gate for this task, since no test covers it.

- [ ] **Step 5: Verify by hand**

Run: `pnpm dev`, open the URL it prints, then:

1. **Leak impact.** Build nothing and tick auto-start on. Pieces walk down the board; each one that reaches the Core should visibly accelerate onto the Core's square and vanish there, and the Core should flash bright at the moment of contact. **A Piece that pops out of existence one square short means the exit record is not reaching the renderer.**
2. **Kill burst.** Play a numbered Card to build a Tower in a Piece's path. A Piece it kills should swell and collapse where it stood, not simply disappear.
3. **Both at once.** Let a Tower kill one Piece while another leaks. The two effects must not swap: the burst stays in place, the lunge goes to the Core.
4. **Reset.** Let the Core fall — the final leak's impact must play out rather than being cut off — then press "Play again" while a Piece is mid-burst if you can, and confirm no ghost survives into the new run.

- [ ] **Step 6: Commit**

```bash
git add src/scene/PieceExits.tsx src/scene/Core.tsx src/scene/GameScene.tsx
git commit -m "$(cat <<'EOF'
Draw Piece exit ghosts and flash the Core on impact

A leak now lunges from the square the engine recorded onto the Core's own
square and flashes it at contact; a Tower kill swells and collapses where
the Piece stood. Core.tsx drives its colour from the frame loop so the
flash is possible, with its resting appearance preserved exactly.

The flash ref is shared by reference from GameScene rather than derived
from core.health, so the Core reacts when the blow lands rather than when
the engine resolved it a lunge earlier.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Pop the promoted Queen

**Files:**
- Modify: `src/scene/Pieces.tsx` — pass `promoted` down; apply the pop in `PieceMesh`

**Interfaces:**
- Consumes: `PROMOTION_POP_MS`, `promotionPopScale`, `promotionPopLift` (Task 8); `Piece.promoted` (Task 2).
- Produces: nothing for later tasks.

No automated test — the decisions are tested in Task 8, and this is plumbing.

- [ ] **Step 1: Import the module**

Add to the imports in `src/scene/Pieces.tsx`:

```ts
import { PROMOTION_POP_MS, promotionPopLift, promotionPopScale } from './promotionPop'
```

- [ ] **Step 2: Pass `promoted` down**

In the `Pieces` component's `pieces.map`, add the prop to `<PieceMesh>`:

```tsx
          <PieceMesh
            key={piece.id}
            pieceId={piece.id}
            typeId={piece.typeId}
            promoted={piece.promoted}
            board={board}
            geometry={shared.geometry}
            material={shared.material}
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
          />
```

- [ ] **Step 3: Apply the pop in `PieceMesh`**

Add `promoted` to the destructured parameters and to the prop type:

```tsx
function PieceMesh({
  pieceId,
  typeId,
  promoted,
  board,
  geometry,
  material,
  ringGeometry,
  ringMaterial,
}: {
  pieceId: string
  typeId: PieceTypeId
  promoted: boolean
  board: BoardSpec
  geometry: BufferGeometry
  material: Material
  ringGeometry: BufferGeometry
  ringMaterial: Material
}) {
  const ref = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)
  const firstSeenAt = useRef(-1)
```

Change the frame callback to take the render state, and add the pop. The
callback currently takes no argument and already uses the name `state` for its
engine snapshot, so the new parameter is named `frame` rather than shadowing it:

```tsx
  useFrame((frame) => {
    const mesh = ref.current
    if (!mesh) return

    const state = getState()
    const piece = state.pieces.find((candidate) => candidate.id === pieceId)
    if (!piece) return

    const now = frame.clock.elapsedTime
    if (firstSeenAt.current < 0) firstSeenAt.current = now

    // A promoted Queen gets a fresh entity id, and `Pieces` keys each mesh on
    // `piece.id` — so this mesh's first frame IS the promotion, and no diff is
    // needed to spot it. An unpromoted Piece is handed a spent age, so both
    // helpers return neutral and cost nothing.
    const popAgeMs = promoted ? (now - firstSeenAt.current) * 1000 : PROMOTION_POP_MS
    const pop = promotionPopScale(popAgeMs)

    const progress = Math.min(1, piece.moveCooldownMs / HOP_ANIMATION_MS)

    const fromX = fileToWorldX(board, piece.prevSquare.file)
    const fromZ = rankToWorldZ(board, piece.prevSquare.rank)
    const toX = fileToWorldX(board, piece.square.file)
    const toZ = rankToWorldZ(board, piece.square.rank)

    const restY = REST_Y_BY_TYPE[typeId]

    mesh.position.set(
      fromX + (toX - fromX) * progress,
      restY + Math.sin(progress * Math.PI) * HOP_ARC + promotionPopLift(popAgeMs),
      fromZ + (toZ - fromZ) * progress,
    )

    // Shrink as it takes damage, so Tower fire has visible effect before the
    // Piece dies. The promotion pop MULTIPLIES this rather than replacing it, so
    // a Queen shot during her pop still shrinks. Mutation only — no state, no
    // allocation.
    const healthFraction = piece.health / pieceType(piece.typeId).maxHealth
    const scale = (0.55 + healthFraction * 0.45) * pop
    mesh.scale.set(scale, scale, scale)
```

Leave the rest of the callback — the `buffed` ring block — unchanged. It reads
`state.phase` and `state.pieces`, which still refer to the engine snapshot.

- [ ] **Step 4: Run the full check**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all pass.

- [ ] **Step 5: Verify by hand**

Run `pnpm dev` and let a Pawn reach the board's near rank on a file that is not
the Core's file (the Core sits at file 3, rank 0), so it promotes rather than
leaking. The Queen must swell and settle once, with no burst for the Pawn. If
you see a burst as well, the promotion exit record from Task 2 is not landing.

- [ ] **Step 6: Commit**

```bash
git add src/scene/Pieces.tsx
git commit -m "$(cat <<'EOF'
Pop the promoted Queen

Applied to the live Queen's mesh, whose first frame is the promotion — she
gets a fresh entity id and Pieces keys on it, so no diff is needed. The pop
multiplies the existing health-derived scale rather than replacing it, so a
Queen shot mid-pop still shrinks.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Flash the board on a Joker's Clear

**Files:**
- Modify: `src/scene/FirePulses.tsx` — sum the flash into the existing additive layer

**Interfaces:**
- Consumes: `CLEAR_FLASH_MS`, `accumulateBoardFlash`, `isFlashLive`, `BoardFlash` (Task 7); `GameState.clears` (Task 3).
- Produces: nothing for later tasks.

No automated test — the maths is tested in Task 7, and this is plumbing.

- [ ] **Step 1: Import the module and add the refs**

Add to the imports in `src/scene/FirePulses.tsx`:

```ts
import { accumulateBoardFlash, isFlashLive, type BoardFlash } from './boardFlash'
```

Add beside the existing refs in the component body, after `const lastEntityId = useRef(0)`:

```ts
  const flash = useRef<BoardFlash | null>(null)
  const lastClears = useRef(0)
```

- [ ] **Step 2: Detect the Clear and sum the flash**

Inside `useFrame`, extend the reset branch so a rewound run cannot leave a stale
count behind:

```ts
    if (liveState.nextEntityId < lastEntityId.current) {
      pulses.current.length = 0
      lastCooldownMs.current.clear()
      // `reset()` rewinds `clears` to 0 too, and a remembered higher count
      // would swallow the new run's first Clear.
      flash.current = null
      lastClears.current = 0
    }
    lastEntityId.current = liveState.nextEntityId

    // Monotonic, so reading it per frame cannot miss one — unlike a per-tick
    // flag, which `advance` would lose when it runs five ticks per emit. Two
    // Clears between frames draw one flash, which is right: they are 300ms
    // apart at worst and the board is empty either way.
    if (liveState.clears > lastClears.current) {
      flash.current = { startedAt: now }
    }
    lastClears.current = liveState.clears
```

Then replace the visibility gate and the accumulation at the end of the
callback. `accumulatePulses` zeroes the board's region unconditionally, so it
must still run when only a flash is live:

```ts
    const live = flash.current
    const flashLive = live !== null && isFlashLive(live, now)
    if (!flashLive) flash.current = null

    // Toggle `visible` rather than unmount, so no material ever recompiles.
    if (group.current) group.current.visible = pulses.current.length > 0 || flashLive
    if (pulses.current.length === 0 && !flashLive) return

    // Zeroes the board's region first, which is why it runs even with no pulses
    // in flight. `accumulateBoardFlash` adds on top and never zeroes.
    accumulatePulses(intensity, board, pulses.current, now)
    accumulateBoardFlash(intensity, board, flashLive ? live : null, now)
```

Keep the per-square colour write loop that follows exactly as it is.

- [ ] **Step 3: Update the component's doc comment**

The block comment above `export const FirePulses` describes the layer as a
Tower's shots only. Add a paragraph, since it now carries a second signal:

```
 * It also carries the board-wide flash a Joker's Clear produces. That shares
 * this layer rather than mounting a second full-board additive one: the
 * alternative doubles the permanent instance count to serve the rarest effect
 * in the game. The maths lives in `boardFlash.ts`, kept out of `firePulse.ts`
 * because that module's whole contract is about shots.
```

- [ ] **Step 4: Run the full check**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm build`
Expected: all pass.

- [ ] **Step 5: Verify by hand**

A Joker is needed, and the opening Base pack may not deal one. Either buy Court
or Suited packs between rounds until one appears — `tierOf` in
`src/data/packs.ts` ranks `'joker'` as `scarce`, so they do occur — or make this
temporary edit to `src/state/simulation.ts`, directly below the `let current =`
line:

```ts
// TEMPORARY, for manually verifying the Clear flash. Revert before committing.
current = { ...current, deck: [...current.deck, { id: 'temp-joker', kind: 'joker' }] }
```

Run `pnpm dev`, start a round, let several Pieces onto the board, and play the
Joker. The whole board must flash white once and fade, with **no** per-Piece
bursts. Bursts appearing here mean the `clears` suppression in `pieceExit.ts` is
not firing.

Then revert the edit and confirm it is gone:

```bash
git checkout src/state/simulation.ts
git diff --stat src/state/simulation.ts
```

Expected: no output from `git diff --stat`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/FirePulses.tsx
git commit -m "$(cat <<'EOF'
Flash the board on a Joker's Clear

Summed into the additive per-square layer FirePulses already draws rather
than a second full-board layer, which would double the permanent instance
count for the rarest effect in the game.

Detected from the monotonic clears counter read per frame, which cannot
miss one, and the reset branch now clears the remembered count so a new
run's first Clear is not swallowed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Document it

**Files:**
- Modify: `CLAUDE.md` — "Current state", and the live test count
- Possibly modify: `docs/design/game-design.md` — only if it makes a claim this falsifies

**Interfaces:** none.

- [ ] **Step 1: Check whether the design doc says anything now untrue**

Run: `grep -n "leak\|Leak\|vanish\|disappear" docs/design/game-design.md`

Read every hit. This work changes only how a leak is *presented*, so most will
be unaffected. Edit only a passage that is now false — the precedent is the pack
work's "Document packs, and fix two passages they falsified". Do **not** add a
description of the renderer to that file: `game-design.md` is what the game is,
not how it draws.

- [ ] **Step 2: Add the effects to CLAUDE.md's "Current state"**

Add a bullet after the existing **Tower legibility** bullet:

```markdown
- **Piece exit legibility.** A Piece that leaks lunges onto the Core's square
  and flashes it on contact; one killed by a Tower bursts where it stood; a
  Joker's Clear flashes the whole board instead of bursting each Piece; and a
  promoted Queen pops as she appears. The engine records only the exits that
  cannot be inferred — leaks and promotions, in a never-cleared 32-entry ring on
  `GameState.recentExits`, plus a monotonic `clears` count — and
  `src/scene/pieceExit.ts` infers a Tower kill as the only case left. The ring
  is never cleared on purpose: `tick` auto-starts from inside itself, so
  clearing at `startRound` can wipe a record before the frame's only publish.
```

- [ ] **Step 3: Re-measure the test count**

Run: `pnpm test:run`

Read the totals from the summary line and update the count in CLAUDE.md's
"Current state" ("560 tests across 34 files" as of writing). **Take the real
number from the output — do not calculate it.** CLAUDE.md records that a stale
figure has already leaked into a plan document once.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/design/game-design.md
git commit -m "$(cat <<'EOF'
Document Piece exit legibility

Records the four effects and the engine facts behind them in CLAUDE.md's
current state, including why the exit ring is never cleared, and re-measures
the test count.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**Spec coverage.** Every section of the spec maps to a task: §1's three engine
additions to Tasks 1–3, and its "why the ring is never cleared" argument to
Task 1's auto-start test; §2's classification table to Task 5; §3's pure module,
its accepted imprecision and its `reset()`-over-phase decision to Task 5, with
the fatal-leak case pinned by its own test; §4's scale-based fade to Task 5's
`ghostScale`; §5's four effects to Tasks 5–11; §6's file table to the File
Structure above, and its "`structuralKey` is untouched" claim to Task 3's pin.
The spec's Testing section is distributed across the tasks that own each module.

**Deliberate departures, both flagged in place.** `diffPieceExits` returns
`PieceExitDiff` rather than `PieceGhost[]`, so the `reset()` decision stays
inside the tested module (noted at the top of this plan). `promotionPop.ts` is a
file the spec's table does not list; the spec assigns the pop to `Pieces.tsx`,
and a `.tsx` file cannot be tested here, so the maths needs a module of its own.

**Coverage thresholds.** Tasks 1–3 add branches to `src/game/`, all covered by
tests in the same task. Tasks 4–11 add only `src/scene/` files, which
`vite.config.ts` excludes from coverage — no threshold entry is needed, and none
of the numbers move.
