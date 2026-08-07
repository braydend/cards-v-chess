# Hunting for All Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lateral sweep with field-guided hunting for Bishop, Rook, Queen, and King (issue #13), so every Piece that runs out of forward board converges on the Core, and the Bishop never breaks its square colour.

**Architecture:** Generalise `src/game/knightDistance.ts` into one module of per-type BFS distance fields (`src/game/distanceFields.ts`). A single new function in `src/game/movement.ts`, `huntByField`, drives the King's single steps and every slider's capped slide: pick the first direction, in a fixed order, whose ray reaches a square one field-move closer, then slide along it at most `1 + slideBonus` squares, stopping on that closer square so no slide overshoots its phase target. A colour-locked Bishop hunts the square directly in front of the Core and leaks from there, so every Piece meets the Core the same way.

**Tech Stack:** TypeScript (strict), Vitest, pnpm. Pure engine work in `src/game/` — no renderer changes.

**Spec:** [`docs/superpowers/specs/2026-08-07-hunting-for-all-design.md`](../specs/2026-08-07-hunting-for-all-design.md)

**Branch:** all work happens on `fix-pathing-into-corners` (already checked out).

## Global Constraints

- `Math.random` must never appear in `src/game/` — ESLint-enforced; all direction choice is a fixed-order scan.
- `src/game/` never imports React or Three.js — ESLint-enforced.
- Tests drive time by calling `tick`/`nextMove` directly; never wall-clock time.
- Distance fields never see Towers — a field's only inputs are the board, the seed square, and the move shape. A blocked hunting Piece grinds; it never reroutes.
- The `hunting` latch is permanent: set the moment a Piece starts hunting, never cleared, carried on every `move`/`attackTower` outcome as `hunting: true`.
- Commit messages match the repo style: imperative, no conventional-commit prefix (e.g. "Add the rank 9 Freezer aura").
- Every task ends with `pnpm test:run` green. Task 6 additionally runs `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, and `pnpm build`.

## File Structure

- Create: `src/game/distanceFields.ts` — the generic BFS, the five offset tables, the five cached field getters.
- Create: `src/game/distanceFields.test.ts` — field semantics per type.
- Delete: `src/game/knightDistance.ts` (Task 1) — absorbed into `distanceFields.ts`.
- Modify: `src/game/movement.ts` — `huntByField`, `forwardFileStep`, `forwardLeavesBoard`, per-type hunt wiring in `nextMove`, deletion of `lateralStep`/`rookStep`, `bishopStep` stripped of its lateral fallback.
- Modify: `src/game/movement.test.ts` — sweep tests replaced by hunting tests.
- Modify: `src/game/types.ts`, `src/game/tick.ts`, `src/data/board.ts` — doc comments only.
- Modify: `src/game/tick.test.ts`, `src/game/termination.test.ts`, `src/game/promotion.test.ts` — sweep-dependent tests repointed at hunting.
- Modify: `docs/design/game-design.md`, `CLAUDE.md` — Task 6.

---

### Task 1: Generalise the distance fields

**Files:**
- Create: `src/game/distanceFields.ts`
- Create: `src/game/distanceFields.test.ts`
- Delete: `src/game/knightDistance.ts`
- Modify: `src/game/movement.ts:2` (import only)
- Modify: `src/game/movement.test.ts:4` (import only)

**Interfaces:**
- Consumes: `isInBounds`, `squareKey` from `./board`; `BoardSpec`, `Square` from `./types`.
- Produces: `KNIGHT_OFFSETS`, `ORTHOGONAL_OFFSETS`, `DIAGONAL_OFFSETS`, `ROYAL_OFFSETS` (all `readonly Square[]`), and `knightDistanceField(board: BoardSpec, core: Square)`, `rookDistanceField(board: BoardSpec, seed: Square)`, `bishopDistanceField(board: BoardSpec, seed: Square)`, `queenDistanceField(board: BoardSpec, seed: Square)`, `kingDistanceField(board: BoardSpec, seed: Square)` — each returning `ReadonlyMap<string, number>` keyed by `squareKey`, distance in *moves* (a slide of any length is one move).

- [ ] **Step 1: Write the failing tests**

Create `src/game/distanceFields.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { allSquares, squareKey } from './board'
import {
  bishopDistanceField,
  kingDistanceField,
  knightDistanceField,
  queenDistanceField,
  rookDistanceField,
} from './distanceFields'

const CORE_COLOUR = (CORE_SQUARE.file + CORE_SQUARE.rank) % 2

describe('knight distance field', () => {
  it('seeds the Core at zero and covers every square on an 8x8 board', () => {
    const field = knightDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey(CORE_SQUARE))).toBe(0)
    for (const square of allSquares(BOARD)) {
      expect(field.get(squareKey(square))).toBeDefined()
    }
  })

  it('keeps the distances the knight module always had', () => {
    // Regression guard for the module move: these values are pinned by the
    // Knight's existing hunt, which this task must not change.
    const field = knightDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 5, rank: 0 }))).toBe(2)
    expect(field.get(squareKey({ file: 4, rank: 2 }))).toBe(1)
    expect(field.get(squareKey({ file: 0, rank: 7 }))).toBeGreaterThanOrEqual(4)
  })
})

describe('rook distance field', () => {
  it('counts a slide of any length as one move', () => {
    const field = rookDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 3, rank: 7 }))).toBe(1)
    expect(field.get(squareKey({ file: 7, rank: 0 }))).toBe(1)
    expect(field.get(squareKey({ file: 7, rank: 7 }))).toBe(2)
  })

  it('covers every square', () => {
    const field = rookDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      expect(field.get(squareKey(square))).toBeDefined()
    }
  })
})

describe('bishop distance field', () => {
  it('covers exactly the seed colour', () => {
    const field = bishopDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      const onCoreColour = (square.file + square.rank) % 2 === CORE_COLOUR
      expect(field.has(squareKey(square))).toBe(onCoreColour)
    }
  })

  it('counts a diagonal of any length as one move', () => {
    const field = bishopDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 7, rank: 4 }))).toBe(1)
    expect(field.get(squareKey({ file: 1, rank: 2 }))).toBe(1)
    expect(field.get(squareKey({ file: 5, rank: 0 }))).toBe(2)
  })

  it('a seed behind the Core covers the opposite colour', () => {
    const behindCore = { file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 }
    const field = bishopDistanceField(BOARD, behindCore)

    expect(field.get(squareKey(behindCore))).toBe(0)
    expect(field.has(squareKey(CORE_SQUARE))).toBe(false)
    expect(field.has(squareKey({ file: 4, rank: 0 }))).toBe(true)
  })
})

describe('queen distance field', () => {
  it('counts a shared rank, file, or diagonal as one move, and never needs more than two', () => {
    const field = queenDistanceField(BOARD, CORE_SQUARE)

    expect(field.get(squareKey({ file: 7, rank: 0 }))).toBe(1)
    expect(field.get(squareKey({ file: 3, rank: 7 }))).toBe(1)
    expect(field.get(squareKey({ file: 7, rank: 4 }))).toBe(1)
    for (const square of allSquares(BOARD)) {
      const distance = field.get(squareKey(square))
      expect(distance).toBeDefined()
      expect(distance).toBeLessThanOrEqual(2)
    }
  })
})

describe('king distance field', () => {
  it('is Chebyshev distance', () => {
    const field = kingDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      const chebyshev = Math.max(
        Math.abs(square.file - CORE_SQUARE.file),
        Math.abs(square.rank - CORE_SQUARE.rank),
      )
      expect(field.get(squareKey(square))).toBe(chebyshev)
    }
  })
})

describe('the field cache', () => {
  it('returns the same field for the same board, seed, and type', () => {
    expect(rookDistanceField(BOARD, CORE_SQUARE)).toBe(rookDistanceField(BOARD, CORE_SQUARE))
  })

  it('keeps different seeds and different types apart', () => {
    const behindCore = { file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 }

    expect(bishopDistanceField(BOARD, CORE_SQUARE)).not.toBe(bishopDistanceField(BOARD, behindCore))
    expect(kingDistanceField(BOARD, CORE_SQUARE)).not.toBe(queenDistanceField(BOARD, CORE_SQUARE))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/game/distanceFields.test.ts`
Expected: FAIL — cannot resolve `./distanceFields`.

- [ ] **Step 3: Write `src/game/distanceFields.ts`**

```ts
/**
 * Per-Piece distance fields for hunting.
 *
 * A hunting Piece's direction comes from a breadth-first search over its own
 * movement, seeded at the square it hunts — the Core, except for a
 * colour-locked Bishop, which hunts the square directly in front of the Core
 * (see the bishop case in movement.ts). Distances count *moves*, not squares:
 * a slide of any length is one move.
 *
 * Every move set here is symmetric — each move is its own inverse — so "distance
 * from the seed" and "distance to the seed" are the same number, and one BFS
 * from the seed covers every square that can reach it. Sliders expand whole
 * rays per move (a rook slide of any length is one move); the Knight and the
 * King expand single steps.
 *
 * Deliberately built with no knowledge of Towers — the board and the seed are
 * the entire input. A field that routed around Towers would let Tower placement
 * steer a hunting Piece, exactly the mazing the "no pathfinding" invariant
 * forbids. See huntByField in movement.ts for how a blocked hunt resolves.
 */
import { isInBounds, squareKey } from './board'
import type { BoardSpec, Square } from './types'

/**
 * The eight knight-move offsets, in one fixed order.
 *
 * Both the BFS below and `huntCore` in movement.ts iterate this same array —
 * a hunting Knight scans it in this order and commits to the first offset
 * whose destination is a hop closer to the Core, so this order is what makes
 * that choice deterministic rather than "some in-bounds candidate at d − 1,
 * unspecified which one".
 */
export const KNIGHT_OFFSETS: readonly Square[] = [
  { file: 1, rank: 2 },
  { file: -1, rank: 2 },
  { file: 1, rank: -2 },
  { file: -1, rank: -2 },
  { file: 2, rank: 1 },
  { file: -2, rank: 1 },
  { file: 2, rank: -1 },
  { file: -2, rank: -1 },
]

/**
 * The four orthogonal directions, in one fixed order. The Rook hunts along
 * these; they are also the first half of the King's and Queen's directions,
 * so an orthogonal line wins any tie they are part of.
 */
export const ORTHOGONAL_OFFSETS: readonly Square[] = [
  { file: 1, rank: 0 },
  { file: -1, rank: 0 },
  { file: 0, rank: 1 },
  { file: 0, rank: -1 },
]

/** The four diagonal directions, in one fixed order. The Bishop hunts along these. */
export const DIAGONAL_OFFSETS: readonly Square[] = [
  { file: 1, rank: 1 },
  { file: -1, rank: 1 },
  { file: 1, rank: -1 },
  { file: -1, rank: -1 },
]

/** All eight King directions — orthogonal first, then diagonal. */
export const ROYAL_OFFSETS: readonly Square[] = [...ORTHOGONAL_OFFSETS, ...DIAGONAL_OFFSETS]

/** The squares one move away. Sliders expand whole rays; steppers expand single steps. */
type Neighbours = (board: BoardSpec, from: Square) => Square[]

function stepNeighbours(offsets: readonly Square[]): Neighbours {
  return (board, from) => {
    const neighbours: Square[] = []
    for (const offset of offsets) {
      const square: Square = { file: from.file + offset.file, rank: from.rank + offset.rank }
      if (isInBounds(board, square)) neighbours.push(square)
    }
    return neighbours
  }
}

function rayNeighbours(directions: readonly Square[]): Neighbours {
  return (board, from) => {
    const neighbours: Square[] = []
    for (const direction of directions) {
      let square: Square = { file: from.file + direction.file, rank: from.rank + direction.rank }
      while (isInBounds(board, square)) {
        neighbours.push(square)
        square = { file: square.file + direction.file, rank: square.rank + direction.rank }
      }
    }
    return neighbours
  }
}

/**
 * The cache is a memoisation of a pure function — the board and the seed are
 * fixed for the lifetime of a run, so the same key always maps to the same
 * field — not mutable game state. It cannot make the simulation depend on
 * call order, wall-clock time, or anything else that would break determinism.
 */
const fieldCache = new Map<string, ReadonlyMap<string, number>>()

function cacheKey(board: BoardSpec, seed: Square, tag: string): string {
  return `${tag}:${board.files}x${board.ranks}@${seed.file},${seed.rank}`
}

function buildDistanceField(board: BoardSpec, seed: Square, neighbours: Neighbours): ReadonlyMap<string, number> {
  const distances = new Map<string, number>()
  distances.set(squareKey(seed), 0)

  let frontier: readonly Square[] = [seed]
  while (frontier.length > 0) {
    const next: Square[] = []
    for (const square of frontier) {
      const distance = distances.get(squareKey(square))
      if (distance === undefined) continue

      for (const neighbour of neighbours(board, square)) {
        const key = squareKey(neighbour)
        if (distances.has(key)) continue

        distances.set(key, distance + 1)
        next.push(neighbour)
      }
    }
    frontier = next
  }

  return distances
}

function distanceField(
  board: BoardSpec,
  seed: Square,
  tag: string,
  neighbours: Neighbours,
): ReadonlyMap<string, number> {
  const key = cacheKey(board, seed, tag)
  const cached = fieldCache.get(key)
  if (cached) return cached

  const field = buildDistanceField(board, seed, neighbours)
  fieldCache.set(key, field)
  return field
}

/** Knight-move distance to the Core for every square, as the Knight hunts it. */
export function knightDistanceField(board: BoardSpec, core: Square): ReadonlyMap<string, number> {
  return distanceField(board, core, 'knight', stepNeighbours(KNIGHT_OFFSETS))
}

/** Rook-move distance in moves: 0 at the seed, 1 on its rank or file, 2 elsewhere. */
export function rookDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'rook', rayNeighbours(ORTHOGONAL_OFFSETS))
}

/**
 * Bishop-move distance in moves. Covers exactly the seed's square colour;
 * opposite-colour squares have no entry at all.
 */
export function bishopDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'bishop', rayNeighbours(DIAGONAL_OFFSETS))
}

/** Queen-move distance in moves: 0 at the seed, 1 on any shared line, 2 elsewhere. */
export function queenDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'queen', rayNeighbours(ROYAL_OFFSETS))
}

/** King-move distance: Chebyshev distance to the seed. */
export function kingDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'king', stepNeighbours(ROYAL_OFFSETS))
}
```

- [ ] **Step 4: Delete `knightDistance.ts` and repoint the imports**

```bash
git rm src/game/knightDistance.ts
```

In `src/game/movement.ts`, replace line 2:

```ts
import { KNIGHT_OFFSETS, knightDistanceField } from './knightDistance'
```

with:

```ts
import { KNIGHT_OFFSETS, knightDistanceField } from './distanceFields'
```

In `src/game/movement.test.ts`, replace line 4:

```ts
import { knightDistanceField } from './knightDistance'
```

with:

```ts
import { knightDistanceField } from './distanceFields'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/game/distanceFields.test.ts src/game/movement.test.ts`
Expected: both PASS — the Knight's behaviour is unchanged.

Run: `pnpm test:run`
Expected: full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/distanceFields.ts src/game/distanceFields.test.ts src/game/movement.ts src/game/movement.test.ts
git commit -m "Generalise the knight-distance field into per-type distance fields"
```

---

### Task 2: The unified field hunt, and the King hunts

**Files:**
- Modify: `src/game/movement.ts` (add `forwardFileStep`, `forwardLeavesBoard`, `huntByField`; rewire the `king` case; doc comments on `MoveRequest.hunting`)
- Modify: `src/game/movement.test.ts` (replace the King's sweep test with a `king hunting` block)
- Modify: `src/game/types.ts:112-128` (`Piece.hunting` doc comment)

**Interfaces:**
- Consumes: `kingDistanceField`, `ROYAL_OFFSETS` from `./distanceFields` (Task 1).
- Produces: the hunt wiring pattern every later task copies — `request.hunting || forwardLeavesBoard(request.from, board)` as the trigger, `huntByField(from, board, targetSquare, towerBySquare, field, directions, maxSteps)` as the resolver. `huntByField` returns `MoveOutcome` with `hunting: true` on every `move`/`attackTower` it produces.

- [ ] **Step 1: Write the failing tests**

In `src/game/movement.test.ts`, add `kingDistanceField` to the `./distanceFields` import, and replace the `king movement` describe's last test (`'sweeps the back rank rather than stranding'`) with a new describe after `king movement`:

```ts
describe('king hunting', () => {
  it('steps toward the Core instead of sweeping the back rank', () => {
    expect(move('king', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('leaks into the Core when adjacent to it', () => {
    expect(move('king', { file: 4, rank: 0 })).toEqual({ kind: 'reachCore' })
  })

  it('strictly decreases distance on every hunting step, for every square on the board', () => {
    // The same exhaustive shape as the Knight's "strictly decreases" test: a
    // King's hunt is a single step, so every square must have a neighbour at
    // exactly one less, or the walk can stall.
    const field = kingDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      const ownDistance = field.get(squareKey(square))
      expect(ownDistance).toBeDefined()

      const outcome = move('king', square, NO_TOWERS, { hunting: true })

      if (ownDistance === 1) {
        expect(outcome).toEqual({ kind: 'reachCore' })
        continue
      }

      expect(outcome.kind).toBe('move')
      if (outcome.kind === 'move') {
        expect(field.get(squareKey(outcome.to))).toBe((ownDistance ?? 0) - 1)
      }
    }
  })

  it('keeps hunting even where a forward step exists, and it differs from the march', () => {
    // The latch: from (1,1) a marching King steps forward to (1,0), but a
    // hunting King closes the file gap instead. If the trigger ever collapsed
    // to "forward off the board" alone and dropped the "already hunting"
    // half, this would revert to the forward step.
    const forward = move('king', { file: 1, rank: 1 })
    expect(forward).toEqual({ kind: 'move', to: { file: 1, rank: 0 }, handedness: 1 })

    const hunting = move('king', { file: 1, rank: 1 }, NO_TOWERS, { hunting: true })
    expect(hunting).toEqual({ kind: 'move', to: { file: 2, rank: 1 }, hunting: true })
  })

  it('grinds a Tower blocking its chosen square rather than stepping around it', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('king', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })

  it('is Tower-blind: a Tower nowhere near the choice does not change it', () => {
    const chosen = { kind: 'move' as const, to: { file: 4, rank: 0 }, hunting: true }

    expect(move('king', { file: 5, rank: 0 })).toEqual(chosen)
    expect(move('king', { file: 5, rank: 0 }, towersAt({ file: 0, rank: 7 }))).toEqual(chosen)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/game/movement.test.ts`
Expected: the new `king hunting` tests FAIL (the King still sweeps).

- [ ] **Step 3: Implement the hunt in `src/game/movement.ts`**

Add the imports from `./distanceFields` (`ROYAL_OFFSETS`, `kingDistanceField` — `KNIGHT_OFFSETS` and `knightDistanceField` are already imported). After the `FORWARD` constant, add:

```ts
/** One square straight down the file, or no move at all. */
const forwardFileStep: Stepper = (from, handedness, board) => {
  const ahead: Square = { file: from.file, rank: from.rank + FORWARD }
  return isInBounds(board, ahead) ? { to: ahead, handedness } : undefined
}

/** Whether the Piece's forward square is off the board — the hunting trigger. */
function forwardLeavesBoard(from: Square, board: BoardSpec): boolean {
  return !isInBounds(board, { file: from.file, rank: from.rank + FORWARD })
}
```

Add `huntByField` next to `huntCore` (after it), with this doc comment and body:

```ts
/**
 * How the King and the sliders hunt: direction from a distance field over
 * their own movement, exactly as the Knight's `huntCore` does, adapted to
 * pieces that move along lines.
 *
 * Direction choice: the first direction, in the fixed order of `directions`,
 * whose ray from `from` passes through a square at field distance
 * `ownDistance − 1`. The slide then resolves along that ray with the usual
 * discipline — one square at a time, a Tower attacked rather than passed,
 * the target square leaked into — for at most `maxSteps` squares, and
 * **capped at the closer square**: `steps` never exceeds the ray distance to
 * it, so a long slide cannot pass straight through the phase target and land
 * beyond it, still at the same distance. That overshoot is exactly the
 * oscillation the hunting latch exists to prevent.
 *
 * Convergence is argued in two levels, because a slide shorter than the ray
 * does not drop field distance per hop: distance strictly decreases between
 * phases (2→1→0 for the sliders, one step per decrease for the King), and
 * within a phase every hop advances along a shortest-path line toward that
 * phase's target — arriving on it, exhausting the slide count en route, or
 * grinding the Tower blocking the line. The walk's arrival from every square
 * is pinned exhaustively in movement.test.ts.
 *
 * The Tower check runs BEFORE the target check on purpose: the target is the
 * Core for most hunts, which no Tower can occupy, but a colour-locked Bishop
 * hunts the square directly in front of the Core, and a Tower CAN stand
 * there — it must be ground down before the leak, not leaked through.
 *
 * The field never sees Towers — see distanceFields.ts — so this only ever
 * consults `towerBySquare` for squares it has already committed to. A Tower
 * there is attacked, exactly like every other blocked Piece; this never tries
 * the next direction, which is what keeps a hunting Piece walled rather than
 * herded.
 */
function huntByField(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  directions: readonly Square[],
  maxSteps: number,
): MoveOutcome {
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
          ? { kind: 'attackTower', towerId: blocker.id, hunting: true }
          : { kind: 'move', to: square, hunting: true }
      }

      if (squaresEqual(next, targetSquare)) return { kind: 'reachCore' }

      square = next
    }

    return { kind: 'move', to: square, hunting: true }
  }

  // Unreachable on the current board: every hunt wired today is connected to
  // its target from every square it can start on. Kept so the function is
  // total rather than assuming its own invariant.
  return { kind: 'stuck' }
}

/**
 * Steps along `direction` from `from` and returns how many squares it is to
 * the first square at field distance `ownDistance − 1`, or `undefined` if the
 * ray leaves the board without finding one.
 */
function rangeToCloserSquare(
  from: Square,
  board: BoardSpec,
  direction: Square,
  field: ReadonlyMap<string, number>,
  ownDistance: number,
): number | undefined {
  let steps = 0
  let square = from

  for (;;) {
    const next: Square = { file: square.file + direction.file, rank: square.rank + direction.rank }
    if (!isInBounds(board, next)) return undefined

    steps += 1
    if (field.get(squareKey(next)) === ownDistance - 1) return steps
    square = next
  }
}
```

Rewire the `king` case in `nextMove` (replacing the `travel` call that uses `rookStep`):

```ts
    // One square, always. Not a slider, so no aura bonus applies — the King
    // grants slide distance, it does not receive it. Once forward leaves the
    // board the King hunts: one royal step at a time down the field.
    case 'king':
      return request.hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            kingDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1,
          )
        : travel(request.from, request.handedness, 1, forwardFileStep, board, coreSquare, towerBySquare)
```

Update the `MoveRequest.hunting` doc comment (movement.ts:48-54):

```ts
  /**
   * Whether this Piece has already latched into hunting the Core. Pawns are
   * the only type that never reads it — they promote instead. See `huntCore`
   * and `huntByField` for what hunting does per type.
   */
  readonly hunting: boolean
```

Update `Piece.hunting` in `src/game/types.ts` (the doc comment at lines 112-127):

```ts
  /**
   * Whether this Piece has started hunting the Core — direction from a
   * distance field over its own movement — instead of its forward march.
   * Knights hunt once their forward hops run out; the King and the sliders
   * hunt once their forward move would leave the board; Pawns promote instead
   * and never hunt. See `huntCore` and `huntByField` in movement.ts.
   *
   * Latches true and never reverts. A same-colour Bishop's first hunting hop
   * goes *away* from rank 0, up to the diagonal intersection that routes it
   * back down to the Core; there it would have a legal forward diagonal
   * again. Without the latch it would revert to marching, reach rank 0
   * elsewhere, hunt again, and oscillate forever; the round would never end.
   * The latch is what breaks that cycle. (The Knight's version of the same
   * argument: its first hunting hop goes backwards.)
   *
   * Always false for Pawns and for a Pawn promoted into a Queen — a promoted
   * Queen is a fresh Piece — kept false rather than omitted so every Piece
   * has the same shape.
   */
  readonly hunting: boolean
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/game/movement.test.ts`
Expected: PASS — the new King tests pass; Rook/Bishop/Queen sweep tests still pass (untouched).

Run: `pnpm test:run`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/types.ts
git commit -m "Replace the King's lateral sweep with a field-guided hunt"
```

---

### Task 3: The Rook hunts

**Files:**
- Modify: `src/game/movement.ts` (rewire the `rook` case)
- Modify: `src/game/movement.test.ts` (delete the Rook's four sweep tests, replace one, add a `rook hunting` block)
- Modify: `src/game/tick.test.ts` (the two sweep-dependent tests at lines 283-307 and the `rookOnBackRank` doc comment)

**Interfaces:**
- Consumes: `huntByField`, `forwardLeavesBoard`, `forwardFileStep` (Task 2); `rookDistanceField`, `ORTHOGONAL_OFFSETS` (Task 1).
- Produces: the slider hunt wiring pattern — `huntByField(..., rookDistanceField(board, coreSquare), ORTHOGONAL_OFFSETS, 1 + request.slideBonus)` — that the Bishop and Queen tasks copy.

- [ ] **Step 1: Write the failing tests**

In `src/game/movement.test.ts`:

Delete these four tests from the `rook movement` describe: `'sweeps sideways along the back rank when forward is off the board'`, `'reflects off file 0 and flips handedness, so it never oscillates'`, `'reflects off the high file edge and flips handedness'`, `'never returns to its own square when a bonus slide meets a file edge'`.

Replace `'leaks into the Core when its sweep reaches the Core file'` with:

```ts
  it('leaks into the Core when its hunt slide reaches it', () => {
    expect(move('rook', { file: 4, rank: 0 }, NO_TOWERS, { slideBonus: 1 })).toEqual({
      kind: 'reachCore',
    })
  })
```

Rename `'ends a bonus slide at the corner rather than bending into an L'` to `'ends a bonus slide at the back rank rather than bending into an L'` and replace its comment:

```ts
    // Forward to (5,0), and there the forward steps run out. A Rook does not
    // bend onto a new line mid-slide, so the slide stops; the hunt begins next hop.
```

Add the `walkToCore` helper after the `move` helper (it serves every hunting block from here on):

```ts
/**
 * Follows hunting hops from `from` until the Piece leaks into the Core, giving
 * up after 64 hops. `nextMove` re-derives the hunt target from the Piece's
 * colour each hop, so this walks a colour-locked Bishop correctly too.
 */
function walkToCore(typeId: PieceTypeId, from: Square, overrides: Partial<MoveRequest> = {}): boolean {
  let square = from
  for (let hops = 0; hops < 64; hops += 1) {
    const outcome = move(typeId, square, NO_TOWERS, { ...overrides, hunting: true })
    if (outcome.kind === 'reachCore') return true
    if (outcome.kind !== 'move') return false
    square = outcome.to
  }
  return false
}
```

Add the `rook hunting` describe after `rook movement`:

```ts
describe('rook hunting', () => {
  it('slides toward the Core along the back rank instead of sweeping', () => {
    expect(move('rook', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('covers two squares toward the Core under a King aura', () => {
    expect(move('rook', { file: 7, rank: 0 }, NO_TOWERS, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 0 },
      hunting: true,
    })
  })

  it('stops on the phase target instead of overshooting it', () => {
    // From (7,3) — a synthetic hunting request, since a real hunt starts on
    // rank 0 — the first phase target is (3,3), where the Core's file meets
    // the Rook's rank. Even a slide long enough to cross it stops there:
    // overshooting would land at the same field distance and undo the
    // convergence argument.
    expect(move('rook', { file: 7, rank: 3 }, NO_TOWERS, { hunting: true, slideBonus: 5 })).toEqual({
      kind: 'move',
      to: { file: 3, rank: 3 },
      hunting: true,
    })
  })

  it('arrives at the Core from every square on the board', () => {
    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      expect(walkToCore('rook', square)).toBe(true)
    }
  })

  it('never increases field distance from hop to hop', () => {
    const field = rookDistanceField(BOARD, CORE_SQUARE)

    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue

      let current = square
      let previous = field.get(squareKey(current)) ?? 0
      for (let hops = 0; hops < 64; hops += 1) {
        const outcome = move('rook', current, NO_TOWERS, { hunting: true })
        if (outcome.kind === 'reachCore') break
        expect(outcome.kind).toBe('move')
        if (outcome.kind !== 'move') break

        const distance = field.get(squareKey(outcome.to)) ?? Number.MAX_SAFE_INTEGER
        expect(distance).toBeLessThanOrEqual(previous)
        previous = distance
        current = outcome.to
      }
    }
  })

  it('grinds a Tower on its chosen line rather than sliding around it', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('rook', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })

  it('stops short when a Tower interrupts a hunt slide it has already begun', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('rook', { file: 6, rank: 0 }, towers, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 0 },
      hunting: true,
    })
  })

  it('is Tower-blind: a Tower nowhere near the choice does not change it', () => {
    const chosen = { kind: 'move' as const, to: { file: 6, rank: 0 }, hunting: true }

    expect(move('rook', { file: 7, rank: 0 })).toEqual(chosen)
    expect(move('rook', { file: 7, rank: 0 }, towersAt({ file: 0, rank: 7 }))).toEqual(chosen)
  })
})
```

Add `rookDistanceField` to the `./distanceFields` import in movement.test.ts.

In `src/game/tick.test.ts`, replace the test at lines 283-293 (`'carries the handedness a slide reflection returns, not just the spawned value'`) — a Rook no longer reflects; the Bishop still does during its forward march:

```ts
  // A Rook no longer reflects off file edges — it hunts from the back rank.
  // The Bishop still reflects during her forward march, so the
  // handedness-threading property this test pins now rides on her.
  it('carries the handedness a slide reflection returns, not just the spawned value', () => {
    const bishop: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        {
          id: 'test-bishop',
          typeId: 'bishop',
          square: { file: 7, rank: 3 },
          prevSquare: { file: 7, rank: 3 },
          health: PIECE_TYPES.bishop.maxHealth,
          moveCooldownMs: 0,
          moveCount: 0,
          handedness: 1,
          auraCooldownMs: 0,
          buffed: false,
          hunting: false,
          promoted: false,
        },
      ],
    }
    const state = runFor(bishop, PIECE_TYPES.bishop.moveIntervalMs * 2 + DT)

    // Hop 1: the diagonal to (8,2) is off the board, so the Bishop reflects
    // to (6,2) and the returned handedness flips to -1. Hop 2 continues with
    // that flip: (6,2) -> (5,1). Discarding the returned handedness (the bug
    // this test guards) would send hop 2 back to (7,1) instead.
    expect(state.pieces[0]?.square).toEqual({ file: 5, rank: 1 })
    expect(state.pieces[0]?.handedness).toBe(-1)
  })
```

Replace the test at lines 299-307 (`'lets a sweeping Rook cross the Core file and leak instead of oscillating forever'`):

```ts
  // Task 11 adds a dedicated termination.test.ts covering every Piece type.
  // This test narrows that down to the one case this task's fix addresses —
  // deliberately redundant with that future coverage, not duplication to
  // prune, because a permanent round hang is severe enough to guard twice.
  it('lets a back-rank Rook hunt the Core and leak', () => {
    const rook = rookOnBackRank(6, 1)
    // Three hunt hops: (6,0) -> (5,0) -> (4,0) -> Core. Before hunting this
    // same scenario swept the whole rank; the round still ends either way,
    // but the hunt is what issue #13 asked for.
    const state = runFor(rook, PIECE_TYPES.rook.moveIntervalMs * 5 + DT)

    expect(state.phase).not.toBe('inProgress')
    expect(state.leaks).toBeGreaterThan(0)
  })
```

Update the `rookOnBackRank` doc comment (tick.test.ts:27-33):

```ts
/**
 * A single Rook placed directly on the back rank, bypassing the spawn
 * pipeline entirely. `startedRound()` always drives round 1, which spawns
 * Pawns exclusively, so this is the only way to get a back-rank slider under
 * test — from rank 0 a Rook hunts, and a Pawn never exercises the hunt at all.
 */
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/game/movement.test.ts src/game/tick.test.ts`
Expected: the new `rook hunting` tests FAIL (the Rook still sweeps).

- [ ] **Step 3: Rewire the `rook` case in `src/game/movement.ts`**

Add `ORTHOGONAL_OFFSETS` and `rookDistanceField` to the `./distanceFields` import. Replace the `rook` case body:

```ts
    case 'rook':
      return request.hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            rookDistanceField(board, coreSquare),
            ORTHOGONAL_OFFSETS,
            1 + request.slideBonus,
          )
        : travel(
            request.from,
            request.handedness,
            1 + request.slideBonus,
            forwardFileStep,
            board,
            coreSquare,
            towerBySquare,
          )
```

(`rookStep` stays defined for now — the Queen's even hops still use it. It is deleted in Task 5.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/game/movement.test.ts src/game/tick.test.ts`
Expected: PASS.

Run: `pnpm test:run`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/tick.test.ts
git commit -m "Replace the Rook's lateral sweep with a field-guided hunt"
```

---

### Task 4: The Bishop hunts — same-colour and colour-locked

**Files:**
- Modify: `src/game/movement.ts` (rewire the `bishop` case)
- Modify: `src/game/movement.test.ts` (delete the Bishop's sweep test, add a `bishop hunting` block)
- Modify: `src/game/termination.test.ts` (add the colour-locked termination test)

**Interfaces:**
- Consumes: `huntByField`, `forwardLeavesBoard` (Task 2); `bishopDistanceField`, `DIAGONAL_OFFSETS` (Task 1).
- Produces: the colour-lock pattern — `target` is the Core when the Bishop shares its colour, `{ file: coreSquare.file, rank: coreSquare.rank + 1 }` otherwise, and the field is seeded at `target` in both cases. Reaching `target` is `reachCore` either way.

Both branches land in one task on purpose: wiring only the same-colour branch first would turn every opposite-colour Bishop that reaches rank 0 into a permanent `stuck` between tasks.

- [ ] **Step 1: Write the failing tests**

In `src/game/movement.test.ts`, delete `'sweeps sideways once it reaches the back rank'` from the `bishop movement` describe, and add after it:

```ts
describe('bishop hunting', () => {
  it('climbs to the diagonal intersection instead of sweeping the back rank', () => {
    // (5,0) is not on a Core diagonal. The intersection that routes it back
    // down to (3,0) is (4,1) — one rank UP, away from the back rank, which
    // is exactly why the hunting latch has to exist.
    expect(move('bishop', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 1 },
      hunting: true,
    })
  })

  it('leaks into the Core down the Core diagonal', () => {
    expect(move('bishop', { file: 4, rank: 1 }, NO_TOWERS, { hunting: true })).toEqual({
      kind: 'reachCore',
    })
  })

  it('keeps hunting at the intersection, where a forward diagonal exists again', () => {
    // The latch, pinned: at (4,1) the Bishop has a legal forward diagonal to
    // (5,0). Unlatched, it would take it, march back to the back rank, and
    // oscillate forever.
    const forward = move('bishop', { file: 4, rank: 1 })
    expect(forward).toEqual({ kind: 'move', to: { file: 5, rank: 0 }, handedness: 1 })

    const hunting = move('bishop', { file: 4, rank: 1 }, NO_TOWERS, { hunting: true })
    expect(hunting).toEqual({ kind: 'reachCore' })
  })

  it('arrives at the Core from every square of the Core colour', () => {
    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      if ((square.file + square.rank) % 2 !== (CORE_SQUARE.file + CORE_SQUARE.rank) % 2) continue
      expect(walkToCore('bishop', square)).toBe(true)
    }
  })

  it('grinds a Tower blocking the climb rather than taking another diagonal', () => {
    const towers = towersAt({ file: 4, rank: 1 })

    expect(move('bishop', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })

  it('leaks from the square in front of the Core when colour-locked', () => {
    // (4,0) is the opposite colour from the Core, so the Core's square is
    // unreachable — a leak from it is impossible. The hunt targets the square
    // directly in front of the Core instead, (3,1), and leaks from there, so
    // the Bishop still meets the Core the same way every other Piece does.
    expect(move('bishop', { file: 4, rank: 0 })).toEqual({ kind: 'reachCore' })
  })

  it('arrives from every colour-locked square too', () => {
    for (const square of allSquares(BOARD)) {
      if ((square.file + square.rank) % 2 === (CORE_SQUARE.file + CORE_SQUARE.rank) % 2) continue
      expect(walkToCore('bishop', square)).toBe(true)
    }
  })

  it('grinds a Tower standing on the square in front of the Core before leaking', () => {
    // The one square a colour-locked Bishop leaks FROM can hold a Tower, and
    // the Tower check outranks the leak check on purpose: the Bishop grinds
    // the wall down, it does not leak through it.
    const towers = towersAt({ file: CORE_SQUARE.file, rank: CORE_SQUARE.rank + 1 })

    expect(move('bishop', { file: 4, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })
})
```

No new imports are needed in movement.test.ts for this task: the Bishop tests walk through `nextMove` via the existing `move` and `walkToCore` helpers and never name the field directly.

In `src/game/termination.test.ts`, add after the Knight back-rank tests:

```ts
  it('a colour-locked Bishop still leaks, from the square in front of the Core', () => {
    // (4,0) is the opposite colour from the Core, so it can never stand on
    // the Core's square. It hunts the square directly in front of it and
    // leaks from there — same interaction with the Core as every other Piece.
    const settled = settle(roundWith([pieceOn('b', 'bishop', 4, 0)]))

    expect(settled.phase).toBe('gap')
    expect(settled.pieces).toHaveLength(0)
    expect(settled.leaks).toBe(1)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/game/movement.test.ts src/game/termination.test.ts`
Expected: the new `bishop hunting` tests FAIL (the Bishop still sweeps).

- [ ] **Step 3: Rewire the `bishop` case in `src/game/movement.ts`**

Add `DIAGONAL_OFFSETS` and `bishopDistanceField` to the `./distanceFields` import. Replace the `bishop` case body:

```ts
    case 'bishop': {
      if (request.hunting || forwardLeavesBoard(request.from, board)) {
        // A Bishop stays on its own colour, so a Core on the other colour is
        // a square it can never stand on — no leak from it is possible. Such
        // a Bishop hunts the square directly in front of the Core instead,
        // which is always the Bishop's own colour, and leaks from there:
        // every Piece meets the Core the same way. The field is seeded at
        // the target in BOTH cases, which is what makes the two branches one
        // code path. See the hunting-for-all spec.
        const locked =
          (request.from.file + request.from.rank) % 2 !== (coreSquare.file + coreSquare.rank) % 2
        const target: Square = locked
          ? { file: coreSquare.file, rank: coreSquare.rank + 1 }
          : coreSquare

        return huntByField(
          request.from,
          board,
          target,
          towerBySquare,
          bishopDistanceField(board, target),
          DIAGONAL_OFFSETS,
          1 + request.slideBonus,
        )
      }

      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        bishopStep,
        board,
        coreSquare,
        towerBySquare,
      )
    }
```

(`bishopStep` keeps its rank-0 lateral fallback for now — the Queen's odd hops still route through it. It is stripped in Task 5.)

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/game/movement.test.ts src/game/termination.test.ts`
Expected: PASS.

Run: `pnpm test:run`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/termination.test.ts
git commit -m "Replace the Bishop's lateral sweep with a field-guided hunt"
```

---

### Task 5: The Queen hunts, and the lateral sweep dies

**Files:**
- Modify: `src/game/movement.ts` (rewire the `queen` case; strip `bishopStep`'s lateral fallback; delete `lateralStep` and `rookStep`; update the file-top doc comments)
- Modify: `src/game/movement.test.ts` (delete the Queen's sweep test, add a `queen hunting` block)
- Modify: `src/game/termination.test.ts` (replace the sweeper-reflection test, update the `CAP_MS` comment)
- Modify: `src/game/promotion.test.ts:63` (test name)
- Modify: `src/game/tick.ts:491-496` (the `stuck` comment)
- Modify: `src/game/types.ts:57-61` (the `Handedness` doc comment)

**Interfaces:**
- Consumes: `huntByField`, `forwardLeavesBoard`, `forwardFileStep` (Task 2); `queenDistanceField`, `ROYAL_OFFSETS` (Task 1).
- Produces: the final movement surface — no `lateralStep`, no `rookStep`, `bishopStep` forward-only. Every type's back-rank behaviour is now its hunt.

- [ ] **Step 1: Write the failing tests**

In `src/game/movement.test.ts`, delete `'sweeps the back rank once it reaches it'` from the `queen movement` describe, and add after it:

```ts
describe('queen hunting', () => {
  it('slides toward the Core along the back rank instead of sweeping', () => {
    expect(move('queen', { file: 5, rank: 0 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('hunts from either alternation parity', () => {
    // The rook/bishop alternation is forward-march behaviour only; a hunting
    // Queen uses full queen movement regardless of which line her next hop
    // would have been.
    expect(move('queen', { file: 5, rank: 0 }, NO_TOWERS, { moveCount: 1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      hunting: true,
    })
  })

  it('arrives at the Core from every square on the board', () => {
    for (const square of allSquares(BOARD)) {
      if (squaresEqual(square, CORE_SQUARE)) continue
      expect(walkToCore('queen', square)).toBe(true)
    }
  })

  it('grinds a Tower on its chosen line rather than sliding around it', () => {
    const towers = towersAt({ file: 4, rank: 0 })

    expect(move('queen', { file: 5, rank: 0 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
      hunting: true,
    })
  })
})
```

In `src/game/termination.test.ts`, replace `'a sweeper left of the Core file still reaches it, thanks to reflection'`:

```ts
  it('a Piece left of the Core file still reaches it, hunting rightward', () => {
    // Before hunting, this case needed the handedness flip off the file-0
    // edge to keep the sweep from oscillating. Direction now comes from the
    // field, not from handedness, so the Core is reached from either side.
    const settled = settle(roundWith([{ ...pieceOn('r', 'rook', 1, 0), handedness: -1 }]))

    expect(settled.phase).not.toBe('inProgress')
  })
```

Replace the `CAP_MS` comment (termination.test.ts:9):

```ts
/** Generous: the slowest hunt — a Bishop's diagonal climb — needs well under this. */
```

In `src/game/promotion.test.ts`, rename the test at line 63:

```ts
  it('leaves the round active, because the Queen can still hunt', () => {
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/game/movement.test.ts`
Expected: the new `queen hunting` tests FAIL (the Queen still sweeps).

- [ ] **Step 3: Rewire the Queen and delete the sweep**

In `src/game/movement.ts`:

Add `queenDistanceField` to the `./distanceFields` import (`ROYAL_OFFSETS` is already imported from Task 2). Replace the `queen` case, including its leading comment:

```ts
    // The Queen alternates the Rook's line and the Bishop's line hop by hop —
    // the "flexible" in her roster entry — while she marches. Once forward
    // leaves the board she hunts with full queen movement instead; the
    // alternation is forward-march behaviour only.
    case 'queen':
      return request.hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            queenDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1 + request.slideBonus,
          )
        : travel(
            request.from,
            request.handedness,
            1 + request.slideBonus,
            request.moveCount % 2 === 0 ? forwardFileStep : bishopStep,
            board,
            coreSquare,
            towerBySquare,
          )
```

Strip `bishopStep`'s lateral fallback — replace this line:

```ts
  if (forwardRank < 0) return lateralStep(from, handedness, board)
```

with:

```ts
  if (forwardRank < 0) return undefined
```

and update the stepper's doc comment:

```ts
/**
 * Forward along a diagonal, reflecting off the side edges.
 *
 * Reflection preserves square colour — bouncing off a vertical edge changes
 * file and rank by one each, which keeps `(file + rank) % 2` constant. That is
 * the same property a chess bishop has, arrived at for the same reason.
 *
 * At the back rank there is no forward diagonal and no fallback either: the
 * Bishop's hunt takes over instead — see the bishop case in `nextMove`.
 */
```

Delete `lateralStep` and `rookStep` entirely (movement.ts:71-98 in the current tree, plus any reference left in doc comments).

Update the file-top doc comment on `MoveOutcome` (movement.ts:5-26) — replace the paragraph's second sentence block:

```ts
 * `stuck` means the Piece has no legal move. That is a real chess outcome —
 * and it is why round completion cannot simply wait for the board to empty.
 * Every Piece type has a designed way off `stuck`: Pawns promote, and every
 * other type hunts the Core once its forward move would leave the board —
 * see `knightMove` and `huntByField`, below. `stuck` stays part of the type
 * for a board shape or Piece that genuinely has none.
 * `promote` means a Pawn has reached the back rank: chess promotes it there,
 * rather than stranding it the way `stuck` would.
 *
 * `hunting`, on both `move` and `attackTower`, rides on the shared outcome
 * shape: present exactly when a Piece has just started hunting or continues
 * to, so `tick.ts`'s `movePieces` can latch it onto the Piece permanently.
 * See `hunting` on `Piece` in types.ts for why the latch has to be permanent.
 * It rides on `attackTower` too, not just `move`, because a Piece's very
 * first hunting hop is exactly as likely to land on a Tower-blocked square as
 * any other — `Piece.hunting` is documented to go true the moment a Piece
 * starts hunting, full stop, not "the moment it starts hunting and also
 * happens to move that hop".
```

Update the `nextMove` doc comment (movement.ts:291-299):

```ts
/**
 * Resolves one move for a Piece using **chess movement**, not a walk toward
 * the Core — while forward movement lasts. Once a Piece's forward move would
 * leave the board, it hunts the Core instead, guided by a distance field
 * over its own movement: see `huntCore` and `huntByField`. Pawns are the one
 * type that never hunts — they promote.
 */
```

In `src/game/tick.ts`, replace the `stuck` comment (lines 492-496):

```ts
        // No legal move this hop. For every Piece type on the current board
        // this is also permanent — Pawns promote and everything else hunts
        // the Core once its forward move would leave the board — so drop the
        // cooldown rather than let a genuinely immobile Piece burn simulation
        // work every tick for nothing.
```

In `src/game/types.ts`, replace the `Handedness` doc comment (lines 57-61):

```ts
/**
 * Which way sideways. Drives the Knight's zig-zag, the Bishop's and Queen's
 * diagonal side, and the reflection off a file edge during the forward march.
 */
export type Handedness = 1 | -1
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/game/movement.test.ts src/game/termination.test.ts src/game/promotion.test.ts src/game/tick.test.ts`
Expected: PASS.

Run: `pnpm test:run`
Expected: full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/termination.test.ts src/game/promotion.test.ts src/game/tick.ts src/game/types.ts
git commit -m "Replace the Queen's lateral sweep with a hunt, and delete the sweep"
```

---

### Task 6: Design docs, CLAUDE.md, and final verification

**Files:**
- Modify: `docs/design/game-design.md` (Movement sections)
- Modify: `CLAUDE.md` (Current state + invariants)
- Modify: `src/data/board.ts:24-29` (the `CORE_MAX_HEALTH` comment)

**Interfaces:**
- Consumes: the finished engine behaviour from Tasks 1-5.
- Produces: documentation that matches the new invariants — the next session's context.

- [ ] **Step 1: Update `docs/design/game-design.md`**

Replace the bullets at lines 267-269:

```markdown
- **Every Piece can threaten the Core.** A pawn is confined to its file, so only the Core's own file and the two files diagonally adjacent are dangerous to it specifically — but a Pawn that reaches the back rank promotes into a Queen, and every other type hunts the Core directly once its forward move runs out; see Hunting, below.
- **A round therefore ends when nothing on the board can still act**, not when the board is empty. Waiting for an empty board would hang the round forever.
```

Replace the Bishop section (lines 279-281):

```markdown
### Bishop

Slides forward along a diagonal, reflecting off the side edges — which keeps it on its own square colour, as a real bishop does. Once forward motion runs out it hunts the Core like every other Piece — unless the Core sits on a colour it can never reach, in which case it hunts the square directly in front of the Core and leaks from there; see Hunting, below.
```

In the sliders paragraph (line 295), replace the final clause — "and if it reaches a board edge mid-slide it stops there too, at the corner, rather than bending onto a new line for the remaining steps." — with:

```markdown
and if it reaches the back rank mid-slide it stops there rather than bending onto a new line for the remaining steps — the hunt begins on the next hop.
```

Replace the entire **Lateral fallback** section (lines 301-307) and the **Hunting** section (lines 309-319) with a single rewritten Hunting section:

```markdown
### Hunting

Once a Piece's forward move would leave the board — for every type, that is rank 0 — it **hunts the Core** the rest of the way, moving by its own chess movement. Pawns are the one exception: they promote instead.

**The state latches.** `hunting: boolean` on the Piece is set true the moment hunting starts, and it never clears. Without the latch the feature does not terminate: a same-colour Bishop's first hunting hop goes *away* from rank 0, up to the diagonal intersection that routes it back down to the Core, and at that intersection it has a legal forward diagonal again. An unlatched flag would let it revert to marching, reach rank 0 elsewhere, start hunting again, and oscillate forever. (The Knight's version of the same argument: its first hunting hop goes backwards.) The Queen hunts with full queen movement; her rook/bishop alternation is forward-march behaviour only.

**Direction comes from a per-type distance field.** A breadth-first search over the Piece's own movement gives every square its distance to the target in *moves* — a slide of any length counts as one — computed once per board, seed square, and type, and memoised (`src/game/distanceFields.ts`). A hunting King steps onto the first neighbour, in a fixed order, at distance one less. A hunting slider picks the first direction, in a fixed order, whose line reaches a square one move closer, and slides along it — at most its normal slide distance, King aura included, and **capped at the closer square** so a long slide cannot overshoot its phase target. A BFS field guarantees the closer square exists at every distance `d > 0`, and distance strictly decreases between phases (2→1→0); within a phase every hop advances along a shortest-path line toward that phase's target — arriving on it, exhausting the slide count en route, or grinding the Tower blocking the line. Arrival is bounded and a cycle is impossible by construction; the walk from every square is pinned exhaustively in `movement.test.ts`.

**The fields never see Towers.** They are computed on an empty board, which is what keeps hunting from reopening the mazing risk: Tower placement cannot change which square a hunting Piece is aiming for. A Tower on the chosen line is attacked exactly as any other blocked Piece attacks one — the Piece grinds rather than trying another line. The player can wall a hunting Piece; the player still cannot herd one.

**The colour-locked Bishop.** A Bishop stays on its own colour, so a Core on the other colour is a square it can never stand on. Such a Bishop hunts the square directly in front of the Core instead — always the Bishop's own colour — and **leaks from there**, standard leak damage, counted in the leaks counter: every Piece meets the Core the same way. Issue #13's literal caveat — a standing half-damage forward attack from that square — was set aside for exactly that uniformity, and is worth revisiting if leaks ever deal Piece-specific damage.

See [`docs/superpowers/specs/2026-08-07-hunting-for-all-design.md`](../superpowers/specs/2026-08-07-hunting-for-all-design.md) for the full reasoning, including the rejected alternatives (rank-0 geometry, the standing half-damage attack, and a Bishop-only fix), and [`2026-08-06-hunting-knights-design.md`](../superpowers/specs/2026-08-06-hunting-knights-design.md) for the Knight-specific origin of the mechanism.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In the **Current state** roster bullet, replace "Pawn promotion on the back rank, hunting Knights, the King's move-speed/slide aura" with:

```markdown
Pawn promotion on the back rank, hunting once forward motion runs out, the King's move-speed/slide aura
```

Replace the round-termination invariant bullet — "**A round ends when nothing can still act, not when the board is empty.** Every Piece type that could once run out of legal moves for good now has a designed way off `stuck` — Pawns promote, sliders and the King sweep sideways, and a Knight that exhausts its forward hops hunts the Core with knight moves rather than stranding on the back rank (see the hunting carve-out below) — but `stillActive` still checks every Piece, rather than assuming a designed answer always applies." — with:

```markdown
- **A round ends when nothing can still act, not when the board is empty.** Every Piece type that could once run out of legal moves for good now has a designed way off `stuck` — Pawns promote, and every other type hunts the Core once its forward move would leave the board (see the hunting carve-out below) — but `stillActive` still checks every Piece, rather than assuming a designed answer always applies.
```

Replace the lateral-sweep invariant bullet — "**Sliders and the King sweep laterally when forward is off the board, reflecting off the file edges and flipping `handedness`.** ..." — with:

```markdown
- **Every Piece hunts once its forward move would leave the board.** For every type that is rank 0: `hunting` latches on the Piece, and direction comes from a per-type distance field — a BFS over that type's own movement, seeded at the Core (for a colour-locked Bishop, at the square directly in front of it), cached, and never seeing Towers. Sliders cap each hunt slide at the phase target so they cannot overshoot it, and a blocked hunting Piece grinds exactly like any other. Round termination rides on this: every Piece reaches the Core or dies, so nothing strands.
```

Replace the forward-bias invariant's carve-out — the "**Pieces are forward-biased and deterministic.**" bullet, from "**Narrow carve-out:**" to its end — with:

```markdown
**Carve-out:** once a Piece's forward move would leave the board, it hunts the Core directly, guided by a per-type distance field computed on an empty board (`src/game/distanceFields.ts`). The fields never see Towers, so Tower placement cannot change what they return, and a hunting Piece blocked by a Tower grinds on it exactly like every other blocked Piece rather than trying another square. What the invariant actually guards against — Tower placement steering a Piece around an obstacle — still cannot happen; only the *source* of direction changes, and only once a Piece has nothing else left to do.
```

- [ ] **Step 3: Update the `CORE_MAX_HEALTH` comment in `src/data/board.ts`**

Replace lines 24-29:

```ts
/**
 * PLACEHOLDER value, not a balance decision — but no longer an arbitrary one.
 *
 * Raised from 20 once the full roster landed. Pawn promotion and hunting
 * together mean every Piece reaches the Core unless something kills it first,
 * so 20 was spent within a handful of rounds and the run ended before the
 * roster had finished introducing itself.
 */
```

- [ ] **Step 4: Run full verification — everything CI runs**

Run: `pnpm lint`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm test:coverage`
Expected: PASS, thresholds met (`src/game/**`: 85/85/85/90).

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md src/data/board.ts
git commit -m "Document hunting for all in the design doc and CLAUDE.md"
```
