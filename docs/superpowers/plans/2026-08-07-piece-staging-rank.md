# Piece Staging Rank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a Piece ever spawning on top of a Tower, by spawning Pieces onto an off-board **Staging rank** at `board.ranks` from which they step onto the far rank as an ordinary hop.

**Architecture:** One new pure helper (`stagingRank`) in `src/game/board.ts`, a one-line change to `drainDueSpawns` in `src/game/tick.ts`, and one new single-mesh renderer component. The fix works because the Staging rank is *out of bounds*: `canBuildOn` already refuses out-of-bounds squares, so no Tower can ever stand there, and entry to the board becomes a move — which the existing "Towers block, blocked Pieces grind" rule already handles. No existing engine rule gains an exception.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, React Three Fiber + drei, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-07-piece-staging-rank-design.md`](../specs/2026-08-07-piece-staging-rank-design.md). Read it before starting — it holds the rejected alternatives and the accepted costs, and this plan does not repeat the reasoning.

## Global Constraints

- **`src/game/` and `src/data/` must never import React or Three.js.** ESLint fails the build on a violation.
- **`src/scene/`, `src/ui/`, `src/state/` import the engine only through `src/game/index.ts`.** Reaching into `src/game/<module>` fails `pnpm lint`. Test files are exempt.
- **`Math.random` is banned in `src/game/` and `src/data/`.** ESLint fails the build.
- **Never derive a board extent from a module constant.** Read it from `state.board`. `stagingRank(board)` exists so this stays true for the new rank too.
- **Never call `setState` inside `useFrame`** or a fast pointer handler; mutate refs.
- **A growing `limit` on drei's `Instances` needs a `key` on the same value.** The renderer task avoids `Instances` entirely for this reason — do not "optimise" it into one.
- **This codebase has no non-null assertions (`!`).** `noUncheckedIndexedAccess` is on, so indexed reads are `T | undefined` — use optional chaining in assertions or a throwing fixture helper (`firstTower`).
- **Vitest runs through esbuild and does not typecheck.** A green suite is not a green `tsc`. Run `pnpm typecheck` before claiming a task done.
- Domain vocabulary is fixed: **Piece**, **Tower**, **Core**, **Round**, **rank**/**file**, and the new term **Staging rank**. Do not invent synonyms ("spawn row", "pre-board row", "lane").
- Every command runs from the repo root with `pnpm`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/game/board.ts` | **Modify.** Gains `stagingRank(board)`. Stays the single home of square/board arithmetic. |
| `src/game/tick.ts` | **Modify** (`drainDueSpawns`, ~line 293). Spawns onto the Staging rank. |
| `src/game/index.ts` | **Modify.** Re-exports `stagingRank` — the only route by which `src/scene/` may see it. |
| `src/game/staging.test.ts` | **Create.** Every engine test for this change, in one focused file. |
| `src/scene/StagingRank.tsx` | **Create.** One mesh drawing the ledge Pieces stand on. |
| `src/scene/Board.tsx` | **Modify.** Mounts `<StagingRank>`. |
| `docs/design/game-design.md` | **Modify.** Four passages; the design is the source of truth. |
| `CLAUDE.md` | **Modify.** Invariants, vocabulary, current state, test count. |

Deliberately **not** touched, and a reviewer should be suspicious of a diff that touches them: `src/game/placement.ts` (out-of-bounds already refuses), `src/game/movement.ts` (every forward candidate from the Staging rank already lands in bounds), `src/scene/Pieces.tsx` (`rankToWorldZ` extrapolates), `src/scene/CoveragePreview.tsx` (already returns `null` for an out-of-bounds hover), `src/game/tick.ts`'s `selectTargets` (a Piece in the Staging rank is an ordinary target — see the spec).

---

## Task 1: Spawn onto the Staging rank

The fix itself, plus the regression test for the issue.

**Files:**
- Modify: `src/game/board.ts` (append after `isInBounds`)
- Modify: `src/game/index.ts:9` (the `./board` re-export line)
- Modify: `src/game/tick.ts:280-312` (`drainDueSpawns`)
- Create: `src/game/staging.test.ts`

**Interfaces:**
- Consumes: `squareKey` from `./board`; `canBuildOn`, `createInitialState`, `isInBounds`, `step`, `tick` from `./index`; `withTower`, `firstTower` from `./fixtures`.
- Produces: `stagingRank(board: BoardSpec): number`, exported from `src/game/board.ts` and re-exported from `src/game/index.ts`. Also `DT` and `runFor` inside `staging.test.ts`, which Task 2 reuses.

- [ ] **Step 1: Write the failing tests**

Create `src/game/staging.test.ts`:

```ts
/**
 * The Staging rank: the off-board rank Pieces spawn onto, one past the board's
 * last rank.
 *
 * These tests exist because a Piece used to spawn directly onto the far rank
 * without consulting `state.towers`, so a Tower built there got a Piece placed
 * on top of it — a Piece sharing a Tower's square is one that walked through
 * what should have stopped it. See
 * `docs/superpowers/specs/2026-08-07-piece-staging-rank-design.md`.
 *
 * The whole fix rests on the Staging rank being OUT OF BOUNDS, which is what
 * makes `canBuildOn` refuse it without a new clause. That property is pinned
 * here directly rather than left to be inferred.
 */
import { describe, expect, it } from 'vitest'
import { squareKey, stagingRank } from './board'
import { firstTower, withTower } from './fixtures'
import { canBuildOn, createInitialState, isInBounds, step, tick } from './index'
import type { GameState } from './types'

/** The fixed timestep the app runs at. Tests drive time; nothing reads a clock. */
const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/**
 * Every square of the far rank holding a rank-5 Tower, with the round started.
 *
 * Rank 5 is the diagonal, chosen so a Tower cannot cover the Staging square
 * directly behind it (file distance 0, rank distance 1 — not a diagonal). Its
 * neighbours can, so the Pieces still die; what matters is that the walled
 * square itself never has a Piece standing on it.
 */
function walledFarRank(): GameState {
  const base = createInitialState()
  let state = base

  for (let file = 0; file < base.board.files; file += 1) {
    state = withTower(5, { file, rank: base.board.ranks - 1 }, state)
  }

  return step(state, { kind: 'startRound' })
}

describe('the Staging rank', () => {
  it('is one rank past the board', () => {
    expect(stagingRank({ files: 8, ranks: 8 })).toBe(8)
    expect(stagingRank({ files: 8, ranks: 12 })).toBe(12)
  })

  it('is out of bounds on every file, which is what keeps a Tower off it', () => {
    const { board } = createInitialState()

    for (let file = 0; file < board.files; file += 1) {
      expect(isInBounds(board, { file, rank: stagingRank(board) })).toBe(false)
    }
  })

  it('refuses a build on every one of its squares', () => {
    const state = createInitialState()

    for (let file = 0; file < state.board.files; file += 1) {
      expect(canBuildOn(state, { file, rank: stagingRank(state.board) })).toBe(false)
    }
  })
})

describe('spawning', () => {
  it('places a new Piece on the Staging rank, not the far rank', () => {
    const started = step(createInitialState(), { kind: 'startRound' })
    const afterFirstSpawn = tick(started, DT)
    const piece = afterFirstSpawn.pieces[0]

    expect(piece).toBeDefined()
    expect(piece?.square.rank).toBe(stagingRank(afterFirstSpawn.board))
  })

  it('never lets a Piece share a square with a Tower, with the far rank walled', () => {
    let state = walledFarRank()
    const overlaps: string[] = []
    const seen = new Set<string>()

    for (let elapsed = 0; elapsed < 120_000 && state.phase === 'inProgress'; elapsed += DT) {
      state = tick(state, DT)

      const towerSquares = new Set(state.towers.map((tower) => squareKey(tower.square)))

      for (const piece of state.pieces) {
        seen.add(piece.id)
        if (towerSquares.has(squareKey(piece.square))) {
          overlaps.push(`${piece.id} on ${squareKey(piece.square)} at ${state.roundElapsedMs}ms`)
        }
      }
    }

    // Guards against a vacuous pass: an arrangement that spawned nothing would
    // satisfy the assertion below without testing anything.
    expect(seen.size).toBeGreaterThan(0)
    expect(overlaps).toEqual([])
  })

  it('grinds a walled far-rank square from the Staging rank instead of standing on it', () => {
    const base = createInitialState()
    const built = withTower(5, { file: 3, rank: base.board.ranks - 1 }, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Two Pawn hops' worth of time: the first spawns it, the rest attack.
    const after = runFor(state, 2_000)
    const tower = firstTower(after)
    const pawn = after.pieces[0]

    expect(pawn?.square).toEqual({ file: 3, rank: stagingRank(after.board) })
    expect(tower.health).toBeLessThan(tower.maxHealth)
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test:run src/game/staging.test.ts`

Expected: FAIL. The first three fail to import (`stagingRank` is not exported from `./board`); once that is added, `places a new Piece on the Staging rank` fails with `expected 7 to be 8`, and `never lets a Piece share a square with a Tower` fails with a non-empty `overlaps` array.

- [ ] **Step 3: Add `stagingRank` to `src/game/board.ts`**

Append at the end of the file, after `allSquares`:

```ts
/**
 * The off-board rank Pieces spawn onto, one past the board's last rank.
 *
 * **Never a board square**, and that is the whole point: `isInBounds` is false
 * here, so `canBuildOn` refuses it without needing a clause of its own and a
 * Tower can never stand where a Piece appears. Entry to the board is then an
 * ordinary hop, which the existing rule already covers — a Piece whose next
 * square holds a Tower grinds it rather than advancing.
 *
 * Derived from `board` rather than a constant, like every other board extent:
 * an Ace grows the board and the Staging rank moves up with it.
 */
export function stagingRank(board: BoardSpec): number {
  return board.ranks
}
```

- [ ] **Step 4: Re-export it from `src/game/index.ts`**

Change the `./board` re-export line so the renderer can reach it — that file is the only route across the boundary:

```ts
export { allSquares, isInBounds, squareKey, squaresEqual, stagingRank } from './board'
```

- [ ] **Step 5: Spawn onto it in `src/game/tick.ts`**

In `drainDueSpawns`, replace the square line and its comment:

```ts
    // Read from state, not a constant: an Ace grows the board and Pieces must
    // then enter from the new far rank.
    const square: Square = { file: spawn.file, rank: state.board.ranks - 1 }
```

with:

```ts
    // The Staging rank, NOT the far rank. It is out of bounds, so no Tower can
    // ever stand there — which is what stops a Piece being placed on top of
    // one. The Piece steps onto the far rank on its own move interval, and a
    // Tower in the way is then handled by the ordinary blocking rule rather
    // than by a spawn-time special case. Read from state, not a constant: an
    // Ace grows the board and the Staging rank moves up with it.
    const square: Square = { file: spawn.file, rank: stagingRank(state.board) }
```

Add `stagingRank` to the existing `./board` import at the top of the file:

```ts
import { squareKey, stagingRank } from './board'
```

- [ ] **Step 6: Run the new tests**

Run: `pnpm test:run src/game/staging.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Run the whole suite and typecheck**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`

Expected: all pass. **If a pre-existing test in `src/game/tick.test.ts` or elsewhere fails**, read it before changing it: a test asserting a spawn lands on `board.ranks - 1` is asserting the old behaviour and should be updated to `stagingRank(board)`; a test that happens to *depend* on spawn timing (a Piece reaching a square by a given elapsed time) is now one hop behind and its duration should be extended by the Piece type's `moveIntervalMs`. Do not weaken an assertion to make it pass — say in the commit message which tests moved and why.

- [ ] **Step 8: Commit**

```bash
git add src/game/board.ts src/game/index.ts src/game/tick.ts src/game/staging.test.ts
git commit -m "$(cat <<'EOF'
Spawn Pieces onto an off-board Staging rank

A Piece used to be placed straight onto the far rank without consulting
state.towers, so a Tower built there got a Piece on top of it. Spawns now
land one rank past the board, which is out of bounds and therefore
unbuildable, and entry to the board is an ordinary hop the existing
blocking rule already covers.

Closes #22.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pin the entry behaviour for every Piece type

Test-only. Task 1 proves the collision is gone; this proves nothing got stranded or stuck on the way in, for all six types, and that an Ace behaves sanely with Pieces waiting.

**Files:**
- Modify: `src/game/staging.test.ts` (append two `describe` blocks)

**Interfaces:**
- Consumes: `stagingRank` from Task 1; `allSquares`, `isStuck`, `isInBounds`, `step`, `tick`, `createInitialState` from `./index`; `pieceAt`, `withDeck`, `withTower`, `standardCard`, `pawnAt`, `firstTower` from `./fixtures`; `PIECE_TYPES` from `../data/pieceTypes`; `DT`, `runFor` from Task 1's own file.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/staging.test.ts`, and extend its import block to:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { squareKey, stagingRank } from './board'
import { firstTower, pawnAt, pieceAt, standardCard, withDeck, withTower } from './fixtures'
import {
  allSquares,
  canBuildOn,
  createInitialState,
  isInBounds,
  isStuck,
  step,
  tick,
} from './index'
import type { GameState, PieceTypeId, Square, Tower } from './types'
```

Then append:

```ts
const PIECE_TYPE_IDS = Object.keys(PIECE_TYPES) as PieceTypeId[]

/**
 * A Tower on every one of these squares. Only `id` is read by the movement
 * code under test, but the whole shape is built so the map is a real
 * `Map<string, Tower>` rather than a cast.
 */
function towersAt(...squares: Square[]): Map<string, Tower> {
  return new Map(
    squares.map((square, index) => [
      squareKey(square),
      {
        id: `tower-${index}`,
        square,
        cardRank: 2 as const,
        fireCooldownMs: 0,
        health: 8,
        maxHealth: 8,
        damage: 1,
        fireIntervalMs: 600,
        shield: 0,
        damageTaken: 0,
      },
    ]),
  )
}

describe('entering the board from the Staging rank', () => {
  /**
   * Where each type's first hop lands. Everything steps or slides one rank in,
   * onto the far rank; a Knight's L crosses two ranks and so skips it.
   */
  function entryRank(typeId: PieceTypeId, ranks: number): number {
    return typeId === 'knight' ? ranks - 2 : ranks - 1
  }

  it.each(PIECE_TYPE_IDS)('gets onto the board on its first hop (%s)', (typeId) => {
    const base = createInitialState()
    const state: GameState = {
      ...base,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId, file: 3 }],
    }

    // One full move interval past the spawn, plus a tick of slack.
    const after = runFor(state, PIECE_TYPES[typeId].moveIntervalMs + DT * 2)
    const piece = after.pieces[0]

    expect(piece).toBeDefined()
    expect(piece?.square.rank).toBe(entryRank(typeId, after.board.ranks))
    expect(isInBounds(after.board, piece?.square ?? { file: -1, rank: -1 })).toBe(true)
  })

  it.each(PIECE_TYPE_IDS)('is never stuck on the Staging rank with the way clear (%s)', (typeId) => {
    const { board, core } = createInitialState()
    const piece = pieceAt(typeId, 'waiting', { file: 3, rank: stagingRank(board) })

    expect(isStuck(piece, board, core.square, new Map())).toBe(false)
  })

  it.each(PIECE_TYPE_IDS)('is never stuck on the Staging rank behind a full wall (%s)', (typeId) => {
    const { board, core } = createInitialState()
    const piece = pieceAt(typeId, 'waiting', { file: 3, rank: stagingRank(board) })

    // Every in-bounds square walled, so whichever candidate the type commits
    // to holds a Tower. That must read as `attackTower` — which is acting —
    // never as `stuck`, or the round could end with Pieces still queued.
    const walled = towersAt(...allSquares(board))

    expect(isStuck(piece, board, core.square, walled)).toBe(false)
  })
})

describe('an Ace played while Pieces wait', () => {
  it('admits them to the board, on new space no Tower could occupy', () => {
    const base = withDeck([standardCard('ace', 'A', 'spades')], createInitialState())
    const waiting = pawnAt('waiting', { file: 3, rank: stagingRank(base.board) })
    const state: GameState = { ...base, phase: 'inProgress', pieces: [waiting], pendingSpawns: [] }

    const grown = step(state, { kind: 'expandBoard', cardId: 'ace' })
    const pawn = grown.pieces[0]

    expect(grown.board.ranks).toBe(base.board.ranks + 1)
    // The rank it was standing on is now the far rank, and the Staging rank has
    // moved up past it.
    expect(pawn?.square.rank).toBe(grown.board.ranks - 1)
    expect(stagingRank(grown.board)).toBe(base.board.ranks + 1)
    expect(grown.towers).toEqual([])
  })
})

describe('round termination with Pieces still on the Staging rank', () => {
  it('ends the round once the wall they are grinding falls', () => {
    const base = createInitialState()
    // Rank 5 is the diagonal, which cannot cover the square directly up-file —
    // so this Tower never shoots its attacker and the grind is a pure countdown
    // on the Tower's health. Nothing else is on the board to shoot it either.
    const built = withTower(5, { file: 3, rank: base.board.ranks - 1 }, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Generous: a Pawn deals 1 per 900ms hop into 20 health, then walks the
    // board to the Core. The point is that it terminates at all — a Piece that
    // never got onto the board must not be able to hang the round.
    const after = runFor(state, 60_000)

    expect(after.phase).toBe('gap')
    expect(after.towers).toEqual([])
    expect(after.pieces).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests and verify they fail or pass for the right reason**

Run: `pnpm test:run src/game/staging.test.ts`

Expected: PASS. Unlike Task 1's tests these are not red-then-green — they characterise behaviour the fix already produces, and their value is as a pin. **If any fails, stop and read it** rather than adjusting the expectation: a stuck Piece on the Staging rank or a type that fails to enter is a real defect in the design's reasoning, not a wrong test.

- [ ] **Step 3: Run the whole suite, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/game/staging.test.ts
git commit -m "$(cat <<'EOF'
Pin Staging-rank entry for every Piece type

Each type gets onto the board on its first hop, and none is ever `stuck`
there — not even behind a fully walled board, where every candidate holds
a Tower and the outcome must be `attackTower` so the round cannot end with
Pieces still queued.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Draw the Staging rank

**Files:**
- Create: `src/scene/StagingRank.tsx`
- Modify: `src/scene/Board.tsx` (import, and the fragment inside `Board`)

**Interfaces:**
- Consumes: `stagingRank` and `type BoardSpec` from `../game`; `SQUARE_SIZE`, `rankToWorldZ` from `./coords`.
- Produces: `<StagingRank board={board} />`.

- [ ] **Step 1: Create `src/scene/StagingRank.tsx`**

```tsx
import { stagingRank, type BoardSpec } from '../game'
import { SQUARE_SIZE, rankToWorldZ } from './coords'

/**
 * Deliberately neither `LIGHT_SQUARE` nor `DARK_SQUARE`, and deliberately not
 * checkered: this is not a board square, and it should not read as one.
 */
const LEDGE = '#1d232c'

/**
 * The ledge Pieces spawn onto, one rank past the board.
 *
 * Pieces enter the board from the Staging rank rather than appearing on the far
 * rank, so without this they would stand on nothing. Drawing it also does the
 * job the rank exists for: the player sees what is coming, and on which file,
 * for one of the Piece's move intervals before it sets foot on the board.
 *
 * **One `<mesh>`, not `Instances`.** A single mesh has no `limit`, so it cannot
 * acquire the `limit`/`key` defect that produced the Ace wedge — the same
 * reason `CoveragePreview` draws its illegal-square marker as a plain mesh. Do
 * not turn this into per-file instances.
 *
 * Its top face sits at y = 0, coplanar with the board squares (0.12 tall,
 * centred at y = -0.06), so a Piece standing here rests at the same height it
 * does anywhere else and `Pieces.tsx` needs no special case. It is drawn a
 * little shallower than a full square so a seam separates it from the far rank.
 */
export function StagingRank({ board }: { board: BoardSpec }) {
  return (
    <mesh position={[0, -0.06, rankToWorldZ(board, stagingRank(board))]} receiveShadow>
      <boxGeometry args={[board.files * SQUARE_SIZE, 0.12, SQUARE_SIZE * 0.86]} />
      <meshStandardMaterial color={LEDGE} flatShading />
    </mesh>
  )
}
```

- [ ] **Step 2: Mount it from `src/scene/Board.tsx`**

Add the import beside the others (alphabetical, so after `SelectionMarker`):

```ts
import { StagingRank } from './StagingRank'
```

And add it to the fragment returned by `Board`, immediately after the `</Instances>` that closes the board squares and before `<CoveragePreview …>`:

```tsx
      <StagingRank board={board} />
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`

Expected: all pass. `pnpm build` is what catches an R3F prop typing mistake that `tsc --noEmit` on its own might not surface in a JSX-heavy file.

- [ ] **Step 4: See it in the real app**

Run `pnpm dev`, open the app, start a round, and confirm: a dark ledge sits beyond the far rank with a visible seam; Pieces appear on it and step onto the board a beat later; hovering it with a build Card selected previews nothing (it is out of bounds) and clicking it does nothing and does not consume the Card.

If a browser is not available in this environment, say so plainly in the commit message rather than claiming the visual check passed.

- [ ] **Step 5: Commit**

```bash
git add src/scene/StagingRank.tsx src/scene/Board.tsx
git commit -m "$(cat <<'EOF'
Draw the Staging rank as a ledge beyond the far rank

One mesh, not Instances — a single mesh has no `limit` and so cannot
acquire the defect that produced the Ace wedge. Its top face is coplanar
with the board so Pieces rest correctly and Pieces.tsx needs no change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update the docs

`game-design.md` is the source of truth for the design; `CLAUDE.md` carries only the invariants that constrain code. Keep them in their lanes.

**Files:**
- Modify: `docs/design/game-design.md` (four passages)
- Modify: `CLAUDE.md` (four passages)

**Interfaces:**
- Consumes: the shipped behaviour from Tasks 1–3.
- Produces: nothing.

- [ ] **Step 1: `game-design.md` — "The board", the Ace's effect**

Replace this paragraph under `## The board`:

> The Core stays on rank 0 and Pieces enter from whatever the far rank currently is, so growth lengthens the run to the Core and buys Towers more shots. That is the Ace's whole effect.

with:

```markdown
The Core stays on rank 0 and Pieces enter from the **Staging rank** — one rank past the far rank, off the board — stepping onto the far rank on their own move interval. Growth lengthens the run to the Core and buys Towers more shots. That is the Ace's whole effect. An Ace played while Pieces are still waiting on the Staging rank admits them: the rank they occupy becomes the new far rank, which is new space no Tower can have been built on.

**The Staging rank is not a board square.** No Tower can stand there, because placement refuses anything off the board — and that is precisely what stops a Piece appearing on top of a Tower. Entry to the board is an ordinary hop, so a Tower on the entry square blocks it and the Piece grinds from the Staging rank exactly as it would anywhere else. In every other respect a Piece there is an ordinary Piece: Towers whose coverage reaches it may shoot it, a Joker's Clear destroys it, and auras reach it. The wait is the point — it is a beat of warning about what is coming and on which file.
```

- [ ] **Step 2: `game-design.md` — Clear**

In the paragraph beginning **Clear leaves Towers and pending spawns alone.**, change:

> Being suitless, Clear is a Joker's only play — and it is the one card that can always break a grind.

to:

```markdown
Being suitless, Clear is a Joker's only play — and it is the one card that can always break a grind, **including a grind on the far rank by Pieces still standing on the Staging rank**. Sparing those would disarm the safety valve exactly when it is needed most.
```

- [ ] **Step 3: `game-design.md` — the occupancy paragraph under "Towers block, and blocked Pieces attack"**

Replace:

> **A Tower cannot be built on a square a Piece occupies.** Blocking only means something if the two never share a square, and a build is the one route onto the board the movement rule does not already guard. This closes it from the placement side only — a Piece can still spawn onto a square a Tower already occupies, which is the same overlap from the opposite direction and is tracked separately (issue #22, open).

with:

```markdown
**A Tower and a Piece never share a square, and both routes onto that state are closed.** A Tower cannot be built on a square a Piece occupies: blocking only means something if the two never overlap, and a build is one route the movement rule does not already guard. The other route was spawning, and it is closed differently — Pieces spawn onto the **Staging rank**, off the board, where no Tower can stand, and enter by moving. Neither route needs a special case at the point of collision, because after both fixes there is no collision to arbitrate.
```

- [ ] **Step 4: `game-design.md` — "Movement is chess movement"**

In the paragraph beginning **Every Piece is forward-biased and deterministic**, change `it travels down-board, rank 7 toward rank 0` to `it travels down-board, from the Staging rank toward rank 0`. Do not touch anything else in that section — the Staging rank changes where a Piece starts, not how it moves.

- [ ] **Step 5: `CLAUDE.md` — the vocabulary table**

Add a row immediately after the **Square / rank / file** row:

```markdown
| **Staging rank** | The off-board rank Pieces spawn onto, one past the board's last rank. Never a board square, so no Tower can stand there. A Piece enters the board by moving off it |
```

- [ ] **Step 6: `CLAUDE.md` — the invariants list**

Replace this sentence at the end of the **Towers block movement** invariant:

> This does not make the two exclusive in general — a Piece can still spawn onto an existing Tower's square, since `drainDueSpawns` in `src/game/tick.ts` does not consult `state.towers` (issue #22, open) — it only guarantees the player can never build the overlap into existence.

with:

```markdown
  The spawn route onto the same overlap is closed too, and differently: `drainDueSpawns` in `src/game/tick.ts` places a Piece on the **Staging rank** — `stagingRank(state.board)`, one past the board — which `isInBounds` rejects and so `canBuildOn` refuses for free. Entry to the board is then a move, which this same rule already covers. **A Tower and a Piece can no longer share a square by any route.**
```

And add a new invariant immediately after it:

```markdown
- **Pieces spawn onto the Staging rank, and it must stay out of bounds.** `stagingRank` in `src/game/board.ts` returns `board.ranks`, and the entire fix for issue #22 rests on `isInBounds` being false there — that, and nothing else, is what stops a Tower being built where a Piece appears. Widening `isInBounds` to include it would silently re-open the collision. A Piece standing there is otherwise ordinary: Towers may fire at it, a Joker's Clear destroys it, auras reach it. `src/game/staging.test.ts` pins all of this.
```

- [ ] **Step 7: `CLAUDE.md` — "Current state"**

In the "What exists" list, after the **The full Chess roster** bullet, add:

```markdown
- **The Staging rank.** Pieces spawn one rank past the board and step onto the far rank on their own interval, so a Tower on the far rank blocks an entering Piece rather than having one spawn on top of it (issue #22). Drawn as a ledge by `src/scene/StagingRank.tsx`.
```

And in the paragraph beginning "Towers fire and can kill Pieces outright", leave the round-termination wording alone — it is still accurate.

- [ ] **Step 8: `CLAUDE.md` — the test count**

Run `pnpm test:run`, read the real figures, and update the sentence that currently reads "560 tests across 34 files" to the actual numbers. **Do not estimate** — CLAUDE.md says a stale figure here has already leaked into a plan document once.

- [ ] **Step 9: Verify the docs against the code**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`

Then re-read your four `game-design.md` edits and six `CLAUDE.md` edits and check each claim is true of the code as committed. Two specifically worth re-checking, because they are the easiest to get wrong: `canBuildOn` gains **no** new clause (confirm `src/game/placement.ts` is unmodified in `git diff main`), and `selectTargets` in `src/game/tick.ts` gains **no** bounds check (confirm the only `tick.ts` change is inside `drainDueSpawns`).

- [ ] **Step 10: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Document the Staging rank

game-design.md gains the rank itself, what an Ace does to Pieces waiting
on it, and Clear's reach over them; the occupancy paragraph now describes
both routes as closed instead of one. CLAUDE.md gains the vocabulary row,
the invariant that the rank must stay out of bounds, and a refreshed test
count.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `pnpm lint` — clean
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm test:coverage` — passes, including the per-directory thresholds in `vite.config.ts`
- [ ] `pnpm build` — succeeds
- [ ] `git diff main --stat` shows only the files this plan names
- [ ] The `Closes #22` trailer is on the Task 1 commit
