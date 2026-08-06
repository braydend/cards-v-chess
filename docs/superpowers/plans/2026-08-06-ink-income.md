# Ink Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Ink currency — earned from Tower kills and round completion, shown in the HUD — without adding anything that spends it.

**Architecture:** A new pure module `src/game/ink.ts` owns every Ink calculation; its balance numbers live in `src/data/`. `tick.ts` and `cardPlays.ts` call it and apply the result, staying plumbing. Ink is an integer field on `GameState`, published to React through `structuralKey` and rendered as one more HUD tile.

**Tech Stack:** TypeScript (strict), Vitest, zustand. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-08-06-ink-income-design.md`](../specs/2026-08-06-ink-income-design.md)
**Issue:** [#9 — add ink](https://github.com/braydend/cards-v-chess/issues/9)

## Global Constraints

- **`src/game/` and `src/data/` must never import React or Three.js.** Enforced by ESLint; a violation fails `pnpm lint` and therefore CI.
- **`Math.random` must never appear in `src/game/` or `src/data/`.** Also ESLint-enforced. Nothing in this plan needs randomness.
- **Ink income must be event-driven — kills and round completion — never time-based.** The gap between rounds is untimed, so time-based income is unbounded.
- **Ink is never spent to play a card.** It buys packs only. Nothing in this plan spends it.
- **Vocabulary is fixed:** "round", never "wave". "Ink", "Piece", "Tower", "Core", "Deck". Use these exactly, in code and UI copy.
- **Balance numbers live in `src/data/`, not in logic.** A balance tweak must never require editing a function.
- **Do not add anything to `structuralKey` that changes every tick.** It would push a React render per frame. Ink is safe: it only moves on a kill or a round completion, both already keyed.
- **Coverage thresholds:** `src/game/**` at 85/85/85/90 (statements/branches/functions/lines), `src/state/**` at 90/95/85/90. `src/ui/` and `src/data/` are excluded from coverage.
- **Tests derive expectations from the data tables** (`PIECE_TYPES.pawn.inkReward`), never hardcoded numbers, so a balance pass does not break unrelated tests.
- **Every task ends green.** Run `pnpm test:run`, `pnpm typecheck`, and `pnpm lint` before committing.

---

### Task 1: Ink balance data and the arithmetic module

Builds the pure calculation layer with nothing wired to it yet. Nothing in this task changes game behaviour — it can be reviewed purely on whether the arithmetic and its numbers are right.

**Files:**
- Modify: `src/game/types.ts` — add `inkReward` to `PieceTypeDef` (interface at line 22)
- Modify: `src/data/pieceTypes.ts` — fill `inkReward` for all six types (table at line 14)
- Create: `src/data/ink.ts`
- Create: `src/game/ink.ts`
- Modify: `src/game/fixtures.ts` — generalise `pawnAt` into `pieceAt`
- Test: `src/game/ink.test.ts` (create)

**Interfaces:**
- Consumes: `PIECE_TYPES` and `pieceType(id)` from `src/data/pieceTypes.ts`; the `Piece` and `PieceTypeId` types from `src/game/types.ts`.
- Produces:
  - `PieceTypeDef.inkReward: number`
  - `ROUND_INCOME_BASE: number`, `ROUND_INCOME_PER_ROUND: number`, `JOKER_CLEAR_SHARE: number` from `src/data/ink.ts`
  - `killReward(piece: Piece): number`
  - `totalKillReward(pieces: readonly Piece[]): number`
  - `roundIncome(roundNumber: number): number`
  - `clearReward(pieces: readonly Piece[]): number`
  - `pieceAt(typeId: PieceTypeId, id: string, square: Square): Piece` from `src/game/fixtures.ts`

**Do NOT export the ink functions from `src/game/index.ts`.** That file is the public surface for the renderer and UI, and neither needs the arithmetic — `tick.ts` and `cardPlays.ts` import from `./ink` directly as same-directory siblings.

- [ ] **Step 1: Add the `inkReward` field to `PieceTypeDef`**

In `src/game/types.ts`, inside the `PieceTypeDef` interface (line 22), after the `slides` field:

```ts
  /**
   * Ink paid when a Tower destroys this Piece.
   *
   * Threat and scarcity, not durability — a Rook has the most health on the
   * roster and is still a wall rather than an event, so it pays less than a
   * Queen. Authored rather than derived from `maxHealth` for exactly that
   * reason, and so that retuning a Piece's durability does not silently
   * retune the economy.
   *
   * PLACEHOLDER balance. Ink's worth is set by what it buys, and packs do not
   * exist yet — see "Ink income values" in the design doc's open questions.
   */
  readonly inkReward: number
```

This breaks the build until Step 2 fills the table. That is expected.

- [ ] **Step 2: Fill in the rewards**

In `src/data/pieceTypes.ts`, replace the six rows of the `PIECE_TYPES` table (line 14 onwards) with:

```ts
  pawn: { id: 'pawn', label: 'Pawn', moveIntervalMs: 900, maxHealth: 3, attackDamage: 2, slides: false, inkReward: 1 },
  knight: { id: 'knight', label: 'Knight', moveIntervalMs: 1100, maxHealth: 4, attackDamage: 2, slides: false, inkReward: 2 },
  bishop: { id: 'bishop', label: 'Bishop', moveIntervalMs: 1000, maxHealth: 5, attackDamage: 1, slides: true, inkReward: 3 },
  rook: { id: 'rook', label: 'Rook', moveIntervalMs: 1600, maxHealth: 14, attackDamage: 4, slides: true, inkReward: 5 },
  queen: { id: 'queen', label: 'Queen', moveIntervalMs: 1000, maxHealth: 9, attackDamage: 5, slides: true, inkReward: 8 },
  king: { id: 'king', label: 'King', moveIntervalMs: 1800, maxHealth: 12, attackDamage: 3, slides: false, inkReward: 10 },
```

- [ ] **Step 3: Create the round-income balance constants**

Create `src/data/ink.ts`:

```ts
/**
 * Ink income balance.
 *
 * Every value here is a PLACEHOLDER. Ink's worth is set by what it buys, and
 * packs do not exist yet, so none of these can be validated until prices do —
 * see "Ink income values" in game-design.md's open questions, which is to be
 * resolved together with "Pack weighting and prices".
 *
 * Kill rewards are not here: they live on `PIECE_TYPES`, beside the rest of a
 * Piece's stats, so a Piece's whole balance profile reads in one place.
 */

/** Paid on every round completion, whatever the round number. */
export const ROUND_INCOME_BASE = 10

/**
 * Added per round completed, so a round pays
 * `ROUND_INCOME_BASE + roundNumber * ROUND_INCOME_PER_ROUND`.
 *
 * Scaling rather than flat because rounds grow — round 11 spawns 13 Pieces —
 * so a fixed payout would shrink in real terms exactly as the pressure rises.
 */
export const ROUND_INCOME_PER_ROUND = 5

/**
 * The share of kill rewards a Joker's Clear pays for what it destroyed.
 *
 * A quarter rather than the full amount. Clear is the safety valve for a
 * repair-versus-the-wall stall, and paying full would make holding a Joker
 * while the board fills the single best way to earn — an income exploit, not
 * an escape hatch.
 */
export const JOKER_CLEAR_SHARE = 0.25
```

- [ ] **Step 4: Generalise the Piece test fixture**

`src/game/fixtures.ts` only builds Pawns, and Task 1's tests need a Queen, a Rook and a King. Replace the `pawnAt` function (lines 51-65) with:

```ts
/**
 * A Piece of any type, placed directly — the spawn pipeline is bypassed, so a
 * test can arrange a Piece the current round would never produce.
 */
export function pieceAt(typeId: PieceTypeId, id: string, square: Square): Piece {
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
    hunting: false,
  }
}

export function pawnAt(id: string, square: Square): Piece {
  return pieceAt('pawn', id, square)
}
```

Then widen the type import on line 11 to include `PieceTypeId`:

```ts
import type {
  BuildableRank,
  Card,
  CardRank,
  GameState,
  Piece,
  PieceTypeId,
  Square,
  Suit,
  Tower,
} from './types'
```

Existing `pawnAt` callers are unaffected — the signature is unchanged.

- [ ] **Step 5: Write the failing tests**

Create `src/game/ink.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { JOKER_CLEAR_SHARE, ROUND_INCOME_BASE, ROUND_INCOME_PER_ROUND } from '../data/ink'
import { PIECE_TYPES } from '../data/pieceTypes'
import { pieceAt } from './fixtures'
import { clearReward, killReward, roundIncome, totalKillReward } from './ink'

const SQUARE = { file: 3, rank: 5 }

function pawns(count: number) {
  return Array.from({ length: count }, (_, i) => pieceAt('pawn', `p${i}`, SQUARE))
}

describe('kill rewards', () => {
  it("pays the Piece type's authored reward", () => {
    expect(killReward(pieceAt('queen', 'q', SQUARE))).toBe(PIECE_TYPES.queen.inkReward)
  })

  it('sums across a mixed set of Pieces', () => {
    const mixed = [
      pieceAt('pawn', 'a', SQUARE),
      pieceAt('rook', 'b', SQUARE),
      pieceAt('king', 'c', SQUARE),
    ]

    expect(totalKillReward(mixed)).toBe(
      PIECE_TYPES.pawn.inkReward + PIECE_TYPES.rook.inkReward + PIECE_TYPES.king.inkReward,
    )
  })

  it('pays nothing for an empty set', () => {
    expect(totalKillReward([])).toBe(0)
  })

  it('pays a Queen more than a Rook, which has more health but is less of an event', () => {
    // Pins the decision to author rewards rather than derive them from
    // maxHealth, which would invert this pair.
    expect(PIECE_TYPES.queen.inkReward).toBeGreaterThan(PIECE_TYPES.rook.inkReward)
  })
})

describe('round income', () => {
  it('pays the base plus one round-scaled share for round 1', () => {
    expect(roundIncome(1)).toBe(ROUND_INCOME_BASE + ROUND_INCOME_PER_ROUND)
  })

  it('pays more for a later round, since rounds grow', () => {
    expect(roundIncome(9) - roundIncome(8)).toBe(ROUND_INCOME_PER_ROUND)
  })
})

describe("a Joker's Clear", () => {
  it('floors the total, not each Piece — a Pawn swarm pays rather than rounding to nothing', () => {
    const swarm = pawns(20)

    // At a quarter share a Pawn is worth a fraction of one Ink, so flooring
    // per Piece would pay ZERO for the whole swarm — nothing for exactly the
    // chaff a Clear is used on. This assertion is the reason the rounding rule
    // is fixed in one place.
    expect(clearReward(swarm)).toBeGreaterThan(0)
    expect(clearReward(swarm)).toBe(Math.floor(totalKillReward(swarm) * JOKER_CLEAR_SHARE))
  })

  it('pays less than killing the same Pieces would', () => {
    const swarm = pawns(20)

    expect(clearReward(swarm)).toBeLessThan(totalKillReward(swarm))
  })

  it('pays nothing for an empty board', () => {
    expect(clearReward([])).toBe(0)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm test:run src/game/ink.test.ts`
Expected: FAIL — `Failed to resolve import "./ink"`, because `src/game/ink.ts` does not exist yet.

- [ ] **Step 7: Write the arithmetic module**

Create `src/game/ink.ts`:

```ts
/**
 * Every Ink calculation, in one pure place.
 *
 * `tick.ts` and `cardPlays.ts` call these and apply the result; neither does
 * the arithmetic itself. Ink is an integer — the player reads it, and a
 * currency shown with decimals is noise — so anything that could produce a
 * fraction floors here rather than at the call site.
 *
 * Income is event-driven by construction: nothing in this file takes a time
 * delta. The gap between rounds is untimed, so time-based income would be
 * unbounded and the player would simply wait.
 */
import { JOKER_CLEAR_SHARE, ROUND_INCOME_BASE, ROUND_INCOME_PER_ROUND } from '../data/ink'
import { pieceType } from '../data/pieceTypes'
import type { Piece } from './types'

/** Ink paid for destroying one Piece. */
export function killReward(piece: Piece): number {
  return pieceType(piece.typeId).inkReward
}

/** Ink paid for destroying all of these Pieces. */
export function totalKillReward(pieces: readonly Piece[]): number {
  return pieces.reduce((total, piece) => total + killReward(piece), 0)
}

/**
 * The lump sum for completing a round.
 *
 * Pass the round just PLAYED, never the one about to start. `tick` increments
 * `roundNumber` in the same branch that pays this, so reading the incremented
 * value is the easiest mistake available here.
 */
export function roundIncome(roundNumber: number): number {
  return ROUND_INCOME_BASE + roundNumber * ROUND_INCOME_PER_ROUND
}

/**
 * Ink paid by a Joker's Clear for the Pieces it destroyed.
 *
 * THE FLOOR APPLIES TO THE TOTAL, NEVER PER PIECE. At a quarter share a Pawn
 * is worth 0.25, so flooring each Piece would pay nothing at all for a swarm
 * of twenty — nothing for exactly the chaff a Clear is used on. Flooring the
 * total pays 5 for those twenty. `ink.test.ts` pins this.
 */
export function clearReward(pieces: readonly Piece[]): number {
  return Math.floor(totalKillReward(pieces) * JOKER_CLEAR_SHARE)
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test:run src/game/ink.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 9: Run the full suite, typecheck and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all green. If `pieceTypes.test.ts` fails, it is asserting on the shape of `PieceTypeDef` — read it and extend it rather than deleting the assertion.

- [ ] **Step 10: Commit**

```bash
git add src/game/types.ts src/data/pieceTypes.ts src/data/ink.ts src/game/ink.ts src/game/fixtures.ts src/game/ink.test.ts
git commit -m "Add the Ink arithmetic and its balance data

Kill rewards are authored per Piece type rather than derived from
maxHealth, which would rank a Rook above a Queen — a Rook is a wall, not
an event. Round income scales with the round number, since rounds grow
and a flat payout would shrink in real terms as pressure rises.

A Joker's share floors the TOTAL, not each Piece: at a quarter share a
Pawn is worth 0.25, so per-Piece flooring would pay nothing for a swarm
of twenty. The test pins that.

Nothing is wired to any of this yet. The numbers are placeholders — Ink's
worth is set by what it buys, and packs do not exist."
```

---

### Task 2: Ink on `GameState`, paid by Tower kills

Adds the field and the first thing that fills it. After this task, killing a Piece earns Ink and React sees the change.

**Files:**
- Modify: `src/game/types.ts` — add `ink` to `GameState` (interface at line 191)
- Modify: `src/game/state.ts` — seed `ink: 0` (line 6-19)
- Modify: `src/game/tick.ts` — `fireTowers` returns the dead; `tick` banks the reward
- Modify: `src/state/structuralKey.ts` — key on `ink`
- Test: `src/game/tick.test.ts` (modify), `src/state/structuralKey.test.ts` (modify)

**Interfaces:**
- Consumes: `totalKillReward(pieces)` from Task 1.
- Produces: `GameState.ink: number`, starting at 0. `fireTowers` gains a third return field, `destroyed: Piece[]` — internal to `tick.ts`, not exported.

- [ ] **Step 1: Write the failing tests**

In `src/game/tick.test.ts`, extend the fixture import on line 5 to bring in `liveRound` and `pawnAt`:

```ts
import { liveRound, pawnAt, withTower } from './fixtures'
```

Then append this block at the end of the file:

```ts
describe('Ink from kills', () => {
  // A rank-4 Tower is `cross`, so it covers its own file: the target is
  // blocked directly up-file from it and stays inside coverage while it is
  // shot. The bystander is far enough away that the round is STILL LIVE when
  // the assertion runs — without it the board would empty, the round would
  // complete, and round income would land in the same total, so the assertion
  // would no longer be about kills at all.
  const TOWER_SQUARE = { file: 3, rank: 4 }

  function towerAndTwoPawns(): GameState {
    return liveRound(withTower(4, TOWER_SQUARE), [
      pawnAt('target', { file: 3, rank: 5 }),
      pawnAt('bystander', { file: 7, rank: 7 }),
    ])
  }

  it('pays the kill reward when a Tower destroys a Piece', () => {
    const after = runFor(towerAndTwoPawns(), 1200)

    expect(after.pieces.map((piece) => piece.id)).toEqual(['bystander'])
    expect(after.phase).toBe('inProgress')
    expect(after.ink).toBe(PIECE_TYPES.pawn.inkReward)
  })

  it('pays nothing for a Piece that leaks, which the player did not kill', () => {
    const leaking = liveRound(createInitialState(), [
      pawnAt('leaker', { file: 3, rank: 1 }),
      pawnAt('bystander', { file: 7, rank: 7 }),
    ])
    const after = runFor(leaking, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.leaks).toBe(1)
    expect(after.ink).toBe(0)
  })

  it('pays nothing for a promoted Pawn, which was not destroyed but transformed', () => {
    // The Queen it becomes pays when the Queen dies. Paying here would pay
    // twice for one Piece.
    const promoting = liveRound(createInitialState(), [pawnAt('promoter', { file: 0, rank: 0 })])
    const after = runFor(promoting, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces.map((piece) => piece.typeId)).toEqual(['queen'])
    expect(after.ink).toBe(0)
  })
})
```

In `src/state/structuralKey.test.ts`, add the import and one test inside the existing `describe('structuralKey', ...)` block:

```ts
import { createInitialState } from '../game'
```

```ts
  it('changes when Ink changes, since the HUD prints it', () => {
    const base = createInitialState()
    const earned = { ...base, ink: base.ink + 5 }

    expect(structuralKey(earned)).not.toBe(structuralKey(base))
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/tick.test.ts src/state/structuralKey.test.ts`
Expected: FAIL — TypeScript errors that `ink` does not exist on `GameState`.

- [ ] **Step 3: Add `ink` to `GameState`**

In `src/game/types.ts`, inside the `GameState` interface, after the `leaks` field (line 212):

```ts
  /**
   * The run currency.
   *
   * Earned two ways and only two ways: destroying a Piece with Tower fire, and
   * completing a round. NEVER from elapsed time — the gap between rounds is
   * untimed, so time-based income would be unbounded and the player would
   * simply wait for it. It is spent on packs alone, and never to play a Card.
   *
   * An integer. Every calculation that could produce a fraction floors in
   * `src/game/ink.ts`.
   */
  readonly ink: number
```

- [ ] **Step 4: Seed it at zero**

In `src/game/state.ts`, in the object returned by `createInitialState`, after `leaks: 0,` (line 15):

```ts
    ink: 0,
```

- [ ] **Step 5: Have `fireTowers` report what it destroyed**

In `src/game/tick.ts`, change the `fireTowers` return type (line 176) and its empty-Tower early return (line 177):

```ts
): { towers: Tower[]; pieces: Piece[]; destroyed: Piece[] } {
  if (towers.length === 0) return { towers: [...towers], pieces: [...pieces], destroyed: [] }
```

Then replace the survivor filter at the end of the function (lines 209-213):

```ts
  // Partitioned in a single pass rather than filtered twice. The dead are the
  // Ink payout, and deriving them with a second, opposite filter would let the
  // two lists disagree the moment either predicate changed.
  const survivors: Piece[] = []
  const destroyed: Piece[] = []

  for (const piece of pieces) {
    const health = remainingHealth.get(piece.id) ?? piece.health

    if (health > 0) survivors.push({ ...piece, health })
    else destroyed.push(piece)
  }

  return { towers: nextTowers, pieces: survivors, destroyed }
```

- [ ] **Step 6: Bank the kill reward in `tick`**

In `src/game/tick.ts`, add the import at the top, after the `auras` import (line 3):

```ts
import { totalKillReward } from './ink'
```

Then insert after `const healed = applyHealing(fired.pieces, dtMs)` (line 85):

```ts
  // Tower fire is the ONLY thing that pays. A leak and a promotion each remove
  // a Piece without passing through fireTowers, so neither can pay by
  // accident: the player did not kill a leaker, and a promoted Pawn was not
  // destroyed — it became a Queen, which pays when the Queen dies.
  const ink = state.ink + totalKillReward(fired.destroyed)
```

Add `ink,` to all three return objects in `tick` — the `defeated` branch (line 92), the `gap` branch (line 139), and the final return (line 153). Put it next to `leaks` in each.

Kill Ink is paid even in the tick where the Core falls. It cannot be spent, so it changes nothing — but a Tower that killed something in that tick did kill it, and suppressing the payout would be a special case earning nothing.

- [ ] **Step 7: Key `structuralKey` on it**

In `src/state/structuralKey.ts`, in the returned array, after `state.leaks,` (line 39):

```ts
    // Ink only ever moves on a kill or a round completion, and both already
    // change this key — a kill through the `pieces` string, a completion
    // through `phase` and `roundNumber`. Keyed because the HUD prints it, not
    // because it adds a publish. It is NOT a per-tick value; adding one of
    // those here would force a React render every frame.
    state.ink,
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test:run src/game/tick.test.ts src/state/structuralKey.test.ts`
Expected: PASS.

- [ ] **Step 9: Verify the store still publishes rarely**

Run: `pnpm test:run src/state/simulation.test.ts`
Expected: PASS. This suite bounds store publishes at 60 per 600 frames (the real figure is ~24). If it fails, something about the `structuralKey` change is per-tick — re-read Step 7.

- [ ] **Step 10: Run the full suite, typecheck and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/game/types.ts src/game/state.ts src/game/tick.ts src/game/tick.test.ts src/state/structuralKey.ts src/state/structuralKey.test.ts
git commit -m "Pay Ink for Pieces destroyed by Tower fire

fireTowers now partitions in one pass and reports the dead, so the payout
and the survivor list cannot disagree. Tower fire is the only thing that
pays: a leak and a promotion both leave `pieces` without passing through
that filter, so neither can pay by accident.

Keyed into structuralKey because the HUD will print it. It costs no extra
publishes — a kill already changes the pieces string."
```

---

### Task 3: The round-completion lump sum

**Files:**
- Modify: `src/game/tick.ts` — the `gap` branch (line 138-151)
- Test: `src/game/tick.test.ts` (modify)

**Interfaces:**
- Consumes: `roundIncome(roundNumber)` from Task 1; `GameState.ink` and the `ink` local in `tick` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/game/tick.test.ts`, add `roundIncome` to the imports:

```ts
import { roundIncome } from './ink'
```

`liveRound` and `pawnAt` were already added to the fixture import in Task 2, so the block below needs no further imports.

Append this block at the end of the file:

```ts
describe('Ink from round completion', () => {
  /** A lone Pawn one square up-file from the Core, so the round ends when it leaks. */
  function oneLeakAway(state: GameState = createInitialState()): GameState {
    return liveRound(state, [pawnAt('leaker', { file: 3, rank: 1 })])
  }

  it('pays a lump sum for the round just played, not the one about to start', () => {
    // The Pawn walks into the Core and nothing is left to act, so the round
    // completes. Leaks pay nothing, which makes every Ink here the lump sum.
    const after = runFor(oneLeakAway(), PIECE_TYPES.pawn.moveIntervalMs + DT * 2)

    expect(after.phase).toBe('gap')
    expect(after.roundNumber).toBe(2)
    expect(after.ink).toBe(roundIncome(1))
    // The off-by-one this guards: `tick` increments roundNumber in the same
    // branch that pays, so reading the incremented value pays for a round that
    // has not been played.
    expect(after.ink).not.toBe(roundIncome(2))
  })

  it('pays nothing when the Core falls, since the run is over', () => {
    const base = createInitialState()
    const doomed = oneLeakAway({ ...base, core: { ...base.core, health: 1 } })
    const after = runFor(doomed, PIECE_TYPES.pawn.moveIntervalMs + DT * 2)

    expect(after.phase).toBe('defeated')
    expect(after.ink).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/tick.test.ts -t 'Ink from round completion'`
Expected: FAIL — the first test reports `expected 0 to be 15`, since nothing pays round income yet.

- [ ] **Step 3: Pay the lump sum**

In `src/game/tick.ts`, add `roundIncome` to the existing `./ink` import:

```ts
import { roundIncome, totalKillReward } from './ink'
```

In the `gap` branch (the `if (!stillActive && pendingSpawns.length === 0)` block), replace the `ink,` line added in Task 2 with:

```ts
      // `state.roundNumber`, NOT the incremented value on the next line: this
      // pays for the round just played, not the one about to start.
      ink: ink + roundIncome(state.roundNumber),
```

The `defeated` branch above returns earlier and so pays nothing. That is a decision, not an accident of ordering — if these branches are ever reordered, defeat must still pay no round income.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/tick.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all green. `roundTermination.test.ts` drives rounds to completion and now accrues Ink — it asserts on termination, not on Ink, so it should be unaffected. If it fails, read it before changing it.

- [ ] **Step 6: Commit**

```bash
git add src/game/tick.ts src/game/tick.test.ts
git commit -m "Pay a scaling lump sum when a round completes

Reads state.roundNumber before the branch increments it, so the payout is
for the round just played. The test asserts it is not roundIncome(2),
which is the off-by-one available here.

Defeat pays nothing: that branch returns earlier, and the test pins it so
a future reordering cannot quietly start paying for a lost run."
```

---

### Task 4: The Joker's quarter share

**Files:**
- Modify: `src/game/cardPlays.ts` — `clearPieces` (line 212-227), and delete the stale note above it
- Test: `src/game/faceCards.test.ts` (modify)

**Interfaces:**
- Consumes: `clearReward(pieces)` from Task 1; `roundIncome` for the second test.
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/game/faceCards.test.ts`, add the import:

```ts
import { clearReward, roundIncome } from './ink'
```

Then append inside the existing `describe('Joker — Clear', ...)` block:

```ts
  // Eight Pawns rather than the two `withJoker` uses: a quarter share of two
  // Pawns floors to nothing, which would assert the rule without ever
  // demonstrating that it pays.
  function fullBoard() {
    return Array.from({ length: 8 }, (_, file) => pawnAt(`p${file}`, { file, rank: 6 }))
  }

  function withJokerAnd(pieces: readonly Piece[]): GameState {
    return liveRound(withDeck([jokerCard('joker')], withTower(5, SQUARE)), pieces)
  }

  it('pays a quarter share of the kill rewards for what it cleared', () => {
    const board = fullBoard()
    const after = step(withJokerAnd(board), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.ink).toBe(clearReward(board))
    expect(after.ink).toBeGreaterThan(0)
  })

  it('pays less than shooting the same Pieces would, so stalling to Clear never pays best', () => {
    const board = fullBoard()
    const after = step(withJokerAnd(board), { kind: 'clearPieces', cardId: 'joker' })
    const shotInstead = board.length * PIECE_TYPES.pawn.inkReward

    expect(after.ink).toBeLessThan(shotInstead)
  })

  it('leaves the round prize whole — the quarter share is on the kills only', () => {
    const board = fullBoard()
    const cleared = step(withJokerAnd(board), { kind: 'clearPieces', cardId: 'joker' })
    // Clearing empties the board with nothing left to spawn, so the very next
    // tick completes the round. The lump sum is paid in full.
    const ended = tick(cleared, 1000 / 60)

    expect(ended.phase).toBe('gap')
    expect(ended.ink).toBe(clearReward(board) + roundIncome(1))
  })
```

Two more imports are needed. Add `PIECE_TYPES`, and widen the existing type import on line 6 to bring in `Piece`:

```ts
import { PIECE_TYPES } from '../data/pieceTypes'
```

```ts
import type { GameState, Piece } from './types'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/faceCards.test.ts -t 'Joker'`
Expected: FAIL — `expected 0 to be 2`, since `clearPieces` pays nothing yet.

- [ ] **Step 3: Pay the share**

In `src/game/cardPlays.ts`, add the import beside the others:

```ts
import { clearReward } from './ink'
```

Replace the last paragraph of the `clearPieces` doc comment. It currently reads:

```
 * NOTE for when Ink lands: clearing twenty Pawns must not pay twenty kill
 * rewards, or this becomes an income exploit.
```

Replace those two lines with:

```
 * It pays a QUARTER share of the kill rewards for what it destroyed, not the
 * full amount. Paying full would make holding a Joker while the board fills
 * the best way to earn, turning the safety valve into an income exploit. The
 * share floors on the total rather than per Piece — see `clearReward`.
```

Then add the payout to the returned state:

```ts
  return {
    ...state,
    ink: state.ink + clearReward(state.pieces),
    pieces: [],
    deck: removeCard(state.deck, cardId),
  }
```

Read `state.pieces` before it is emptied — the reward is for what was on the board.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/faceCards.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite, typecheck and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/game/cardPlays.ts src/game/faceCards.test.ts
git commit -m "Pay a Joker's Clear a quarter share of the kills

Answers the standing note in this file: clearing twenty Pawns must not
pay twenty kill rewards. A quarter share keeps Clear feeling like it
accomplished something while never being the best way to earn, so the
safety valve stays a safety valve.

The round prize is untouched. If a Clear empties the board the next tick
completes the round and pays the lump sum in full, which needs no code —
the test pins it so it stays true."
```

---

### Task 5: The HUD readout, and the docs

**Files:**
- Modify: `src/ui/Hud.tsx` — the stats list (line 17 and lines 38-62)
- Modify: `CLAUDE.md` — "Current state"

**Interfaces:**
- Consumes: `GameState.ink` from Task 2, via the zustand snapshot.
- Produces: nothing.

No CSS change is needed. `.hud__stats` uses `grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr))`, so a sixth tile flows on its own.

There are no component tests and no jsdom, so this task is verified by reading the diff and running the app.

- [ ] **Step 1: Add the tile**

In `src/ui/Hud.tsx`, add `ink` to the destructuring on line 17:

```tsx
  const { phase, roundNumber, core, leaks, autoStart, pieces, towers, ink } = snapshot
```

Then insert a new tile immediately after the `Round` tile in the `<dl className="hud__stats">`:

```tsx
          <div>
            <dt>Ink</dt>
            <dd>{ink}</dd>
          </div>
```

Placed after Round because Round and Ink are both run-level state, where Core, Leaks, Pieces and Towers describe the board. Plain number, no gain animation — there is nothing to spend Ink on yet, so drawing the eye to each gain would be emphasis without a payoff.

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 3: Verify it in the running app**

Run: `pnpm dev`, open the page, start a round, and let a Tower kill something.
Expected: the Ink tile sits between Round and Core, starts at 0, rises as Pieces die, and jumps by the lump sum when the round completes. Check the six tiles still lay out sensibly at the panel's width.

- [ ] **Step 4: Update `CLAUDE.md`**

In the "What exists" list, add a bullet after the card system entry:

```markdown
- **Ink income.** The run currency, earned from Tower kills and round completion, shown in the HUD. Kill rewards are authored per Piece type in `src/data/pieceTypes.ts`; the round lump sum and the Joker's share live in `src/data/ink.ts`. Every calculation is in `src/game/ink.ts`. **The numbers are placeholders** — Ink buys nothing yet, so nothing prices them.
```

In "What does **not** exist yet", replace the `Ink and packs` bullet with:

```markdown
- **Packs.** No pack opening, no cull flow, and no seeded PRNG. Ink accumulates with nothing to spend it on. The Deck is a fixed authored list in `src/data/deck.ts` — see the file's own comment before touching it.
```

In the paragraph below that list, change `The largest unbuilt piece is Ink and packs, with the cull flow and the PRNG.` to:

```markdown
The largest unbuilt piece is packs, with the cull flow and the PRNG.
```

- [ ] **Step 5: Refresh the test count in `CLAUDE.md`**

Run: `pnpm test:run`

Read the real figures off the output and update the line that currently reads `396 tests across 26 files, all passing`. CLAUDE.md notes that a stale figure here has already leaked into a plan document once — take the number from the command, not from an estimate.

- [ ] **Step 6: Run everything CI runs**

Run: `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build`
Expected: all green, including the `src/game/**` (85/85/85/90) and `src/state/**` (90/95/85/90) coverage thresholds.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Hud.tsx CLAUDE.md
git commit -m "Show Ink in the HUD

A sixth stat tile, after Round: both are run-level state, where Core,
Leaks, Pieces and Towers describe the board. No CSS change — the stats
grid auto-fits.

Plain number, no gain animation. There is nothing to spend Ink on yet, so
animating each gain would be emphasis without a payoff."
```

---

## Done when

- Killing a Piece with Tower fire pays its authored reward; leaking and promoting pay nothing.
- Completing a round pays `10 + roundNumber * 5`, for the round just played. Defeat pays nothing.
- A Joker's Clear pays a quarter of the kill rewards for what it cleared, floored on the total, and the round prize is unaffected.
- The HUD shows Ink.
- `pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build` is green.
- `CLAUDE.md` reflects that Ink income exists and packs do not.

## Explicitly not in this plan

- **Packs, prices, spending, the cull flow, the seeded PRNG.** Ink is a number that only goes up until packs land. That is the accepted cost of building the economy in two stages.
- **Tuning the numbers.** They cannot be validated without a sink. `game-design.md` carries "Ink income values" as an open question, to be resolved alongside "Pack weighting and prices".
- **The Ink floor for running out of cards.** Open, and needs packs to mean anything.
- **Persistence.** Ink dies with the run, like every other value in `GameState`.
