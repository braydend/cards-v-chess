# Developer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dev-only control panel — round selection, an any-card picker, a Piece spawner, and Ink/Core/board/tower utilities — backed by eight new engine commands, per spec `docs/superpowers/specs/2026-08-12-developer-mode-design.md`.

**Architecture:** Eight dev `Command` variants routed through `step` into a new pure module `src/game/dev.ts`. Each refuses invalid input by returning the same state object (identity is how `simulation.dispatch` detects a refusal). The `DevPanel` React component is guarded by `import.meta.env.DEV`, so Vite dead-code-eliminates it from the production bundle. No runtime gate in the engine.

**Tech Stack:** TypeScript strict, Vite, React, zustand, Vitest, React Three Fiber (renderer untouched).

## Global Constraints

These apply to every task. Exact values copied from the spec and CLAUDE.md.

- **`Math.random` must never appear in `src/game/`.** Enforced by ESLint; fails `pnpm lint`.
- **Dev commands never draw from `state.rng`.** Neither rng stream may be touched by a dev command — using dev mode must not shift later seeded outcomes.
- **`devSpawnPiece` derives `handedness` from `nextEntityId` parity; `devAddCard` numbers cards on `nextCardId`.** Never spend `nextEntityId` on a Card (its parity is load-bearing for Piece weave direction).
- **`devSetRound` is valid in the `gap` phase only.** Mid-round it would be skipped by round completion's `roundNumber + 1`.
- **`devAddCard` deliberately bypasses the 30-card cap.** That is the point of the picker.
- **A refusal returns the SAME state object**, never a copy — `simulation.dispatch` tells a refusal from a success by `===`.
- **`src/game/` must never import React or Three.js.** Enforced by ESLint.
- **The panel UI is compiled out of production.** `import.meta.env.DEV` guards `DevPanel`; there is no engine flag.
- **No new exports on `src/game/index.ts`.** Dev commands travel through the existing `Command`/`step` surface.
- **Verification commands:** `pnpm test:run` (full suite; `pnpm test:run -- <file>` filters), `pnpm typecheck` (`tsc --noEmit`), `pnpm lint`, `pnpm build`. Engine coverage thresholds cover `src/game/`; `dev.ts` and `dev.test.ts` count toward them.

## File Structure

- **Create `src/game/dev.ts`** — pure module with one exported function per dev command. Task 1 creates it with `devAddInk` and `devSetCoreHealth`; Tasks 2–5 add the rest.
- **Modify `src/game/types.ts`** — add the eight `dev*` variants to the `Command` union (one or two per task).
- **Modify `src/game/step.ts`** — add a `case` arm per new variant, routing to `dev.ts`. Every variant MUST have a case (the switch's declared return type `GameState` makes a missing case a compile error, `TS2366`).
- **Create `src/game/dev.test.ts`** — tests for all dev commands through the public `step` surface. Grows one `describe` block per task.
- **Modify `src/state/uiStore.ts`** — add `devPanelOpen` / `setDevPanelOpen` (view-only state, same home as `packShopOpen`).
- **Create `src/ui/DevPanel.tsx`** — the panel. `import.meta.env.DEV` guard, backquote hotkey, floating non-modal sections, form state as local `useState`.
- **Modify `src/ui/Hud.tsx`** — mount `<DevPanel />` BEFORE the modals (no `z-index` anywhere in the CSS; DOM order decides stacking, so the modals must paint over it).
- **Modify `src/index.css`** — `.dev-panel*` styles. Must set `pointer-events: auto` (`.hud` is `pointer-events: none`).

Existing test fixtures available in `src/game/fixtures.ts`: `standardCard(id, rank, suit)`, `jokerCard(id)`, `withDeck(cards, state)`, `withTower(cardRank, square, state)`, `pieceAt(typeId, id, square)`, `liveRound(state, pieces)`, `firstTower(state)`, `firstTowerId(state)`. `withTower` throws if the build is refused.

Engine facts the tasks rely on:
- `createInitialState(seed)` (`src/game/state.ts`) starts at `roundNumber: 1`, `nextEntityId: 1`, board 8×8, gap phase. `createInitialState('dev-test')` is the standard test base.
- `stagingRank(board)` (`src/game/board.ts`) returns `board.ranks` — the off-board spawn rank.
- `spawnHealth(baseHealth, roundNumber)` (`src/game/spawnScaling.ts`) — round-scaled Piece health.
- `roundSpec(roundNumber)` (`src/data/rounds.ts`) — deterministic spawn table per round.
- `PIECE_TYPES` (`src/data/pieceTypes.ts`) and `TIERS` (`src/data/tiers.ts`) are `Record` keyed by type/tier id.
- `ALL_CARD_RANKS` and `SUITS` (`src/data/cards.ts`); `DECK_CAP = 30` (`src/data/deck.ts`).

---

### Task 1: `devAddInk` and `devSetCoreHealth`

**Files:**
- Create: `src/game/dev.ts`
- Modify: `src/game/types.ts` (Command union), `src/game/step.ts`
- Create: `src/game/dev.test.ts`

**Interfaces:**
- Produces (consumed by `step.ts`):
  - `devAddInk(state: GameState, amount: number): GameState` — refuses `amount < 1`.
  - `devSetCoreHealth(state: GameState, health: number, maxHealth: number): GameState` — refuses `health < 1`, `maxHealth < health`, and the `defeated` phase.
- Consumes: the two new `Command` variants `{ kind: 'devAddInk'; amount: number }` and `{ kind: 'devSetCoreHealth'; health: number; maxHealth: number }`.

- [ ] **Step 1: Add the two Command variants and write the failing tests**

In `src/game/types.ts`, inside the `Command` union (after the `buyPack` variant at the end), add:

```ts
  | { readonly kind: 'devAddInk'; readonly amount: number }
  | { readonly kind: 'devSetCoreHealth'; readonly health: number; readonly maxHealth: number }
```

Create `src/game/dev.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createInitialState, step, tick } from './index'
import type { GameState } from './types'

const base = (): GameState => createInitialState('dev-test')

describe('devAddInk', () => {
  it('refuses an amount below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devAddInk', amount: 0 })).toBe(state)
  })

  it('adds exactly the amount, mid-round included', () => {
    const state: GameState = { ...base(), phase: 'inProgress' }

    const after = step(state, { kind: 'devAddInk', amount: 150 })

    expect(after.ink).toBe(state.ink + 150)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devAddInk', amount: 10 })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devSetCoreHealth', () => {
  it('refuses health below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devSetCoreHealth', health: 0, maxHealth: 100 })).toBe(state)
  })

  it('refuses a max below health', () => {
    const state = base()

    expect(step(state, { kind: 'devSetCoreHealth', health: 50, maxHealth: 40 })).toBe(state)
  })

  it('refuses once defeated, so the phase cannot contradict the health', () => {
    const defeated: GameState = { ...base(), phase: 'defeated' }

    expect(step(defeated, { kind: 'devSetCoreHealth', health: 100, maxHealth: 100 })).toBe(
      defeated,
    )
  })

  it('sets both current and maximum health', () => {
    const state = base()

    const after = step(state, { kind: 'devSetCoreHealth', health: 40, maxHealth: 50 })

    expect(after.core.health).toBe(40)
    expect(after.core.maxHealth).toBe(50)
  })

  it('survives a tick', () => {
    const state = step(base(), { kind: 'devSetCoreHealth', health: 40, maxHealth: 50 })

    const after = tick(state, 1000 / 60)

    expect(after.core.health).toBe(40)
    expect(after.core.maxHealth).toBe(50)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: FAIL. The switch in `step` has no `devAddInk` case yet, so `step` falls through and returns `undefined` — the assertions throw on reading a property of `undefined`. (esbuild strips types, so the missing-case `TS2366` is not what stops the run; the runtime `undefined` is.)

- [ ] **Step 3: Implement `dev.ts` and wire the `step` cases**

Create `src/game/dev.ts`:

```ts
import type { GameState } from './types'

/**
 * Developer-mode commands: the engine half of issue #60's testing panel.
 *
 * Deliberately NOT part of the game rules — a dev panel is the only caller.
 * Each command refuses an invalid input by returning the same state object,
 * exactly like every other command, so `simulation.dispatch` tells a refusal
 * from a success by identity. None of them draws from `state.rng`, so using
 * dev mode never shifts later seeded outcomes. The panel UI is compiled out
 * of production builds (`import.meta.env.DEV`), which is the only gate.
 */

export function devAddInk(state: GameState, amount: number): GameState {
  if (amount < 1) return state

  return { ...state, ink: state.ink + amount }
}

export function devSetCoreHealth(
  state: GameState,
  health: number,
  maxHealth: number,
): GameState {
  // Refused once defeated: phase 'defeated' plus a full Core would contradict
  // each other. Every other dev command is deliberately phase-agnostic.
  if (state.phase === 'defeated') return state
  if (health < 1 || maxHealth < health) return state

  return { ...state, core: { ...state.core, health, maxHealth } }
}
```

In `src/game/step.ts`, import the module and add the cases:

```ts
import { devAddInk, devSetCoreHealth } from './dev'
```

```ts
    case 'devAddInk':
      return devAddInk(state, command.amount)
    case 'devSetCoreHealth':
      return devSetCoreHealth(state, command.health, command.maxHealth)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. `typecheck` proves the new switch arms keep `step`'s exhaustiveness.

- [ ] **Step 6: Commit**

```bash
git add src/game/dev.ts src/game/dev.test.ts src/game/types.ts src/game/step.ts
git commit -m "feat(engine): devAddInk and devSetCoreHealth dev commands"
```

---

### Task 2: `devSetRound` and `devGrowBoard`

**Files:**
- Modify: `src/game/dev.ts`, `src/game/types.ts`, `src/game/step.ts`, `src/game/dev.test.ts`

**Interfaces:**
- Produces:
  - `devSetRound(state: GameState, roundNumber: number): GameState` — refuses unless `phase === 'gap'` and `roundNumber >= 1`.
  - `devGrowBoard(state: GameState, ranks: number): GameState` — refuses `ranks < 1`; grows `board.ranks` only.
- Consumes: `{ kind: 'devSetRound'; roundNumber: number }` and `{ kind: 'devGrowBoard'; ranks: number }`.
- Uses (from earlier): `devAddInk`, `devSetCoreHealth`.

- [ ] **Step 1: Add the two Command variants and write the failing tests**

In `src/game/types.ts`, inside the `Command` union, add:

```ts
  | { readonly kind: 'devSetRound'; readonly roundNumber: number }
  | { readonly kind: 'devGrowBoard'; readonly ranks: number }
```

Append to `src/game/dev.test.ts`:

```ts
import { roundSpec } from '../data/rounds'
import { stagingRank } from './board'
```

```ts
describe('devSetRound', () => {
  it('is refused while a round is live', () => {
    const state: GameState = { ...base(), phase: 'inProgress' }

    expect(step(state, { kind: 'devSetRound', roundNumber: 9 })).toBe(state)
  })

  it('refuses a round below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devSetRound', roundNumber: 0 })).toBe(state)
  })

  it('changes the round the next Start round loads', () => {
    const state = step(base(), { kind: 'devSetRound', roundNumber: 7 })

    expect(state.roundNumber).toBe(7)

    const started = step(state, { kind: 'startRound' })

    expect(started.pendingSpawns).toEqual(roundSpec(7).spawns)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devSetRound', roundNumber: 7 })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devGrowBoard', () => {
  it('refuses a rank count below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devGrowBoard', ranks: 0 })).toBe(state)
  })

  it('grows ranks only, leaving files untouched', () => {
    const state = base()

    const after = step(state, { kind: 'devGrowBoard', ranks: 2 })

    expect(after.board.ranks).toBe(state.board.ranks + 2)
    expect(after.board.files).toBe(state.board.files)
  })

  it('moves the staging rank with the board', () => {
    const after = step(base(), { kind: 'devGrowBoard', ranks: 1 })

    expect(stagingRank(after.board)).toBe(after.board.ranks)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: FAIL — `step` returns `undefined` for the new kinds.

- [ ] **Step 3: Implement the functions and wire the cases**

In `src/game/dev.ts`, add:

```ts
export function devSetRound(state: GameState, roundNumber: number): GameState {
  // Gap only, like buyPack. Mid-round it would be silently skipped: round
  // completion sets roundNumber = state.roundNumber + 1, so a mid-round set to
  // N would complete straight past N to N + 1.
  if (state.phase !== 'gap') return state
  if (roundNumber < 1) return state

  return { ...state, roundNumber }
}

export function devGrowBoard(state: GameState, ranks: number): GameState {
  if (ranks < 1) return state

  // Ranks only, mirroring the Ace: files are fixed so spawn-file math in
  // data/rounds.ts stays correct and the staging rank stays out of bounds.
  return { ...state, board: { ...state.board, ranks: state.board.ranks + ranks } }
}
```

In `src/game/step.ts`, extend the import and add the cases:

```ts
import { devAddInk, devGrowBoard, devSetCoreHealth, devSetRound } from './dev'
```

```ts
    case 'devSetRound':
      return devSetRound(state, command.roundNumber)
    case 'devGrowBoard':
      return devGrowBoard(state, command.ranks)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/dev.ts src/game/dev.test.ts src/game/types.ts src/game/step.ts
git commit -m "feat(engine): devSetRound and devGrowBoard dev commands"
```

---

### Task 3: `devSpawnPiece`

**Files:**
- Modify: `src/game/dev.ts`, `src/game/types.ts`, `src/game/step.ts`, `src/game/dev.test.ts`

**Interfaces:**
- Produces:
  - `devSpawnPiece(state: GameState, typeId: PieceTypeId, tier: PieceTier, square: Square): GameState`
  - Refuses: square not in bounds and not on the staging rank; a Tower on the square; a Piece on the square. Builds the Piece exactly like `drainDueSpawns` in `tick.ts`: `spawnHealth(pieceType(typeId).maxHealth, state.roundNumber)`, `handedness` from `nextEntityId` parity, `hunting = tierDef(tier).huntsFromSpawn && typeId !== 'pawn'`. Increments `nextEntityId`.
- Consumes: `{ kind: 'devSpawnPiece'; typeId: PieceTypeId; tier: PieceTier; square: Square }`.
- Uses: `spawnHealth` from `./spawnScaling`, `pieceType` from `../data/pieceTypes`, `tierDef` from `../data/tiers`, `squaresEqual` / `isInBounds` / `stagingRank` from `./board`.

- [ ] **Step 1: Add the Command variant and write the failing tests**

In `src/game/types.ts`, inside the `Command` union, add:

```ts
  | {
      readonly kind: 'devSpawnPiece'
      readonly typeId: PieceTypeId
      readonly tier: PieceTier
      readonly square: Square
    }
```

Append to `src/game/dev.test.ts`:

```ts
import { PIECE_TYPES } from '../data/pieceTypes'
import { pieceAt, liveRound, withTower } from './fixtures'
import { spawnHealth } from './spawnScaling'
```

```ts
describe('devSpawnPiece', () => {
  it('is refused off the board and off the staging rank', () => {
    const state = base()

    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'rook',
        tier: 'red',
        square: { file: 0, rank: -1 },
      }),
    ).toBe(state)
    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'rook',
        tier: 'red',
        square: { file: 0, rank: 9 },
      }),
    ).toBe(state)
    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'rook',
        tier: 'red',
        square: { file: 8, rank: 0 },
      }),
    ).toBe(state)
  })

  it('is refused onto a Tower, so the no-shared-square invariant holds', () => {
    const state = withTower(2, { file: 2, rank: 2 }, base())

    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'pawn',
        tier: 'green',
        square: { file: 2, rank: 2 },
      }),
    ).toBe(state)
  })

  it('is refused onto an occupied square', () => {
    const state = liveRound(base(), [pieceAt('pawn', 'p0', { file: 1, rank: 1 })])

    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'pawn',
        tier: 'green',
        square: { file: 1, rank: 1 },
      }),
    ).toBe(state)
  })

  it('spawns a round-scaled Piece with its tier flags', () => {
    const state = base()

    const after = step(state, {
      kind: 'devSpawnPiece',
      typeId: 'rook',
      tier: 'yellow',
      square: { file: 0, rank: 4 },
    })

    const piece = after.pieces[0]
    expect(piece?.typeId).toBe('rook')
    expect(piece?.tier).toBe('yellow')
    expect(piece?.square).toEqual({ file: 0, rank: 4 })
    expect(piece?.prevSquare).toEqual({ file: 0, rank: 4 })
    expect(piece?.health).toBe(spawnHealth(PIECE_TYPES.rook.maxHealth, state.roundNumber))
    expect(piece?.maxHealth).toBe(piece?.health)
    expect(piece?.hunting).toBe(true)
    expect(after.nextEntityId).toBe(state.nextEntityId + 1)
  })

  it('spawns onto the staging rank', () => {
    const state = base()
    const square = { file: 3, rank: stagingRank(state.board) }

    const after = step(state, { kind: 'devSpawnPiece', typeId: 'king', tier: 'green', square })

    expect(after.pieces[0]?.square).toEqual(square)
  })

  it('weaves handedness from entity-id parity', () => {
    const first = step(base(), {
      kind: 'devSpawnPiece',
      typeId: 'pawn',
      tier: 'green',
      square: { file: 0, rank: 0 },
    })
    const second = step(first, {
      kind: 'devSpawnPiece',
      typeId: 'pawn',
      tier: 'green',
      square: { file: 1, rank: 0 },
    })

    expect(second.pieces[0]?.handedness).not.toBe(second.pieces[1]?.handedness)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, {
      kind: 'devSpawnPiece',
      typeId: 'pawn',
      tier: 'green',
      square: { file: 0, rank: 0 },
    })

    expect(after.rng).toBe(state.rng)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: FAIL — `step` returns `undefined` for the new kind.

- [ ] **Step 3: Implement the function and wire the case**

In `src/game/dev.ts`, extend the imports (replacing the `import type { GameState } from './types'` added in Task 1):

```ts
import { pieceType } from '../data/pieceTypes'
import { tierDef } from '../data/tiers'
import { isInBounds, squaresEqual, stagingRank } from './board'
import { spawnHealth } from './spawnScaling'
import type { GameState, Piece, PieceTier, PieceTypeId, Square } from './types'
```

Add:

```ts
export function devSpawnPiece(
  state: GameState,
  typeId: PieceTypeId,
  tier: PieceTier,
  square: Square,
): GameState {
  // On the board, or on the Staging rank. Both are refused by a Tower/Piece
  // occupancy check below, and the Staging rank can never hold a Tower, so the
  // no-shared-square invariant holds for a dev spawn exactly as for a real one.
  const onBoard = isInBounds(state.board, square)
  const onStaging =
    square.rank === stagingRank(state.board) &&
    square.file >= 0 &&
    square.file < state.board.files
  if (!onBoard && !onStaging) return state

  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return state
  if (state.pieces.some((piece) => squaresEqual(piece.square, square))) return state

  // Identical to a normal spawn (drainDueSpawns in tick.ts): round-scaled
  // health and handedness from entity-id parity, so a dev-spawned Piece weaves
  // exactly like one the round would have produced.
  const health = spawnHealth(pieceType(typeId).maxHealth, state.roundNumber)
  const piece: Piece = {
    id: `piece-${state.nextEntityId}`,
    typeId,
    tier,
    square,
    prevSquare: square,
    health,
    maxHealth: health,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: state.nextEntityId % 2 === 0 ? 1 : -1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: tierDef(tier).huntsFromSpawn && typeId !== 'pawn',
    promoted: false,
  }

  return {
    ...state,
    pieces: [...state.pieces, piece],
    nextEntityId: state.nextEntityId + 1,
  }
}
```

In `src/game/step.ts`, extend the import and add the case:

```ts
import { devAddInk, devGrowBoard, devSetCoreHealth, devSetRound, devSpawnPiece } from './dev'
```

```ts
    case 'devSpawnPiece':
      return devSpawnPiece(state, command.typeId, command.tier, command.square)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: PASS (22 tests).

- [ ] **Step 5: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/dev.ts src/game/dev.test.ts src/game/types.ts src/game/step.ts
git commit -m "feat(engine): devSpawnPiece dev command"
```

---

### Task 4: `devRemoveTower` and `devClearPieces`

**Files:**
- Modify: `src/game/dev.ts`, `src/game/types.ts`, `src/game/step.ts`, `src/game/dev.test.ts`

**Interfaces:**
- Produces:
  - `devRemoveTower(state: GameState, towerId: string): GameState` — removes the named Tower; no-op (same object) for an unknown id.
  - `devClearPieces(state: GameState): GameState` — empties `pieces`, leaves `pendingSpawns` untouched, pays no ink, does not bump `clears`; no-op when already empty.
- Consumes: `{ kind: 'devRemoveTower'; towerId: string }` and `{ kind: 'devClearPieces' }`.
- Uses: `roundSpec` from `../data/rounds` (test only), `firstTowerId` / `withTower` / `pieceAt` / `liveRound` from `./fixtures`.

- [ ] **Step 1: Add the two Command variants and write the failing tests**

In `src/game/types.ts`, inside the `Command` union, add:

```ts
  | { readonly kind: 'devRemoveTower'; readonly towerId: string }
  | { readonly kind: 'devClearPieces' }
```

Append to `src/game/dev.test.ts`:

```ts
import { firstTowerId } from './fixtures'
```

(`pieceAt` / `liveRound` / `withTower` imports already exist from Task 3.)

```ts
describe('devRemoveTower', () => {
  it('removes the named Tower and leaves the rest', () => {
    const seeded = withTower(2, { file: 0, rank: 0 }, base())
    const state = withTower(5, { file: 3, rank: 3 }, seeded)
    const target = firstTowerId(state)

    const after = step(state, { kind: 'devRemoveTower', towerId: target })

    expect(after.towers).toHaveLength(1)
    expect(after.towers[0]?.id).not.toBe(target)
  })

  it('is a no-op for an unknown id', () => {
    const state = withTower(2, { file: 0, rank: 0 }, base())

    expect(step(state, { kind: 'devRemoveTower', towerId: 'ghost' })).toBe(state)
  })

  it('does not touch the rng streams', () => {
    const state = withTower(2, { file: 0, rank: 0 }, base())

    const after = step(state, { kind: 'devRemoveTower', towerId: firstTowerId(state) })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devClearPieces', () => {
  it('empties pieces but leaves pending spawns', () => {
    const state: GameState = {
      ...liveRound(base(), [pieceAt('pawn', 'p0', { file: 1, rank: 1 })]),
      pendingSpawns: roundSpec(1).spawns,
    }

    const after = step(state, { kind: 'devClearPieces' })

    expect(after.pieces).toHaveLength(0)
    expect(after.pendingSpawns).toEqual(state.pendingSpawns)
  })

  it('pays no ink and does not bump the clears counter', () => {
    const state: GameState = {
      ...liveRound(base(), [pieceAt('queen', 'q0', { file: 2, rank: 2 })]),
      ink: 5,
      clears: 3,
    }

    const after = step(state, { kind: 'devClearPieces' })

    expect(after.ink).toBe(5)
    expect(after.clears).toBe(3)
  })

  it('is a no-op when the board is already clear', () => {
    const state = liveRound(base(), [])

    expect(step(state, { kind: 'devClearPieces' })).toBe(state)
  })

  it('does not touch the rng streams', () => {
    const state = liveRound(base(), [pieceAt('pawn', 'p0', { file: 1, rank: 1 })])

    const after = step(state, { kind: 'devClearPieces' })

    expect(after.rng).toBe(state.rng)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: FAIL — `step` returns `undefined` for the new kinds.

- [ ] **Step 3: Implement the functions and wire the cases**

In `src/game/dev.ts`, add:

```ts
export function devRemoveTower(state: GameState, towerId: string): GameState {
  if (!state.towers.some((tower) => tower.id === towerId)) return state

  return { ...state, towers: state.towers.filter((tower) => tower.id !== towerId) }
}

export function devClearPieces(state: GameState): GameState {
  if (state.pieces.length === 0) return state

  // A testing utility, not the Joker: no ink, no clears bump, and pending
  // spawns untouched so a live round keeps its schedule.
  return { ...state, pieces: [] }
}
```

In `src/game/step.ts`, extend the import and add the cases:

```ts
import {
  devAddInk,
  devClearPieces,
  devGrowBoard,
  devRemoveTower,
  devSetCoreHealth,
  devSetRound,
  devSpawnPiece,
} from './dev'
```

```ts
    case 'devRemoveTower':
      return devRemoveTower(state, command.towerId)
    case 'devClearPieces':
      return devClearPieces(state)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: PASS (29 tests).

- [ ] **Step 5: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/dev.ts src/game/dev.test.ts src/game/types.ts src/game/step.ts
git commit -m "feat(engine): devRemoveTower and devClearPieces dev commands"
```

---

### Task 5: `devAddCard`

**Files:**
- Modify: `src/game/dev.ts`, `src/game/types.ts`, `src/game/step.ts`, `src/game/dev.test.ts`

**Interfaces:**
- Produces:
  - `devAddCard(state: GameState, rank: CardRank | undefined, suit: Suit | undefined): GameState`
  - Refuses: a standard rank without a suit, or a suit with no rank (mirrors `buyPack`'s validation style). Builds `{ id: \`card-${nextCardId}\`, kind: 'standard', rank, suit }` or `{ id: \`card-${nextCardId}\`, kind: 'joker' }`. **Bypasses `DECK_CAP`.** Increments `nextCardId`, never `nextEntityId`.
- Consumes: `{ kind: 'devAddCard'; rank?: CardRank; suit?: Suit }`.
- Uses: `DECK_CAP` from `../data/deck`, `standardCard` / `withDeck` from `./fixtures`.

- [ ] **Step 1: Add the Command variant and write the failing tests**

In `src/game/types.ts`, inside the `Command` union, add:

```ts
  | { readonly kind: 'devAddCard'; readonly rank?: CardRank; readonly suit?: Suit }
```

Append to `src/game/dev.test.ts`:

```ts
import { DECK_CAP } from '../data/deck'
import { standardCard, withDeck } from './fixtures'
```

```ts
function filler(size: number): Card[] {
  return Array.from({ length: size }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
}
```

(Add `import type { Card, GameState } from './types'` — replace the existing `import type { GameState } from './types'` line.)

```ts
describe('devAddCard', () => {
  it('adds a standard Card of the chosen rank and suit', () => {
    const state = base()

    const after = step(state, { kind: 'devAddCard', rank: 7, suit: 'spades' })

    const added = after.deck[after.deck.length - 1]
    expect(added).toEqual({
      id: `card-${state.nextCardId}`,
      kind: 'standard',
      rank: 7,
      suit: 'spades',
    })
    expect(after.nextCardId).toBe(state.nextCardId + 1)
  })

  it('adds a Joker when no rank is given', () => {
    const state = base()

    const after = step(state, { kind: 'devAddCard' })

    const added = after.deck[after.deck.length - 1]
    expect(added).toEqual({ id: `card-${state.nextCardId}`, kind: 'joker' })
  })

  it('is refused for a standard Card without a suit', () => {
    const state = base()

    expect(step(state, { kind: 'devAddCard', rank: 5 })).toBe(state)
  })

  it('is refused for a Joker with a suit', () => {
    const state = base()

    expect(step(state, { kind: 'devAddCard', suit: 'hearts' })).toBe(state)
  })

  it('breaks the deck cap deliberately', () => {
    const state = withDeck(filler(DECK_CAP), base())

    const after = step(state, { kind: 'devAddCard', rank: 10, suit: 'clubs' })

    expect(after.deck).toHaveLength(DECK_CAP + 1)
  })

  it('numbers cards on nextCardId, never nextEntityId', () => {
    const state: GameState = { ...base(), nextEntityId: 5 }

    const after = step(state, { kind: 'devAddCard', rank: 3, suit: 'hearts' })

    expect(after.nextCardId).toBe(state.nextCardId + 1)
    expect(after.nextEntityId).toBe(5)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devAddCard', rank: 3, suit: 'hearts' })

    expect(after.rng).toBe(state.rng)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: FAIL — `step` returns `undefined` for the new kind.

- [ ] **Step 3: Implement the function and wire the case**

In `src/game/dev.ts`, replace the type import from Task 3 with one that adds the Card types:

```ts
import type { Card, CardRank, GameState, Piece, PieceTier, PieceTypeId, Square, Suit } from './types'
```

```ts
export function devAddCard(
  state: GameState,
  rank: CardRank | undefined,
  suit: Suit | undefined,
): GameState {
  // A standard Card needs a suit and a Joker must not carry one — the same
  // either-or validation buyPack uses, so a mistaken command is refused rather
  // than silently coerced.
  if (rank !== undefined && suit === undefined) return state
  if (rank === undefined && suit !== undefined) return state

  const card: Card =
    rank === undefined
      ? { id: `card-${state.nextCardId}`, kind: 'joker' }
      : { id: `card-${state.nextCardId}`, kind: 'standard', rank, suit }

  // nextCardId, never nextEntityId: the entity counter's parity drives Piece
  // handedness and must not move on a card deal. The deck cap is deliberately
  // bypassed — the picker is the point of dev mode.
  return {
    ...state,
    deck: [...state.deck, card],
    nextCardId: state.nextCardId + 1,
  }
}
```

In `src/game/step.ts`, extend the import and add the case:

```ts
  devAddCard,
```

(Add to the existing `import { ... } from './dev'` block, keeping it alphabetical.)

```ts
    case 'devAddCard':
      return devAddCard(state, command.rank, command.suit)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/dev.test.ts`
Expected: PASS (36 tests).

- [ ] **Step 5: Verify typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/dev.ts src/game/dev.test.ts src/game/types.ts src/game/step.ts
git commit -m "feat(engine): devAddCard dev command"
```

---

### Task 6: The developer panel UI

**Files:**
- Modify: `src/state/uiStore.ts`, `src/ui/Hud.tsx`, `src/index.css`
- Create: `src/ui/DevPanel.tsx`

**Interfaces:**
- Consumes: all eight dev commands via `dispatch` from `../state/store`; `resetRun` from `./cardActions`; `useGameStore` snapshot for `board`, `roundNumber`, `phase`, `core`, `towers`, `deck`, `ink`.
- Produces: `devPanelOpen` / `setDevPanelOpen` on the ui store; a `<DevPanel />` mounted in `Hud.tsx`; the `.dev-panel*` CSS classes.
- Uses: `ALL_CARD_RANKS`, `SUITS` from `../data/cards`; `PIECE_TYPES` from `../data/pieceTypes`; `TIERS` from `../data/tiers`; `DECK_CAP` from `../data/deck`; `stagingRank` and the `CardRank` / `PieceTypeId` / `PieceTier` / `Suit` types from `../game`.

- [ ] **Step 1: Add the view-state to the ui store**

In `src/state/uiStore.ts`, add to the `UiStore` interface (after `creditsOpen`):

```ts
  /**
   * Whether the developer panel is open.
   *
   * Purely view state. The panel itself is compiled out of production builds
   * (`import.meta.env.DEV` in `src/ui/DevPanel.tsx`), so this flag only ever
   * exists in development.
   */
  devPanelOpen: boolean
  setDevPanelOpen: (open: boolean) => void
```

And to the store:

```ts
  devPanelOpen: false,
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
```

- [ ] **Step 2: Create `src/ui/DevPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { ALL_CARD_RANKS, SUITS } from '../data/cards'
import { DECK_CAP } from '../data/deck'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TIERS } from '../data/tiers'
import { stagingRank } from '../game'
import type { CardRank, PieceTier, PieceTypeId, Suit } from '../game'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { resetRun } from './cardActions'

const PIECE_IDS = Object.keys(PIECE_TYPES) as PieceTypeId[]
const TIER_IDS = Object.keys(TIERS) as PieceTier[]

/**
 * The developer panel: round selection, an any-card picker, a Piece spawner,
 * and Ink/Core/board/tower utilities for testing every mechanic (issue #60).
 *
 * Deliberately NOT a modal — the player must keep clicking the board (to place
 * towers) while it is open. Form state is local and never touches the
 * simulation; each control dispatches one dev command through the normal
 * surface. The whole component is guarded by `import.meta.env.DEV`, which Vite
 * statically replaces, so it — and the hotkey listener — are dead-code
 * eliminated from the production bundle. There is no engine-side gate.
 */
export function DevPanel() {
  const open = useUiStore((store) => store.devPanelOpen)
  const setOpen = useUiStore((store) => store.setDevPanelOpen)
  const snapshot = useGameStore((store) => store.snapshot)
  const { board, roundNumber, phase, core, towers, deck, ink } = snapshot

  const [roundInput, setRoundInput] = useState(String(roundNumber))
  const [cardRank, setCardRank] = useState<CardRank | ''>('')
  const [cardSuit, setCardSuit] = useState<Suit>('hearts')
  const [pieceType, setPieceType] = useState<PieceTypeId>('pawn')
  const [pieceTier, setPieceTier] = useState<PieceTier>('green')
  const [fileInput, setFileInput] = useState('0')
  const [rankInput, setRankInput] = useState('0')
  const [inkInput, setInkInput] = useState('100')
  const [coreHealthInput, setCoreHealthInput] = useState(String(core.health))
  const [coreMaxInput, setCoreMaxInput] = useState(String(core.maxHealth))
  const [growInput, setGrowInput] = useState('1')

  // Backquote toggles the panel. The listener is a plain event handler — no
  // setState in an effect — and it ships nowhere because the guard below
  // strips this component from production builds.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '`') return
      event.preventDefault()
      useUiStore.getState().setDevPanelOpen(!useUiStore.getState().devPanelOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!import.meta.env.DEV) return null

  if (!open) {
    return (
      <button type="button" className="dev-panel__toggle" onClick={() => setOpen(true)}>
        Dev
      </button>
    )
  }

  const maxFile = board.files - 1
  const maxRank = stagingRank(board)

  return (
    <div className="dev-panel" role="dialog" aria-label="Developer tools">
      <div className="dev-panel__head">
        <span className="hud__label">Developer tools</span>
        <button type="button" className="dev-panel__close" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Round</h2>
        <div className="dev-panel__row">
          <label>
            Round number
            <input
              type="number"
              min={1}
              value={roundInput}
              disabled={phase !== 'gap'}
              onChange={(event) => setRoundInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap'}
            onClick={() => dispatch({ kind: 'devSetRound', roundNumber: Number(roundInput) })}
          >
            Set round
          </button>
        </div>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Deck</h2>
        <div className="dev-panel__row">
          <select
            value={cardRank}
            onChange={(event) =>
              setCardRank(event.target.value === '' ? '' : (event.target.value as CardRank))
            }
          >
            <option value="">Joker</option>
            {ALL_CARD_RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </select>
          <select
            value={cardSuit}
            disabled={cardRank === ''}
            onChange={(event) => setCardSuit(event.target.value as Suit)}
          >
            {SUITS.map((suit) => (
              <option key={suit} value={suit}>
                {suit}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="hud__button"
            onClick={() =>
              dispatch(
                cardRank === ''
                  ? { kind: 'devAddCard' }
                  : { kind: 'devAddCard', rank: cardRank, suit: cardSuit },
              )
            }
          >
            Add card
          </button>
        </div>
        <p className="hud__hint">{deck.length} / {DECK_CAP} cards — the picker ignores the cap.</p>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Pieces</h2>
        <div className="dev-panel__row">
          <select
            value={pieceType}
            onChange={(event) => setPieceType(event.target.value as PieceTypeId)}
          >
            {PIECE_IDS.map((typeId) => (
              <option key={typeId} value={typeId}>
                {PIECE_TYPES[typeId].label}
              </option>
            ))}
          </select>
          <select
            value={pieceTier}
            onChange={(event) => setPieceTier(event.target.value as PieceTier)}
          >
            {TIER_IDS.map((tier) => (
              <option key={tier} value={tier}>
                {TIERS[tier].label}
              </option>
            ))}
          </select>
          <label>
            File
            <input
              type="number"
              min={0}
              max={maxFile}
              value={fileInput}
              onChange={(event) => setFileInput(event.target.value)}
            />
          </label>
          <label>
            Rank
            <input
              type="number"
              min={0}
              max={maxRank}
              value={rankInput}
              onChange={(event) => setRankInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() =>
              dispatch({
                kind: 'devSpawnPiece',
                typeId: pieceType,
                tier: pieceTier,
                square: { file: Number(fileInput), rank: Number(rankInput) },
              })
            }
          >
            Spawn
          </button>
        </div>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Economy</h2>
        <div className="dev-panel__row">
          <label>
            Ink
            <input
              type="number"
              min={1}
              value={inkInput}
              onChange={(event) => setInkInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() => dispatch({ kind: 'devAddInk', amount: Number(inkInput) })}
          >
            Add ink
          </button>
        </div>
        <p className="hud__hint">{ink} ink available.</p>
        <div className="dev-panel__row">
          <label>
            Core health
            <input
              type="number"
              min={1}
              value={coreHealthInput}
              onChange={(event) => setCoreHealthInput(event.target.value)}
            />
          </label>
          <label>
            Core max
            <input
              type="number"
              min={1}
              value={coreMaxInput}
              onChange={(event) => setCoreMaxInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() =>
              dispatch({
                kind: 'devSetCoreHealth',
                health: Number(coreHealthInput),
                maxHealth: Number(coreMaxInput),
              })
            }
          >
            Set core
          </button>
        </div>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Board</h2>
        <div className="dev-panel__row">
          <label>
            +ranks
            <input
              type="number"
              min={1}
              value={growInput}
              onChange={(event) => setGrowInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() => dispatch({ kind: 'devGrowBoard', ranks: Number(growInput) })}
          >
            Grow
          </button>
        </div>
        <p className="hud__hint">
          {board.files}×{board.ranks}
        </p>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Utilities</h2>
        <div className="dev-panel__row">
          <button type="button" className="hud__button" onClick={() => dispatch({ kind: 'devClearPieces' })}>
            Clear pieces
          </button>
          <button type="button" className="hud__button" onClick={() => resetRun()}>
            Reset run
          </button>
        </div>
        <ul className="dev-panel__towers">
          {towers.map((tower) => (
            <li key={tower.id}>
              <span>
                Rank {tower.cardRank} — {tower.square.file},{tower.square.rank}
              </span>
              <button
                type="button"
                className="dev-panel__remove"
                onClick={() => dispatch({ kind: 'devRemoveTower', towerId: tower.id })}
              >
                Remove
              </button>
            </li>
          ))}
          {towers.length > 0 ? (
            <li>
              <button
                type="button"
                className="hud__button"
                onClick={() =>
                  towers.forEach((tower) => dispatch({ kind: 'devRemoveTower', towerId: tower.id }))
                }
              >
                Remove all towers
              </button>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Mount the panel in `Hud.tsx`, before the modals**

In `src/ui/Hud.tsx`, add the import:

```tsx
import { DevPanel } from './DevPanel'
```

And render it first inside the `.hud` div — BEFORE `TowerPanel`/`PackShop`/`Credits` — so the modals' scrims paint over it (there is no `z-index` anywhere in this CSS; DOM order decides stacking):

```tsx
    <div className="hud">
      <DevPanel />
      {isMobile ? <MobileHud /> : <DesktopHud />}
      <TowerPanel />
      <PackShop />
      <Credits />
    </div>
```

- [ ] **Step 4: Add the panel styles to `src/index.css`**

Append at the end of the file:

```css
/* The developer panel: a floating, non-modal console for testing mechanics.
   Compiled out of production builds — the component returns null under
   !import.meta.env.DEV. `.hud` is pointer-events: none, so this re-enables
   them exactly as .hud__panel does. */
.dev-panel {
  position: fixed;
  top: 1rem;
  right: 1rem;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: min(24rem, calc(100% - 2rem));
  max-height: calc(100% - 2rem);
  overflow-y: auto;
  padding: 1rem 1.15rem;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 0.6rem;
  background: rgb(16 20 26 / 92%);
  color: #e8edf4;
}

.dev-panel__toggle {
  position: fixed;
  top: 1rem;
  right: 1rem;
  pointer-events: auto;
  padding: 0.4rem 0.8rem;
  border: 0;
  border-radius: 0.4rem;
  background: #7a4fd1;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.dev-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dev-panel__close {
  border: 0;
  background: none;
  color: #8fa0b5;
  font: inherit;
  cursor: pointer;
}

.dev-panel__section {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgb(255 255 255 / 8%);
}

.dev-panel__title {
  margin: 0;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #8fa0b5;
}

.dev-panel__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.45rem;
}

.dev-panel label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.75rem;
  color: #b9c6d6;
}

.dev-panel input,
.dev-panel select {
  padding: 0.3rem 0.4rem;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 0.3rem;
  background: rgb(255 255 255 / 6%);
  color: #e8edf4;
  font: inherit;
  font-size: 0.8rem;
}

.dev-panel__towers {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
}

.dev-panel__towers li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.dev-panel__remove {
  padding: 0.2rem 0.5rem;
  border: 0;
  border-radius: 0.3rem;
  background: #c1403a;
  color: #fff;
  font: inherit;
  font-size: 0.75rem;
  cursor: pointer;
}
```

- [ ] **Step 5: Verify the build, typecheck, and lint**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. (`build` runs typecheck again and produces the production bundle — the bundle proves the `import.meta.env.DEV` guard compiles.)

- [ ] **Step 6: Run the full suite**

Run: `pnpm test:run && pnpm test:coverage`
Expected: PASS — the whole suite and the engine coverage thresholds (the new `dev.ts` and `dev.test.ts` count toward `src/game/`).

- [ ] **Step 7: Manual smoke check**

Run: `pnpm dev`
Expected: the "Dev" button appears at the top-right; backquote (`` ` ``) toggles the panel. Verify each section dispatches: set a round in the gap and Start round loads it; add a card and it appears in the Deck (over the cap allowed); spawn a Piece and it stands on the chosen square; add ink and the HUD Ink rises; set Core health/max and the HUD Core updates; grow the board and the board extends; remove/clear towers and pieces; reset run restores the opening state.

- [ ] **Step 8: Commit**

```bash
git add src/state/uiStore.ts src/ui/DevPanel.tsx src/ui/Hud.tsx src/index.css
git commit -m "feat(ui): developer panel for issue #60"
```

---

## Self-Review Notes

- **Spec coverage:** every spec requirement maps to a task — the eight commands (Tasks 1–5), the panel + `import.meta.env.DEV` guard + backquote toggle + floating non-modal layout + six sections (Task 6), the no-rng rule (asserted in every command's tests), the `nextEntityId`/`nextCardId` split (Tasks 3 and 5), the gap-only round set (Task 2), the ranks-only growth (Task 2), the deck-cap bypass (Task 5), and the "refuse by identity" rule (each refusal asserts `.toBe(state)`). No `structuralKey` change needed — dev commands only mutate fields already in the key.
- **Placeholder scan:** every step carries real code and an exact expected result; no TBDs.
- **Type consistency:** `devSetRound(state, roundNumber)`, `devGrowBoard(state, ranks)`, `devSpawnPiece(state, typeId, tier, square)`, `devRemoveTower(state, towerId)`, `devClearPieces(state)`, `devAddCard(state, rank, suit)`, `devAddInk(state, amount)`, `devSetCoreHealth(state, health, maxHealth)` are used identically in their step wiring and their tests.
