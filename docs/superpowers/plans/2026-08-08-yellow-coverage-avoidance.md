# Yellow Coverage Avoidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make yellow Pieces avoid landing on squares Towers can actually hit while they hunt the Core — a soft preference, yellow-only, that never strands a Piece and never routes around a blocker.

**Architecture:** A new `hittableSquares(board, towers)` in `src/game/coverage.ts` computes the union of each Tower's occlusion-aware firing footprint (`reachableSquares`, exactly what the firing overlays draw). `nextMove` gains an `avoid: ReadonlySet<string>` parameter — a tick-level context value, not per-Piece state — threaded into `huntByOffsets` and `huntByField`, gated on `request.tier === 'yellow'`. Both hunt functions scan their fixed candidate order once, preferring the first candidate whose *landing square* is not in the avoid set, and fall back to today's first candidate when every one is covered. `tick.ts`'s `movePieces` computes the set once per tick from `towerBySquare`. The distance-field cache, the renderer, and `structuralKey` are untouched.

**Tech Stack:** TypeScript strict, Vitest (esbuild strips types — type-level claims need `pnpm typecheck`), ESLint (renderer boundary + no `Math.random` in `src/game/`), pnpm.

## Global Constraints

Copy these from the spec (`docs/superpowers/specs/2026-08-08-yellow-coverage-avoidance-design.md`); every task's requirements implicitly include this section.

- **Yellow-only.** Avoidance is gated on `request.tier === 'yellow'`; green (including late-hunt), red, and black behave exactly as today.
- **Soft preference, never hard avoidance.** Direction still comes from the Tower-blind distance field; every hop still lands on a `d−1` candidate (or today's first landing); if every candidate is covered, fall back to today's first candidate. Avoidance never strands a Piece and round termination is untouched.
- **Landing square only.** Check the hop's actual landing square, never intermediate slide squares.
- **The Core is never avoided.** A `d−1` candidate equal to the target — the Core, or a colour-locked Bishop's pre-Core target — always wins, even when covered.
- **Tower-blocking candidates still grind.** A `d−1` candidate that is a Tower commits immediately in fixed order, exactly as today. Yellow avoids *fire*, never *obstacles*; the anti-mazing invariant holds for blockers.
- **`src/game/distanceFields.ts` is untouched.** The field cache stays Tower-blind; the avoid set is a pure function of the Tower list and the board, so seeded runs stay deterministic (`Math.random` never appears in `src/game/`).
- **No new fields.** No new `MoveRequest` member, no new tier flag, no `types.ts` change. `structuralKey.ts`, `src/scene/`, and `src/ui/` need no change.
- **`hittableSquares` does NOT go on the public surface** in `src/game/index.ts` — it is used only by `tick.ts` and imported directly by tests, exactly like `coverage.ts`'s other internals.

## File Map

| File | Responsibility | Change |
| --- | --- | --- |
| `src/game/coverage.ts` | Tower reachability | Add `hittableSquares` beside `reachableSquares` |
| `src/game/coverage.test.ts` | Coverage tests | Add `hittableSquares` tests |
| `src/game/movement.ts` | Piece movement | `nextMove`/`huntByOffsets`/`huntByField`/`knightMove` gain `avoid`; two-pass preference with fallback; `isStuck` passes empty |
| `src/game/movement.test.ts` | Movement tests | `move()` helper gains `avoid`; new yellow avoidance describe block |
| `src/game/tierMovement.test.ts` | Tier tests | `move()` helper gains `avoid` (default empty) |
| `src/game/staging.test.ts` | Staging tests | Direct `nextMove` call passes `new Set()` |
| `src/game/tick.ts` | Simulation | `movePieces` computes `hittableSquares` once per tick, passes to `nextMove` |
| `src/game/tick.test.ts` | Simulation tests | Preference + termination tests through `tick` |
| `docs/design/game-design.md` | Canonical design | Yellow carve-out paragraph beside the red one |
| `CLAUDE.md` | Repo how-to | One sentence in the "forward-biased and deterministic" invariant |

---

### Task 1: `hittableSquares` in `coverage.ts`

The union of every Tower's occlusion-aware firing footprint, keyed by `squareKey`. This is the one place the avoid set is derived, so the footprint yellow dodges and the footprint a shot actually lands on cannot drift.

**Files:**
- Modify: `src/game/coverage.ts` (imports at lines 1-2, append function at end after `reachableSquares`)
- Test: `src/game/coverage.test.ts`

**Interfaces:**
- Consumes: `reachableSquares(board, geometry, range, from, blockers)` and `squareKey(square)` (already in this codebase).
- Produces: `export function hittableSquares(board: BoardSpec, towers: readonly Tower[]): ReadonlySet<string>` — used by Task 3 (`tick.ts`) and by Task 3's tests.

- [ ] **Step 1: Add the failing tests**

Add this describe block to `src/game/coverage.test.ts`, and extend the imports on lines 3-5 of that file with `squareKey` (from `./board`) and add `BOARD` (from `../data/board`):

```ts
import { BOARD } from '../data/board'
import { allSquares, isInBounds, squareKey } from './board'
```

Add the `hittableSquares` import to the line-5 import from `./coverage`:

```ts
import { coveredSquares, coversSquare, hittableSquares, isOccluded, reachableSquares } from './coverage'
```

Append the describe block:

```ts
describe('hittableSquares', () => {
  it('is the union of every Tower\'s reachable footprint', () => {
    // Interior squares, so each adjacent footprint is the full 8 squares —
    // corner towers would be edge-clipped and shrink the expected union.
    const first = withTower(2, { file: 2, rank: 2 })
    const state = withTower(2, { file: 5, rank: 5 }, first)

    const set = hittableSquares(BOARD, state.towers)
    const def = towerRank(2)
    const blockers = state.towers.map((tower) => tower.square)

    for (const square of [
      ...reachableSquares(BOARD, def.geometry, def.range, { file: 2, rank: 2 }, blockers),
      ...reachableSquares(BOARD, def.geometry, def.range, { file: 5, rank: 5 }, blockers),
    ]) {
      expect(set.has(squareKey(square))).toBe(true)
    }
    // Two non-overlapping adjacent footprints of 8 squares each.
    expect(set.size).toBe(16)
  })

  it('drops a square another Tower occludes', () => {
    // A rank-5 diagonal Tower at the corner covers (4,4), but a rank-3 vertical
    // Tower at (2,2) stands between on the same diagonal — the shot is blocked,
    // so (4,4) must not be in the union even though no other Tower covers it.
    const diagonal = withTower(5, { file: 0, rank: 0 })
    const state = withTower(3, { file: 2, rank: 2 }, diagonal)

    const def = towerRank(5)
    const covered = coveredSquares(BOARD, def.geometry, def.range, { file: 0, rank: 0 })
    expect(covered.some((square) => square.file === 4 && square.rank === 4)).toBe(true)

    expect(hittableSquares(BOARD, state.towers).has(squareKey({ file: 4, rank: 4 }))).toBe(false)
  })

  it('a Wall contributes nothing', () => {
    const state = withTower(7, { file: 4, rank: 4 })

    expect(hittableSquares(BOARD, state.towers).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: FAIL — `hittableSquares is not a function` (esbuild strips types, so the missing export is the runtime failure).

- [ ] **Step 3: Implement `hittableSquares`**

In `src/game/coverage.ts`, extend the imports (lines 1-2):

```ts
import { towerRank } from '../data/towerRanks'
import { allSquares, squareKey, squaresEqual } from './board'
import type { BoardSpec, Square, Tower, TowerGeometry } from './types'
```

Append at the end of the file, after `reachableSquares`:

```ts
/**
 * Every square on the board that at least one Tower can actually hit, keyed by
 * `squareKey`.
 *
 * The union of `reachableSquares` across the Tower list — occlusion-aware, so
 * a square a Tower can see but another Tower hides is not in the set. This is
 * the footprint the firing overlays draw, which is what makes it the right
 * thing for yellow's hunt to dodge: the squares a shot would actually land on
 * and the squares yellow avoids are the same set by construction. The Wall's
 * `geometry: 'none'` contributes nothing; an aura Tower contributes its firing
 * footprint, which is also where its aura applies.
 *
 * A pure function of the board and the Tower list, so the avoidance it feeds
 * stays deterministic within a seeded run. Allocates: `movePieces` in tick.ts
 * calls it once per tick, never from a frame loop.
 */
export function hittableSquares(board: BoardSpec, towers: readonly Tower[]): ReadonlySet<string> {
  const blockers = towers.map((tower) => tower.square)
  const covered = new Set<string>()

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    for (const square of reachableSquares(board, def.geometry, def.range, tower.square, blockers)) {
      covered.add(squareKey(square))
    }
  }

  return covered
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/coverage.ts src/game/coverage.test.ts
git commit -m "feat(game): add hittableSquares for the reachable tower footprint"
```

---

### Task 2: `avoid` through the movement engine

`nextMove` gains the `avoid` parameter and gates it on yellow; `huntByOffsets` and `huntByField` scan their fixed order once, committing blockers/targets, preferring an uncovered landing, and falling back to today's first candidate when every one is covered. Red's Tower-seek and green's paths pass an empty set.

**Files:**
- Modify: `src/game/movement.ts` (`nextMove` at 499, `knightMove` at 200, `huntByOffsets` at 257, `huntByField` at 331, `seekTower` at 465, `isStuck` at 692)
- Modify: `src/game/movement.test.ts` (`move()` helper at 13, new describe block)
- Modify: `src/game/tierMovement.test.ts` (`move()` helper at 10)
- Modify: `src/game/staging.test.ts` (direct `nextMove` call at 389)
- Test: `src/game/movement.test.ts`

**Interfaces:**
- Consumes: `hittableSquares` output shape from Task 1 (a `ReadonlySet<string>` of square keys) — though Task 2's unit tests pass synthetic sets directly.
- Produces: `nextMove(request, board, coreSquare, towerBySquare, avoid: ReadonlySet<string>)`. Task 3 (`tick.ts`) consumes this 5-argument signature, and `isStuck` keeps its 4-argument-facing behaviour by passing `EMPTY_AVOID`.

- [ ] **Step 1: Update the two `move()` test helpers and add the failing tests**

In `src/game/movement.test.ts`, change the `move()` helper (lines 13-30) to take and forward `avoid`:

```ts
const EMPTY_AVOID = new Set<string>()

/** Keeps call sites readable. Defaults match a freshly spawned Piece. */
function move(
  typeId: PieceTypeId,
  from: Square,
  towers: ReadonlyMap<string, Tower> = NO_TOWERS,
  overrides: Partial<MoveRequest> = {},
  avoid: ReadonlySet<string> = EMPTY_AVOID,
) {
  const request: MoveRequest = {
    typeId,
    from,
    moveCount: 0,
    handedness: 1,
    slideBonus: 0,
    hunting: false,
    tier: 'green',
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers, avoid)
}
```

Extend the imports on lines 3-8 of the file so the new describe block compiles: add `isInBounds` to the `./board` import, add `KNIGHT_OFFSETS` to the `./distanceFields` import (line 4).

Add this describe block to `src/game/movement.test.ts`:

```ts
describe('yellow coverage avoidance', () => {
  /**
   * A hunting Knight at (2,3) has exactly two d−1 candidates, both found at
   * runtime from the field so the test survives field changes: the first in
   * KNIGHT_OFFSETS order and the second. (1,1) and (4,2) both sit one knight
   * move from the Core at (3,0).
   */
  const from = { file: 2, rank: 3 }

  function knightCandidates(field: ReadonlyMap<string, number>): Square[] {
    const own = field.get(squareKey(from))
    if (own === undefined) throw new Error('expected a knight field entry for (2,3)')

    return KNIGHT_OFFSETS.map((offset) => ({ file: from.file + offset.file, rank: from.rank + offset.rank }))
      .filter(
        (square) => isInBounds(BOARD, square) && field.get(squareKey(square)) === own - 1,
      )
  }

  it('prefers an uncovered d−1 landing over a covered one', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[1] === undefined) throw new Error('expected at least two candidates')

    const avoid = new Set([squareKey(candidates[0])])
    const outcome = move('knight', from, NO_TOWERS, { tier: 'yellow', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[1], hunting: true })
  })

  it('falls back to the first d−1 landing when every one is covered', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const avoid = new Set(candidates.map((square) => squareKey(square)))
    const outcome = move('knight', from, NO_TOWERS, { tier: 'yellow', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[0], hunting: true })
  })

  it('grinds a Tower-blocked d−1 landing rather than routing around it', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const towers = towersAt(candidates[0])
    const outcome = move('knight', from, towers, { tier: 'yellow', hunting: true }, new Set())

    expect(outcome).toEqual({ kind: 'attackTower', towerId: 'tower-0', hunting: true })
  })

  it('a green late-hunt Piece does not avoid', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const avoid = new Set(candidates.map((square) => squareKey(square)))
    const outcome = move('knight', from, NO_TOWERS, { tier: 'green', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[0], hunting: true })
  })

  it('a red Piece ignores the avoid set', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)
    const candidates = knightCandidates(field)
    if (candidates[0] === undefined) throw new Error('expected at least one candidate')

    const avoid = new Set(candidates.map((square) => squareKey(square)))
    const outcome = move('knight', from, NO_TOWERS, { tier: 'red', hunting: true }, avoid)

    expect(outcome).toEqual({ kind: 'move', to: candidates[0], hunting: true })
  })

  it('never dodges the Core, even when it is covered', () => {
    const outcome = move('king', { file: 3, rank: 1 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['3,0']))

    expect(outcome).toEqual({ kind: 'reachCore' })
  })

  it('a colour-locked Bishop never dodges its pre-Core target', () => {
    // (4,0) is on the opposite colour from the Core, so this Bishop hunts the
    // square directly in front of it, (3,1) — covered here, and still taken.
    const outcome = move('bishop', { file: 4, rank: 0 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['3,1']))

    expect(outcome).toEqual({ kind: 'reachCore' })
  })

  it('a slider prefers a direction whose landing square is uncovered', () => {
    // Locked Bishop at (5,1): its first direction lands on (4,2) (covered), so
    // it takes the second, which lands on (4,0).
    const outcome = move('bishop', { file: 5, rank: 1 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['4,2']))

    expect(outcome).toEqual({ kind: 'move', to: { file: 4, rank: 0 }, hunting: true })
  })

  it('a King prefers a direction whose landing square is uncovered', () => {
    // From (3,2) the King's fixed scan order first resolves the direction
    // landing on (2,2), then (3,1); both covered here, so it takes the third
    // d−1 landing, (4,1).
    const outcome = move('king', { file: 3, rank: 2 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['2,2', '3,1']))

    expect(outcome).toEqual({ kind: 'move', to: { file: 4, rank: 1 }, hunting: true })
  })

  it("a King falls back to today's first landing when every one is covered", () => {
    const outcome = move('king', { file: 3, rank: 2 }, NO_TOWERS, { tier: 'yellow', hunting: true }, new Set(['2,2', '3,1', '4,1', '2,1']))

    expect(outcome).toEqual({ kind: 'move', to: { file: 2, rank: 2 }, hunting: true })
  })
})
```

Also update the `move()` helper in `src/game/tierMovement.test.ts` (lines 10-27) with the same `avoid` parameter and default:

```ts
const EMPTY_AVOID = new Set<string>()

function move(
  typeId: PieceTypeId,
  from: Square,
  towers: ReadonlyMap<string, Tower> = NO_TOWERS,
  overrides: Partial<MoveRequest> = {},
  avoid: ReadonlySet<string> = EMPTY_AVOID,
) {
  const request: MoveRequest = {
    typeId,
    from,
    moveCount: 0,
    handedness: 1,
    slideBonus: 0,
    hunting: false,
    tier: 'green',
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers, avoid)
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: the new describe block's assertions FAIL — `nextMove` ignores the extra argument (esbuild strips types), so a yellow Knight with a covered first candidate still lands on it.

- [ ] **Step 3: Implement the two-pass preference in `movement.ts`**

Add the module constant near the top of the file, after the imports (after line 14):

```ts
/**
 * The avoid set every non-yellow hunt passes: no preference at all. Red's Tower
 * seek and a green late-hunt keep their exact current behaviour.
 */
const EMPTY_AVOID: ReadonlySet<string> = new Set()
```

Replace the body of `huntByOffsets` (lines 257-295) with this version, and change its signature to add `avoid: ReadonlySet<string>` as the final parameter. Update the function's doc comment to note the two-pass scan:

```ts
function huntByOffsets(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  offsets: readonly Square[],
  stampHunting: boolean,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  const ownDistance = field.get(squareKey(from))

  // Undefined only if `from` is not connected to the target at all — not
  // possible on the current 8x8 board, but a future board shape or Core
  // placement should fail safe as a genuinely immobile Piece rather than
  // throw.
  if (ownDistance === undefined) return { kind: 'stuck' }
  if (ownDistance === 0) return { kind: 'reachCore' }

  const destinations: Square[] = []
  for (const offset of offsets) {
    const to: Square = { file: from.file + offset.file, rank: from.rank + offset.rank }
    if (!isInBounds(board, to)) continue
    if (field.get(squareKey(to)) !== ownDistance - 1) continue
    destinations.push(to)
  }

  // One scan of the fixed order, not a separate preference pass, so a blocker
  // or the target still commits at its own position in the order — yellow
  // avoids FIRE, never obstacles. A covered landing is remembered as the
  // fallback and skipped; the first uncovered landing wins. When every landing
  // is covered the fallback is today's first candidate, so avoidance never
  // strands a Piece.
  let fallback: Square | undefined

  for (const to of destinations) {
    const blocker = towerBySquare.get(squareKey(to))
    if (blocker) {
      return stampHunting
        ? { kind: 'attackTower', towerId: blocker.id, hunting: true }
        : { kind: 'attackTower', towerId: blocker.id }
    }

    if (squaresEqual(to, targetSquare)) return { kind: 'reachCore' }

    if (avoid.has(squareKey(to))) {
      if (fallback === undefined) fallback = to
      continue
    }

    return stampHunting ? { kind: 'move', to, hunting: true } : { kind: 'move', to }
  }

  if (fallback) return stampHunting ? { kind: 'move', to: fallback, hunting: true } : { kind: 'move', to: fallback }

  // Unreachable given the BFS guarantee above, kept only so the function is
  // total rather than assuming its own invariant.
  return { kind: 'stuck' }
}
```

Replace the body of `huntByField` (lines 331-384) with this version, and change its signature to add `avoid: ReadonlySet<string>` as the final parameter. Update the doc comment to note that the landing square of a resolved direction is what the avoidance checks, and that a covered landing is skipped with today's first direction kept as the fallback:

```ts
function huntByField(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  directions: readonly Square[],
  maxSteps: number,
  stampHunting: boolean,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  const stamp = stampHunting ? { hunting: true as const } : {}
  const ownDistance = field.get(squareKey(from))

  // Undefined only if `from` is not connected to the target at all under this
  // movement — not possible for the hunts wired today, but a future board
  // shape should fail safe as a genuinely immobile Piece rather than throw.
  if (ownDistance === undefined) return { kind: 'stuck' }

  // Standing ON the target is arrival. In real play a Piece never begins a
  // hop there — the target check fires the moment a slide steps onto it —
  // but the exhaustive walk tests finish a colour-locked Bishop's approach
  // from the square in front of the Core, and this keeps the function total.
  if (ownDistance === 0) return { kind: 'reachCore' }

  let fallback: Square | undefined

  for (const direction of directions) {
    const closerRange = rangeToCloserSquare(from, board, direction, field, ownDistance)
    if (closerRange === undefined) continue

    const steps = Math.min(Math.max(1, maxSteps), closerRange)
    let square = from

    for (let remaining = steps; remaining > 0; remaining -= 1) {
      const next: Square = { file: square.file + direction.file, rank: square.rank + direction.rank }

      const blocker = towerBySquare.get(squareKey(next))
      if (blocker) {
        return squaresEqual(square, from)
          ? { kind: 'attackTower', towerId: blocker.id, ...stamp }
          : { kind: 'move', to: square, ...stamp }
      }

      if (squaresEqual(next, targetSquare)) return { kind: 'reachCore' }

      square = next
    }

    // The slide resolved to a landing. A blocker or the target already
    // committed above; a covered LANDING square is skipped — intermediate
    // squares are positions no shot can reach and stay legal to cross — and
    // today's first resolved direction is kept as the fallback.
    if (avoid.has(squareKey(square))) {
      if (fallback === undefined) fallback = square
      continue
    }

    return { kind: 'move', to: square, ...stamp }
  }

  if (fallback) return { kind: 'move', to: fallback, ...stamp }

  // Unreachable on the current board: every hunt wired today is connected to
  // its target from every square it can start on. Kept so the function is
  // total rather than assuming its own invariant.
  return { kind: 'stuck' }
}
```

Change `knightMove` (line 200) to take `avoid: ReadonlySet<string>` as a final parameter, and forward it to `huntByOffsets` (line 230):

```ts
function knightMove(
  from: Square,
  moveCount: number,
  handedness: Handedness,
  hunting: boolean,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  if (!hunting) {
    // ... unchanged zig-zag body ...
  }

  return huntByOffsets(
    from,
    board,
    coreSquare,
    towerBySquare,
    knightDistanceField(board, coreSquare),
    KNIGHT_OFFSETS,
    true,
    avoid,
  )
}
```

Change the two `huntByOffsets`/`huntByField` calls inside `seekTower` (lines 479 and 489) to pass `EMPTY_AVOID` as their final argument:

```ts
  if (request.typeId === 'knight') {
    return huntByOffsets(request.from, board, target.square, towerBySquare, field, KNIGHT_OFFSETS, false, EMPTY_AVOID)
  }

  const directions =
    request.typeId === 'rook'
      ? ORTHOGONAL_OFFSETS
      : request.typeId === 'bishop'
        ? DIAGONAL_OFFSETS
        : ROYAL_OFFSETS

  return huntByField(request.from, board, target.square, towerBySquare, field, directions, maxSteps, false, EMPTY_AVOID)
```

Change `nextMove`'s signature (line 499) to add `avoid: ReadonlySet<string>`, gate it on yellow, and thread it into the hunt calls. **This is a set of minimal edits, not a wholesale replacement — keep every existing comment in the function body** (the staging-rank note, the red-override note, and the colour-locked Bishop note inside `case 'bishop'` all stay exactly as they are). The three edits:

1. Signature — add the parameter:

```ts
export function nextMove(
  request: MoveRequest,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  avoid: ReadonlySet<string>,
): MoveOutcome {
```

2. After the red-seek block, add the gate with a comment in the file's voice:

```ts
  // Yellow's one carve-out: while hunting, prefer a landing square no Tower
  // can hit. Every other tier hunts with no preference — an empty set.
  const huntAvoid = request.tier === 'yellow' ? avoid : EMPTY_AVOID
```

3. In each hunt call in the type switch, append `huntAvoid` as the final argument to `huntByField`, and append it to the `knightMove` call. The rook, queen, and king hunts become:

```ts
    case 'rook':
      return hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            rookDistanceField(board, coreSquare),
            ORTHOGONAL_OFFSETS,
            1 + request.slideBonus,
            true,
            huntAvoid,
          )
        : travel(...) // unchanged
```

```ts
    case 'queen':
      return hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            queenDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1 + request.slideBonus,
            true,
            huntAvoid,
          )
        : travel(...) // unchanged
```

```ts
    case 'king':
      return hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            kingDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1,
            true,
            huntAvoid,
          )
        : travel(...) // unchanged
```

The `case 'bishop'` hunt (both its `target` derivation and its existing colour-locking comment stay untouched) gains `huntAvoid` the same way, and the `case 'knight'` call becomes:

```ts
    case 'knight':
      return knightMove(
        request.from,
        request.moveCount,
        request.handedness,
        hunting,
        board,
        coreSquare,
        towerBySquare,
        huntAvoid,
      )
```

Change `isStuck`'s `nextMove` call (line 692) to pass `EMPTY_AVOID`:

```ts
  return nextMove(request, board, coreSquare, towerBySquare, EMPTY_AVOID).kind === 'stuck'
```

In `src/game/staging.test.ts`, update the direct `nextMove` call (line 389) to pass an empty set as its fifth argument:

```ts
                const outcome = nextMove(
                  { typeId, from: square, moveCount, handedness, slideBonus, hunting, tier: 'green' },
                  board,
                  core.square,
                  new Map(),
                  new Set(),
                )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: PASS — including the existing "strictly decreases" exhaustive Knight hunt test and `walkToCore`.

Run: `pnpm test:run src/game/tierMovement.test.ts src/game/staging.test.ts`
Expected: PASS — these only compile-consumed the new signature.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (This is where the new `avoid` parameter's required-ness is enforced — esbuild in the step above would not catch a missed call site.)

- [ ] **Step 6: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/tierMovement.test.ts src/game/staging.test.ts
git commit -m "feat(game): yellow hunts avoid covered landing squares"
```

---

### Task 3: Thread the avoid set through `tick`

`movePieces` computes `hittableSquares` once per tick — before the Piece loop — and hands it to every `nextMove` call. `isStuck` already passes `EMPTY_AVOID` from Task 2, so the termination check stays cheap and avoidance never changes a `stuck` outcome.

**Files:**
- Modify: `src/game/tick.ts` (import at line 6, `movePieces` at 516, `nextMove` call at 570)
- Test: `src/game/tick.test.ts`

**Interfaces:**
- Consumes: `hittableSquares(board, towers)` from Task 1; the 5-argument `nextMove` from Task 2.
- Produces: end-to-end behaviour only — no new exports.

- [ ] **Step 1: Add the failing tests**

Add a describe block to `src/game/tick.test.ts` (it already imports `withTower`, `liveRound`, `runFor`, `PIECE_TYPES`, `DT`, and its local `pieceAt(id, typeId, square, overrides)` at line 62):

```ts
describe('tick: yellow coverage avoidance', () => {
  it('a yellow Knight hops to an uncovered d−1 landing rather than a covered one', () => {
    // The rank-2 Tower at (2,1) covers (1,1) — the Knight's first d−1 landing —
    // but not (4,2), its second.
    const state = withTower(2, { file: 2, rank: 1 })
    const knight = pieceAt('knight', 'hop', { file: 2, rank: 3 }, { tier: 'yellow', hunting: true })

    const after = runFor(liveRound(state, [knight]), PIECE_TYPES.knight.moveIntervalMs + DT)

    expect(after.pieces[0]?.square).toEqual({ file: 4, rank: 2 })
  })

  it('a round whose every d−1 landing is covered still terminates', () => {
    // Both of the Knight's d−1 landings, (1,1) and (4,2), are covered. Avoidance
    // falls back to today's first candidate, which sits under the Tower at
    // (2,1): the Knight is shot down, and with nothing left to act the round
    // completes rather than stalling.
    const covered = withTower(2, { file: 2, rank: 1 })
    const state = withTower(2, { file: 4, rank: 3 }, covered)
    const knight = pieceAt('knight', 'doomed', { file: 2, rank: 3 }, { tier: 'yellow', hunting: true })

    const after = runFor(liveRound(state, [knight]), 60_000)

    expect(after.phase).toBe('gap')
    expect(after.pieces).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/tick.test.ts`
Expected: the first test FAILS — with no avoid set wired, the yellow Knight lands on (1,1) instead of (4,2). (The termination test may pass already; that is fine — it pins the no-regression.)

- [ ] **Step 3: Implement the wiring in `tick.ts`**

Extend the `./coverage` import (line 6):

```ts
import { coversSquare, hittableSquares, isOccluded } from './coverage'
```

In `movePieces`, add the computation before the Piece loop (before `for (const piece of pieces)` at line 537), with a comment matching the file's style:

```ts
  // The squares no Piece should choose to land on, derived once for the whole
  // tick so every yellow hunt sees the same Tower layout regardless of the
  // order Pieces are processed in. A soft preference, never a wall: a Piece
  // with every d−1 landing covered falls back to its ordinary first candidate.
  const avoid = hittableSquares(board, [...towerBySquare.values()])
```

Pass it as the fifth argument to the `nextMove` call (line 570):

```ts
      const outcome = nextMove(
        {
          typeId: piece.typeId,
          from: square,
          moveCount,
          handedness,
          slideBonus,
          hunting,
          tier: piece.tier,
        },
        board,
        coreSquare,
        towerBySquare,
        avoid,
      )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/tick.test.ts`
Expected: PASS — both new tests green, all existing tick tests still green.

Run the full suite: `pnpm test:run`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/game/tick.ts src/game/tick.test.ts
git commit -m "feat(game): thread tower-coverage avoidance through movePieces"
```

---

### Task 4: Document the yellow carve-out

Record the deliberate inversion of the "fields never see Towers" invariant where the design keeps its carve-outs — beside red's, in `game-design.md`, and one sentence in `CLAUDE.md`'s movement invariant.

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the yellow carve-out to `game-design.md`**

In `docs/design/game-design.md`, insert a new paragraph directly after the red carve-out paragraph (currently line 314, ending "...placing a decoy Tower spends a card and draws aggression toward it."):

```md
**The yellow carve-out.** Yellow is steered the opposite way — placement *repels* it. While hunting, a yellow Piece prefers the first candidate, in its fixed scan order, whose *landing square* no Tower can hit; the avoid set is the union of every Tower's `reachableSquares` (`hittableSquares` in `src/game/coverage.ts`), exactly the footprint a shot would actually land on. It is a **soft preference**, never a wall: direction still comes from the Tower-blind field, every hop still lands on a `d−1` candidate (or today's first landing), and a Piece with every candidate covered falls back to today's first-candidate behaviour — so avoidance never strands a Piece and round termination is untouched. It avoids *fire*, never *obstacles*: a Tower-blocked candidate is still ground, never routed around, and the anti-mazing invariant holds for blockers. Like red, this is a deliberate inversion of the no-mazing invariant that costs the player a Card — placement attracts red and repels yellow. See [`2026-08-08-yellow-coverage-avoidance-design.md`](../superpowers/specs/2026-08-08-yellow-coverage-avoidance-design.md).
```

- [ ] **Step 2: Add one sentence to `CLAUDE.md`**

In `CLAUDE.md`, the **Pieces are forward-biased and deterministic** invariant ends "...red's tower-fields are Tower-blind as geometry — Towers are seeds, never obstacles." Append this sentence after it:

```md
A second, softer steer rides the same carve-out: while hunting, **yellow repels** — among the equal-distance candidates in its fixed order it prefers the first whose landing square no Tower can hit, falling back to today's first candidate when every one is covered. It avoids fire, never obstacles: a blocked yellow Piece still grinds, distance still decreases every hop, and termination is untouched. Red attracts; yellow repels; both are deliberate, and both cost the player a Card.
```

- [ ] **Step 3: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "docs: record the yellow coverage-avoidance carve-out"
```

---

### Task 5: Full verification

Confirm the whole repository is clean before calling the work done — the engine is the priority, but the renderer and data layers must not have been broken by the boundary change.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test:run`
Expected: 753+ tests pass (the count grows with this work), zero failures.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean — no new imports of React/Three.js in `src/game/`, no `Math.random`, no `react-hooks` regressions.

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: production build succeeds.

- [ ] **Step 5: Review the diff**

Run: `git diff main...HEAD --stat` and skim `git log --oneline -5`.
Expected: five commits — Task 1's `coverage.ts` + tests, Task 2's movement engine + tests, Task 3's tick wiring + tests, Task 4's docs, and no stray changes.

## Self-Review

**Spec coverage** — every spec section maps to a task: `hittableSquares` union/occlusion/Wall (Task 1); soft preference, fallback, Core-never-dodged, colour-locked Bishop target, green-doesn't-avoid, red-unchanged, blocker-still-grinds, slider/King landing-square preference (Task 2); once-per-tick computation and full-coverage termination (Task 3); the two carve-out doc edits (Task 4). The spec's "no new fields, no renderer change, no structuralKey change" constraints are honoured by the file map — no such file appears in it.

**Placeholder scan** — every code step carries its full implementation or test text; no "add appropriate X" or "similar to Task N". Task 2's `case` bodies are spelled out rather than referenced because the signature change is exactly the kind of detail an engineer reading tasks out of order must not have to reconstruct.

**Type consistency** — `hittableSquares(board, towers)` is defined in Task 1 and consumed with that exact shape in Task 3; `avoid: ReadonlySet<string>` is the final parameter of `nextMove`, `huntByOffsets`, `huntByField`, and `knightMove` throughout. `EMPTY_AVOID` is the module constant in `movement.ts`, referenced by `seekTower`, `nextMove`, and `isStuck`. The `move()` test helpers take `avoid` as their final parameter in both test files, and `staging.test.ts` passes `new Set()` positionally.

**Known deliberate details** — the avoidance check in `huntByField` tests the slide's resolved *landing square* (which is the closer square when the slide reaches it, and a short stop when `maxSteps` caps it short, as a King's one-step hop can be); this is the spec's "landing square only" rule, and it is what keeps a King from picking a direction whose covered landing it would occupy until the next hop. Termination holds because the fallback always reproduces today's first candidate.
