# Chess Piece Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four piece tiers — green, yellow, red, black — as per-spawn behaviour flags, a tier unlock schedule and shifting weighted mix in round composition, a universal full-damage combat rule (with one pawn-straight-ahead carve-out), and a seeded Black-Piece dodge with a renderer whiff flash.

**Architecture:** `PieceTier` is a new discriminated union on `types.ts`; behaviour lives in a `data/tiers.ts` table mirroring `pieceTypes.ts`. `Spawn` and `Piece` carry `tier` for life, inherited through promotion. Yellow is "born hunting" (a staging-rank carve-out keeps entry onto the board a march). Red detours toward the nearest Tower reachable by its own movement, using the existing cached distance fields seeded at each Tower. Black dodges via a new named `rng.combat` stream, recorded in a `recentDodges` ring so the renderer can flash the whiff. All round-composition remains deterministic — no PRNG.

**Tech Stack:** TypeScript (strict), Vitest, zustand, React Three Fiber. No new dependencies.

## Global Constraints

- `src/game/` must never import React or Three.js (ESLint-enforced). `src/scene/`, `src/ui/`, `src/state/` must import from `src/game/index.ts` only, never from inside `src/game/` (tests exempt).
- `Math.random` must never appear in `src/game/`, `src/data/`, `src/state/`, or `src/scene/` (ESLint-enforced). All randomness comes from `GameState.rng` named streams.
- `nextEntityId`'s parity is load-bearing — never spend it on anything but a Piece or a Tower.
- The Staging rank must stay out of bounds; `isInBounds` is never widened. Damage cannot reach a Piece there; a Joker's Clear must keep reaching it.
- Never add pathfinding: a blocked Piece grinds, it never routes around. Red's tower fields are Tower-blind as geometry (Towers are seeds, never obstacles).
- Tier never changes stats, movement intervals, or Ink rewards.
- No placeholders without a `PLACEHOLDER` label; the tier unlock rounds, reach radius, mix weights, and dodge chance are all placeholder tuning.
- Commit after every task; run `pnpm test:run`, `pnpm lint`, and `pnpm typecheck` before each commit.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/types.ts` | `PieceTier`, `TierDef`, `DodgeRecord`; `tier` on `Spawn`/`Piece`; `recentDodges` and `rng.combat` on `GameState` |
| `src/data/tiers.ts` (new) | The tier table: flags per tier. `tierDef(id)` accessor. |
| `src/data/tiers.test.ts` (new) | Tier table shape tests |
| `src/data/rounds.ts` | `TIER_INTRODUCED_AT`, shifting `tierWeight`, `tierPoolFor`; `roundSpec` assigns `tier` per spawn |
| `src/game/movement.ts` | `MoveRequest.tier`; effective-hunting staging carve-out (yellow); `huntByOffsets` (renamed `huntCore`, blocker-before-target); `huntByField` gains `stampHunting`; red `seekTower`/`nearestTower`/`towerField` |
| `src/game/tick.ts` | Spawn/promotion tier propagation; conditional attack multiplier; `DODGE_RING_SIZE`, `appendDodges`; `fireTowers` dodge rolls; rng threading |
| `src/game/state.ts` | `rng.combat` stream; empty `recentDodges` |
| `src/game/fixtures.ts` | `pieceAt` defaults `tier: 'green'` |
| `src/game/index.ts` | Export `PieceTier`, `TierDef`, `DodgeRecord` types |
| `src/game/tierMovement.test.ts` (new) | Yellow and red movement behaviour |
| `src/game/combat.test.ts` (new) | Universal full-damage rule |
| `src/game/dodge.test.ts` (new) | Black dodge behaviour |
| `src/scene/tierColours.ts` (new) | Tier marker colours (green excluded) |
| `src/scene/tierColours.test.ts` (new) | Disjointness from piece/rank/buff-ring colours |
| `src/scene/pieceColours.ts` | Export `BUFF_RING_COLOUR` |
| `src/scene/whiff.ts` (new) | `whiffAgeMs`, `whiffScale`, `WhiffTracker` |
| `src/scene/whiff.test.ts` (new) | Whiff flash logic |
| `src/scene/Pieces.tsx` | Tier ring at the base; whiff scale pulse in `useFrame` |
| `docs/design/game-design.md` | Universal rule, red field carve-out, Tiers section, open-question row |
| `CLAUDE.md` | Updated invariants + "what exists" bullet |

---

### Task 1: The tier type and data table

**Files:**
- Modify: `src/game/types.ts` (append after the `PieceTypeDef` interface, ~line 55)
- Create: `src/data/tiers.ts`
- Create: `src/data/tiers.test.ts`
- Modify: `src/game/index.ts:19-40` (type exports)

**Interfaces:**
- Produces: `export type PieceTier = 'green' | 'yellow' | 'red' | 'black'`; `export interface TierDef { id: PieceTier; label: string; huntsFromSpawn: boolean; seeksTowers: boolean; dodgeChance: number; reachInMoves: number }`; `export const TIERS: Record<PieceTier, TierDef>`; `export function tierDef(id: PieceTier): TierDef`. All later tasks rely on these.

- [ ] **Step 1: Write the failing test**

Create `src/data/tiers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TIERS, tierDef } from './tiers'
import type { PieceTier } from '../game/types'

describe('piece tiers', () => {
  it('green is the all-false baseline', () => {
    expect(TIERS.green.huntsFromSpawn).toBe(false)
    expect(TIERS.green.seeksTowers).toBe(false)
    expect(TIERS.green.dodgeChance).toBe(0)
  })

  it('has exactly the four tiers', () => {
    expect(Object.keys(TIERS).sort()).toEqual(['black', 'green', 'red', 'yellow'])
  })

  it('gives every tier a label', () => {
    for (const tier of Object.values(TIERS)) expect(tier.label.length).toBeGreaterThan(0)
  })

  it('only red seeks Towers and only black dodges', () => {
    expect(TIERS.red.seeksTowers).toBe(true)
    expect(TIERS.black.dodgeChance).toBeGreaterThan(0)
    for (const [id, def] of Object.entries(TIERS)) {
      if (id !== 'red') expect(def.seeksTowers).toBe(false)
      if (id !== 'black') expect(def.dodgeChance).toBe(0)
    }
  })

  it('yellow hunts from spawn', () => {
    expect(TIERS.yellow.huntsFromSpawn).toBe(true)
  })

  it('tierDef is a lookup, not a copy', () => {
    expect(tierDef('black')).toBe(TIERS.black)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/data/tiers.test.ts`
Expected: FAIL — module `./tiers` not found.

- [ ] **Step 3: Add the types**

In `src/game/types.ts`, after the `PieceTypeDef` interface (line 55), add:

```ts
/** The four difficulty tiers a spawn can be assigned. Green is the baseline. */
export type PieceTier = 'green' | 'yellow' | 'red' | 'black'

export interface TierDef {
  readonly id: PieceTier
  readonly label: string
  /**
   * Whether the Piece hunts the Core from its first on-board hop. Yellow.
   * Pawns never read it — they promote — so a yellow Pawn marches and the
   * promoted Queen inherits the flag.
   */
  readonly huntsFromSpawn: boolean
  /** Whether the Piece detours to attack Towers within reach. Red only. */
  readonly seeksTowers: boolean
  /** Chance in [0, 1) a Tower shot at this Piece is negated. 0 = never. */
  readonly dodgeChance: number
  /**
   * How many moves away a red Piece considers a Tower worth seeking.
   * PLACEHOLDER tuning. 0 for every non-red tier (never read).
   */
  readonly reachInMoves: number
}
```

- [ ] **Step 4: Create the data table**

Create `src/data/tiers.ts`:

```ts
import type { PieceTier, TierDef } from '../game/types'

/**
 * The four piece tiers. A tier is a small set of behaviour flags; it never
 * touches a Piece's type, stats, or Ink reward. Green is exactly today's
 * logic. The reach radius and the 50% dodge are PLACEHOLDER tuning, not design.
 */
export const TIERS: Record<PieceTier, TierDef> = {
  green: { id: 'green', label: 'Green', huntsFromSpawn: false, seeksTowers: false, dodgeChance: 0, reachInMoves: 0 },
  yellow: { id: 'yellow', label: 'Yellow', huntsFromSpawn: true, seeksTowers: false, dodgeChance: 0, reachInMoves: 0 },
  red: { id: 'red', label: 'Red', huntsFromSpawn: false, seeksTowers: true, dodgeChance: 0, reachInMoves: 6 },
  black: { id: 'black', label: 'Black', huntsFromSpawn: false, seeksTowers: false, dodgeChance: 0.5, reachInMoves: 0 },
}

export function tierDef(id: PieceTier): TierDef {
  return TIERS[id]
}
```

- [ ] **Step 5: Export the types**

In `src/game/index.ts`, add to the type-export block:

```ts
  DodgeRecord,
  PieceTier,
  TierDef,
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run src/data/tiers.test.ts`
Expected: PASS (5 tests). Then `pnpm lint` and `pnpm typecheck` — both clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/data/tiers.ts src/data/tiers.test.ts src/game/index.ts
git commit -m "feat(tiers): add PieceTier type and tier data table"
```

---

### Task 2: Spawn tier and the round-composition ramp

**Files:**
- Modify: `src/game/types.ts:243-248` (`Spawn` gains `tier`)
- Modify: `src/data/rounds.ts`
- Modify: `src/data/rounds.test.ts`
- Modify: `src/game/staging.test.ts` (6 Spawn literals: lines 144, 173, 290, 326, 360, 474 — grep for `pendingSpawns:` to be safe)
- Modify: `src/game/faceCards.test.ts:299`

**Interfaces:**
- Consumes: `PieceTier` (Task 1).
- Produces: `export const TIER_INTRODUCED_AT: Record<PieceTier, number>`; `roundSpec` spawns now carry `tier: PieceTier`. `Spawn` gains `readonly tier: PieceTier`. Later tasks read `spawn.tier`.

- [ ] **Step 1: Write the failing tests**

Add to `src/data/rounds.test.ts` (append a new describe block):

```ts
import type { PieceTier } from '../game/types'

function tiersIn(roundNumber: number): Set<PieceTier> {
  return new Set(roundSpec(roundNumber).spawns.map((spawn) => spawn.tier))
}

describe('tier composition', () => {
  it('sends only green in the opening rounds', () => {
    expect(tiersIn(1)).toEqual(new Set(['green']))
  })

  it('never sends a tier before the round it is introduced', () => {
    for (let roundNumber = 1; roundNumber <= 14; roundNumber += 1) {
      for (const tier of tiersIn(roundNumber)) {
        expect(roundNumber).toBeGreaterThanOrEqual(TIER_INTRODUCED_AT[tier])
      }
    }
  })

  it('actually sends a newly unlocked tier in its unlock round', () => {
    for (const [tier, roundNumber] of Object.entries(TIER_INTRODUCED_AT)) {
      expect(tiersIn(Number(roundNumber))).toContain(tier as PieceTier)
    }
  })

  it('stays deterministic — same round, same tiers', () => {
    expect(roundSpec(9).spawns.map((spawn) => spawn.tier)).toEqual(
      roundSpec(9).spawns.map((spawn) => spawn.tier),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/data/rounds.test.ts`
Expected: FAIL — `spawn.tier` is undefined.

- [ ] **Step 3: Give `Spawn` a tier**

In `src/game/types.ts`, in the `Spawn` interface add `readonly tier: PieceTier` after `typeId`.

- [ ] **Step 4: Compose tiers in `rounds.ts`**

Add the imports and tier machinery, and assign a tier per spawn. Full new `rounds.ts` content for the changed parts:

```ts
import type { PieceTier, PieceTypeId, RoundSpec, Spawn } from '../game/types'

export const TIER_INTRODUCED_AT: Record<PieceTier, number> = {
  green: 1,
  yellow: 4, // PLACEHOLDER
  red: 8,    // PLACEHOLDER
  black: 12, // PLACEHOLDER
}

const TIER_ORDER: readonly PieceTier[] = ['green', 'yellow', 'red', 'black']

const TIER_BASE_WEIGHT: Record<PieceTier, number> = {
  green: 4,
  yellow: 3,
  red: 2,
  black: 1,
}

/**
 * A tier's weight in a round. The mix shifts as the run progresses: green
 * recedes from its starting 4 (floored at 1) and every unlocked tier grows
 * from its base. All PLACEHOLDER tuning; the shape — never before the unlock
 * round, always present in it, shifting toward the higher tiers — is design.
 */
function tierWeight(tier: PieceTier, roundNumber: number): number {
  const since = roundNumber - TIER_INTRODUCED_AT[tier]
  if (since < 0) return 0
  if (tier === 'green') return Math.max(1, TIER_BASE_WEIGHT.green - since)
  return TIER_BASE_WEIGHT[tier] + since
}

/**
 * The weighted tier pool for a round, interleaved exactly like `poolFor` so a
 * newly unlocked tier appears in the very round it unlocks.
 */
function tierPoolFor(roundNumber: number): PieceTier[] {
  const passes = Math.max(...TIER_ORDER.map((tier) => tierWeight(tier, roundNumber)))
  const pool: PieceTier[] = []

  for (let pass = 1; pass <= passes; pass += 1) {
    for (const tier of TIER_ORDER) {
      if (tierWeight(tier, roundNumber) >= pass) pool.push(tier)
    }
  }

  return pool
}
```

In `roundSpec`, add `const tierPool = tierPoolFor(roundNumber)` and push `tier: tierPool[i % tierPool.length] as PieceTier` into each spawn. Green is available from round 1 with weight 4, so `tierPool` is never empty.

- [ ] **Step 5: Fix the Spawn literals**

Add `tier: 'green'` to every hand-built `Spawn`:
- `src/game/staging.test.ts` — the 6 `pendingSpawns: [{ atMs: ..., typeId: ..., file: ... }]` literals (grep `pendingSpawns:` — one uses a `typeId` variable).
- `src/game/faceCards.test.ts:299`.

Each becomes `pendingSpawns: [{ atMs: 0, typeId: 'pawn', tier: 'green', file: 3 }]` (keep the site's own values).

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run src/data/rounds.test.ts src/game/staging.test.ts src/game/faceCards.test.ts`
Expected: PASS. Then `pnpm typecheck` and `pnpm lint` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/data/rounds.ts src/data/rounds.test.ts src/game/staging.test.ts src/game/faceCards.test.ts
git commit -m "feat(tiers): compose a tier per spawn with an unlock and ramp schedule"
```

---

### Task 3: `Piece.tier` and propagation through spawn and promotion

**Files:**
- Modify: `src/game/types.ts:88-145` (`Piece` gains `tier`)
- Modify: `src/game/tick.ts` (`drainDueSpawns` ~line 390, `promotedQueens` ~line 98, `movePieces` `promotedFrom` ~line 441)
- Modify: `src/game/fixtures.ts:94-109` (`pieceAt` gains `tier: 'green'`)
- Modify: `src/game/promotion.test.ts` (add an inheritance test; `pawnOn` literal line 22)
- Modify: `src/game/auras.test.ts:19`, `src/game/termination.test.ts:26`, `src/game/tick.test.ts` — three hand-built Piece literals gain `tier: 'green'`: `rookOnBackRank` (~line 38), the local `pieceAt` helper (~line 67), and the hand-built Bishop (~line 288)

**Interfaces:**
- Consumes: `PieceTier`, `tierDef` (Task 1), `Spawn.tier` (Task 2).
- Produces: `Piece.tier: PieceTier`; spawned non-pawn Pieces born with `hunting: tierDef(tier).huntsFromSpawn`; promoted Queens inherit the Pawn's tier. Later tasks read `piece.tier`.

- [ ] **Step 1: Write the failing test**

Add to `src/game/promotion.test.ts` (a new `it` in the existing `describe('pawn promotion', ...)`):

```ts
  it('inherits the Pawn\'s tier through promotion', () => {
    const state = withPawn(0, 0)
    const pawn = state.pieces[0]
    if (!pawn) throw new Error('expected a Pawn')

    const redPawn: GameState = { ...state, pieces: [{ ...pawn, tier: 'red' }] }
    const after = runFor(redPawn, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces[0]?.tier).toBe('red')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/promotion.test.ts`
Expected: FAIL — `after.pieces[0]?.tier` is `undefined`.

- [ ] **Step 3: Add `tier` to `Piece`**

In `src/game/types.ts`, add `readonly tier: PieceTier` to the `Piece` interface (after `typeId`), with a one-line doc: "Set at spawn and inherited through promotion. Behavioural only — never stats or Ink."

- [ ] **Step 4: Propagate through `tick.ts`**

In `drainDueSpawns` (tick.ts ~line 390), set `tier: spawn.tier` on the spawned Piece and change the `hunting` field:

```ts
      // A yellow Piece is born hunting the Core — but never a Pawn, which
      // promotes instead. See `Piece.hunting` in types.ts.
      hunting: tierDef(spawn.tier).huntsFromSpawn && spawn.typeId !== 'pawn',
```

Import `tierDef` at the top of `tick.ts`: `import { tierDef } from '../data/tiers'`.

In `movePieces` (tick.ts ~line 441), change `promotedFrom` from `Square[]` to `{ square: Square; tier: PieceTier }[]` and at the promotion site (~line 506):

```ts
      if (outcome.kind === 'promote') {
        promotedFrom.push({ square, tier: piece.tier })
```

(The `exits.push` and `isPromoted = true` lines stay as they are, still reading the local `square`.)

In `tick.ts`, the `promotedQueens` map (~line 98) becomes:

```ts
  const promotedQueens: Piece[] = moved.promotedFrom.map((entry, index) => ({
    id: `piece-${nextEntityId + index}`,
    typeId: 'queen',
    tier: entry.tier,
    square: entry.square,
    prevSquare: entry.square,
    health: pieceType('queen').maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    // Entity-id parity, same rule as drainDueSpawns, so promoted Queens weave
    // opposite ways from one another too.
    handedness: (nextEntityId + index) % 2 === 0 ? 1 : -1,
    auraCooldownMs: 0,
    buffed: false,
    // A promoted Queen hunts from spawn when her tier says so — a yellow Pawn
    // becomes a yellow Queen that hunts from the moment she appears. She spawns
    // on the board, so the staging-rank carve-out never applies to her.
    hunting: tierDef(entry.tier).huntsFromSpawn,
    // Renderer-facing only. This is the one place it is ever true.
    promoted: true,
  }))
```

Add `PieceTier` to the `import type` list at the top of `tick.ts`.

- [ ] **Step 5: Fix the Piece literals**

Add `tier: 'green'` to each hand-built `Piece`:
- `src/game/fixtures.ts` `pieceAt` (line ~107)
- `src/game/auras.test.ts` `piece` helper (line ~19)
- `src/game/promotion.test.ts` `pawnOn` (line ~22)
- `src/game/termination.test.ts` `pieceOn` (line ~26)
- `src/game/tick.test.ts` — all three hand-built Pieces: `rookOnBackRank` (~line 50), the local `pieceAt` helper (~line 79), and the hand-built Bishop (~line 300)

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run src/game/promotion.test.ts src/game/auras.test.ts src/game/termination.test.ts src/game/tick.test.ts src/game/firing.test.ts`
Expected: PASS (firing.test.ts uses `pieceAt`, which now defaults tier green). Then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/tick.ts src/game/fixtures.ts src/game/promotion.test.ts src/game/auras.test.ts src/game/termination.test.ts src/game/tick.test.ts
git commit -m "feat(tiers): carry tier on Piece through spawn and promotion"
```

---

### Task 4: `MoveRequest.tier` and yellow — hunt from spawn, march the entry hop

**Files:**
- Modify: `src/game/movement.ts` (`MoveRequest`, `nextMove`, `isStuck`)
- Modify: `src/game/tick.ts` (the `nextMove` call in `movePieces`, ~line 478)
- Modify: `src/game/movement.test.ts:19-27` (`move` helper gains `tier: 'green'`)
- Create: `src/game/tierMovement.test.ts`

**Interfaces:**
- Consumes: `Piece.tier` (Task 3), `PieceTier`.
- Produces: `MoveRequest.tier: PieceTier`; `nextMove` treats a non-Pawn yellow request as hunting — EXCEPT from the Staging rank, where it marches its entry hop.

- [ ] **Step 1: Write the failing tests**

Create `src/game/tierMovement.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BOARD, CORE_SQUARE } from '../data/board'
import { nextMove } from './movement'
import type { MoveRequest } from './movement'
import type { PieceTypeId, Square, Tower } from './types'

const NO_TOWERS = new Map<string, Tower>()

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
    hunting: false,
    tier: 'green',
    ...overrides,
  }
  return nextMove(request, BOARD, CORE_SQUARE, towers)
}

describe('yellow — hunts from spawn', () => {
  it('a yellow Knight hunts from its first on-board hop', () => {
    const from = { file: 5, rank: 6 }
    const yellow = move('knight', from, NO_TOWERS, { hunting: true, tier: 'yellow' })
    const alreadyHunting = move('knight', from, NO_TOWERS, { hunting: true, tier: 'green' })

    expect(yellow).toEqual(alreadyHunting)
  })

  it('a yellow Knight on the Staging rank marches its entry hop', () => {
    // rank `BOARD.ranks` is off the board — the Staging rank. No distance field
    // has an entry there, so hunting must not engage until the Piece is on it.
    const from = { file: 3, rank: BOARD.ranks }
    const yellow = move('knight', from, NO_TOWERS, { hunting: true, tier: 'yellow' })
    const green = move('knight', from, NO_TOWERS, { hunting: false, tier: 'green' })

    expect(yellow).toEqual(green)
  })

  it('a yellow Pawn still marches, because Pawns never hunt', () => {
    const from = { file: 3, rank: 5 }
    const yellow = move('pawn', from, NO_TOWERS, { hunting: true, tier: 'yellow' })
    const green = move('pawn', from, NO_TOWERS, { hunting: false, tier: 'green' })

    expect(yellow).toEqual(green)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/tierMovement.test.ts`
Expected: FAIL — the yellow Knight test: a non-hunting march differs from a hunt, so `yellow !== alreadyHunting` (because `request.tier` is currently ignored and `hunting: true` already produces the hunt for BOTH — actually this test may pass for the wrong reason). To make the failure real, first confirm the Staging-rank test fails: `move('knight', { file: 3, rank: 8 }, NO_TOWERS, { hunting: true, tier: 'green' })` returns `stuck` (no field entry), so `yellow` (currently `stuck`) ≠ `green` (a march). That test failing is the signal.

- [ ] **Step 3: Add `tier` to `MoveRequest` and wire the carve-out**

In `src/game/movement.ts`:

- Add to the `MoveRequest` interface: `readonly tier: PieceTier` (import `PieceTier` in the type import at line 13).
- In `nextMove`, compute effective hunting once, then branch on tier:

```ts
export function nextMove(
  request: MoveRequest,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  // A Piece on the Staging rank is still entering the board. Hunting fields
  // have no entry off-board, so a yellow Piece born `hunting: true` must
  // march its first hop — hunting engages the moment it is on the board.
  // This is the one carve-out that lets yellow exist at all; see the
  // chess-tiers spec.
  const hunting = request.hunting && isInBounds(board, request.from)

  switch (request.typeId) {
    case 'pawn':
      return pawnMove(request.from, board, coreSquare, towerBySquare)
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

Replace every other `request.hunting` reference in the switch with the local `hunting` (bishop line 434, knight call argument line 474, queen line 484, king line 507). `knightMove` receives the local `hunting`.

- In `isStuck`, add `tier: piece.tier` to the request literal.

- [ ] **Step 4: Pass tier at the call site**

In `src/game/tick.ts` `movePieces`, the `nextMove` call (~line 478) gains `tier: piece.tier` in the request object.

- [ ] **Step 5: Fix the movement.test.ts helper**

In `src/game/movement.test.ts` `move` helper, add `tier: 'green',` before `...overrides`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run src/game/tierMovement.test.ts src/game/movement.test.ts src/game/staging.test.ts`
Expected: PASS. Then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add src/game/movement.ts src/game/tick.ts src/game/movement.test.ts src/game/tierMovement.test.ts
git commit -m "feat(tiers): yellow hunts from spawn, with the Staging-rank entry hop as a march"
```

---

### Task 5: The universal combat rule — full damage except a Pawn blocked straight ahead

**Files:**
- Modify: `src/game/tick.ts` (`movePieces` attack handling, ~line 490)
- Modify: `src/data/pieceTypes.ts` (comments at lines 7-8 and 23-31)
- Modify: `src/game/towerAuras.test.ts:316` (the Rook's per-attack damage becomes full)
- Create: `src/game/combat.test.ts`

**Interfaces:**
- Produces: non-Pawn Pieces blocked by a Tower deal FULL `attackDamage`; Pawns blocked straight ahead still deal `attackDamage * BLOCKED_ATTACK_MULTIPLIER`. `BLOCKED_ATTACK_MULTIPLIER` keeps its name and value (0.5).

- [ ] **Step 1: Write the failing tests**

Create `src/game/combat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BLOCKED_ATTACK_MULTIPLIER, PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTower, liveRound, pieceAt, withTower } from './fixtures'
import { tick } from './index'
import type { GameState } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('the universal combat rule', () => {
  it('a Rook blocked by a Tower ahead deals full damage', () => {
    // Rook on the Tower's file, one square up — its next hop lands on the Tower.
    const state = liveRound(withTower(5, { file: 3, rank: 4 }), [
      pieceAt('rook', 'grinder', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, PIECE_TYPES.rook.moveIntervalMs + DT)

    expect(firstTower(after).health).toBe(
      TOWER_RANKS[5].maxHealth - PIECE_TYPES.rook.attackDamage,
    )
  })

  it('a Knight blocked on an L-square deals full damage', () => {
    // The Knight's zig-zag hop from (2,5) lands on (3,3); a Tower there blocks it.
    const state = liveRound(withTower(5, { file: 3, rank: 3 }), [
      pieceAt('knight', 'hopper', { file: 2, rank: 5 }),
    ])

    const after = runFor(state, PIECE_TYPES.knight.moveIntervalMs + DT)

    expect(firstTower(after).health).toBe(
      TOWER_RANKS[5].maxHealth - PIECE_TYPES.knight.attackDamage,
    )
  })

  it('a Pawn blocked straight ahead still deals half damage', () => {
    const state = liveRound(withTower(5, { file: 3, rank: 4 }), [
      pieceAt('pawn', 'grinder', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(firstTower(after).health).toBe(
      TOWER_RANKS[5].maxHealth -
        PIECE_TYPES.pawn.attackDamage * BLOCKED_ATTACK_MULTIPLIER,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/combat.test.ts`
Expected: FAIL — the Rook test: `firstTower(after).health` equals `maxHealth - 2` (half) instead of `maxHealth - 4` (full).

- [ ] **Step 3: Implement the conditional multiplier**

In `src/game/tick.ts` `movePieces`, at the `outcome.kind === 'attackTower'` branch (~line 490), replace the damage accumulation:

```ts
      if (outcome.kind === 'attackTower') {
        // Universal combat rule: any Piece deals FULL damage to a Tower that
        // stands on one of its attack tiles — the squares it could capture
        // onto. A Pawn's attack tiles are its forward diagonals, so a Pawn
        // blocked STRAIGHT ahead is the one case where the blocker is not on
        // an attack tile — genuinely stuck territory — and the only one that
        // still pays BLOCKED_ATTACK_MULTIPLIER. See the chess-tiers spec.
        const multiplier = piece.typeId === 'pawn' ? BLOCKED_ATTACK_MULTIPLIER : 1
        towerDamage.set(
          outcome.towerId,
          (towerDamage.get(outcome.towerId) ?? 0) + attackDamage * multiplier,
        )
```

- [ ] **Step 4: Update the Rook case in towerAuras.test.ts**

At line 316, the two-Freezer stacking test's `perAttackDamage` becomes full:

```ts
    const perAttackDamage = PIECE_TYPES.rook.attackDamage
```

And update the comment above it (line ~311-315) to note the Rook now deals full damage under the universal rule; the two-attack arithmetic is unchanged (2 attacks × 4 = 8, far under the Wall's 45 health, so the Wall survives and the attack count still reads from health lost).

- [ ] **Step 5: Update the `pieceTypes.ts` comments**

- Lines 7-8: replace "There is no designated Tower-hunter." with "The universal combat rule: a blocked Piece attacks at full `attackDamage`, except a Pawn blocked straight ahead."
- Lines 23-31 (`BLOCKED_ATTACK_MULTIPLIER`): reword the doc to say it is now the Pawn-straight-ahead multiplier — "the one case where a Tower blocks a Piece without standing on an attack tile. Every other Piece's blocking Tower sits on an attack tile, so it deals full damage."

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run src/game/combat.test.ts src/game/towerAuras.test.ts src/game/blocking.test.ts src/game/roundTermination.test.ts src/game/tick.test.ts`
Expected: PASS (blocking.test.ts and roundTermination.test.ts only grind with Pawns, whose half damage is preserved). Then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add src/game/tick.ts src/data/pieceTypes.ts src/game/towerAuras.test.ts src/game/combat.test.ts
git commit -m "feat(combat): any Piece deals full damage to a blocking Tower; half survives only for a Pawn blocked straight ahead"
```

---

### Task 6: Red — seek Towers by own movement

**Files:**
- Modify: `src/game/movement.ts` (`huntCore` → `huntByOffsets`, `huntByField` gains `stampHunting`, new `towerField`/`nearestTower`/`seekTower`, `nextMove` red branch)
- Modify: `src/game/tierMovement.test.ts` (add a red describe block)

**Interfaces:**
- Consumes: `MoveRequest.tier` (Task 4), `tierDef` and `TIERS` (Task 1), the per-type distance fields from `distanceFields.ts`.
- Produces: for `tier: 'red'` non-Pawn requests, `nextMove` detours toward the nearest Tower within `tierDef('red').reachInMoves` moves by that type's own movement, using `huntByField`/`huntByOffsets` with `stampHunting: false`; when no Tower is in reach it behaves exactly as green.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/tierMovement.test.ts`:

```ts
import { towersAt } from './fixtures'

describe('red — seeks Towers', () => {
  it('detours toward the nearest Tower within reach', () => {
    // Rook at (5,6). The Tower at (4,4) is 2 rook-moves away; green marches
    // straight down its file to (5,5), red steps left toward the Tower.
    const towers = towersAt({ file: 4, rank: 4 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { tier: 'red' })).toEqual({
      kind: 'move',
      to: { file: 4, rank: 6 },
    })
    expect(move('rook', { file: 5, rank: 6 }, towers, { tier: 'green' })).toEqual({
      kind: 'move',
      to: { file: 5, rank: 5 },
      handedness: 1,
    })
  })

  it('grinds a Tower blocking its line rather than routing around it', () => {
    const towers = towersAt({ file: 5, rank: 5 })

    expect(move('rook', { file: 5, rank: 6 }, towers, { tier: 'red' })).toEqual({
      kind: 'attackTower',
      towerId: 'tower-0',
    })
  })

  it('behaves exactly as green when no Tower is in reach', () => {
    expect(move('rook', { file: 5, rank: 6 }, NO_TOWERS, { tier: 'red' })).toEqual(
      move('rook', { file: 5, rank: 6 }, NO_TOWERS, { tier: 'green' }),
    )
  })

  it('ignores a Tower its own movement cannot reach', () => {
    // (4,0) is a same-colour square as (3,4); (4,0) vs (3,4): (4+0)%2=0,
    // (3+4)%2=1 — opposite colour, so the Bishop can never reach it. Both
    // sides then behave identically (they both hunt the Core from rank 0).
    const towers = towersAt({ file: 3, rank: 4 })

    expect(move('bishop', { file: 4, rank: 0 }, towers, { tier: 'red' })).toEqual(
      move('bishop', { file: 4, rank: 0 }, towers, { tier: 'green' }),
    )
  })

  it('a red Pawn behaves exactly like a green Pawn', () => {
    expect(move('pawn', { file: 3, rank: 5 }, NO_TOWERS, { tier: 'red' })).toEqual(
      move('pawn', { file: 3, rank: 5 }, NO_TOWERS, { tier: 'green' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/tierMovement.test.ts`
Expected: FAIL — the detour test: red's move equals green's (down the file), because tier is still ignored.

- [ ] **Step 3: Generalise the Knight's hunt into `huntByOffsets`**

Replace `huntCore` (movement.ts lines 230-283) with a version that takes the field, the offsets, and whether to stamp `hunting`:

```ts
/**
 * One hop down a distance field, resolved the way the Knight hunts: the first
 * offset, in the fixed order, whose destination is exactly one move closer to
 * `targetSquare` than `from` is. That "exactly one closer" rule is the whole
 * convergence argument — see the BFS guarantee documented on the old
 * `huntCore`. `stampHunting` controls whether the outcome carries `hunting:
 * true`: true for a real hunt, false for a red Piece's Tower seek, which must
 * not latch the hunt.
 *
 * The blocker check runs BEFORE the target check, matching `huntByField`: a
 * Tower on the destination is attacked, not leaked through. For a core hunt
 * this never fires (nothing can build on the Core); for a red seek the target
 * square IS the Tower, so the blocker check is exactly how red grinds it.
 */
function huntByOffsets(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  offsets: readonly Square[],
  stampHunting: boolean,
): MoveOutcome {
  const ownDistance = field.get(squareKey(from))

  if (ownDistance === undefined) return { kind: 'stuck' }
  if (ownDistance === 0) return { kind: 'reachCore' }

  for (const offset of offsets) {
    const to: Square = { file: from.file + offset.file, rank: from.rank + offset.rank }
    if (!isInBounds(board, to)) continue
    if (field.get(squareKey(to)) !== ownDistance - 1) continue

    const blocker = towerBySquare.get(squareKey(to))
    if (blocker) {
      return stampHunting
        ? { kind: 'attackTower', towerId: blocker.id, hunting: true }
        : { kind: 'attackTower', towerId: blocker.id }
    }

    if (squaresEqual(to, targetSquare)) return { kind: 'reachCore' }

    return stampHunting ? { kind: 'move', to, hunting: true } : { kind: 'move', to }
  }

  return { kind: 'stuck' }
}
```

Update `knightMove`'s final return to:

```ts
  return huntByOffsets(
    from,
    board,
    coreSquare,
    towerBySquare,
    knightDistanceField(board, coreSquare),
    KNIGHT_OFFSETS,
    true,
  )
```

- [ ] **Step 4: Give `huntByField` a `stampHunting` flag**

Change the signature (line 319-327) to add `stampHunting: boolean` as the last parameter. Replace the three `hunting: true` outcome literals with a stamp:

```ts
  const stamp = stampHunting ? { hunting: true as const } : {}
```

and spread it into the three outcome objects: `{ kind: 'attackTower', towerId: blocker.id, ...stamp }`, `{ kind: 'move', to: square, ...stamp }` (two sites — the partial-move at line 355 and the full move at line 363). All five core-hunt callers (rook, bishop, queen, king) gain a trailing `true` argument. (The `squaresEqual(square, from)` partial-move shape keeps its `to: square`.)

- [ ] **Step 5: Add the red machinery**

In `src/game/movement.ts`, add imports `tierDef` from `../data/tiers` and `PieceTier` to the type import. Then:

```ts
/** The distance field a red Piece uses to seek Towers — its own movement. */
function towerField(typeId: PieceTypeId, board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  switch (typeId) {
    case 'knight':
      return knightDistanceField(board, seed)
    case 'rook':
      return rookDistanceField(board, seed)
    case 'bishop':
      return bishopDistanceField(board, seed)
    case 'queen':
      return queenDistanceField(board, seed)
    case 'king':
      return kingDistanceField(board, seed)
    case 'pawn':
      throw new Error('pawns never seek Towers')
  }
}

/**
 * The Tower nearest to `from` under the Piece's own movement, within
 * `reachInMoves`, or undefined. Towers are the SEED of the field, never
 * obstacles in it — no pathfinding. Ties break on the smaller Tower id so the
 * seek is deterministic.
 */
function nearestTower(
  from: Square,
  typeId: PieceTypeId,
  board: BoardSpec,
  towerBySquare: ReadonlyMap<string, Tower>,
  reachInMoves: number,
): Tower | undefined {
  let best: Tower | undefined
  let bestDistance = Infinity

  for (const tower of towerBySquare.values()) {
    const distance = towerField(typeId, board, tower.square).get(squareKey(from))
    if (distance === undefined || distance > reachInMoves) continue
    if (distance < bestDistance || (distance === bestDistance && (best === undefined || tower.id < best.id))) {
      best = tower
      bestDistance = distance
    }
  }

  return best
}

/**
 * A red Piece's move decision: detour toward the nearest reachable Tower.
 * Pawns never seek — their movement has no way to detour — so they fall
 * through to green. When no Tower is in reach, returns undefined and the
 * Piece behaves exactly as green. Red seeks even while hunting: a hunting red
 * Piece detours to a Tower if one is near, and resumes the hunt once it is
 * gone, because these outcomes never stamp `hunting`.
 */
function seekTower(
  request: MoveRequest,
  board: BoardSpec,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome | undefined {
  if (request.typeId === 'pawn') return undefined

  const target = nearestTower(request.from, request.typeId, board, towerBySquare, tierDef('red').reachInMoves)
  if (!target) return undefined

  const field = towerField(request.typeId, board, target.square)
  const maxSteps = request.typeId === 'king' ? 1 : 1 + request.slideBonus

  if (request.typeId === 'knight') {
    return huntByOffsets(request.from, board, target.square, towerBySquare, field, KNIGHT_OFFSETS, false)
  }

  const directions =
    request.typeId === 'rook'
      ? ORTHOGONAL_OFFSETS
      : request.typeId === 'bishop'
        ? DIAGONAL_OFFSETS
        : ROYAL_OFFSETS

  return huntByField(request.from, board, target.square, towerBySquare, field, directions, maxSteps, false)
}
```

In `nextMove`, after the `hunting` const and before the `switch`:

```ts
  if (request.tier === 'red') {
    const detour = seekTower(request, board, towerBySquare)
    if (detour) return detour
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test:run src/game/tierMovement.test.ts src/game/movement.test.ts src/game/termination.test.ts`
Expected: PASS (termination.test.ts exercises every type through full rounds, so red-adjacent regressions surface there). Then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add src/game/movement.ts src/game/tierMovement.test.ts
git commit -m "feat(tiers): red Pieces detour toward the nearest reachable Tower by own movement"
```

---

### Task 7: Black — the seeded dodge

**Files:**
- Modify: `src/game/types.ts` (`DodgeRecord`; `GameState.recentDodges` and `rng.combat`)
- Modify: `src/game/state.ts` (initialise the stream and the ring)
- Modify: `src/game/tick.ts` (`DODGE_RING_SIZE`, `appendDodges`, `fireTowers` rng/dodge, the three main return paths)
- Modify: `src/game/rng.test.ts` (combat stream independence)
- Modify: `src/state/structuralKey.test.ts` (recentDodges adds no publish)
- Create: `src/game/dodge.test.ts`

**Interfaces:**
- Consumes: `Piece.tier` (Task 3), `tierDef` (Task 1), `next`/`Rng` from `./rng`.
- Produces: `interface DodgeRecord { pieceId: string; roundNumber: number; roundElapsedMs: number }`; `GameState.recentDodges: readonly DodgeRecord[]`; `GameState.rng.combat: Rng`; `fireTowers` returns `{ towers, pieces, destroyed, rng, dodged }`. `tick` consumes and returns the advanced `rng.combat`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/dodge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { liveRound, pieceAt, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState, PieceTier } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A rank-3 vertical Tower, one Rook on its file under fire. */
function underFire(tier: PieceTier): GameState {
  const rook = pieceAt('rook', 'dodger', { file: 3, rank: 4 })
  return liveRound(withTower(3, { file: 3, rank: 2 }), [{ ...rook, tier }])
}

// 6 shots at 2 damage = 12, under the Rook's 14 health even for green. The
// Rook marches once, at 1600ms, from (3,4) to (3,3) — still on the tower's
// file, so every shot in the window still lands.
const WINDOW_MS = TOWER_RANKS[3].fireIntervalMs * 6 + DT

describe('the black dodge', () => {
  it('negates shots from a seeded stream, so a black Piece takes less damage than a green twin', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0

    expect(black.recentDodges.length).toBeGreaterThan(0)
    expect(blackHealth).toBeGreaterThan(greenHealth)
  })

  it('records exactly one entry per negated shot, carrying piece id, round, and elapsed time', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0
    const dodged = black.recentDodges.length

    // Each negated shot is one 2-damage hit the green twin still took, so the
    // black Piece's health exceeds the green twin's by damage × dodges.
    expect(blackHealth).toBe(greenHealth + dodged * TOWER_RANKS[3].damage)

    for (const record of black.recentDodges) {
      expect(record.pieceId).toBe('dodger')
      expect(record.roundNumber).toBe(1)
      expect(record.roundElapsedMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('never dodges a non-Black Piece, and records nothing', () => {
    const green = runFor(underFire('green'), WINDOW_MS)

    expect(green.recentDodges).toEqual([])
  })

  it("a Joker's Clear still destroys a Black Piece, and rolls nothing", () => {
    const state = { ...underFire('black'), deck: [{ id: 'joker', kind: 'joker' as const }] }
    const cleared = step(state, { kind: 'clearPieces', cardId: 'joker' })

    expect(cleared.pieces).toHaveLength(0)
    expect(cleared.recentDodges).toEqual([])
  })

  it('is deterministic — same seed, same dodges', () => {
    expect(runFor(underFire('black'), WINDOW_MS).recentDodges).toEqual(
      runFor(underFire('black'), WINDOW_MS).recentDodges,
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/game/dodge.test.ts`
Expected: FAIL — `black.recentDodges` is `undefined`.

- [ ] **Step 3: Add the types**

In `src/game/types.ts`:

```ts
/**
 * One negated Tower shot, recorded for the renderer.
 *
 * A dodge changes no field the renderer diffs — a hit is a `damageTaken` rise,
 * a death is an absence, but a negated shot leaves the Piece untouched — so it
 * must be recorded or the whiff can never be shown. Never cleared, capped at
 * `DODGE_RING_SIZE` in `tick.ts` exactly as `recentExits` is.
 */
export interface DodgeRecord {
  readonly pieceId: string
  readonly roundNumber: number
  readonly roundElapsedMs: number
}
```

Add to `GameState`: `readonly recentDodges: readonly DodgeRecord[]` (next to `recentExits`) and `readonly combat: Rng` inside the `rng` object.

- [ ] **Step 4: Initialise in `state.ts`**

```ts
    recentDodges: [],
    ...
    rng: { packs: opening.rng, combat: streamFor(seed, 'combat') },
```

- [ ] **Step 5: Implement the ring and the roll in `tick.ts`**

Add after `EXIT_RING_SIZE`:

```ts
/**
 * How many dodge records `GameState.recentDodges` keeps. Sized like the exit
 * ring: the renderer reads it live each frame, so it only needs to outlast a
 * publish cycle.
 */
export const DODGE_RING_SIZE = 32
```

Add an `appendDodges` mirroring `appendExits`. Change `fireTowers`:

```ts
function fireTowers(
  towers: readonly Tower[],
  pieces: readonly Piece[],
  board: BoardSpec,
  coreSquare: Square,
  dtMs: number,
  combat: Rng,
): {
  towers: Tower[]
  pieces: Piece[]
  destroyed: Piece[]
  rng: Rng
  dodged: string[]
} {
  if (towers.length === 0) {
    return { towers: [...towers], pieces: [...pieces], destroyed: [], rng: combat, dodged: [] }
  }

  const remainingHealth = new Map(pieces.map((piece) => [piece.id, piece.health]))
  const nextTowers: Tower[] = []
  const amplifiers = amplifierIdsByPiece(towers, pieces)
  let combatRng = combat
  const dodged: string[] = []
```

and inside the target loop, before applying damage:

```ts
      for (const target of targets) {
        // A black Piece dodges each incoming shot on a seeded roll. The roll
        // order is deterministic: towers iterate in array order and targets in
        // selectTargets's sorted order. Clear is a board wipe, not damage, so
        // it never reaches this loop and can never be dodged.
        const dodgeChance = tierDef(target.tier).dodgeChance
        if (dodgeChance > 0) {
          const [roll, advanced] = next(combatRng)
          combatRng = advanced
          if (roll < dodgeChance) {
            dodged.push(target.id)
            continue
          }
        }

        const multiplier = amplificationFor(tower.id, target.id, amplifiers)
        remainingHealth.set(
          target.id,
          (remainingHealth.get(target.id) ?? 0) - tower.damage * multiplier,
        )
      }
```

and the final return:

```ts
  return { towers: nextTowers, pieces: survivors, destroyed, rng: combatRng, dodged }
```

Add imports at the top of `tick.ts`: `import { next, type Rng } from './rng'` (extend the existing rng import if any), `import { tierDef } from '../data/tiers'`, and add `DodgeRecord` to the type import.

- [ ] **Step 6: Thread rng and the ring through `tick`**

In `tick`, after the `fired` call (~line 126):

```ts
  const fired = fireTowers(
    standingTowers,
    [...moved.pieces, ...promotedQueens],
    state.board,
    state.core.square,
    dtMs,
    state.rng.combat,
  )

  const dodgeRecords: DodgeRecord[] = fired.dodged.map((pieceId) => ({
    pieceId,
    roundNumber: state.roundNumber,
    roundElapsedMs,
  }))
  const recentDodges = appendDodges(state.recentDodges, dodgeRecords)
```

Every return inside `tick` that runs after `fireTowers` — the `defeated` return (~line 150), the round-completion `gap` return (~line 199), and the live return (~line 218) — gains both:

```ts
      recentDodges,
      rng: { ...state.rng, combat: fired.rng },
```

- [ ] **Step 7: Add the stream-independence and structural-key tests**

In `src/game/rng.test.ts`, add to the `streamFor` describe:

```ts
  it('gives combat its own stream, independent of packs', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).not.toEqual(draw(streamFor('run-a', 'combat'), 8))
  })
```

In `src/state/structuralKey.test.ts`, add:

```ts
  it('ignores recentDodges, which add no publish of their own', () => {
    const base = createInitialState()
    const recorded: GameState = {
      ...base,
      recentDodges: [{ pieceId: 'dodger', roundNumber: 1, roundElapsedMs: 400 }],
    }

    expect(structuralKey(recorded)).toBe(structuralKey(base))
  })
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm test:run src/game/dodge.test.ts src/game/rng.test.ts src/state/structuralKey.test.ts src/game/firing.test.ts src/game/tick.test.ts`
Expected: PASS. Then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 9: Commit**

```bash
git add src/game/types.ts src/game/state.ts src/game/tick.ts src/game/dodge.test.ts src/game/rng.test.ts src/state/structuralKey.test.ts
git commit -m "feat(tiers): black Pieces dodge Tower shots on a seeded combat stream"
```

---

### Task 8: Renderer — the tier ring

**Files:**
- Create: `src/scene/tierColours.ts`
- Create: `src/scene/tierColours.test.ts`
- Modify: `src/scene/pieceColours.ts` (export `BUFF_RING_COLOUR`)
- Modify: `src/scene/Pieces.tsx`

**Interfaces:**
- Consumes: `PieceTier` (Task 1); `piece.tier` on the snapshot.
- Produces: `export const TIER_COLOURS: Record<Exclude<PieceTier, 'green'>, string>`; `export const BUFF_RING_COLOUR`. The piece body keeps its per-type colour; a ring at the base marks the tier (green none); buff ring stacks above tier ring.

- [ ] **Step 1: Write the failing test**

Create `src/scene/tierColours.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BUFF_RING_COLOUR, PIECE_COLOURS } from './pieceColours'
import { RANK_COLOURS } from './rankColours'
import { TIER_COLOURS } from './tierColours'

describe('tier colours', () => {
  it('never collide with a Piece type colour, so the marker reads as a marker', () => {
    const pieceValues = Object.values(PIECE_COLOURS)
    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      expect(pieceValues, `${tier}'s colour ${colour} collides with a Piece colour`).not.toContain(colour)
    }
  })

  it('never collide with a Tower rank colour, so the factions stay readable apart', () => {
    const rankValues = Object.values(RANK_COLOURS)
    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      expect(rankValues, `${tier}'s colour ${colour} collides with a rank colour`).not.toContain(colour)
    }
  })

  it('never collide with the King-buff ring, which sits on the same pieces', () => {
    for (const colour of Object.values(TIER_COLOURS)) expect(colour).not.toBe(BUFF_RING_COLOUR)
  })

  it('marks exactly the three non-green tiers, all distinct', () => {
    expect(Object.keys(TIER_COLOURS).sort()).toEqual(['black', 'red', 'yellow'])
    expect(new Set(Object.values(TIER_COLOURS)).size).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/scene/tierColours.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Export the buff-ring colour**

In `src/scene/pieceColours.ts`, add:

```ts
/** The King-buff ring at a Piece's base. Kept here so tier colours can be tested disjoint from it. */
export const BUFF_RING_COLOUR = '#f1c40f'
```

- [ ] **Step 4: Create the tier colours**

Create `src/scene/tierColours.ts`:

```ts
import type { PieceTier } from '../game'

/**
 * One colour per tier, for the base ring that marks a Piece's tier. Green is
 * the baseline and gets no ring, so it has no colour here.
 *
 * The marker is INTERIM — the issue anticipates real per-tier assets later.
 * Deliberately disjoint from `PIECE_COLOURS`, `RANK_COLOURS`, and the King-buff
 * ring, so the marker never reads as a Piece type, a Tower, or a buff. The
 * buff ring and a tier ring can sit on the same Piece at once; they must read
 * as different things.
 */
export const TIER_COLOURS: Record<Exclude<PieceTier, 'green'>, string> = {
  yellow: '#f4d03f',
  red: '#e74c3c',
  black: '#2c3e50',
}
```

- [ ] **Step 5: Render the ring in `Pieces.tsx`**

In `Pieces.tsx`:

- Import `TIER_COLOURS` and `BUFF_RING_COLOUR`, and `PieceTier` from `'../game'`.
- In `resources`, build per-tier ring materials:

```ts
    const ring = new RingGeometry(0.34, 0.42, 16)
    const ringMaterial = new MeshStandardMaterial({ color: BUFF_RING_COLOUR, emissive: BUFF_RING_COLOUR })
    const tierRingMaterials = new Map<keyof typeof TIER_COLOURS, Material>()
    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      tierRingMaterials.set(tier as keyof typeof TIER_COLOURS, new MeshStandardMaterial({ color: colour, emissive: colour }))
    }
```

  Return `tierRingMaterials` from `resources`, and dispose its materials in the cleanup effect.
- Pass `tier={piece.tier}` to `PieceMesh`, and add a `tier: PieceTier` prop.
- Render the tier ring below the buff ring (the buff ring stays at y `0.02`; the tier ring sits at y `0.01`), mounted only for non-green tiers:

```tsx
      {tier !== 'green' && (
        <mesh
          ref={tierRingRef}
          geometry={ringGeometry}
          material={tierRingMaterials.get(tier)}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        />
      )}
```

- In `useFrame`, add a second ring ref guard. The buff ring keeps its existing visibility rule; the tier ring follows the mesh and stays visible whenever the Piece is alive (it does NOT depend on `phase`, unlike the buff ring):

```ts
    const tierRing = tierRingRef.current
    if (tierRing) {
      tierRing.visible = true
      tierRing.position.set(mesh.position.x, 0.01, mesh.position.z)
    }
```

(`ring.position.set(...)` on the buff ring already sets y `0.02`.)

- [ ] **Step 6: Run tests and checks**

Run: `pnpm test:run src/scene/tierColours.test.ts`
Expected: PASS. Then `pnpm typecheck` and `pnpm lint`. (No component tests exist in this repo; the renderer is deliberately untested — see CLAUDE.md.)

- [ ] **Step 7: Commit**

```bash
git add src/scene/tierColours.ts src/scene/tierColours.test.ts src/scene/pieceColours.ts src/scene/Pieces.tsx
git commit -m "feat(tiers): render a base ring marking each Piece's tier"
```

---

### Task 9: Renderer — the dodge whiff

**Files:**
- Create: `src/scene/whiff.ts`
- Create: `src/scene/whiff.test.ts`
- Modify: `src/scene/Pieces.tsx`

**Interfaces:**
- Consumes: `GameState.recentDodges` (Task 7), `PieceTier`.
- Produces: `export const WHIFF_FLASH_MS`; `interface WhiffTracker`; `createWhiffTracker()`; `whiffAgeMs(tracker, dodges, pieceId, roundNumber, nowMs): number`; `whiffScale(ageMs): number`.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/whiff.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WHIFF_FLASH_MS, createWhiffTracker, whiffAgeMs, whiffScale } from './whiff'
import type { DodgeRecord } from '../game'

const DODGES: readonly DodgeRecord[] = [
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 500 },
  { pieceId: 'b', roundNumber: 1, roundElapsedMs: 600 },
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1200 },
]

describe('whiffAgeMs', () => {
  it('flashes when a new dodge for this Piece appears, and ignores other Pieces', () => {
    const tracker = createWhiffTracker()

    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)).toBe(0)
    // No new dodge for 'a' — the age keeps growing.
    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_400)).toBe(400)
  })

  it('re-arms when a later dodge for this Piece arrives', () => {
    const tracker = createWhiffTracker()

    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)).toBe(0)
    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_500)).toBe(500)
    // A later dodge — a newer record in the ring — re-arms the flash.
    const later: readonly DodgeRecord[] = [
      ...DODGES,
      { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1600 },
    ]
    expect(whiffAgeMs(tracker, later, 'a', 1, 10_800)).toBe(0)
  })

  it('a new round must not re-flash a previous round\'s dodge at the same elapsed time', () => {
    const tracker = createWhiffTracker()

    whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)
    // Round 2 starts at elapsed 0; 'a' has no dodge there yet.
    expect(whiffAgeMs(tracker, DODGES, 'a', 2, 10_000)).toBe(10_000 - 10_000)
  })

  it('a dodge in a fresh round flashes', () => {
    const tracker = createWhiffTracker()
    const round2 = [{ pieceId: 'a', roundNumber: 2, roundElapsedMs: 400 }]

    whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)
    expect(whiffAgeMs(tracker, round2, 'a', 2, 11_000)).toBe(0)
  })
})

describe('whiffScale', () => {
  it('starts at a swell and returns to 1 by the end of the window', () => {
    expect(whiffScale(0)).toBeGreaterThan(1)
    expect(whiffScale(WHIFF_FLASH_MS)).toBe(1)
    expect(whiffScale(WHIFF_FLASH_MS + 1)).toBe(1)
  })

  it('returns 1 when nothing has flashed', () => {
    expect(whiffScale(-1)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/scene/whiff.test.ts`
Expected: FAIL — module `./whiff` not found.

- [ ] **Step 3: Implement the pure module**

Create `src/scene/whiff.ts`:

```ts
import type { DodgeRecord } from '../game'

/**
 * The dodge whiff: a short flash on a Black Piece that just negated a Tower
 * shot. Presentation constants, tunable by feel — nothing in the engine reads
 * them. A dodge moves no field the renderer diffs, so unlike the Tower
 * hit-flash it cannot be diff-driven; it is read live in `useFrame` from
 * `GameState.recentDodges`.
 */
export const WHIFF_FLASH_MS = 220

export interface WhiffTracker {
  lastElapsed: number
  lastRound: number
  flashStartedAtMs: number
}

export function createWhiffTracker(): WhiffTracker {
  return { lastElapsed: -1, lastRound: -1, flashStartedAtMs: -Infinity }
}

/**
 * Advances a Piece's tracker against the dodge ring and returns the flash age
 * in milliseconds. `nowMs` is wall-clock (frame.clock.elapsedTime * 1000); the
 * records carry engine elapsed time, which is monotonic within a round — so a
 * newer `roundElapsedMs` means a newly negated shot. `roundNumber` in the
 * record keeps a previous round's dodge from re-flashing when the next round
 * reaches the same elapsed time. Mutates `tracker` in place; it lives in a ref.
 */
export function whiffAgeMs(
  tracker: WhiffTracker,
  dodges: readonly DodgeRecord[],
  pieceId: string,
  roundNumber: number,
  nowMs: number,
): number {
  let newest = -1
  for (const record of dodges) {
    if (record.pieceId !== pieceId || record.roundNumber !== roundNumber) continue
    if (record.roundElapsedMs > newest) newest = record.roundElapsedMs
  }

  if (roundNumber !== tracker.lastRound) {
    tracker.lastRound = roundNumber
    tracker.lastElapsed = -1
  }

  if (newest > tracker.lastElapsed) {
    tracker.lastElapsed = newest
    tracker.flashStartedAtMs = nowMs
  }

  return nowMs - tracker.flashStartedAtMs
}

/** A scale multiplier: a brief swell on a fresh dodge, 1 otherwise. */
export function whiffScale(ageMs: number): number {
  if (ageMs < 0 || ageMs >= WHIFF_FLASH_MS) return 1
  const progress = ageMs / WHIFF_FLASH_MS
  return 1 + 0.3 * Math.sin(progress * Math.PI)
}
```

- [ ] **Step 4: Wire it into `PieceMesh`**

In `src/scene/Pieces.tsx`:

- Import `createWhiffTracker, whiffAgeMs, whiffScale` from `./whiff`.
- In `PieceMesh`, add a ref: `const whiffTracker = useRef(createWhiffTracker())`.
- In `useFrame`, after computing `scale` (line ~150), fold the whiff into the mesh scale (the body material is shared per type, so emissive is unavailable — scale is the per-mesh channel):

```ts
    const flashAgeMs = whiffAgeMs(
      whiffTracker.current,
      state.recentDodges,
      pieceId,
      state.roundNumber,
      now * 1000,
    )
    const whiff = whiffScale(flashAgeMs)
    mesh.scale.set(scale * whiff, scale * whiff, scale * whiff)
```

- [ ] **Step 5: Run tests and checks**

Run: `pnpm test:run src/scene/whiff.test.ts`
Expected: PASS. Then `pnpm typecheck` and `pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/whiff.ts src/scene/whiff.test.ts src/scene/Pieces.tsx
git commit -m "feat(tiers): flash a whiff when a black Piece dodges a Tower shot"
```

---

### Task 10: Design docs, invariants, and full verification

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`
- Modify: `src/data/pieceTypes.ts` (already partly done in Task 5 — finish the header comment)
- Modify: `src/ui/formatStat.ts:4` (comment now describes a per-Piece value)

**Interfaces:**
- Consumes: everything from Tasks 1-9. No code — documentation only.

- [ ] **Step 1: Update `docs/design/game-design.md`**

1. **Universal combat rule.** Replace the block at lines 345-355 ("No Piece type is a designated Tower-hunter. ... A Piece whose next square holds a Tower does not advance. It attacks that Tower instead, at **half** its attack damage.") with:

   > **The universal combat rule.** Any Piece deals **full** damage to a Tower that stands on one of its **attack tiles** — a square the Piece could capture onto by its chess movement (a Pawn's forward diagonals, a Knight's L-squares, a slider's lines, a King's neighbouring squares). The one carve-out is **a Pawn blocked straight ahead**: its forward square is not an attack tile, so that attack stays at half (`BLOCKED_ATTACK_MULTIPLIER`). This is a deliberate buff to every Piece's Tower-killing power, and it interacts with "Repair versus the wall" — Towers fall faster under the roster now.
   >
   > **There is no pathfinding.** (keep, but add) Red is the only tier that *deliberately seeks* attack positions; the other tiers only ever attack a Tower that happens to block them. The rule itself is universal; the seeking is red's alone.

2. **Red carve-out on the fields.** After the "The fields never see Towers" paragraph (line 310), add:

   > **The red carve-out.** A red Piece's field is still Tower-blind as *geometry* — Towers are never obstacles in it — but red fields are *seeded* at Towers, which is what lets Tower placement attract a red Piece. That is a deliberate inversion of the no-mazing invariant: placing a decoy Tower spends a card and draws aggression toward it.

3. **Hunting + yellow.** In the Hunting section (after line 304), add a sentence: "**Yellow** Pieces are born hunting — a yellow Queen, Knight, or slider seeks the Core from its first hop on the board, marching only the entry hop off the Staging rank, which no field covers."

4. **Tiers section.** Add a new subsection under "The Chess roster" (after "Auras", ~line 335):

   ```markdown
   ### Tiers

   Every spawn is assigned a tier — **green**, **yellow**, **red**, or **black** — a per-Piece set of behaviour flags, never stats or Ink. Any type can be any tier. Green is the baseline; the mix shifts toward the higher tiers as rounds progress (tier unlock rounds and mix weights are placeholder tuning in `src/data/rounds.ts`).

   - **Green — dumb.** Exactly the baseline behaviour.
   - **Yellow — smart.** Hunts the Core from its first on-board hop (Pawns still promote; the Queen they become inherits yellow).
   - **Red — aggressive.** Detours toward the nearest Tower reachable by its own movement (a distance field over its own move set, seeded at each Tower, capped by a placeholder reach radius in `src/data/tiers.ts`), grinds a Tower blocking its line rather than routing around it, and resumes marching once its target falls.
   - **Black — sneaky.** Each Tower shot at it rolls the seeded `rng.combat` stream: a 50% chance the shot is negated (placeholder). A Joker's Clear is a board wipe, not damage, so it is never dodged.
   ```

5. **Open questions.** Add a row to the table at line 385:

   ```markdown
   | **Tier tuning numbers** | The tier unlock rounds, mix weights, red reach radius, and black dodge chance are all placeholders in `src/data/rounds.ts` and `src/data/tiers.ts`. The shapes are settled; the numbers await play experience. |
   ```

6. **Pawn (line 274).** Extend "it attacks that Tower instead of advancing" with "(at half damage — a Pawn's forward square is not one of its attack tiles)".

- [ ] **Step 2: Update `CLAUDE.md` invariants**

- In "Current state → What exists", extend the full-roster bullet with: "**Piece tiers** — green/yellow/red/black per-spawn behaviour flags, a tier unlock schedule and shifting mix in round composition, and a seeded black-Piece dodge." Replace the "Towers block movement, and blocked Pieces attack them at half damage" wording.
- "**Towers block movement, and blocked Pieces attack them at half damage.**" → "**Towers block movement, and the universal combat rule governs the attack.** Any Piece deals full damage to a Tower on one of its attack tiles; a Pawn blocked straight ahead — its forward square is not an attack tile — is the one carve-out still at half."
- "**Pieces are forward-biased and deterministic.**" → add: "Two tiers soften this by design: **yellow** hunts the Core from its first on-board hop, and **red** detours toward the nearest Tower reachable by its own movement. Neither reintroduces goal-seeking toward the Core (yellow already hunts it) and red's tower-fields are Tower-blind as geometry — Towers are seeds, never obstacles."
- "**Every Piece hunts once its forward move would leave the board.**" → add: "**Yellow** Pieces hunt from their first on-board hop instead, and a yellow Pawn's promoted Queen inherits the tier. Red Pieces detour to Towers, overriding the march or hunt at any point."

- [ ] **Step 3: Finish the code comments**

- `src/data/pieceTypes.ts` header (lines 5-13): drop "There is no designated Tower-hunter" and point at the universal combat rule.
- `src/ui/formatStat.ts` line 4: "Engine damage to a Tower is `attackDamage × BLOCKED_ATTACK_MULTIPLIER` for a Pawn blocked straight ahead, and full `attackDamage` for every other blocked Piece — both can be floats."

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test:run && pnpm test:coverage && pnpm build`
Expected: all clean. `test:coverage` keeps the per-directory thresholds green — the new `tiers.ts`, `tierMovement.test.ts`, `combat.test.ts`, `dodge.test.ts`, `whiff.ts`, and `whiff.test.ts` all sit in measured directories and must clear their thresholds.

- [ ] **Step 5: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md src/data/pieceTypes.ts src/ui/formatStat.ts
git commit -m "docs(tiers): record the universal combat rule, the tier system, and the softened invariants"
```

---

## Self-Review

**Spec coverage:**
- Tier table + per-spawn assignment → Tasks 1, 2. ✓
- Yellow hunts from spawn, staging carve-out, pawns promote → Tasks 3, 4. ✓
- Red seeks Towers by own movement, grinds, resumes march → Task 6. ✓
- Black dodge on `rng.combat`, `recentDodges` ring, not a Clear → Task 7. ✓
- Universal combat rule → Task 5. ✓
- Promotion inherits tier → Task 3. ✓
- Ink unchanged → no ink.ts changes (tier never pays). ✓
- Renderer tier ring (interim) → Task 8. Whiff flash → Task 9. ✓
- structuralKey untouched; a test pins `recentDodges` adds no publish → Task 7. ✓
- Design doc + invariants softened consciously → Task 10. ✓

**Placeholder scan:** no TBD/TODO; every code step carries real content. The only "labelled placeholder" strings are balance values marked PLACEHOLDER, as the spec requires.

**Type consistency:** `PieceTier`/`TierDef`/`DodgeRecord` defined in Task 1/7 and used with identical names throughout. `huntByOffsets` and `huntByField(..., stampHunting)` names are consistent from Task 6 onward. `tierDef` accessor is used everywhere a tier's flags are read. `spawn.tier` (Task 2) feeds `drainDueSpawns` (Task 3). `piece.tier` (Task 3) feeds `MoveRequest.tier` (Task 4) and the dodge (Task 7). `rng.combat` is initialised (Task 7) before `tick` consumes it.

**Known accepted simplification:** the red reach cap (6 moves) is non-binding for sliders on an 8x8 board (their fields max out at 2); it binds for Knights (field max 6). A test for the cap's exact boundary is therefore not meaningful yet and is omitted — the "no Tower in reach" fall-through is tested via the empty-board case and the Bishop's own-movement unreachability case.
