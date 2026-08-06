# Chess Piece Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the five remaining chess Pieces — Knight, Bishop, Rook, Queen, King — with their designed threats, plus Pawn promotion.

**Architecture:** All movement stays in `src/game/movement.ts`, dispatched from `nextMove`. Sliders share one `travel` loop that walks a *stepper* function one square at a time, so a Tower mid-slide still blocks. A new `src/game/auras.ts` derives King and Bishop aura effects once per tick, before any Piece moves, so results never depend on processing order. Everything is deterministic — no PRNG is added.

**Tech Stack:** TypeScript (strict, pinned 5.x), Vitest, React Three Fiber, zustand, pnpm.

**Design spec:** [`docs/superpowers/specs/2026-08-05-chess-piece-roster-design.md`](../specs/2026-08-05-chess-piece-roster-design.md)

## Global Constraints

- **`src/game/` and `src/data/` must never import React or three.js.** ESLint-enforced; a violation fails `pnpm lint`.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** ESLint-enforced. Every decision in this plan is deterministic; no PRNG is introduced.
- **Never add a per-tick value to `structuralKey`.** It is an allowlist. Adding `moveCount`, `handedness`, or `auraCooldownMs` would push a React render per hop and break the property `src/state/simulation.test.ts` guards (28 store publishes per 600 frames).
- **Never call `setState` inside `useFrame`.** Mutate refs. Do not allocate in the frame loop. Share geometries and materials via `useMemo`. Toggle `visible` rather than conditionally mounting.
- **No pathfinding, ever.** A blocked Piece grinds; it never routes around.
- **Vocabulary is fixed:** Piece, Tower, Round, Core, Leak, Tick, Command. Never "wave" or "defender". Distinguish `cardRank` from board rank.
- **Run `pnpm test:run`** (single run) in automation, never `pnpm test` (watch mode).
- Commit after every task.

---

### Task 1: Refactor `nextMove` to take a request object

Pure refactor, no behaviour change. `nextMove` needs three new inputs (`moveCount`, `handedness`, `slideBonus`) and already has five positional parameters. Bundle the per-Piece ones into an object now so later tasks add fields without growing the signature.

**Files:**
- Modify: `src/game/movement.ts:11-15` (`MoveOutcome`), `:31-42` (`nextMove`), `:79-86` (`isStuck`)
- Modify: `src/game/tick.ts:266` (the `nextMove` call inside `movePieces`)
- Modify: `src/game/index.ts:10`
- Test: `src/game/movement.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Handedness = 1 | -1`; `MoveRequest { typeId, from, moveCount, handedness, slideBonus }`; `nextMove(request: MoveRequest, board: BoardSpec, coreSquare: Square, towerBySquare: ReadonlyMap<string, Tower>): MoveOutcome`; `MoveOutcome`'s `move` variant gains optional `handedness?: Handedness`

- [ ] **Step 1: Update the test file to the new call shape**

Add this helper at the top of `src/game/movement.test.ts`, after `const NO_TOWERS`:

```ts
import type { MoveRequest } from './movement'
// Extend the EXISTING type import on line 5 rather than adding a second one:
//   import type { PieceTypeId, Square, Tower } from './types'

/** Keeps call sites readable. Defaults match a freshly spawned Piece. */
function move(
  typeId: PieceTypeId,
  from: Square,
  towers: ReadonlyMap<string, Tower> = NO_TOWERS,
  overrides: Partial<MoveRequest> = {},
) {
  const request: MoveRequest = {
    typeId,
    from,
    moveCount: 0,
    handedness: 1,
    slideBonus: 0,
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers)
}
```

Then rewrite all ten `nextMove(...)` calls in the `pawn movement` describe block to use it. The `to`/`towers` arguments are unchanged — only the call shape differs. For example:

```ts
// was: nextMove('pawn', { file: 5, rank: 6 }, BOARD, CORE_SQUARE, NO_TOWERS)
move('pawn', { file: 5, rank: 6 })

// was: nextMove('pawn', { file: 5, rank: 6 }, BOARD, CORE_SQUARE, towers)
move('pawn', { file: 5, rank: 6 }, towers)
```

Expected assertions are **unchanged** — `handedness` is optional on the `move` outcome and the Pawn never sets it, so `toEqual({ kind: 'move', to: {...} })` still matches.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: FAIL — TypeScript errors, `nextMove` does not accept an object as its first argument.

- [ ] **Step 3: Change the signature**

First add `Handedness` to `src/game/types.ts`, **not** to `movement.ts`. Task 2 adds a `handedness` field to `Piece`, and defining the type in `movement.ts` would make `types.ts` import from `movement.ts` while `movement.ts` imports from `types.ts` — a cycle:

```ts
/**
 * Which way sideways. Drives the Knight's zig-zag, the Bishop's and Queen's
 * diagonal side, and the direction of a lateral sweep along a rank.
 */
export type Handedness = 1 | -1
```

Then in `src/game/movement.ts`, add `Handedness` to the existing `import type { ... } from './types'` and replace the `MoveOutcome` type and `nextMove`:

```ts
export type MoveOutcome =
  | { readonly kind: 'move'; readonly to: Square; readonly handedness?: Handedness }
  | { readonly kind: 'attackTower'; readonly towerId: string }
  | { readonly kind: 'reachCore' }
  | { readonly kind: 'stuck' }

/** Everything about a Piece that its movement rule depends on. */
export interface MoveRequest {
  readonly typeId: PieceTypeId
  readonly from: Square
  /** Hops completed. Drives the Knight's zig-zag and the Queen's alternation. */
  readonly moveCount: number
  readonly handedness: Handedness
  /** Extra squares per hop, from a King aura. Sliders only. */
  readonly slideBonus: number
}

export function nextMove(
  request: MoveRequest,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  switch (request.typeId) {
    case 'pawn':
      return pawnMove(request.from, board, coreSquare, towerBySquare)
  }
}
```

And `isStuck`:

```ts
export function isStuck(
  piece: Piece,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): boolean {
  // Slide distance cannot change whether a Piece has *any* legal move, so the
  // bonus is irrelevant here.
  const request: MoveRequest = {
    typeId: piece.typeId,
    from: piece.square,
    moveCount: piece.moveCount,
    handedness: piece.handedness,
    slideBonus: 0,
  }
  return nextMove(request, board, coreSquare, towerBySquare).kind === 'stuck'
}
```

`piece.moveCount` and `piece.handedness` do not exist yet — Task 2 adds them. For this task only, hardcode `moveCount: 0, handedness: 1` and leave a `// Task 2 wires these to the Piece` comment.

- [ ] **Step 4: Update the caller in `tick.ts`**

In `movePieces`, replace the `nextMove` call:

```ts
      const outcome = nextMove(
        { typeId: piece.typeId, from: square, moveCount: 0, handedness: 1, slideBonus: 0 },
        board,
        coreSquare,
        towerBySquare,
      )
```

- [ ] **Step 5: Export the new types**

In `src/game/index.ts`, change line 10 and add `Handedness` to the type export block:

```ts
export { isStuck, nextMove, type MoveOutcome, type MoveRequest } from './movement'
```

```ts
export type {
  BoardSpec,
  CardRank,
  Command,
  GameState,
  Handedness,
  Piece,
  // ...the rest unchanged
} from './types'
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS. All 38 existing tests still green — this changed no behaviour.

- [ ] **Step 7: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/tick.ts src/game/index.ts
git commit -m "Bundle nextMove's per-Piece inputs into a request object"
```

---

### Task 2: Widen the roster types and data

Add all six Piece types and the per-Piece fields their movement needs. New types return `stuck` until their resolver lands, which is safe because `rounds.ts` cannot spawn them until Task 12.

**Files:**
- Modify: `src/game/types.ts:20` (`PieceTypeId`), `:22-38` (`PieceTypeDef`), `:40-56` (`Piece`)
- Modify: `src/data/pieceTypes.ts`
- Modify: `src/game/movement.ts` (`nextMove` switch, `isStuck`)
- Modify: `src/game/tick.ts` (`drainDueSpawns`)
- Test: `src/data/pieceTypes.test.ts` (create)

**Interfaces:**
- Consumes: `Handedness`, `MoveRequest` from Task 1
- Produces: `PieceTypeId = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'`; `PieceTypeDef.slides: boolean`; `Piece.moveCount: number`, `Piece.handedness: Handedness`, `Piece.auraCooldownMs: number`, `Piece.buffed: boolean`; `PIECE_TYPES` keyed by all six

- [ ] **Step 1: Write the failing test**

Create `src/data/pieceTypes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES, pieceType } from './pieceTypes'
import type { PieceTypeId } from '../game/types'

const ALL: PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

describe('piece roster', () => {
  it('defines every Piece type', () => {
    for (const id of ALL) {
      expect(pieceType(id).id).toBe(id)
    }
  })

  it('marks exactly the sliding Pieces as sliders', () => {
    const sliders = ALL.filter((id) => pieceType(id).slides)

    expect(sliders).toEqual(['bishop', 'rook', 'queen'])
  })

  it('gives the Rook the most health, since high health is its armour', () => {
    const health = ALL.map((id) => pieceType(id).maxHealth)

    expect(Math.max(...health)).toBe(PIECE_TYPES.rook.maxHealth)
  })

  it('gives the Bishop the weakest attack, since healing is its job', () => {
    const attacks = ALL.map((id) => pieceType(id).attackDamage)

    expect(Math.min(...attacks)).toBe(PIECE_TYPES.bishop.attackDamage)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test:run src/data/pieceTypes.test.ts`
Expected: FAIL — `'knight'` is not assignable to `PieceTypeId`.

- [ ] **Step 3: Widen the types**

In `src/game/types.ts`, replace the `PieceTypeId` declaration and its comment:

```ts
/** The full Chess roster. Each type maps a real chess trait onto a threat. */
export type PieceTypeId = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
```

Add to `PieceTypeDef`:

```ts
  /**
   * Whether this Piece slides along a line. Sliders move one square per hop
   * and gain +1 from a King aura; everything else has a fixed hop.
   */
  readonly slides: boolean
```

Add to `Piece`:

```ts
  /** Hops completed. Drives the Knight's zig-zag and the Queen's alternation. */
  readonly moveCount: number
  /**
   * Which way sideways. Set at spawn from entity-id parity so consecutively
   * spawned Pieces weave opposite ways, and flipped when a Piece reflects off
   * a file edge.
   */
  readonly handedness: Handedness
  /** Milliseconds toward this Piece's next aura pulse. Bishops only. */
  readonly auraCooldownMs: number
  /** Whether a King aura reached this Piece on the last tick. Renderer-facing. */
  readonly buffed: boolean
```

`Handedness` is already declared in `types.ts` by Task 1, so no import is needed.

- [ ] **Step 4: Fill in the roster**

Replace the body of `src/data/pieceTypes.ts` (keep `BLOCKED_ATTACK_MULTIPLIER` and `pieceType` as they are):

```ts
/**
 * The Chess roster. Each Piece's threat comes from the design doc; the numbers
 * are PLACEHOLDER balance, not design decisions.
 *
 * The Rook has no armour stat — high health *is* its armour. `coverage.ts` is
 * explicit that piercing is not part of the design, and with only four
 * buildable ranks (damage 1, 1, 2, 3) flat reduction would make half the pool
 * useless against Rooks.
 */
export const PIECE_TYPES: Record<PieceTypeId, PieceTypeDef> = {
  pawn: { id: 'pawn', label: 'Pawn', moveIntervalMs: 900, maxHealth: 3, attackDamage: 2, slides: false },
  knight: { id: 'knight', label: 'Knight', moveIntervalMs: 1100, maxHealth: 4, attackDamage: 2, slides: false },
  bishop: { id: 'bishop', label: 'Bishop', moveIntervalMs: 1000, maxHealth: 5, attackDamage: 1, slides: true },
  rook: { id: 'rook', label: 'Rook', moveIntervalMs: 1600, maxHealth: 14, attackDamage: 4, slides: true },
  queen: { id: 'queen', label: 'Queen', moveIntervalMs: 1000, maxHealth: 9, attackDamage: 5, slides: true },
  king: { id: 'king', label: 'King', moveIntervalMs: 1800, maxHealth: 12, attackDamage: 3, slides: false },
}
```

- [ ] **Step 5: Keep the movement switch exhaustive**

In `src/game/movement.ts`, extend the `nextMove` switch. The new types get resolvers in Tasks 3–7; until then they cannot move:

```ts
  switch (request.typeId) {
    case 'pawn':
      return pawnMove(request.from, board, coreSquare, towerBySquare)
    // Resolvers arrive in later tasks. Returning `stuck` is safe because
    // rounds.ts cannot spawn these types yet.
    case 'knight':
    case 'bishop':
    case 'rook':
    case 'queen':
    case 'king':
      return { kind: 'stuck' }
  }
```

Also replace the hardcoded values left in `isStuck` by Task 1:

```ts
    moveCount: piece.moveCount,
    handedness: piece.handedness,
```

- [ ] **Step 6: Assign the new fields at spawn**

In `src/game/tick.ts`, inside `drainDueSpawns`, extend the pushed Piece:

```ts
    spawned.push({
      id: `piece-${nextEntityId}`,
      typeId: spawn.typeId,
      square,
      prevSquare: square,
      health: pieceType(spawn.typeId).maxHealth,
      moveCooldownMs: 0,
      moveCount: 0,
      // Entity-id parity, so consecutively spawned Pieces weave opposite ways.
      handedness: nextEntityId % 2 === 0 ? 1 : -1,
      auraCooldownMs: 0,
      buffed: false,
    })
```

- [ ] **Step 7: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS. Fix any other construction sites the compiler flags (test fixtures that build a `Piece` literal).

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/data/pieceTypes.ts src/data/pieceTypes.test.ts src/game/movement.ts src/game/tick.ts
git commit -m "Add the full Chess roster to types and data"
```

---

### Task 3: Rook movement, the slide loop, and the lateral fallback

The Rook is the simplest slider, so it carries the machinery every other slider reuses: `travel` (walk N single squares along a committed line) and `lateralStep` (sweep sideways when forward is off-board, reflecting at the file edges).

**Why reflection needs to flip `handedness`:** a stateless "always try file − 1 first" rule oscillates forever between files 0 and 1 and the round never ends. Flipping handedness on reflection makes a sweeper genuinely traverse the rank, so it crosses the Core's file (3) within about fourteen hops and leaks. **That is what makes rounds terminate.**

**Files:**
- Modify: `src/game/movement.ts`
- Test: `src/game/movement.test.ts`

**Interfaces:**
- Consumes: `Handedness`, `MoveRequest`, `MoveOutcome` from Task 1
- Produces: `type Stepper = (from: Square, handedness: Handedness, board: BoardSpec) => Step | undefined`; `interface Step { readonly to: Square; readonly handedness: Handedness }`; internal `travel(...)`, `lateralStep(...)`, `rookStep`

- [ ] **Step 1: Write the failing tests**

Append to `src/game/movement.test.ts`:

```ts
describe('rook movement', () => {
  it('advances one square down its file', () => {
    expect(move('rook', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('covers two squares when a King aura grants a slide bonus', () => {
    expect(move('rook', { file: 5, rank: 6 }, NO_TOWERS, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 4 },
      handedness: 1,
    })
  })

  it('attacks a Tower rather than sliding over it', () => {
    const towers = towersAt({ file: 5, rank: 5 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { slideBonus: 1 })).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })

  it('stops short when a Tower interrupts a slide it has already begun', () => {
    const towers = towersAt({ file: 5, rank: 4 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('sweeps sideways along the back rank when forward is off the board', () => {
    expect(move('rook', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })

  it('reflects off file 0 and flips handedness, so it never oscillates', () => {
    expect(move('rook', { file: 0, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 1, rank: 0 },
      handedness: 1,
    })
  })

  it('leaks into the Core when its sweep reaches the Core file', () => {
    expect(move('rook', { file: 4, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'reachCore',
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: FAIL — every rook test gets `{ kind: 'stuck' }`.

- [ ] **Step 3: Implement the machinery**

Add to `src/game/movement.ts`, above `nextMove`:

```ts
/** One legal square, plus the handedness the Piece carries away from it. */
interface Step {
  readonly to: Square
  readonly handedness: Handedness
}

/** How a Piece type picks its next single square. `undefined` means no move. */
type Stepper = (from: Square, handedness: Handedness, board: BoardSpec) => Step | undefined

/**
 * Sideways along the rank, reflecting off the file edges.
 *
 * Reflection **flips handedness** rather than retrying the same side. Without
 * that, a Piece on file 0 preferring file −1 would bounce 0→1→0→1 forever and
 * the round would never end. Flipping makes it traverse the rank, so it crosses
 * the Core's file and leaks. Round termination depends on this.
 *
 * The direction is fixed by handedness, never chosen by where the Core is —
 * that would be goal-seeking.
 */
function lateralStep(from: Square, handedness: Handedness, board: BoardSpec): Step | undefined {
  const sideways: Square = { file: from.file + handedness, rank: from.rank }
  if (isInBounds(board, sideways)) return { to: sideways, handedness }

  const reflected: Handedness = handedness === 1 ? -1 : 1
  const back: Square = { file: from.file + reflected, rank: from.rank }
  if (isInBounds(board, back)) return { to: back, handedness: reflected }

  return undefined
}

/** Straight down the file, sweeping sideways once the back rank is reached. */
const rookStep: Stepper = (from, handedness, board) => {
  const ahead: Square = { file: from.file, rank: from.rank + FORWARD }
  if (isInBounds(board, ahead)) return { to: ahead, handedness }
  return lateralStep(from, handedness, board)
}

/**
 * Walks a Piece along its committed line, **one square at a time**.
 *
 * Stepping rather than jumping is what keeps Towers blocking: a slide can never
 * pass over one. A Piece that has already covered ground this hop keeps it and
 * attacks next hop; one blocked immediately attacks now.
 */
function travel(
  from: Square,
  handedness: Handedness,
  steps: number,
  stepper: Stepper,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  let square = from
  let side = handedness
  let advanced = false

  for (let remaining = steps; remaining > 0; remaining -= 1) {
    const step = stepper(square, side, board)
    if (!step) break

    if (squaresEqual(step.to, coreSquare)) return { kind: 'reachCore' }

    const blocker = towerBySquare.get(squareKey(step.to))
    if (blocker) {
      return advanced
        ? { kind: 'move', to: square, handedness: side }
        : { kind: 'attackTower', towerId: blocker.id }
    }

    square = step.to
    side = step.handedness
    advanced = true
  }

  return advanced ? { kind: 'move', to: square, handedness: side } : { kind: 'stuck' }
}
```

Then replace the `rook` case in `nextMove`:

```ts
    case 'rook':
      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        rookStep,
        board,
        coreSquare,
        towerBySquare,
      )
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts
git commit -m "Add Rook movement, the slide loop, and the lateral fallback"
```

---

### Task 4: Bishop movement

Forward diagonal, reflecting off the side edges — which keeps the Bishop on its own colour, exactly as in chess.

**Files:**
- Modify: `src/game/movement.ts`
- Test: `src/game/movement.test.ts`

**Interfaces:**
- Consumes: `travel`, `lateralStep`, `Stepper` from Task 3
- Produces: internal `bishopStep: Stepper`

- [ ] **Step 1: Write the failing tests**

```ts
describe('bishop movement', () => {
  it('advances one square on its forward diagonal', () => {
    expect(move('bishop', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 5 },
      handedness: 1,
    })
  })

  it('takes the other diagonal when its handedness points the other way', () => {
    expect(move('bishop', { file: 5, rank: 6 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 5 },
      handedness: -1,
    })
  })

  it('reflects off the file edge and flips handedness', () => {
    expect(move('bishop', { file: 7, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 5 },
      handedness: -1,
    })
  })

  it('stays on its own square colour, as a chess bishop does', () => {
    // (7,6) is a light square: file + rank is odd. Reflecting must preserve that.
    const outcome = move('bishop', { file: 7, rank: 6 })

    expect(outcome.kind).toBe('move')
    if (outcome.kind === 'move') {
      expect((outcome.to.file + outcome.to.rank) % 2).toBe((7 + 6) % 2)
    }
  })

  it('sweeps sideways once it reaches the back rank', () => {
    expect(move('bishop', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts -t bishop`
Expected: FAIL — outcomes are `{ kind: 'stuck' }`.

- [ ] **Step 3: Implement**

Add below `rookStep`:

```ts
/**
 * Forward along a diagonal, reflecting off the side edges.
 *
 * Reflection preserves square colour — bouncing off a vertical edge changes
 * file and rank by one each, which keeps `(file + rank) % 2` constant. That is
 * the same property a chess bishop has, arrived at for the same reason.
 */
const bishopStep: Stepper = (from, handedness, board) => {
  const forwardRank = from.rank + FORWARD
  if (forwardRank < 0) return lateralStep(from, handedness, board)

  const diagonal: Square = { file: from.file + handedness, rank: forwardRank }
  if (isInBounds(board, diagonal)) return { to: diagonal, handedness }

  const reflected: Handedness = handedness === 1 ? -1 : 1
  const mirrored: Square = { file: from.file + reflected, rank: forwardRank }
  if (isInBounds(board, mirrored)) return { to: mirrored, handedness: reflected }

  return undefined
}
```

Replace the `bishop` case in `nextMove`:

```ts
    case 'bishop':
      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        bishopStep,
        board,
        coreSquare,
        towerBySquare,
      )
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts
git commit -m "Add Bishop movement, reflecting off the file edges"
```

---

### Task 5: Knight movement

Zig-zag two-forward L-hops, with two one-forward hops as a fallback so a Knight on rank 1 can still reach rank 0 — which *sometimes* lands it on the Core, giving the Knight its only route to a leak.

**Corrected during review:** an earlier draft of this task claimed a Knight captures the Core from `(1,1)` or `(5,1)`. That is false for `(5,1)` with handedness `+1`: candidates are tried in order and the Knight commits to the first in-bounds one, which there is `(7,0)` — legal and not the Core — so candidate 4 (`(3,0)`, the Core) is never evaluated. The Core is on file 3, which is not centred on files 0-7, so the two files are not symmetric. Committing to the first legal candidate is exactly what no-goal-seeking requires, so **the code is right and the claim was wrong**. Do not add a Core preference.

**Knights strand on rank 0 and that is deliberate.** Every Knight move from rank 0 goes backwards. A Knight bouncing back up the board could always act, so `stillActive` would never go false and the round would hang forever.

**Files:**
- Modify: `src/game/movement.ts`
- Test: `src/game/movement.test.ts`

**Interfaces:**
- Consumes: `Handedness`, `MoveOutcome`
- Produces: internal `knightMove(...)`

- [ ] **Step 1: Write the failing tests**

```ts
describe('knight movement', () => {
  it('hops two ranks forward and one file sideways', () => {
    expect(move('knight', { file: 4, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 4 },
    })
  })

  it('zig-zags: the next hop weaves back the other way', () => {
    expect(move('knight', { file: 5, rank: 4 }, NO_TOWERS, { moveCount: 1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 2 },
    })
  })

  it('starts on the opposite side when its handedness is reversed', () => {
    expect(move('knight', { file: 4, rank: 6 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 3, rank: 4 },
    })
  })

  it('mirrors the hop rather than leaving the board at a file edge', () => {
    expect(move('knight', { file: 7, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 4 },
    })
  })

  it('falls back to a one-forward hop when two ranks would leave the board', () => {
    expect(move('knight', { file: 4, rank: 1 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 0 },
    })
  })

  it('captures the Core with a one-forward hop', () => {
    // (1,1) -> (3,0) is a legal knight move, and the Core is on (3,0).
    expect(move('knight', { file: 1, rank: 1 })).toEqual({ kind: 'reachCore' })
  })

  it('attacks a Tower on its landing square rather than picking another hop', () => {
    const towers = towersAt({ file: 5, rank: 4 })

    expect(move('knight', { file: 4, rank: 6 }, towers)).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })

  it('strands on the back rank, because every hop from there goes backwards', () => {
    expect(move('knight', { file: 5, rank: 0 })).toEqual({ kind: 'stuck' })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts -t knight`
Expected: FAIL — outcomes are `{ kind: 'stuck' }`.

- [ ] **Step 3: Implement**

Add below `bishopStep`:

```ts
/**
 * The Knight is a hopper, not a slider, so it ignores slide bonuses and never
 * uses `travel`.
 *
 * Candidates are tried in order: the zig-zag hop, its mirror (for file edges),
 * then the two one-forward hops so a Knight on rank 1 can still reach rank 0 —
 * which sometimes lands it on the Core, depending on its file and handedness,
 * in the same emergent way a Pawn only threatens the Core from certain files.
 *
 * A Tower on the chosen landing square is attacked rather than hopped over or
 * routed around — the no-pathfinding invariant applies to the Knight too.
 *
 * From rank 0 every candidate goes backwards, so the Knight strands. That is
 * deliberate: a Knight that could bounce back up the board would keep
 * `stillActive` true forever and the round would never end.
 */
function knightMove(
  from: Square,
  moveCount: number,
  handedness: Handedness,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  const zig = moveCount % 2 === 0 ? handedness : -handedness

  const candidates: Square[] = [
    { file: from.file + zig, rank: from.rank - 2 },
    { file: from.file - zig, rank: from.rank - 2 },
    { file: from.file + handedness * 2, rank: from.rank - 1 },
    { file: from.file - handedness * 2, rank: from.rank - 1 },
  ]

  for (const to of candidates) {
    if (!isInBounds(board, to)) continue
    if (squaresEqual(to, coreSquare)) return { kind: 'reachCore' }

    const blocker = towerBySquare.get(squareKey(to))
    if (blocker) return { kind: 'attackTower', towerId: blocker.id }

    return { kind: 'move', to }
  }

  return { kind: 'stuck' }
}
```

Replace the `knight` case in `nextMove`:

```ts
    case 'knight':
      return knightMove(
        request.from,
        request.moveCount,
        request.handedness,
        board,
        coreSquare,
        towerBySquare,
      )
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:run src/game/movement.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts
git commit -m "Add Knight movement as a zig-zagging L-hop"
```

---

### Task 6: Queen and King movement

The Queen alternates between the Rook's line and the Bishop's line, hop by hop — the only Piece that both advances *and* changes files under her own steam. The King reuses the Rook's line at a fixed one square, never gaining a slide bonus.

**Files:**
- Modify: `src/game/movement.ts`
- Test: `src/game/movement.test.ts`

**Interfaces:**
- Consumes: `travel`, `rookStep`, `bishopStep` from Tasks 3–4
- Produces: the completed `nextMove` switch — no more `stuck` placeholders

- [ ] **Step 1: Write the failing tests**

```ts
describe('queen movement', () => {
  it('goes straight forward on an even hop', () => {
    expect(move('queen', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('goes diagonally forward on an odd hop', () => {
    expect(move('queen', { file: 5, rank: 6 }, NO_TOWERS, { moveCount: 1 })).toEqual({
      kind: 'move',
      to: { file: 6, rank: 5 },
      handedness: 1,
    })
  })

  it('holds one line for the whole of a bonus slide', () => {
    expect(move('queen', { file: 5, rank: 6 }, NO_TOWERS, { moveCount: 1, slideBonus: 1 })).toEqual({
      kind: 'move',
      to: { file: 7, rank: 4 },
      handedness: 1,
    })
  })

  it('sweeps the back rank once it reaches it', () => {
    expect(move('queen', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })
})

describe('king movement', () => {
  it('advances exactly one square forward', () => {
    expect(move('king', { file: 5, rank: 6 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('ignores a slide bonus, because it is not a slider', () => {
    expect(move('king', { file: 5, rank: 6 }, NO_TOWERS, { slideBonus: 2 })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('sweeps the back rank rather than stranding', () => {
    expect(move('king', { file: 5, rank: 0 }, NO_TOWERS, { handedness: -1 })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 0 },
      handedness: -1,
    })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run src/game/movement.test.ts -t "queen movement"`
Expected: FAIL — outcomes are `{ kind: 'stuck' }`.

- [ ] **Step 3: Implement**

Replace the remaining placeholder cases in `nextMove`:

```ts
    // The Queen alternates the Rook's line and the Bishop's line hop by hop —
    // the "flexible" in her roster entry. The line is picked once per hop and
    // held for the whole slide, so she travels along one line rather than
    // wandering mid-slide.
    case 'queen':
      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        request.moveCount % 2 === 0 ? rookStep : bishopStep,
        board,
        coreSquare,
        towerBySquare,
      )
    // One square, always. Not a slider, so no aura bonus applies — the King
    // grants slide distance, it does not receive it.
    case 'king':
      return travel(request.from, request.handedness, 1, rookStep, board, coreSquare, towerBySquare)
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts
git commit -m "Add Queen and King movement"
```

---

### Task 7: Wire per-Piece motion state through `tick`

Movement now depends on `moveCount` and `handedness`, but `tick` still passes hardcoded zeros. Thread the real values through and persist what a move returns.

**`moveCount` increments only on an actual move**, never on a blocked attack. A blocked Knight must keep grinding the same Tower rather than flipping its zig-zag to try a different square — that would be routing around, which the no-pathfinding invariant forbids.

**Files:**
- Modify: `src/game/tick.ts` (`movePieces`)
- Test: `src/game/tick.test.ts`

**Interfaces:**
- Consumes: `nextMove`, `MoveRequest`, `Piece.moveCount`, `Piece.handedness`
- Produces: `movePieces` returning Pieces with updated `moveCount` and `handedness`

- [ ] **Step 1: Write the failing test**

Append to `src/game/tick.test.ts`:

```ts
describe('tick: motion state', () => {
  it('counts a Piece hops so zig-zag and alternation advance', () => {
    const started = startedRound()
    const state = runFor(started, PIECE_TYPES.pawn.moveIntervalMs * 2 + DT)

    expect(state.pieces[0]?.moveCount).toBeGreaterThan(0)
  })

  it('gives consecutively spawned Pieces opposite handedness', () => {
    const state = runFor(startedRound(), 1200 + DT)
    const sides = state.pieces.map((piece) => piece.handedness)

    expect(new Set(sides).size).toBe(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run src/game/tick.test.ts -t "motion state"`
Expected: FAIL — `moveCount` stays 0.

- [ ] **Step 3: Implement**

In `movePieces`, replace the loop body's local state and the `nextMove` call:

```ts
    let cooldown = piece.moveCooldownMs + dtMs
    let square = piece.square
    let prevSquare = piece.prevSquare
    let moveCount = piece.moveCount
    let handedness = piece.handedness
    let reachedCore = false

    while (cooldown >= moveIntervalMs) {
      cooldown -= moveIntervalMs

      const outcome = nextMove(
        { typeId: piece.typeId, from: square, moveCount, handedness, slideBonus: 0 },
        board,
        coreSquare,
        towerBySquare,
      )
```

Leave the `reachCore`, `attackTower`, and `stuck` branches exactly as they are, and replace the final move branch:

```ts
      prevSquare = square
      square = outcome.to
      // Only a real move advances the count. A blocked Piece must grind the
      // same Tower rather than weave to a different square next interval —
      // that would be routing around, which the design forbids.
      moveCount += 1
      handedness = outcome.handedness ?? handedness
    }
```

And the survivor push:

```ts
    survivors.push({ ...piece, square, prevSquare, moveCooldownMs: cooldown, moveCount, handedness })
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/tick.ts src/game/tick.test.ts
git commit -m "Thread per-Piece motion state through tick"
```

---

### Task 8: The King aura

Adjacent Pieces move more often; adjacent sliders also cover +1 square. Computed once per tick from tick-start positions, so the outcome never depends on which Piece is processed first — the same discipline `tick.ts` already applies to `towerBySquare`.

**Files:**
- Create: `src/game/auras.ts`, `src/game/auras.test.ts`
- Modify: `src/game/tick.ts`, `src/game/index.ts`

**Interfaces:**
- Consumes: `Piece`, `Square`, `PIECE_TYPES`
- Produces: `chebyshev(a: Square, b: Square): number`; `buffedPieceIds(pieces: readonly Piece[]): ReadonlySet<string>`; constants `KING_SPEED_MULTIPLIER = 0.7`, `KING_SLIDE_BONUS = 1`

- [ ] **Step 1: Write the failing test**

Create `src/game/auras.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buffedPieceIds } from './auras'
import type { Handedness, Piece, PieceTypeId, Square } from './types'

function piece(id: string, typeId: PieceTypeId, square: Square, handedness: Handedness = 1): Piece {
  return {
    id,
    typeId,
    square,
    prevSquare: square,
    health: 5,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness,
    auraCooldownMs: 0,
    buffed: false,
  }
}

describe('the King aura', () => {
  it('buffs a Piece on an adjacent square', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 5, rank: 5 })]

    expect(buffedPieceIds(pieces).has('r')).toBe(true)
  })

  it('does not reach two squares away', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 6, rank: 4 })]

    expect(buffedPieceIds(pieces).has('r')).toBe(false)
  })

  it('never buffs the King itself', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 })]

    expect(buffedPieceIds(pieces).has('k')).toBe(false)
  })

  it('does not stack — two Kings buff exactly as much as one', () => {
    const one = [piece('k1', 'king', { file: 4, rank: 4 }), piece('p', 'pawn', { file: 4, rank: 5 })]
    const two = [...one, piece('k2', 'king', { file: 3, rank: 5 })]

    expect(buffedPieceIds(two).has('p')).toBe(buffedPieceIds(one).has('p'))
  })

  it('is empty when no King is on the board', () => {
    expect(buffedPieceIds([piece('r', 'rook', { file: 4, rank: 4 })]).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run src/game/auras.test.ts`
Expected: FAIL — cannot resolve `./auras`.

- [ ] **Step 3: Implement**

Create `src/game/auras.ts`:

```ts
import { pieceType } from '../data/pieceTypes'
import type { Piece, Square } from './types'

/**
 * Aura effects, derived from Piece positions.
 *
 * Every function here reads the Piece list as it stood at the start of a tick
 * and returns a result, so nothing depends on the order Pieces are processed
 * in — the same discipline `tick.ts` applies to its Tower map.
 */

/** Move interval multiplier for a Piece standing beside a King. Lower is faster. */
export const KING_SPEED_MULTIPLIER = 0.7

/** Extra squares per hop a King grants an adjacent slider. */
export const KING_SLIDE_BONUS = 1

export const BISHOP_HEAL_INTERVAL_MS = 1500
export const BISHOP_HEAL_AMOUNT = 2
export const BISHOP_HEAL_RADIUS = 2

const NONE: ReadonlySet<string> = new Set()

/** Squares of king-move distance between two squares. */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank))
}

/**
 * Every Piece currently standing beside a King.
 *
 * Membership, not a count: the aura deliberately does **not** stack, so two
 * Kings buff exactly as much as one. A King never buffs itself.
 */
export function buffedPieceIds(pieces: readonly Piece[]): ReadonlySet<string> {
  const kings = pieces.filter((piece) => piece.typeId === 'king')
  if (kings.length === 0) return NONE

  const buffed = new Set<string>()

  for (const piece of pieces) {
    if (piece.typeId === 'king') continue
    if (kings.some((king) => chebyshev(king.square, piece.square) === 1)) buffed.add(piece.id)
  }

  return buffed
}

/** Whether a Piece type gains slide distance from a King. */
export function slideBonusFor(piece: Piece, buffed: ReadonlySet<string>): number {
  if (!buffed.has(piece.id)) return 0
  return pieceType(piece.typeId).slides ? KING_SLIDE_BONUS : 0
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:run src/game/auras.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `tick`**

In `src/game/tick.ts`, import and compute the set alongside `towerBySquare`:

```ts
import { KING_SPEED_MULTIPLIER, buffedPieceIds, slideBonusFor } from './auras'
```

```ts
  const towerBySquare = new Map(state.towers.map((tower) => [squareKey(tower.square), tower]))

  // Auras are derived once, from tick-start positions, for the same reason the
  // Tower map is: so no Piece's outcome depends on processing order.
  const allPieces = [...state.pieces, ...spawned]
  const buffed = buffedPieceIds(allPieces)

  const moved = movePieces(allPieces, state.board, state.core.square, towerBySquare, dtMs, buffed)
```

Add the `buffed` parameter to `movePieces` and use it:

```ts
function movePieces(
  pieces: readonly Piece[],
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  dtMs: number,
  buffed: ReadonlySet<string>,
): { pieces: Piece[]; leaked: number; towerDamage: Map<string, number> } {
```

Inside the per-Piece loop, replace the destructure and add the bonus:

```ts
    const { moveIntervalMs: baseInterval, attackDamage } = pieceType(piece.typeId)
    const isBuffed = buffed.has(piece.id)
    const moveIntervalMs = isBuffed ? baseInterval * KING_SPEED_MULTIPLIER : baseInterval
    const slideBonus = slideBonusFor(piece, buffed)
```

Pass `slideBonus` in the `nextMove` request instead of `0`, and record the flag on the survivor:

```ts
    survivors.push({
      ...piece,
      square,
      prevSquare,
      moveCooldownMs: cooldown,
      moveCount,
      handedness,
      buffed: isBuffed,
    })
```

- [ ] **Step 6: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

Do **not** re-export `auras.ts` from `src/game/index.ts`. Nothing outside the engine needs it, and `index.ts` is documented as the surface the renderer and UI import from.

- [ ] **Step 7: Commit**

```bash
git add src/game/auras.ts src/game/auras.test.ts src/game/tick.ts
git commit -m "Add the King aura: speed for all, extra slide for sliders"
```

---

### Task 9: The Bishop healing aura

Every *other* Piece within two squares, 2 health every 1500 ms, capped at the target's maximum. Never itself — the designed counter is "kill it first", and self-healing blunts exactly that.

Healing runs **after** Tower fire, which already filtered out dead Pieces, so a Bishop can never resurrect one.

**Files:**
- Modify: `src/game/auras.ts`, `src/game/auras.test.ts`, `src/game/tick.ts`

**Interfaces:**
- Consumes: `chebyshev`, `BISHOP_HEAL_*` constants from Task 8
- Produces: `applyHealing(pieces: readonly Piece[], dtMs: number): Piece[]`

- [ ] **Step 1: Write the failing test**

Append to `src/game/auras.test.ts`:

```ts
import { BISHOP_HEAL_INTERVAL_MS, applyHealing } from './auras'
import { PIECE_TYPES } from '../data/pieceTypes'

describe('the Bishop healing aura', () => {
  it('heals a damaged Piece within range when its pulse comes due', () => {
    const hurt = { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBeGreaterThan(1)
  })

  it('does nothing before its pulse comes due', () => {
    const hurt = { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, 100)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(1)
  })

  it('never heals past a Piece maximum health', () => {
    const pieces = [
      piece('b', 'bishop', { file: 4, rank: 4 }),
      { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: PIECE_TYPES.pawn.maxHealth },
    ]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('never heals itself, so killing it first still works', () => {
    const hurt = { ...piece('b', 'bishop', { file: 4, rank: 4 }), health: 1 }

    const healed = applyHealing([hurt], BISHOP_HEAL_INTERVAL_MS)

    expect(healed[0]?.health).toBe(1)
  })

  it('does not reach three squares away', () => {
    const hurt = { ...piece('p', 'pawn', { file: 7, rank: 4 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(1)
  })

  it('stacks across separate Bishops, which are separate sources', () => {
    // A Rook, not a Pawn: the target's max health must exceed what one Bishop
    // heals, or the cap hides the difference.
    const hurt = { ...piece('r', 'rook', { file: 4, rank: 5 }), health: 1 }
    const one = [piece('b1', 'bishop', { file: 4, rank: 4 }), hurt]
    const two = [...one, piece('b2', 'bishop', { file: 3, rank: 5 })]

    const healedOnce = applyHealing(one, BISHOP_HEAL_INTERVAL_MS).find((e) => e.id === 'r')
    const healedTwice = applyHealing(two, BISHOP_HEAL_INTERVAL_MS).find((e) => e.id === 'r')

    expect(healedTwice?.health).toBeGreaterThan(healedOnce?.health ?? 0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run src/game/auras.test.ts -t "healing aura"`
Expected: FAIL — `applyHealing` is not exported.

- [ ] **Step 3: Implement**

Append to `src/game/auras.ts`:

```ts
/**
 * Advances every Bishop's aura cooldown and applies the pulses that come due.
 *
 * Adjacency is measured against the Piece list as passed in, so two Bishops
 * heal the same targets regardless of order. They **do** stack: they are two
 * separate sources, not one effect applied twice.
 *
 * Call this after Tower fire has already removed dead Pieces, so a Bishop can
 * never resurrect one.
 */
export function applyHealing(pieces: readonly Piece[], dtMs: number): Piece[] {
  const healing = new Map<string, number>()

  const cooled = pieces.map((piece) => {
    if (piece.typeId !== 'bishop') return piece

    let cooldown = piece.auraCooldownMs + dtMs

    while (cooldown >= BISHOP_HEAL_INTERVAL_MS) {
      cooldown -= BISHOP_HEAL_INTERVAL_MS

      for (const other of pieces) {
        if (other.id === piece.id) continue
        if (chebyshev(piece.square, other.square) > BISHOP_HEAL_RADIUS) continue
        healing.set(other.id, (healing.get(other.id) ?? 0) + BISHOP_HEAL_AMOUNT)
      }
    }

    return { ...piece, auraCooldownMs: cooldown }
  })

  if (healing.size === 0) return cooled

  return cooled.map((piece) => {
    const amount = healing.get(piece.id)
    if (amount === undefined) return piece

    return {
      ...piece,
      health: Math.min(pieceType(piece.typeId).maxHealth, piece.health + amount),
    }
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:run src/game/auras.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into `tick`**

In `tick.ts`, add `applyHealing` to the auras import, then apply it right after `fireTowers`:

```ts
  const fired = fireTowers(standingTowers, moved.pieces, state.core.square, dtMs)

  // After firing, so a Bishop can top up survivors but never resurrect the dead.
  const healed = applyHealing(fired.pieces, dtMs)
```

Replace every subsequent use of `fired.pieces` in `tick` with `healed` — there are three: the `defeated` return, the `stillActive` computation, and the `gap` return, plus the final return.

- [ ] **Step 6: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/auras.ts src/game/auras.test.ts src/game/tick.ts
git commit -m "Add the Bishop healing aura"
```

---

### Task 10: Pawn promotion

A Pawn whose forward square is off the board — which only happens on rank 0 — is consumed, and a Queen spawns on that square with a **fresh entity id**.

**The fresh id is not optional.** `structuralKey` tracks `id@file,rank:health` and does not include `typeId`, so mutating the type in place would leave the renderer drawing a Pawn forever. A new id makes it a clean unmount/mount.

Promotion resolves on the Pawn's *next* move attempt from rank 0, one move interval after it arrives. That gives a visible beat and needs no extra machinery.

**Files:**
- Modify: `src/game/movement.ts` (`MoveOutcome`, `pawnMove`), `src/game/tick.ts` (`movePieces`)
- Test: `src/game/movement.test.ts`, `src/game/promotion.test.ts` (create)

**Interfaces:**
- Consumes: `MoveOutcome`, `drainDueSpawns`'s id scheme
- Produces: `MoveOutcome` gains `{ kind: 'promote' }`; `movePieces` returns `promoted: Square[]`

- [ ] **Step 1: Write the failing tests**

In `src/game/movement.test.ts`, replace the two existing "is stuck on the back rank" Pawn tests with:

```ts
  it('promotes on the back rank rather than stranding', () => {
    expect(move('pawn', { file: 0, rank: 0 })).toEqual({ kind: 'promote' })
  })

  it('promotes rather than sliding along the back rank toward the Core', () => {
    expect(move('pawn', { file: 2, rank: 0 })).toEqual({ kind: 'promote' })
  })
```

Create `src/game/promotion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState, tick } from './index'
import type { GameState, Piece } from './types'

const DT = 1000 / 60

function pawnOn(file: number, rank: number): Piece {
  const square = { file, rank }
  return {
    id: 'piece-1',
    typeId: 'pawn',
    square,
    prevSquare: square,
    health: PIECE_TYPES.pawn.maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
  }
}

function withPawn(file: number, rank: number): GameState {
  return {
    ...createInitialState(),
    phase: 'inProgress',
    pieces: [pawnOn(file, rank)],
    nextEntityId: 2,
  }
}

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('pawn promotion', () => {
  it('turns a Pawn on the back rank into a Queen', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces.map((piece) => piece.typeId)).toEqual(['queen'])
  })

  it('gives the Queen a fresh entity id, so the renderer remounts it', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.id).not.toBe('piece-1')
  })

  it('spawns the Queen at full Queen health, on the Pawn square', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.health).toBe(PIECE_TYPES.queen.maxHealth)
    expect(state.pieces[0]?.square).toEqual({ file: 0, rank: 0 })
  })

  it('leaves the round active, because the Queen can still sweep', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.phase).toBe('inProgress')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test:run src/game/promotion.test.ts`
Expected: FAIL — the Pawn is still `stuck` and stays a Pawn.

- [ ] **Step 3: Add the outcome**

In `src/game/movement.ts`, add to `MoveOutcome`:

```ts
  | { readonly kind: 'promote' }
```

Update its doc comment to say `promote` means a Pawn has reached the back rank. In `pawnMove`, replace the out-of-bounds branch:

```ts
  // Off the board forward can only mean rank 0 — the back rank. In chess a pawn
  // promotes there, and here it is exactly where Pawns would otherwise pile up
  // for the rest of the run.
  if (!isInBounds(board, ahead)) return { kind: 'promote' }
```

`isStuck` needs no change: `promote` is not `stuck`, so a promoting Pawn correctly keeps the round active.

- [ ] **Step 4: Handle it in `tick`**

In `movePieces`, add a collector beside `towerDamage`:

```ts
  const promoted: Square[] = []
```

Add a branch in the move loop, after the `attackTower` branch:

```ts
      if (outcome.kind === 'promote') {
        promoted.push(square)
        break
      }
```

Track it so the Pawn is not also pushed as a survivor. Declare `let isPromoted = false` beside `reachedCore`, set it in that branch, and guard the push:

```ts
    if (reachedCore) {
      leaked += 1
      continue
    }
    if (isPromoted) continue
```

Return `promoted` from `movePieces`, then in `tick` mint the Queens after `drainDueSpawns` has taken its ids:

```ts
  const promotedQueens: Piece[] = moved.promoted.map((square, index) => ({
    id: `piece-${nextEntityId + index}`,
    typeId: 'queen',
    square,
    prevSquare: square,
    health: pieceType('queen').maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: (nextEntityId + index) % 2 === 0 ? 1 : -1,
    auraCooldownMs: 0,
    buffed: false,
  }))
  const entityIdAfterPromotion = nextEntityId + moved.promoted.length
```

Add `...promotedQueens` to the Piece list passed into `fireTowers`, and use `entityIdAfterPromotion` in place of `nextEntityId` in all three `return` statements.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/movement.ts src/game/movement.test.ts src/game/promotion.test.ts src/game/tick.ts
git commit -m "Promote Pawns to Queens on the back rank"
```

---

### Task 11: Round termination

The single most important test in this change. The lateral fallback is what stops rounds hanging, and the Knight's stranding exception exists solely to protect it. Both are easy to break by accident.

A round is terminated when `phase` leaves `inProgress` — either back to `gap`, or to `defeated` if the Core fell. Both prove the simulation does not hang.

**Files:**
- Create: `src/game/termination.test.ts`

**Interfaces:**
- Consumes: `createInitialState`, `tick`, `PIECE_TYPES`

- [ ] **Step 1: Write the test**

Create `src/game/termination.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { BOARD } from '../data/board'
import { createInitialState, tick } from './index'
import type { GameState, Piece, PieceTypeId } from './types'

const DT = 1000 / 60

/** Generous: the slowest Piece sweeping the full rank needs well under this. */
const CAP_MS = 300_000

function pieceOn(id: string, typeId: PieceTypeId, file: number, rank: number): Piece {
  const square = { file, rank }
  return {
    id,
    typeId,
    square,
    prevSquare: square,
    health: PIECE_TYPES[typeId].maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
  }
}

function roundWith(pieces: Piece[]): GameState {
  return { ...createInitialState(), phase: 'inProgress', pieces, pendingSpawns: [] }
}

/** Runs until the round leaves `inProgress`, or gives up. */
function settle(state: GameState): GameState {
  let current = state
  for (let elapsed = 0; elapsed < CAP_MS; elapsed += DT) {
    current = tick(current, DT)
    if (current.phase !== 'inProgress') return current
  }
  return current
}

const ALL: PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

describe('round termination', () => {
  it.each(ALL)('a lone %s never hangs the round', (typeId) => {
    const settled = settle(roundWith([pieceOn('p1', typeId, 5, BOARD.ranks - 1)]))

    expect(settled.phase).not.toBe('inProgress')
  })

  it.each(ALL)('a %s starting on the back rank never hangs the round', (typeId) => {
    const settled = settle(roundWith([pieceOn('p1', typeId, 5, 0)]))

    expect(settled.phase).not.toBe('inProgress')
  })

  it('a sweeper left of the Core file still reaches it, thanks to reflection', () => {
    // File 1 sweeping toward file 0 would oscillate 0-1 forever without the
    // handedness flip. It must reflect and cross file 3.
    const settled = settle(roundWith([{ ...pieceOn('r', 'rook', 1, 0), handedness: -1 }]))

    expect(settled.phase).not.toBe('inProgress')
  })

  it('strands a Knight on the back rank rather than letting it bounce forever', () => {
    const settled = settle(roundWith([pieceOn('n', 'knight', 5, 0)]))

    expect(settled.phase).toBe('gap')
    // Left standing, not deleted — the gap stays visible.
    expect(settled.pieces.map((piece) => piece.typeId)).toEqual(['knight'])
  })

  it('a whole mixed board settles', () => {
    const settled = settle(
      roundWith(ALL.map((typeId, index) => pieceOn(`p${index}`, typeId, index, BOARD.ranks - 1))),
    )

    expect(settled.phase).not.toBe('inProgress')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm test:run src/game/termination.test.ts`
Expected: PASS. **If any case times out or fails, stop and fix the movement rule** — do not raise `CAP_MS`. A round that needs more than 300 simulated seconds to settle is a bug in the lateral fallback, not a slow test.

- [ ] **Step 3: Commit**

```bash
git add src/game/termination.test.ts
git commit -m "Guard round termination for every Piece type"
```

---

### Task 12: Progressive round composition

One new type unlocks every couple of rounds, weighted so Pawns dominate and Kings stay rare. Fully deterministic — a given round number always produces the same spawns.

**Files:**
- Modify: `src/data/rounds.ts`
- Test: `src/data/rounds.test.ts` (create)

**Interfaces:**
- Consumes: `PieceTypeId`, `roundSpec`
- Produces: `INTRODUCED_AT: Record<PieceTypeId, number>`

- [ ] **Step 1: Write the failing test**

Create `src/data/rounds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { INTRODUCED_AT, roundSpec } from './rounds'
import type { PieceTypeId } from '../game/types'

function typesIn(roundNumber: number): Set<PieceTypeId> {
  return new Set(roundSpec(roundNumber).spawns.map((spawn) => spawn.typeId))
}

describe('round composition', () => {
  it('sends only Pawns in the opening rounds', () => {
    expect(typesIn(1)).toEqual(new Set(['pawn']))
  })

  it('never sends a type before the round it is introduced', () => {
    for (let roundNumber = 1; roundNumber <= 12; roundNumber += 1) {
      for (const typeId of typesIn(roundNumber)) {
        expect(roundNumber).toBeGreaterThanOrEqual(INTRODUCED_AT[typeId])
      }
    }
  })

  it('has introduced the whole roster by round 11', () => {
    expect(typesIn(11).size).toBe(Object.keys(INTRODUCED_AT).length)
  })

  it('actually sends a new type in the round it unlocks', () => {
    for (const [typeId, roundNumber] of Object.entries(INTRODUCED_AT)) {
      expect(typesIn(roundNumber)).toContain(typeId as PieceTypeId)
    }
  })

  it('is deterministic — the same round always composes the same way', () => {
    expect(roundSpec(7)).toEqual(roundSpec(7))
  })

  it('keeps Pawns the most common Piece once the roster opens up', () => {
    const counts = new Map<PieceTypeId, number>()
    for (const spawn of roundSpec(11).spawns) {
      counts.set(spawn.typeId, (counts.get(spawn.typeId) ?? 0) + 1)
    }

    const pawns = counts.get('pawn') ?? 0
    for (const [typeId, count] of counts) {
      if (typeId !== 'pawn') expect(pawns).toBeGreaterThanOrEqual(count)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:run src/data/rounds.test.ts`
Expected: FAIL — `INTRODUCED_AT` is not exported.

- [ ] **Step 3: Implement**

Replace the body of `src/data/rounds.ts`:

```ts
import type { PieceTypeId, RoundSpec, Spawn } from '../game/types'
import { BOARD } from './board'

/**
 * Round composition.
 *
 * Deliberately deterministic — a given round number always produces the same
 * spawns. There is no randomness anywhere in the engine; if wave variety is
 * wanted later it must come from a seeded PRNG carried in state, never
 * `Math.random`, or the simulation stops being reproducible.
 *
 * Types unlock progressively so the player meets one threat at a time and
 * learns its counter before the next arrives.
 */
export const INTRODUCED_AT: Record<PieceTypeId, number> = {
  pawn: 1,
  knight: 3,
  bishop: 5,
  rook: 7,
  queen: 9,
  king: 11,
}

/**
 * Relative frequency once a type is available. Pawns are chaff and should
 * dominate; a Queen or King is an event.
 */
const WEIGHT: Record<PieceTypeId, number> = {
  pawn: 6,
  knight: 3,
  bishop: 2,
  rook: 2,
  queen: 1,
  king: 1,
}

const ORDER: readonly PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

/**
 * The weighted pool of types available at a given round, **interleaved** rather
 * than grouped.
 *
 * Interleaving is load-bearing, not tidiness. A round is shorter than the pool
 * — round 11 spawns 13 Pieces from a pool of 15 — so a grouped pool
 * (`pawn,pawn,…,queen,king`) would simply never reach the rare types at the
 * end. Taking one copy of each available type per pass means any prefix of the
 * pool is representative, and a newly introduced type always appears in the
 * very round it unlocks.
 */
function poolFor(roundNumber: number): PieceTypeId[] {
  const available = ORDER.filter((typeId) => roundNumber >= INTRODUCED_AT[typeId])
  const passes = Math.max(...available.map((typeId) => WEIGHT[typeId]))
  const pool: PieceTypeId[] = []

  for (let pass = 1; pass <= passes; pass += 1) {
    for (const typeId of available) {
      if (WEIGHT[typeId] >= pass) pool.push(typeId)
    }
  }

  return pool
}

export function roundSpec(roundNumber: number): RoundSpec {
  const pool = poolFor(roundNumber)
  const count = 2 + roundNumber
  const spawns: Spawn[] = []

  for (let i = 0; i < count; i += 1) {
    spawns.push({
      atMs: i * 1200,
      // `pool` is never empty — the Pawn is available from round 1.
      typeId: pool[i % pool.length] as PieceTypeId,
      file: (i * 3 + roundNumber) % BOARD.files,
    })
  }

  return { number: roundNumber, spawns }
}
```

For reference, this is what the generator produces — check against it if a test fails:

| Round | Pool size | Spawns | Composition |
| --- | --- | --- | --- |
| 1 | 6 | 3 | 3 Pawn |
| 3 | 9 | 5 | 3 Pawn, 2 Knight |
| 5 | 11 | 7 | 3 Pawn, 2 Knight, 2 Bishop |
| 7 | 13 | 9 | 3 Pawn, 2 Knight, 2 Bishop, 2 Rook |
| 9 | 14 | 11 | 3 Pawn, 3 Knight, 2 Bishop, 2 Rook, 1 Queen |
| 11 | 15 | 13 | 4 Pawn, 3 Knight, 2 Bishop, 2 Rook, 1 Queen, 1 King |

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:run src/data/rounds.test.ts`
Expected: PASS, matching the composition table above. If a case fails, fix the pool construction — never weaken the assertion.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS. `tick.test.ts` asserts round-1 behaviour, which is still Pawns only, so it should be unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/data/rounds.ts src/data/rounds.test.ts
git commit -m "Introduce Piece types progressively across rounds"
```

---

### Task 13: Render the roster

Distinct low-poly silhouettes per type, one shared geometry and material each. Bishop and King get their own colour — both are priority targets and the player needs to pick them out. Buffed Pieces show a ring, toggled by `visible` in `useFrame`.

**Files:**
- Modify: `src/scene/Pieces.tsx`

**Interfaces:**
- Consumes: `Piece.typeId`, `Piece.buffed` from Tasks 2 and 8

- [ ] **Step 1: Replace the shared geometry with per-type ones**

In `src/scene/Pieces.tsx`, replace the `CHESS_COLOUR` / `PIECE_REST_Y` constants and the geometry `useMemo`:

```ts
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import type { PieceTypeId } from '../game'

const CHESS_COLOUR = '#c0392b'
/** The healer and the commander are priority targets, so they read differently. */
const COLOUR_BY_TYPE: Record<PieceTypeId, string> = {
  pawn: CHESS_COLOUR,
  knight: CHESS_COLOUR,
  bishop: '#8e44ad',
  rook: CHESS_COLOUR,
  queen: CHESS_COLOUR,
  king: '#d4a017',
}

const GEOMETRY_BY_TYPE: Record<PieceTypeId, () => BufferGeometry> = {
  pawn: () => new ConeGeometry(0.28, 0.55, 6),
  knight: () => new BoxGeometry(0.4, 0.6, 0.3),
  bishop: () => new ConeGeometry(0.2, 0.8, 6),
  rook: () => new CylinderGeometry(0.32, 0.32, 0.45, 6),
  queen: () => new ConeGeometry(0.3, 0.9, 8),
  king: () => new CylinderGeometry(0.26, 0.3, 0.85, 8),
}

/**
 * Where each silhouette's origin sits so the Piece rests on the board rather
 * than in it — half its height, except the Pawn, which keeps the existing
 * hand-tuned 0.35 so it looks unchanged.
 */
const REST_Y_BY_TYPE: Record<PieceTypeId, number> = {
  pawn: 0.35,
  knight: 0.3,
  bishop: 0.4,
  rook: 0.23,
  queen: 0.45,
  king: 0.43,
}

const PIECE_TYPE_IDS = Object.keys(GEOMETRY_BY_TYPE) as PieceTypeId[]
```

- [ ] **Step 2: Build and dispose the shared resources**

Replace the `useMemo` / `useEffect` pair in `Pieces`:

```ts
  // One geometry and one material per type, shared across every instance of it,
  // per CLAUDE.md. Built once, disposed on unmount.
  const resources = useMemo(() => {
    const ring = new RingGeometry(0.34, 0.42, 16)
    const ringMaterial = new MeshStandardMaterial({ color: '#f1c40f', emissive: '#f1c40f' })
    const byType = new Map<PieceTypeId, { geometry: BufferGeometry; material: Material }>()

    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: GEOMETRY_BY_TYPE[typeId](),
        material: new MeshStandardMaterial({ color: COLOUR_BY_TYPE[typeId], flatShading: true }),
      })
    }

    return { byType, ring, ringMaterial }
  }, [])

  useEffect(
    () => () => {
      for (const { geometry, material } of resources.byType.values()) {
        geometry.dispose()
        material.dispose()
      }
      resources.ring.dispose()
      resources.ringMaterial.dispose()
    },
    [resources],
  )
```

- [ ] **Step 3: Pass the type through to each mesh**

In the returned JSX, look each Piece's resources up by type:

```tsx
      {pieces.map((piece) => {
        const shared = resources.byType.get(piece.typeId)
        if (!shared) return null

        return (
          <PieceMesh
            key={piece.id}
            pieceId={piece.id}
            typeId={piece.typeId}
            board={board}
            geometry={shared.geometry}
            material={shared.material}
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
          />
        )
      })}
```

- [ ] **Step 4: Use the per-type rest height and toggle the aura ring**

In `PieceMesh`, add `typeId`, `ringGeometry`, and `ringMaterial` to the props, add `const ringRef = useRef<Mesh>(null)`, and inside `useFrame` replace the `PIECE_REST_Y` reference:

```ts
    const restY = REST_Y_BY_TYPE[typeId]

    mesh.position.set(
      fromX + (toX - fromX) * progress,
      restY + Math.sin(progress * Math.PI) * HOP_ARC,
      fromZ + (toZ - fromZ) * progress,
    )
```

and add, at the end of the same callback:

```ts
    // Toggling `visible` rather than mounting conditionally — mounting would
    // recompile the material. No state is set here.
    const ring = ringRef.current
    if (ring) {
      ring.visible = piece.buffed
      if (piece.buffed) {
        ring.position.set(mesh.position.x, 0.02, mesh.position.z)
      }
    }
```

Return both meshes:

```tsx
  return (
    <>
      <mesh ref={ref} geometry={geometry} material={material} castShadow />
      <mesh
        ref={ringRef}
        geometry={ringGeometry}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
    </>
  )
```

Also update the health-scaling line to use `pieceType(piece.typeId).maxHealth` — it already does, so no change is needed there.

- [ ] **Step 5: Verify it runs**

Run: `pnpm build && pnpm lint`
Expected: PASS.

Run: `pnpm dev`, open the app, enable auto-start, and let it reach round 11. Confirm six distinct silhouettes appear, the Bishop is purple, the King is gold, and Pieces beside a King show a ring.

- [ ] **Step 6: Commit**

```bash
git add src/scene/Pieces.tsx
git commit -m "Render each Piece type with its own silhouette"
```

---

### Task 14: Update the design docs

The code now contradicts `game-design.md` and `CLAUDE.md` in several places. Both are authoritative documents and drift is exactly what the three-document structure exists to prevent.

**Files:**
- Modify: `docs/design/game-design.md`, `CLAUDE.md`

- [ ] **Step 1: Update `docs/design/game-design.md`**

In **The Chess roster** table:
- Knight row: change Threat to describe erratic L-hop movement that line geometries struggle to cover. Remove "only damageable while on a **light** square". Change Forces to coverage that can catch a hopper.
- Pawn row: keep promotion, but make it read "Promotes to a Queen on reaching the back rank".

Delete the standalone line "**Square colour is mechanically load-bearing** because of the Knight. It is not decoration."

In **Rank ladder**, rewrite the paragraph beginning "Rank 5 is diagonal for a specific reason" — the colour-preservation property is still true, but it no longer counters anything. State that rank 5's geometry is now identity alone, and that the colour property is available if a future mechanic wants it.

In **Movement is chess movement**, add a subsection per Piece mirroring the plan's movement table, and replace the "Stranded Pieces are left standing" paragraph with the lateral-fallback rule, including why Knights are exempt.

In **Open questions**, delete the **How far do sliding Pieces move?** and **The Core is hard to reach** rows. Rewrite **Stranded Pieces** to cover only Knights. Rewrite **Board geometry** — its argument for a literal 8×8 was that square colour is load-bearing, which is no longer true.

- [ ] **Step 2: Update `CLAUDE.md`**

In **Invariants that constrain code**:
- Delete "**Square colour is mechanically load-bearing**, not decoration — the Knight is only damageable on light squares."
- Add: "**Pieces are forward-biased and deterministic.** Direction is a pure function of Piece type, `moveCount`, and `handedness`. Never choose a line because the Core is on it — that is goal-seeking, and it makes Tower placement steer Pieces."
- Add: "**Sliders and the King sweep laterally when forward is off the board, reflecting off the file edges and flipping `handedness`.** Round termination depends on this: without the flip a Piece oscillates between two files forever. Knights are exempt and strand, because a bouncing Knight would keep a round alive indefinitely."

In **Current state**, replace the "What does **not** exist yet" bullet about the piece roster: the roster, promotion, healing, and the King aura now exist. Colour vulnerability is gone from the design. Cards, Ink, and the Deck are still absent.

Also fix the stale test count in that section — it claims "38 tests, all passing". Run `pnpm test:run` and use the real number.

- [ ] **Step 3: Verify nothing else drifted**

Run: `rg -n "light square|colour-flicker|load-bearing" CLAUDE.md docs/design/game-design.md`
Expected: no hits describing the Knight's vulnerability. Frozen specs under `docs/superpowers/specs/` are historical records and **must not** be edited.

- [ ] **Step 4: Run everything one last time**

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/design/game-design.md
git commit -m "Update the design docs for the full Chess roster"
```
