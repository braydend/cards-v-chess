# Card Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the modal card system for GitHub issue #5 — a visible Deck of Cards where rank builds a Tower and suit supports one, playing consumes the card, covering ranks 2–10, the face cards, the Ace and the Jokers.

**Architecture:** The rules engine (`src/game/`) is pure TypeScript and owns all state. `step(state, command)` applies player commands and `tick(state, dtMs)` advances the simulation; both are pure and return new state. Card play enters through `step` as one command per action. The renderer reads a zustand snapshot published only when a structural key changes. Balance values live in `src/data/` as plain data so tuning never touches logic.

**Tech Stack:** TypeScript 5.x (strict), Vite, React Three Fiber, zustand, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-05-card-mechanics-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **`src/game/` and `src/data/` must never import React or three.js.** ESLint-enforced in `eslint.config.js` — a violation fails `pnpm lint`.
- **`Math.random` must never appear in `src/game/`.** No randomness is in scope; the Deck is a fixed authored list.
- **Never add pathfinding.** A blocked Piece grinds; it must never route around.
- **Towers block movement, and blocked Pieces attack at half damage** (`BLOCKED_ATTACK_MULTIPLIER = 0.5`).
- **A round ends when nothing can still act, not when the board is empty.**
- **Playing a card consumes it.** No drawing, no shuffling, no discard pile, no hand.
- **Deck cap is 30 cards.** The authored deck must be at or under it.
- **Every Tower fire interval must stay below the Pawn's 900 ms move cadence**, so a Tower gets at least one shot at a Piece crossing its coverage.
- **Never add a per-tick value to `structuralKey`.** `roundElapsedMs`, `moveCooldownMs`, `prevSquare` and `fireCooldownMs` are excluded deliberately; adding one pushes a React render every frame.
- **Never call `setState` inside `useFrame`** or in fast handlers like `onPointerMove`.
- **Invalid commands return state unchanged, never throw.** The UI is responsible for not offering illegal actions.
- **Vocabulary is fixed** (CLAUDE.md "Domain vocabulary"): Card, Rank, Suit, Tower, Support, Piece, Core, Round, Deck, Leak, Cull. Never "wave", never "hand", never "defender". Where both could appear, name variables `cardRank` and `boardRank`.
- **Ink is not in scope.** Playing a card costs nothing.

**Commands:**

```bash
pnpm test:run     # Vitest, single run — use this, not `pnpm test` (watch mode)
pnpm typecheck    # tsc --noEmit
pnpm lint
pnpm build        # typecheck, then production build
```

**Baseline:** 101 tests passing across 7 files at `55963db`.

---

## File Structure

**Created:**

| File | Responsibility |
| --- | --- |
| `src/data/cards.ts` | Suits, support magnitude by rank, and the balance constants for every card action |
| `src/data/deck.ts` | The authored starting Deck |
| `src/game/cards.ts` | Deck queries: find a card by id, remove one instance |
| `src/game/support.ts` | Applying a suit's support action to one Tower |
| `src/game/cardPlays.ts` | The seven card-play command handlers |
| `src/game/fixtures.ts` | Test-only builders for state, Towers and Pieces |
| `src/ui/Deck.tsx` | The visible Deck, card selection, and mode choice |

**Modified:**

| File | Change |
| --- | --- |
| `src/game/types.ts` | `Suit`, `BuildableRank`, `CardRank`, `Card`; `star` geometry; Tower stats; `deck` and `core.maxHealth` on state; the seven commands |
| `src/game/coverage.ts` | `star` geometry case |
| `src/game/tick.ts` | Multi-target firing, shield absorption, spawn rank from state, invariant comment |
| `src/game/step.ts` | Dispatch the seven card commands |
| `src/game/state.ts` | Seed `deck` and `core.maxHealth` |
| `src/game/index.ts` | Export the new public types and helpers |
| `src/data/towerRanks.ts` | Ranks 6–10, `targetsPerShot` |
| `src/data/board.ts` | Remove the static `SPAWN_RANK` |
| `src/state/structuralKey.ts` | Deck size, board ranks, core max, tower shield and stats |
| `src/state/uiStore.ts` | Card selection replaces rank selection |
| `src/scene/Board.tsx` | Dispatch `buildTower` with the selected card |
| `src/scene/CoveragePreview.tsx` | Preview from the selected card's rank |
| `src/ui/Hud.tsx` | Render the Deck; core max from state; geometry labels |

---

### Task 1: The `star` geometry

Rank 6 needs all eight rays — `cross` and `diagonal` combined. This is the only new geometry the whole ladder requires.

**Files:**
- Modify: `src/game/types.ts:58`
- Modify: `src/game/coverage.ts:27-41`
- Modify: `src/ui/Hud.tsx:7-13`
- Test: `src/game/coverage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TowerGeometry` gains the `'star'` member. `coversSquare('star', range, from, target)` returns true when `rankDistance === 0 || fileDistance === 0 || fileDistance === rankDistance`.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/coverage.test.ts`:

```ts
describe('coversSquare: star', () => {
  it('covers along the file, like cross', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 4, rank: 6 })).toBe(true)
  })

  it('covers along the rank, like cross', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 6, rank: 4 })).toBe(true)
  })

  it('covers the diagonals too', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 6, rank: 6 })).toBe(true)
  })

  it('does not cover an off-ray square', () => {
    expect(coversSquare('star', 3, ORIGIN, { file: 6, rank: 5 })).toBe(false)
  })

  it('does not cover its own square', () => {
    expect(coversSquare('star', 3, ORIGIN, ORIGIN)).toBe(false)
  })

  it('respects range', () => {
    expect(coversSquare('star', 2, ORIGIN, { file: 7, rank: 4 })).toBe(false)
  })
})
```

`ORIGIN` is already defined at the top of that file as `{ file: 4, rank: 4 }` — the coordinates above are calculated against it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run src/game/coverage.test.ts`
Expected: FAIL. TypeScript rejects `'star'` as not assignable to `TowerGeometry`.

- [ ] **Step 3: Add `star` to the union**

In `src/game/types.ts`, replace line 58:

```ts
export type TowerGeometry =
  | 'adjacent'
  | 'horizontal'
  | 'vertical'
  | 'cross'
  | 'diagonal'
  | 'star'
```

- [ ] **Step 4: Add the geometry case**

In `src/game/coverage.ts`, add to the `switch` after the `diagonal` case:

```ts
    // Rank 6: cross and diagonal combined. Rank 4 taught the player that 4 is
    // 2 and 3 together; 6 being 4 and 5 together reads the same way.
    case 'star':
      return rankDistance === 0 || fileDistance === 0 || fileDistance === rankDistance
```

- [ ] **Step 5: Add the HUD label**

In `src/ui/Hud.tsx`, add to `GEOMETRY_LABELS`:

```ts
  star: 'Fires along rank, file and diagonals',
```

- [ ] **Step 6: Run the full suite and checks**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS. 101 baseline tests plus 6 new.

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/game/coverage.ts src/game/coverage.test.ts src/ui/Hud.tsx
git commit -m "Add the star firing geometry for card rank 6"
```

---

### Task 2: Widen the ladder to ranks 2–10

Introduce `BuildableRank` (2–10) in place of the current `CardRank` (2–5), and add the five new rank definitions. `targetsPerShot` is added to the shape now but left at 1 everywhere, so this task changes no firing behaviour.

**Files:**
- Modify: `src/game/types.ts:64-68` (the `CardRank` type), `:76` (`Tower.cardRank`), `:118` (the `placeTower` command)
- Modify: `src/data/towerRanks.ts`
- Modify: `src/game/index.ts:16`
- Modify: `src/game/step.ts:4,58`
- Modify: `src/state/uiStore.ts`
- Modify: `src/game/blocking.test.ts:5`
- Test: `src/game/coverage.test.ts`, `src/data/towerRanks.test.ts` (create)

**Interfaces:**
- Consumes: `TowerGeometry` including `'star'` from Task 1.
- Produces: `BuildableRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10`, exported from `src/game/index.ts`. `TowerRankDef` gains `readonly targetsPerShot: number`. `TOWER_RANKS: Record<BuildableRank, TowerRankDef>`. `BUILDABLE_RANKS: readonly BuildableRank[]` is `[2,3,4,5,6,7,8,9,10]`. The type name `CardRank` is **removed** in this task and reintroduced with a different meaning in Task 4.

- [ ] **Step 1: Write the failing test**

Create `src/data/towerRanks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from './pieceTypes'
import { BUILDABLE_RANKS, TOWER_RANKS, towerRank } from './towerRanks'

describe('the rank ladder', () => {
  it('covers every rank from 2 to 10', () => {
    expect(BUILDABLE_RANKS).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('defines every buildable rank', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(TOWER_RANKS[rank]).toBeDefined()
    }
  })

  it('never fires slower than a Pawn moves, so every Tower gets a shot', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(towerRank(rank).fireIntervalMs).toBeLessThan(PIECE_TYPES.pawn.moveIntervalMs)
    }
  })

  it('rises in health with rank', () => {
    const healths = BUILDABLE_RANKS.map((rank) => towerRank(rank).maxHealth)

    for (let i = 1; i < healths.length; i += 1) {
      expect(healths[i]).toBeGreaterThan(healths[i - 1])
    }
  })

  it('never fires slower as rank rises', () => {
    const intervals = BUILDABLE_RANKS.map((rank) => towerRank(rank).fireIntervalMs)

    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeLessThanOrEqual(intervals[i - 1])
    }
  })

  it('starts every rank at a single target', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(towerRank(rank).targetsPerShot).toBe(1)
    }
  })
})
```

The last test is deliberately temporary — Task 3 replaces it once 8, 9 and 10 gain multiple targets.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/data/towerRanks.test.ts`
Expected: FAIL. `BUILDABLE_RANKS` is `[2,3,4,5]` and `targetsPerShot` does not exist.

- [ ] **Step 3: Replace `CardRank` with `BuildableRank`**

In `src/game/types.ts`, replace the `CardRank` block (lines 64-68):

```ts
/**
 * Ranks that build a Tower. 2–10 carry the geometry ladder.
 *
 * The face ranks (J, Q, K, A) act instead of building, so they are deliberately
 * absent here — passing `'K'` where geometry is expected is a type error rather
 * than a runtime surprise. See `CardRank` for every rank a Card can carry.
 */
export type BuildableRank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
```

Then replace every remaining `CardRank` in that file with `BuildableRank` — `Tower.cardRank` (line 76) and the `placeTower` command (line 118).

- [ ] **Step 4: Update the rank data**

In `src/data/towerRanks.ts`, change the import to `BuildableRank`, add `targetsPerShot` to `TowerRankDef`, and replace `TOWER_RANKS` and `BUILDABLE_RANKS`:

```ts
export interface TowerRankDef {
  readonly geometry: TowerGeometry
  /** Squares along the pattern, not straight-line distance. */
  readonly range: number
  readonly damage: number
  readonly fireIntervalMs: number
  readonly maxHealth: number
  /**
   * Pieces hit by a single shot. `Number.POSITIVE_INFINITY` means everything
   * the Tower covers.
   *
   * This is what carries the top of the ladder. After adjacent, vertical, cross
   * and diagonal, the supply of generic non-chess silhouettes is spent, and the
   * candidates left over fight the power curve — a ring that only fires at exact
   * range is weaker up close. Scaling on target count has no such problem, and
   * it answers the Pawn swarm the roster is built around.
   */
  readonly targetsPerShot: number
}

/**
 * Range is NOT comparable across geometries: it counts squares along the
 * pattern, so `adjacent` range 3 is a 7x7 disc of 49 squares while `vertical`
 * range 4 is 8 squares. Rank 7's range of 3 is not a downgrade from rank 5's 5.
 *
 * Every value here except the geometry is a PLACEHOLDER. The agreed principle is
 * only that power rises with rank.
 */
export const TOWER_RANKS: Record<BuildableRank, TowerRankDef> = {
  2: { geometry: 'adjacent', range: 1, damage: 1, fireIntervalMs: 600, maxHealth: 8, targetsPerShot: 1 },
  3: { geometry: 'vertical', range: 4, damage: 1, fireIntervalMs: 600, maxHealth: 12, targetsPerShot: 1 },
  4: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 16, targetsPerShot: 1 },
  5: { geometry: 'diagonal', range: 5, damage: 3, fireIntervalMs: 500, maxHealth: 20, targetsPerShot: 1 },
  6: { geometry: 'star', range: 5, damage: 3, fireIntervalMs: 480, maxHealth: 24, targetsPerShot: 1 },
  7: { geometry: 'adjacent', range: 3, damage: 4, fireIntervalMs: 450, maxHealth: 28, targetsPerShot: 1 },
  8: { geometry: 'star', range: 6, damage: 4, fireIntervalMs: 420, maxHealth: 32, targetsPerShot: 1 },
  9: { geometry: 'adjacent', range: 3, damage: 5, fireIntervalMs: 400, maxHealth: 36, targetsPerShot: 1 },
  10: { geometry: 'adjacent', range: 4, damage: 6, fireIntervalMs: 380, maxHealth: 40, targetsPerShot: 1 },
}

export function towerRank(rank: BuildableRank): TowerRankDef {
  return TOWER_RANKS[rank]
}

/** Every rank the game can build, low to high. */
export const BUILDABLE_RANKS: readonly BuildableRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10]
```

Delete the stale paragraph in that file's header comment claiming ranks 6–10 are undesigned and must not be added. Keep the paragraph explaining why rank 2 is adjacent rather than horizontal.

- [ ] **Step 5: Update every other reference**

- `src/game/index.ts:16` — change the exported type `CardRank` to `BuildableRank`.
- `src/game/step.ts` — change the `CardRank` import and the `placeTower` parameter type to `BuildableRank`.
- `src/state/uiStore.ts` — change `selectedRank: CardRank` to `selectedRank: BuildableRank` and its import.
- `src/game/blocking.test.ts:5` — change the `CardRank` type import to `BuildableRank`, and line 25's `blockedApproach(cardRank: CardRank, …)` parameter.

Run `pnpm typecheck` and fix any remaining `CardRank` references it reports.

- [ ] **Step 6: Add coverage tests for the new ranks**

Append to `src/game/coverage.test.ts`:

```ts
describe('coversSquare: adjacent as a disc', () => {
  it('covers the whole square block at range 3, not just the eight neighbours', () => {
    expect(coversSquare('adjacent', 3, ORIGIN, { file: 7, rank: 7 })).toBe(true)
    expect(coversSquare('adjacent', 3, ORIGIN, { file: 5, rank: 7 })).toBe(true)
  })

  it('still excludes anything past its range', () => {
    expect(coversSquare('adjacent', 3, ORIGIN, { file: 0, rank: 4 })).toBe(false)
  })
})
```

- [ ] **Step 7: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/game/index.ts src/game/step.ts src/game/blocking.test.ts \
        src/game/coverage.test.ts src/data/towerRanks.ts src/data/towerRanks.test.ts \
        src/state/uiStore.ts
git commit -m "Extend the rank ladder to 10 and rename CardRank to BuildableRank"
```

---

### Task 3: Multi-target firing

Ranks 8, 9 and 10 hit several Pieces per shot. `fireTowers` currently picks exactly one target.

**Files:**
- Modify: `src/game/tick.ts:120-193`
- Modify: `src/data/towerRanks.ts` (ranks 8, 9, 10)
- Modify: `src/data/towerRanks.test.ts` (replace the temporary single-target test)
- Test: `src/game/firing.test.ts`

**Interfaces:**
- Consumes: `TowerRankDef.targetsPerShot` from Task 2.
- Produces: `selectTargets` replaces `selectTarget` inside `tick.ts`. Both are module-private; nothing outside `tick.ts` imports either.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/firing.test.ts`. Read the existing `scenario(cardRank, towerSquare, pieceSquares)` helper at the top of that file first — it returns a live round with one Tower and Pieces at the given squares.

```ts
describe('targets per shot', () => {
  it('a single-target Tower damages only one of two covered Pieces', () => {
    // Rank 3 fires up its own file; both Pieces sit on it.
    const state = scenario(3, { file: 3, rank: 1 }, [
      { file: 3, rank: 2 },
      { file: 3, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(1)
  })

  it('a multi-target Tower damages several covered Pieces in one shot', () => {
    // Rank 8 is a star with 3 targets. Three Pieces on three different rays.
    const state = scenario(8, { file: 3, rank: 3 }, [
      { file: 3, rank: 4 },
      { file: 4, rank: 4 },
      { file: 4, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(3)
  })

  it('caps at its target count', () => {
    // Rank 8 covers four Pieces but may only hit 3.
    const state = scenario(8, { file: 3, rank: 3 }, [
      { file: 3, rank: 4 },
      { file: 4, rank: 4 },
      { file: 4, rank: 3 },
      { file: 2, rank: 2 },
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(TOWER_RANKS[8].targetsPerShot)
  })

  it('rank 10 hits everything it covers', () => {
    const state = scenario(10, { file: 3, rank: 3 }, [
      { file: 3, rank: 4 },
      { file: 4, rank: 4 },
      { file: 2, rank: 2 },
      { file: 5, rank: 5 },
      { file: 1, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(5)
  })

  it('is deterministic when more Pieces are covered than can be hit', () => {
    const build = () =>
      scenario(8, { file: 3, rank: 3 }, [
        { file: 3, rank: 4 },
        { file: 4, rank: 4 },
        { file: 4, rank: 3 },
        { file: 2, rank: 2 },
      ])

    const a = runFor(build(), 2000)
    const b = runFor(build(), 2000)

    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/firing.test.ts`
Expected: FAIL. The multi-target tests report 1 hit where 3 or 5 are expected.

- [ ] **Step 3: Set the target counts**

In `src/data/towerRanks.ts`, change ranks 8, 9 and 10:

```ts
  8: { geometry: 'star', range: 6, damage: 4, fireIntervalMs: 420, maxHealth: 32, targetsPerShot: 3 },
  9: { geometry: 'adjacent', range: 3, damage: 5, fireIntervalMs: 400, maxHealth: 36, targetsPerShot: 5 },
  10: { geometry: 'adjacent', range: 4, damage: 6, fireIntervalMs: 380, maxHealth: 40, targetsPerShot: Number.POSITIVE_INFINITY },
```

- [ ] **Step 4: Replace the temporary ladder test**

In `src/data/towerRanks.test.ts`, replace the `'starts every rank at a single target'` test:

```ts
  it('never targets fewer Pieces as rank rises', () => {
    const targets = BUILDABLE_RANKS.map((rank) => towerRank(rank).targetsPerShot)

    for (let i = 1; i < targets.length; i += 1) {
      expect(targets[i]).toBeGreaterThanOrEqual(targets[i - 1])
    }
  })

  it('hits at least one Piece at every rank', () => {
    for (const rank of BUILDABLE_RANKS) {
      expect(towerRank(rank).targetsPerShot).toBeGreaterThanOrEqual(1)
    }
  })
```

- [ ] **Step 5: Implement multi-target selection**

In `src/game/tick.ts`, replace `selectTarget` (lines 162-193) with:

```ts
/**
 * The covered, still-living Pieces nearest the Core — the most urgent threats,
 * capped at the Tower's `targetsPerShot`.
 *
 * Distance is measured in hops rather than straight-line, because Pieces move
 * one square along one axis at a time. Ties break on id so the simulation stays
 * deterministic and seed-reproducible.
 */
function selectTargets(
  tower: Tower,
  def: TowerRankDef,
  pieces: readonly Piece[],
  remainingHealth: Map<string, number>,
  coreSquare: Square,
): Piece[] {
  const candidates: { piece: Piece; distance: number }[] = []

  for (const piece of pieces) {
    if ((remainingHealth.get(piece.id) ?? piece.health) <= 0) continue
    if (!coversSquare(def.geometry, def.range, tower.square, piece.square)) continue

    candidates.push({
      piece,
      distance:
        Math.abs(piece.square.file - coreSquare.file) +
        Math.abs(piece.square.rank - coreSquare.rank),
    })
  }

  candidates.sort((a, b) =>
    a.distance === b.distance
      ? a.piece.id < b.piece.id
        ? -1
        : 1
      : a.distance - b.distance,
  )

  // `slice` handles POSITIVE_INFINITY correctly: it returns every candidate.
  return candidates.slice(0, def.targetsPerShot).map((candidate) => candidate.piece)
}
```

Then replace the firing loop inside `fireTowers` (lines 137-150):

```ts
    while (cooldown >= def.fireIntervalMs) {
      const targets = selectTargets(tower, def, pieces, remainingHealth, coreSquare)

      if (targets.length === 0) {
        // Hold at "ready" rather than banking shots. Without this, a Tower idle
        // for ten seconds would unload every stored shot the instant a Piece
        // walked into range.
        cooldown = def.fireIntervalMs
        break
      }

      cooldown -= def.fireIntervalMs

      for (const target of targets) {
        remainingHealth.set(target.id, (remainingHealth.get(target.id) ?? 0) - def.damage)
      }
    }
```

Update the `fireTowers` doc comment (lines 114-119), which says a Tower fires "at a single target":

```ts
/**
 * Advances every Tower's cooldown and resolves the shots that come due.
 *
 * A Tower fires at most one shot per elapsed interval, hitting up to its rank's
 * `targetsPerShot` Pieces. Nothing blocks line of fire and nothing pierces.
 */
```

- [ ] **Step 6: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/tick.ts src/game/firing.test.ts src/data/towerRanks.ts src/data/towerRanks.test.ts
git commit -m "Let high-rank Towers hit several Pieces per shot"
```

---

### Task 4: The Card and the Deck

Introduce the Card type, the authored Deck, and the state to hold it. Nothing plays a card yet — that starts in Task 6.

**Files:**
- Create: `src/data/cards.ts`, `src/data/deck.ts`, `src/game/cards.ts`
- Create: `src/game/cards.test.ts`, `src/data/deck.test.ts`
- Modify: `src/game/types.ts`, `src/game/state.ts`, `src/game/index.ts`
- Modify: `src/state/structuralKey.ts`
- Modify: `src/ui/Hud.tsx:1,42`

**Interfaces:**
- Consumes: `BuildableRank` from Task 2.
- Produces:
  - `Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs'`
  - `FaceRank = 'J' | 'Q' | 'K' | 'A'`
  - `CardRank = BuildableRank | FaceRank`
  - `Card = { id, kind: 'standard', rank: CardRank, suit: Suit } | { id, kind: 'joker' }`
  - `GameState.deck: readonly Card[]`, `GameState.core.maxHealth: number`
  - `findCard(deck: readonly Card[], cardId: string): Card | undefined`
  - `removeCard(deck: readonly Card[], cardId: string): Card[]`
  - `isBuildableRank(rank: CardRank): rank is BuildableRank`
  - `supportMagnitude(rank: CardRank): number`
  - `STARTING_DECK: readonly Card[]`, `DECK_CAP = 30`

- [ ] **Step 1: Write the failing tests**

Create `src/game/cards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findCard, isBuildableRank, removeCard } from './cards'
import type { Card } from './types'

const FIVE_A: Card = { id: 'a', kind: 'standard', rank: 5, suit: 'diamonds' }
const FIVE_B: Card = { id: 'b', kind: 'standard', rank: 5, suit: 'diamonds' }
const FIVE_C: Card = { id: 'c', kind: 'standard', rank: 5, suit: 'diamonds' }
const DECK = [FIVE_A, FIVE_B, FIVE_C]

describe('findCard', () => {
  it('finds a card by id', () => {
    expect(findCard(DECK, 'b')).toBe(FIVE_B)
  })

  it('returns undefined for an unknown id', () => {
    expect(findCard(DECK, 'nope')).toBeUndefined()
  })
})

describe('removeCard', () => {
  // The Deck is a multiset: cards come from random packs, so three identical
  // 5♦ is normal. Identity must be the id, never rank+suit.
  it('removes only the named instance and leaves its duplicates', () => {
    const after = removeCard(DECK, 'b')

    expect(after).toHaveLength(2)
    expect(after.map((card) => card.id)).toEqual(['a', 'c'])
  })

  it('leaves the deck alone when the id is unknown', () => {
    expect(removeCard(DECK, 'nope')).toEqual(DECK)
  })

  it('does not mutate the input', () => {
    removeCard(DECK, 'b')

    expect(DECK).toHaveLength(3)
  })
})

describe('isBuildableRank', () => {
  it('accepts numeric ranks', () => {
    expect(isBuildableRank(2)).toBe(true)
    expect(isBuildableRank(10)).toBe(true)
  })

  it('rejects the face ranks', () => {
    expect(isBuildableRank('J')).toBe(false)
    expect(isBuildableRank('A')).toBe(false)
  })
})
```

Create `src/data/deck.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BUILDABLE_RANKS } from './towerRanks'
import { DECK_CAP, STARTING_DECK } from './deck'
import { SUITS, supportMagnitude } from './cards'

describe('the starting Deck', () => {
  it('is within the Deck cap', () => {
    expect(STARTING_DECK.length).toBeLessThanOrEqual(DECK_CAP)
  })

  it('gives every card a unique id', () => {
    const ids = new Set(STARTING_DECK.map((card) => card.id))

    expect(ids.size).toBe(STARTING_DECK.length)
  })

  // Cards are gained from random packs, so duplicates are the normal case and
  // the code must handle them from day one.
  it('contains duplicates', () => {
    const signatures = STARTING_DECK.filter((card) => card.kind === 'standard').map((card) =>
      card.kind === 'standard' ? `${card.rank}${card.suit}` : '',
    )

    expect(new Set(signatures).size).toBeLessThan(signatures.length)
  })

  it('can build every rank on the ladder', () => {
    const ranks = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.rank] : [])),
    )

    for (const rank of BUILDABLE_RANKS) {
      expect(ranks).toContain(rank)
    }
  })

  it('covers all four suits', () => {
    const suits = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.suit] : [])),
    )

    for (const suit of SUITS) {
      expect(suits).toContain(suit)
    }
  })

  it('includes every face rank and at least one Joker', () => {
    const ranks = new Set(
      STARTING_DECK.flatMap((card) => (card.kind === 'standard' ? [card.rank] : [])),
    )

    for (const face of ['J', 'Q', 'K', 'A']) {
      expect(ranks).toContain(face)
    }

    expect(STARTING_DECK.some((card) => card.kind === 'joker')).toBe(true)
  })
})

describe('supportMagnitude', () => {
  it('is the face value for numbered ranks', () => {
    expect(supportMagnitude(2)).toBe(2)
    expect(supportMagnitude(10)).toBe(10)
  })

  it('continues past 10 for the face ranks', () => {
    expect(supportMagnitude('J')).toBe(11)
    expect(supportMagnitude('Q')).toBe(12)
    expect(supportMagnitude('K')).toBe(13)
    expect(supportMagnitude('A')).toBe(14)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/cards.test.ts src/data/deck.test.ts`
Expected: FAIL. None of the modules exist.

- [ ] **Step 3: Add the Card types**

In `src/game/types.ts`, add after the `BuildableRank` block:

```ts
export type Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs'

/** Ranks that act instead of building. See the card mechanics spec. */
export type FaceRank = 'J' | 'Q' | 'K' | 'A'

export type CardRank = BuildableRank | FaceRank

/**
 * One unplayed item in the Deck.
 *
 * A Joker is a separate variant because it has neither rank nor suit, so
 * "play a Joker for its suit" is not expressible. That is the point.
 *
 * `id` is independent of rank and suit. The Deck is a MULTISET — cards are
 * gained from random packs, so holding three 5♦ is normal, and playing one must
 * consume that instance and leave the others. Identifying a card by rank+suit
 * would be a bug the moment a duplicate exists.
 */
export type Card =
  | {
      readonly id: string
      readonly kind: 'standard'
      readonly rank: CardRank
      readonly suit: Suit
    }
  | { readonly id: string; readonly kind: 'joker' }
```

Then change `GameState`'s `core` and add `deck`:

```ts
  readonly core: {
    readonly square: Square
    readonly health: number
    /**
     * Raised by a King, the only card that touches the Core and the only Core
     * recovery in the game. Split from `health` so the HUD can show a ceiling
     * that grows.
     */
    readonly maxHealth: number
  }
```

```ts
  /**
   * Every Card held for this run, always fully visible and playable. Capped at
   * `DECK_CAP`. There is no hand and no draw pile — playing consumes a card and
   * nothing returns.
   */
  readonly deck: readonly Card[]
```

- [ ] **Step 4: Create the card data**

Create `src/data/cards.ts`:

```ts
import type { CardRank, Suit } from '../game/types'

export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'spades', 'clubs']

/**
 * How strong a suit's support action is when played from this rank.
 *
 * Support magnitude scales with rank, as Tower power does: a 9♥ is a large
 * repair, a 2♥ a small one. The face ranks continue the scale past 10, which is
 * why a K♥ is a top-of-scale repair.
 */
export function supportMagnitude(rank: CardRank): number {
  switch (rank) {
    case 'J':
      return 11
    case 'Q':
      return 12
    case 'K':
      return 13
    case 'A':
      return 14
    default:
      return rank
  }
}

/**
 * Balance values for the card actions. PLACEHOLDERS, not design decisions —
 * they live here so tuning never touches logic.
 */

/** Milliseconds shaved off a fire interval per point of magnitude (♦ Speed). */
export const SPEED_MS_PER_MAGNITUDE = 10

/**
 * The floor a fire interval can never go below, however many ♦ are stacked.
 *
 * Not a balance value — a guard. `fireTowers` loops `while (cooldown >=
 * fireIntervalMs)`, so an interval of zero would never terminate.
 */
export const MIN_FIRE_INTERVAL_MS = 100

/** Magnitude needed per point of added damage (♣ Damage). */
export const MAGNITUDE_PER_DAMAGE = 3

/**
 * A Jack's shield, flat rather than rank-scaled.
 *
 * A blocked Pawn deals 1 damage per 900ms hop, so 10 absorbs about 9 seconds of
 * grinding. Flat on purpose: it is worth proportionally more on a cheap Tower,
 * which gives low ranks a reason to matter once the player holds 9s and 10s.
 */
export const JACK_SHIELD = 10

/** Core health a King adds, to both current and maximum. */
export const KING_CORE_HEALTH = 1

/** Board ranks an Ace adds. Ranks only, never files. */
export const ACE_BOARD_RANKS = 1
```

- [ ] **Step 5: Create the authored Deck**

Create `src/data/deck.ts`:

```ts
import type { Card, CardRank, Suit } from '../game/types'

/**
 * The hard Deck cap. Acquiring cards beyond it forces culling — which cannot
 * happen yet, because packs are not in scope and this Deck is authored. The cap
 * is asserted by a test so it cannot be quietly exceeded later.
 */
export const DECK_CAP = 30

/** Shorthand so the deck below reads like a list of cards. */
function card(index: number, rank: CardRank, suit: Suit): Card {
  return { id: `card-${index}`, kind: 'standard', rank, suit }
}

function joker(index: number): Card {
  return { id: `card-${index}`, kind: 'joker' }
}

/**
 * The Deck a run opens with, for this slice only.
 *
 * This is NOT a standard 54-card deck and must not become one — the cap is 30,
 * and cards are gained from random packs, so the real Deck is a multiset with
 * duplicates. This list is authored to exercise every mechanic: all nine
 * buildable ranks, all four suits, each face rank, both Jokers, and deliberate
 * duplicates including a triple.
 *
 * When packs land, this is replaced by a pack opening. Nothing else should need
 * to change.
 */
export const STARTING_DECK: readonly Card[] = [
  card(1, 2, 'hearts'),
  card(2, 2, 'hearts'),
  card(3, 2, 'diamonds'),
  card(4, 3, 'diamonds'),
  card(5, 3, 'diamonds'),
  card(6, 3, 'spades'),
  card(7, 4, 'spades'),
  card(8, 4, 'hearts'),
  card(9, 5, 'clubs'),
  card(10, 5, 'clubs'),
  card(11, 5, 'clubs'),
  card(12, 6, 'hearts'),
  card(13, 6, 'diamonds'),
  card(14, 7, 'diamonds'),
  card(15, 7, 'clubs'),
  card(16, 8, 'spades'),
  card(17, 8, 'clubs'),
  card(18, 9, 'clubs'),
  card(19, 9, 'spades'),
  card(20, 10, 'hearts'),
  card(21, 10, 'diamonds'),
  card(22, 'J', 'hearts'),
  card(23, 'J', 'spades'),
  card(24, 'Q', 'diamonds'),
  card(25, 'K', 'clubs'),
  card(26, 'A', 'hearts'),
  joker(27),
  joker(28),
]
```

- [ ] **Step 6: Create the deck helpers**

Create `src/game/cards.ts`:

```ts
import type { BuildableRank, Card, CardRank } from './types'

export function findCard(deck: readonly Card[], cardId: string): Card | undefined {
  return deck.find((card) => card.id === cardId)
}

/**
 * The Deck without the named card.
 *
 * Filtering on `id` and not on rank+suit is load-bearing: the Deck is a
 * multiset, so three identical 5♦ must lose exactly the one that was played.
 */
export function removeCard(deck: readonly Card[], cardId: string): Card[] {
  return deck.filter((card) => card.id !== cardId)
}

/** Whether this rank builds a Tower, as opposed to acting. */
export function isBuildableRank(rank: CardRank): rank is BuildableRank {
  return typeof rank === 'number'
}
```

- [ ] **Step 7: Seed the state**

In `src/game/state.ts`:

```ts
import { BOARD, CORE_MAX_HEALTH, CORE_SQUARE } from '../data/board'
import { STARTING_DECK } from '../data/deck'
import type { GameState } from './types'

export function createInitialState(): GameState {
  return {
    board: BOARD,
    core: { square: CORE_SQUARE, health: CORE_MAX_HEALTH, maxHealth: CORE_MAX_HEALTH },
    phase: 'gap',
    roundNumber: 1,
    autoStart: false,
    roundElapsedMs: 0,
    pieces: [],
    towers: [],
    leaks: 0,
    pendingSpawns: [],
    nextEntityId: 1,
    deck: STARTING_DECK,
  }
}
```

- [ ] **Step 8: Export the new surface**

In `src/game/index.ts`, add to the value exports:

```ts
export { findCard, isBuildableRank, removeCard } from './cards'
```

and add `Card`, `CardRank`, `FaceRank`, `Suit` to the exported types alongside `BuildableRank`.

- [ ] **Step 9: Publish deck and core changes to React**

In `src/state/structuralKey.ts`, replace the returned array:

```ts
  return [
    state.phase,
    state.roundNumber,
    state.core.health,
    state.core.maxHealth,
    state.leaks,
    state.autoStart,
    state.pendingSpawns.length,
    // The board grows when an Ace is played, and the renderer draws from it.
    state.board.ranks,
    state.board.files,
    // Every card play removes exactly one card, so length alone is a faithful
    // trigger — and far cheaper than joining 30 ids on every publish.
    state.deck.length,
    pieces,
    towers,
  ].join('#')
```

- [ ] **Step 10: Read the core ceiling from state**

In `src/ui/Hud.tsx`, delete the `CORE_MAX_HEALTH` import on line 1 and change line 42:

```tsx
              <span className="hud__muted"> / {core.maxHealth}</span>
```

- [ ] **Step 11: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/game/types.ts src/game/cards.ts src/game/cards.test.ts src/game/state.ts \
        src/game/index.ts src/data/cards.ts src/data/deck.ts src/data/deck.test.ts \
        src/state/structuralKey.ts src/ui/Hud.tsx
git commit -m "Add the Card type and the Deck, held as a multiset"
```

---

### Task 5: Towers carry their own stats

Suit supports modify one specific Tower, so damage, fire interval and shield must live on the Tower rather than be derived from its rank on every read.

**Files:**
- Modify: `src/game/types.ts` (the `Tower` interface)
- Modify: `src/game/step.ts:52-78` (`placeTower`)
- Modify: `src/game/tick.ts` (`fireTowers`, `applyTowerDamage`)
- Modify: `src/state/structuralKey.ts`
- Test: `src/game/blocking.test.ts`

**Interfaces:**
- Consumes: `TOWER_RANKS` from Task 2.
- Produces: `Tower` gains `readonly damage: number`, `readonly fireIntervalMs: number`, `readonly shield: number`. `geometry`, `range` and `targetsPerShot` stay derived from `cardRank` — no support modifies them, so duplicating them onto every Tower would invite drift.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/blocking.test.ts`:

```ts
describe('Tower shields', () => {
  it('seeds a new Tower with no shield', () => {
    const state = blockedApproach(3, { file: 3, rank: 4 })

    expect(state.towers[0]?.shield).toBe(0)
  })

  it('absorbs damage before health', () => {
    const shielded = blockedApproach(3, { file: 3, rank: 4 })
    const state: GameState = {
      ...shielded,
      towers: shielded.towers.map((tower) => ({ ...tower, shield: 4 })),
    }

    const after = runFor(state, PAWN.moveIntervalMs + DT)

    expect(after.towers[0]?.health).toBe(TOWER_RANKS[3].maxHealth)
    expect(after.towers[0]?.shield).toBe(4 - BLOCKED_DAMAGE)
  })

  it('carries overflow into health once the shield is gone', () => {
    // Shield 1, incoming 3: the shield eats 1 and health loses 2.
    const shielded = blockedApproach(3, { file: 3, rank: 4 })
    const state: GameState = {
      ...shielded,
      towers: shielded.towers.map((tower) => ({ ...tower, shield: 1 })),
      pieces: shielded.pieces.map((piece) => ({ ...piece, health: 99 })),
    }

    // One hop lands BLOCKED_DAMAGE. Give the shield less than that so overflow
    // is forced on the very first hit.
    const after = runFor(
      { ...state, towers: state.towers.map((tower) => ({ ...tower, shield: 0.5 })) },
      PAWN.moveIntervalMs + DT,
    )

    expect(after.towers[0]?.shield).toBe(0)
    expect(after.towers[0]?.health).toBe(TOWER_RANKS[3].maxHealth - (BLOCKED_DAMAGE - 0.5))
  })
})

describe('Tower stats are per-Tower', () => {
  it('seeds damage and fire interval from the rank', () => {
    const state = blockedApproach(5, { file: 3, rank: 4 })

    expect(state.towers[0]?.damage).toBe(TOWER_RANKS[5].damage)
    expect(state.towers[0]?.fireIntervalMs).toBe(TOWER_RANKS[5].fireIntervalMs)
  })

  it('fires using the Tower’s own damage, not its rank’s', () => {
    // A Tower whose damage has been raised kills faster than its rank would.
    const base = blockedApproach(3, { file: 3, rank: 6 })
    const boosted: GameState = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, damage: PAWN.maxHealth })),
      pieces: [{ ...base.pieces[0]!, square: { file: 3, rank: 2 }, prevSquare: { file: 3, rank: 2 } }],
    }

    const after = runFor(boosted, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(after.pieces).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/blocking.test.ts`
Expected: FAIL. `shield`, `damage` and `fireIntervalMs` do not exist on `Tower`.

- [ ] **Step 3: Extend the Tower type**

In `src/game/types.ts`, replace the `Tower` interface:

```ts
export interface Tower {
  readonly id: string
  readonly square: Square
  readonly cardRank: BuildableRank
  /** Milliseconds accumulated toward this Tower's next shot. */
  readonly fireCooldownMs: number
  readonly health: number
  /** Separate from the rank's base value so ♠ can raise it. */
  readonly maxHealth: number
  /** Seeded from the rank, raised by ♣ Damage. */
  readonly damage: number
  /** Seeded from the rank, lowered by ♦ Speed, floored at MIN_FIRE_INTERVAL_MS. */
  readonly fireIntervalMs: number
  /**
   * Granted by a Jack. Absorbed before health, with overflow carrying into it.
   * Never regenerates.
   */
  readonly shield: number
}
```

`geometry`, `range` and `targetsPerShot` stay off the Tower on purpose — no support modifies them, so they remain derived from `cardRank` and cannot drift.

- [ ] **Step 4: Seed the new fields on placement**

In `src/game/step.ts`, inside `placeTower`, replace the pushed tower object:

```ts
  const def = towerRank(cardRank)

  return {
    ...state,
    towers: [
      ...state.towers,
      {
        id: `tower-${state.nextEntityId}`,
        square,
        cardRank,
        fireCooldownMs: 0,
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        damage: def.damage,
        fireIntervalMs: def.fireIntervalMs,
        shield: 0,
      },
    ],
    nextEntityId: state.nextEntityId + 1,
  }
```

- [ ] **Step 5: Fire from the Tower's own stats**

In `src/game/tick.ts`, inside `fireTowers`, change the loop to read the Tower rather than the rank definition. `def` is still needed for geometry, range and target count:

```ts
  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    let cooldown = tower.fireCooldownMs + dtMs

    while (cooldown >= tower.fireIntervalMs) {
      const targets = selectTargets(tower, def, pieces, remainingHealth, coreSquare)

      if (targets.length === 0) {
        cooldown = tower.fireIntervalMs
        break
      }

      cooldown -= tower.fireIntervalMs

      for (const target of targets) {
        remainingHealth.set(target.id, (remainingHealth.get(target.id) ?? 0) - tower.damage)
      }
    }

    nextTowers.push({ ...tower, fireCooldownMs: cooldown })
  }
```

- [ ] **Step 6: Absorb damage into the shield**

In `src/game/tick.ts`, replace `applyTowerDamage`:

```ts
/**
 * Applies damage dealt by blocked Pieces and drops Towers that fall.
 *
 * A shield absorbs first, and overflow carries into health — a shield of 2
 * taking a 5-damage hit leaves 0 shield and costs 3 health. No hit is wasted,
 * and a shield never blocks more than it is worth.
 */
function applyTowerDamage(towers: readonly Tower[], damage: Map<string, number>): Tower[] {
  if (damage.size === 0) return [...towers]

  return towers
    .map((tower) => {
      const dealt = damage.get(tower.id)
      if (dealt === undefined) return tower

      const absorbed = Math.min(tower.shield, dealt)

      return {
        ...tower,
        shield: tower.shield - absorbed,
        health: tower.health - (dealt - absorbed),
      }
    })
    .filter((tower) => tower.health > 0)
}
```

- [ ] **Step 7: Publish the shield to React**

In `src/state/structuralKey.ts`, include the shield in the tower signature so damage absorbed is visible:

```ts
  const towers = state.towers
    .map(
      (tower) =>
        `${tower.id}@${tower.square.file},${tower.square.rank}:${tower.health}:${tower.shield}:${tower.damage}:${tower.fireIntervalMs}`,
    )
    .join('|')
```

`fireCooldownMs` stays excluded — it changes every tick.

- [ ] **Step 8: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/game/types.ts src/game/step.ts src/game/tick.ts src/game/blocking.test.ts \
        src/state/structuralKey.ts
git commit -m "Give each Tower its own damage, fire interval and shield"
```

---

### Task 6: Building a Tower spends a Card

Replace `placeTower` with `buildTower`, which names a card and consumes it. This migrates every existing test off the free-placement command.

**Files:**
- Create: `src/game/cardPlays.ts`, `src/game/fixtures.ts`
- Modify: `src/game/types.ts` (the `Command` union)
- Modify: `src/game/step.ts`
- Modify: `src/game/blocking.test.ts`, `src/game/firing.test.ts`, `src/game/step.test.ts`
- Modify: `src/state/uiStore.ts`, `src/scene/Board.tsx`, `src/scene/CoveragePreview.tsx`, `src/ui/Hud.tsx`

**Interfaces:**
- Consumes: `findCard`, `removeCard`, `isBuildableRank` from Task 4; the Tower stat fields from Task 5.
- Produces:
  - Command `{ kind: 'buildTower'; cardId: string; square: Square }`. `placeTower` is **removed**.
  - `buildTower(state: GameState, cardId: string, square: Square): GameState` in `cardPlays.ts`.
  - `src/game/fixtures.ts` exporting `standardCard`, `jokerCard`, `withDeck`, `withTower`, `pawnAt`, `liveRound` — used by tests only.
  - `uiStore.selectedCardId: string | null` replaces `selectedRank`.

- [ ] **Step 1: Write the fixtures**

Create `src/game/fixtures.ts`:

```ts
/**
 * Test-only builders. Imported by `*.test.ts` and never by production code.
 *
 * Tests go through the public command surface rather than constructing Towers
 * by hand, as CLAUDE.md requires — so building a Tower means seeding the one
 * Card it costs.
 */
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState } from './state'
import { step } from './step'
import type { BuildableRank, Card, CardRank, GameState, Piece, Square, Suit } from './types'

export function standardCard(id: string, rank: CardRank, suit: Suit = 'hearts'): Card {
  return { id, kind: 'standard', rank, suit }
}

export function jokerCard(id: string): Card {
  return { id, kind: 'joker' }
}

/** State holding exactly these cards, so a test's Deck is never a surprise. */
export function withDeck(cards: readonly Card[], state: GameState = createInitialState()): GameState {
  return { ...state, deck: cards }
}

/**
 * A Tower of this rank on this square, built by spending a seeded Card.
 *
 * The seeded card's suit is irrelevant — it is played for its rank.
 */
export function withTower(
  cardRank: BuildableRank,
  square: Square,
  state: GameState = createInitialState(),
): GameState {
  const cardId = `seed-${cardRank}-${square.file}-${square.rank}`
  const seeded: GameState = { ...state, deck: [...state.deck, standardCard(cardId, cardRank)] }

  return step(seeded, { kind: 'buildTower', cardId, square })
}

export function pawnAt(id: string, square: Square): Piece {
  return {
    id,
    typeId: 'pawn',
    square,
    prevSquare: square,
    health: PIECE_TYPES.pawn.maxHealth,
    moveCooldownMs: 0,
  }
}

/** A live round with these Pieces and nothing left to spawn. */
export function liveRound(state: GameState, pieces: readonly Piece[]): GameState {
  return { ...state, phase: 'inProgress', pendingSpawns: [], pieces }
}
```

- [ ] **Step 2: Write the failing tests**

In `src/game/step.test.ts`, replace the whole `describe('step: placeTower', …)` block with:

```ts
describe('step: buildTower', () => {
  const FIVE = standardCard('five', 5, 'clubs')

  it('builds a Tower on an empty square', () => {
    const state = step(withDeck([FIVE]), { kind: 'buildTower', cardId: 'five', square: { file: 2, rank: 2 } })

    expect(state.towers).toHaveLength(1)
    expect(state.towers[0]?.square).toEqual({ file: 2, rank: 2 })
  })

  it('records the Card rank the Tower was built from', () => {
    const state = step(withDeck([FIVE]), { kind: 'buildTower', cardId: 'five', square: { file: 3, rank: 3 } })

    expect(state.towers[0]?.cardRank).toBe(5)
  })

  it('consumes the Card', () => {
    const state = step(withDeck([FIVE]), { kind: 'buildTower', cardId: 'five', square: { file: 3, rank: 3 } })

    expect(state.deck).toHaveLength(0)
  })

  it('consumes only the Card played, leaving its duplicates', () => {
    const deck = [standardCard('a', 5, 'clubs'), standardCard('b', 5, 'clubs'), standardCard('c', 5, 'clubs')]
    const state = step(withDeck(deck), { kind: 'buildTower', cardId: 'b', square: { file: 3, rank: 3 } })

    expect(state.deck.map((card) => card.id)).toEqual(['a', 'c'])
  })

  it('gives each Tower a distinct id', () => {
    let state = withDeck([standardCard('a', 2, 'hearts'), standardCard('b', 3, 'hearts')])
    state = step(state, { kind: 'buildTower', cardId: 'a', square: { file: 1, rank: 1 } })
    state = step(state, { kind: 'buildTower', cardId: 'b', square: { file: 2, rank: 1 } })

    expect(new Set(state.towers.map((tower) => tower.id)).size).toBe(2)
  })

  it('is allowed during a round, since building is not confined to the gap', () => {
    const running = step(withDeck([FIVE]), { kind: 'startRound' })
    const state = step(running, { kind: 'buildTower', cardId: 'five', square: { file: 4, rank: 4 } })

    expect(state.phase).toBe('inProgress')
    expect(state.towers).toHaveLength(1)
  })

  it.each([
    ['off the left edge', { file: -1, rank: 0 }],
    ['off the far rank', { file: 0, rank: 8 }],
    ['off the right edge', { file: 8, rank: 0 }],
  ])('refuses a square %s', (_label, square) => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'buildTower', cardId: 'five', square })).toBe(initial)
  })

  it('refuses the Core square', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'buildTower', cardId: 'five', square: initial.core.square })).toBe(initial)
  })

  it('refuses an already occupied square', () => {
    const deck = [standardCard('a', 5, 'clubs'), standardCard('b', 5, 'clubs')]
    const occupied = step(withDeck(deck), { kind: 'buildTower', cardId: 'a', square: { file: 5, rank: 5 } })
    const state = step(occupied, { kind: 'buildTower', cardId: 'b', square: { file: 5, rank: 5 } })

    expect(state).toBe(occupied)
    expect(state.towers).toHaveLength(1)
  })

  it('refuses a Card that is not in the Deck', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'buildTower', cardId: 'ghost', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('refuses a face card, which acts rather than builds', () => {
    const initial = withDeck([standardCard('king', 'K', 'clubs')])

    expect(step(initial, { kind: 'buildTower', cardId: 'king', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('refuses a Joker, which has no rank', () => {
    const initial = withDeck([jokerCard('joker')])

    expect(step(initial, { kind: 'buildTower', cardId: 'joker', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('does not consume the Card when the play is refused', () => {
    const initial = withDeck([FIVE])
    const state = step(initial, { kind: 'buildTower', cardId: 'five', square: initial.core.square })

    expect(state.deck).toHaveLength(1)
  })
})
```

Add to that file's imports:

```ts
import { jokerCard, standardCard, withDeck } from './fixtures'
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm vitest run src/game/step.test.ts`
Expected: FAIL. `buildTower` is not a known command kind.

- [ ] **Step 4: Replace the command**

In `src/game/types.ts`, replace the `placeTower` member of `Command`:

```ts
  | { readonly kind: 'buildTower'; readonly cardId: string; readonly square: Square }
```

- [ ] **Step 5: Implement the play**

Create `src/game/cardPlays.ts`:

```ts
/**
 * The card-play command handlers.
 *
 * Every one of these is pure and returns new state. An illegal play returns the
 * state unchanged — never throws, and never consumes the Card. The UI is
 * responsible for not offering illegal actions; the engine just refuses them.
 */
import { towerRank } from '../data/towerRanks'
import { isInBounds, squaresEqual } from './board'
import { findCard, isBuildableRank, removeCard } from './cards'
import type { GameState, Square } from './types'

/**
 * Plays a Card for its RANK, converting it into a Tower.
 *
 * Playing costs nothing but the Card itself. There is no Ink cost — Ink buys
 * packs and is never spent to play.
 */
export function buildTower(state: GameState, cardId: string, square: Square): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard') return state
  if (!isBuildableRank(card.rank)) return state

  if (!isInBounds(state.board, square)) return state
  if (squaresEqual(square, state.core.square)) return state
  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return state

  const def = towerRank(card.rank)

  return {
    ...state,
    towers: [
      ...state.towers,
      {
        id: `tower-${state.nextEntityId}`,
        square,
        cardRank: card.rank,
        fireCooldownMs: 0,
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        damage: def.damage,
        fireIntervalMs: def.fireIntervalMs,
        shield: 0,
      },
    ],
    nextEntityId: state.nextEntityId + 1,
    deck: removeCard(state.deck, cardId),
  }
}
```

In `src/game/step.ts`, delete the local `placeTower` function and its now-unused imports (`towerRank`, `isInBounds`, `squaresEqual`, `BuildableRank`, `Square`), import the new handler, and dispatch:

```ts
import { buildTower } from './cardPlays'
```

```ts
    case 'buildTower':
      return buildTower(state, command.cardId, command.square)
```

- [ ] **Step 6: Migrate the firing and blocking tests**

In `src/game/blocking.test.ts`, replace the `blockedApproach` helper body and the two inline `placeTower` calls with the fixtures:

```ts
import { liveRound, pawnAt, withTower } from './fixtures'
```

```ts
function blockedApproach(cardRank: BuildableRank, towerSquare: Square): GameState {
  const placed = withTower(cardRank, towerSquare)
  const pieceSquare = { file: towerSquare.file, rank: towerSquare.rank + 1 }

  return liveRound(placed, [pawnAt('blocked', pieceSquare)])
}
```

Rename the `describe('placeTower: health', …)` block to `describe('buildTower: health', …)` and change its body to use `withTower(4, { file: 1, rank: 1 })`.

For the `'does not damage a Tower it is not blocked by'` test, replace the `step(..., placeTower)` call with:

```ts
    const state = liveRound(withTower(3, { file: 7, rank: 7 }), [pawnAt('passer', { file: 0, rank: 5 })])
```

In `src/game/firing.test.ts`, replace the `scenario` helper's `step(..., placeTower)` call with `withTower(cardRank, towerSquare)`, and its inline piece construction with `pawnAt`. Keep its signature identical so the existing tests and the Task 3 tests are untouched.

- [ ] **Step 7: Switch the UI to card selection**

In `src/state/uiStore.ts`, replace the rank fields:

```ts
  /** The Card the player has picked from the Deck, or null for none. */
  selectedCardId: string | null
  setSelectedCardId: (cardId: string | null) => void
```

```ts
  selectedCardId: null,
  setSelectedCardId: (selectedCardId) => set({ selectedCardId }),
```

Remove the now-unused `CardRank` import.

In `src/scene/Board.tsx`, replace the `onClick` dispatch:

```tsx
      onClick={(event) => {
        event.stopPropagation()

        const cardId = useUiStore.getState().selectedCardId
        if (!cardId) return

        dispatch({
          kind: 'buildTower',
          cardId,
          square: {
            file: worldXToFile(board, event.point.x),
            rank: worldZToRank(board, event.point.z),
          },
        })
      }}
```

In `src/scene/CoveragePreview.tsx`, resolve the selected card to a rank:

```tsx
import { towerRank } from '../data/towerRanks'
import { allSquares, coversSquare, findCard, isBuildableRank, isInBounds, squareKey, type BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
```

```tsx
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const deck = useGameStore((store) => store.snapshot.deck)

  const covered = useMemo(() => {
    if (!hoveredSquare || !isInBounds(board, hoveredSquare)) return []
    if (!selectedCardId) return []

    const card = findCard(deck, selectedCardId)
    if (!card || card.kind !== 'standard' || !isBuildableRank(card.rank)) return []

    const { geometry, range } = towerRank(card.rank)
    return allSquares(board).filter((square) =>
      coversSquare(geometry, range, hoveredSquare, square),
    )
  }, [board, deck, hoveredSquare, selectedCardId])
```

In `src/ui/Hud.tsx`, remove the `hud__ranks` block entirely, along with the `BUILDABLE_RANKS`, `towerRank`, `useUiStore`, `selectedRank` and `GEOMETRY_LABELS` references. Task 12 replaces it with the real Deck. Change the hint text to:

```tsx
          {phase === 'defeated' ? 'The Core has fallen.' : 'Pick a Card, then click the board to build.'}
```

- [ ] **Step 8: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. `pnpm build` matters here — this task touches the renderer.

- [ ] **Step 9: Commit**

```bash
git add src/game/types.ts src/game/step.ts src/game/cardPlays.ts src/game/fixtures.ts \
        src/game/step.test.ts src/game/blocking.test.ts src/game/firing.test.ts \
        src/state/uiStore.ts src/scene/Board.tsx src/scene/CoveragePreview.tsx src/ui/Hud.tsx
git commit -m "Build Towers by spending a Card instead of clicking for free"
```

---

### Task 7: Suit supports

Playing a Card for its suit applies one of four actions to an existing Tower.

**Files:**
- Create: `src/game/support.ts`, `src/game/support.test.ts`
- Modify: `src/game/types.ts` (the `Command` union)
- Modify: `src/game/step.ts`, `src/game/cardPlays.ts`
- Modify: `src/game/index.ts`

**Interfaces:**
- Consumes: `supportMagnitude`, `SPEED_MS_PER_MAGNITUDE`, `MIN_FIRE_INTERVAL_MS`, `MAGNITUDE_PER_DAMAGE` from Task 4; Tower stat fields from Task 5.
- Produces:
  - Command `{ kind: 'supportTower'; cardId: string; towerId: string }`
  - `applySupport(tower: Tower, suit: Suit, magnitude: number): Tower` in `support.ts`
  - `supportTower(state: GameState, cardId: string, towerId: string): GameState` in `cardPlays.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/support.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIN_FIRE_INTERVAL_MS, supportMagnitude } from '../data/cards'
import { TOWER_RANKS } from '../data/towerRanks'
import { standardCard, withDeck, withTower } from './fixtures'
import { step } from './index'
import type { GameState } from './types'

const SQUARE = { file: 2, rank: 2 }

/** A rank-5 Tower plus the one support Card under test. */
function withSupport(cardId: string, rank: 2 | 5 | 'K', suit: 'hearts' | 'diamonds' | 'spades' | 'clubs') {
  const built = withTower(5, SQUARE)
  return withDeck([standardCard(cardId, rank, suit)], built)
}

function play(state: GameState, cardId: string): GameState {
  return step(state, { kind: 'supportTower', cardId, towerId: state.towers[0]!.id })
}

describe('♥ Repair', () => {
  it('restores lost health', () => {
    const state = withSupport('h', 5, 'hearts')
    const hurt: GameState = {
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, health: 4 })),
    }

    expect(play(hurt, 'h').towers[0]?.health).toBe(4 + supportMagnitude(5))
  })

  it('never heals past maxHealth', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(play(state, 'h').towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('heals more from a higher rank', () => {
    const low = withSupport('h', 2, 'hearts')
    const high = withSupport('h', 'K', 'hearts')
    const hurt = (state: GameState): GameState => ({
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, health: 1 })),
    })

    const healedLow = play(hurt(low), 'h').towers[0]!.health
    const healedHigh = play(hurt(high), 'h').towers[0]!.health

    expect(healedHigh).toBeGreaterThan(healedLow)
  })
})

describe('♦ Speed', () => {
  it('shortens the fire interval', () => {
    const state = withSupport('d', 5, 'diamonds')

    expect(play(state, 'd').towers[0]?.fireIntervalMs).toBeLessThan(TOWER_RANKS[5].fireIntervalMs)
  })

  it('never drops below the floor, however many are stacked', () => {
    let state = withDeck(
      Array.from({ length: 20 }, (_, i) => standardCard(`d${i}`, 'A', 'diamonds')),
      withTower(5, SQUARE),
    )

    for (let i = 0; i < 20; i += 1) {
      state = play(state, `d${i}`)
    }

    expect(state.towers[0]?.fireIntervalMs).toBe(MIN_FIRE_INTERVAL_MS)
  })
})

describe('♠ Health', () => {
  it('raises maxHealth', () => {
    const state = withSupport('s', 5, 'spades')

    expect(play(state, 's').towers[0]?.maxHealth).toBe(TOWER_RANKS[5].maxHealth + supportMagnitude(5))
  })

  it('does not heal — it raises the ceiling only, which is what keeps it distinct from ♥', () => {
    const state = withSupport('s', 5, 'spades')
    const hurt: GameState = {
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, health: 4 })),
    }

    expect(play(hurt, 's').towers[0]?.health).toBe(4)
  })
})

describe('♣ Damage', () => {
  it('raises damage', () => {
    const state = withSupport('c', 5, 'clubs')

    expect(play(state, 'c').towers[0]?.damage).toBeGreaterThan(TOWER_RANKS[5].damage)
  })

  it('always adds at least one, even from the lowest rank', () => {
    const state = withSupport('c', 2, 'clubs')

    expect(play(state, 'c').towers[0]?.damage).toBeGreaterThanOrEqual(TOWER_RANKS[5].damage + 1)
  })
})

describe('supportTower: refusals', () => {
  it('consumes the Card on a successful play', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(play(state, 'h').deck).toHaveLength(0)
  })

  it('refuses an unknown Card', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(step(state, { kind: 'supportTower', cardId: 'ghost', towerId: state.towers[0]!.id })).toBe(state)
  })

  it('refuses an unknown Tower, and keeps the Card', () => {
    const state = withSupport('h', 5, 'hearts')
    const after = step(state, { kind: 'supportTower', cardId: 'h', towerId: 'ghost' })

    expect(after).toBe(state)
    expect(after.deck).toHaveLength(1)
  })

  it('refuses a Joker, which has no suit', () => {
    const state = withDeck([{ id: 'j', kind: 'joker' }], withTower(5, SQUARE))

    expect(step(state, { kind: 'supportTower', cardId: 'j', towerId: state.towers[0]!.id })).toBe(state)
  })

  it('supports from a face card, since suits work at every rank', () => {
    const state = withSupport('k', 'K', 'clubs')

    expect(play(state, 'k').towers[0]?.damage).toBeGreaterThan(TOWER_RANKS[5].damage)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/support.test.ts`
Expected: FAIL. `supportTower` is not a known command kind.

- [ ] **Step 3: Add the command**

In `src/game/types.ts`, add to `Command`:

```ts
  | { readonly kind: 'supportTower'; readonly cardId: string; readonly towerId: string }
```

- [ ] **Step 4: Implement the support actions**

Create `src/game/support.ts`:

```ts
import {
  MAGNITUDE_PER_DAMAGE,
  MIN_FIRE_INTERVAL_MS,
  SPEED_MS_PER_MAGNITUDE,
} from '../data/cards'
import type { Suit, Tower } from './types'

/**
 * Applies one suit's support action to a Tower.
 *
 * Supports stack additively with no cap. Magnitude scales with the Card's rank,
 * so a 9♥ is a large repair and a 2♥ a small one.
 */
export function applySupport(tower: Tower, suit: Suit, magnitude: number): Tower {
  switch (suit) {
    // Restores lost health, never past the ceiling.
    case 'hearts':
      return { ...tower, health: Math.min(tower.maxHealth, tower.health + magnitude) }

    // Floored, and not for balance: `fireTowers` loops
    // `while (cooldown >= fireIntervalMs)`, so zero would never terminate.
    case 'diamonds':
      return {
        ...tower,
        fireIntervalMs: Math.max(
          MIN_FIRE_INTERVAL_MS,
          tower.fireIntervalMs - magnitude * SPEED_MS_PER_MAGNITUDE,
        ),
      }

    // Raises the ceiling WITHOUT healing. That is what keeps ♠ distinct from ♥:
    // ♠ grows the ceiling, ♥ fills it. A ♠ on a damaged Tower gives headroom
    // for a later ♥.
    case 'spades':
      return { ...tower, maxHealth: tower.maxHealth + magnitude }

    // Divided down because raw magnitude would be enormous against a rank-2
    // Tower's damage of 1. Always at least 1, so no ♣ is ever wasted.
    case 'clubs':
      return {
        ...tower,
        damage: tower.damage + Math.max(1, Math.round(magnitude / MAGNITUDE_PER_DAMAGE)),
      }
  }
}
```

- [ ] **Step 5: Wire up the play**

In `src/game/cardPlays.ts`, add:

```ts
import { supportMagnitude } from '../data/cards'
import { applySupport } from './support'
```

```ts
/**
 * Plays a Card for its SUIT, applying a support action to one existing Tower.
 *
 * A Joker is refused: it has no suit, so this play is not available to it.
 */
export function supportTower(state: GameState, cardId: string, towerId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard') return state

  const target = state.towers.find((tower) => tower.id === towerId)
  if (!target) return state

  const magnitude = supportMagnitude(card.rank)

  return {
    ...state,
    towers: state.towers.map((tower) =>
      tower.id === towerId ? applySupport(tower, card.suit, magnitude) : tower,
    ),
    deck: removeCard(state.deck, cardId),
  }
}
```

In `src/game/step.ts`, add the dispatch case:

```ts
    case 'supportTower':
      return supportTower(state, command.cardId, command.towerId)
```

- [ ] **Step 6: Export the helper**

In `src/game/index.ts`, add:

```ts
export { applySupport } from './support'
```

- [ ] **Step 7: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/game/types.ts src/game/support.ts src/game/support.test.ts \
        src/game/cardPlays.ts src/game/step.ts src/game/index.ts
git commit -m "Add the four suit support actions"
```

---

### Task 8: Jack shields, Queen echoes

The first two face cards. Both target a Tower.

**Files:**
- Create: `src/game/faceCards.test.ts`
- Modify: `src/game/types.ts`, `src/game/cardPlays.ts`, `src/game/step.ts`

**Interfaces:**
- Consumes: `JACK_SHIELD` from Task 4; `buildTower`'s Tower shape from Task 6.
- Produces:
  - Command `{ kind: 'shieldTower'; cardId: string; towerId: string }`
  - Command `{ kind: 'echoTower'; cardId: string; sourceTowerId: string; square: Square }`
  - `shieldTower(state, cardId, towerId)` and `echoTower(state, cardId, sourceTowerId, square)` in `cardPlays.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/game/faceCards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { JACK_SHIELD } from '../data/cards'
import { TOWER_RANKS } from '../data/towerRanks'
import { standardCard, withDeck, withTower } from './fixtures'
import { step } from './index'
import type { GameState } from './types'

const SQUARE = { file: 2, rank: 2 }
const ELSEWHERE = { file: 5, rank: 5 }

function withJacks(count: number): GameState {
  return withDeck(
    Array.from({ length: count }, (_, i) => standardCard(`j${i}`, 'J', 'hearts')),
    withTower(5, SQUARE),
  )
}

describe('Jack — Shield', () => {
  it('grants a shield', () => {
    const state = withJacks(1)
    const after = step(state, { kind: 'shieldTower', cardId: 'j0', towerId: state.towers[0]!.id })

    expect(after.towers[0]?.shield).toBe(JACK_SHIELD)
  })

  it('stacks additively', () => {
    let state = withJacks(3)
    const towerId = state.towers[0]!.id

    for (let i = 0; i < 3; i += 1) {
      state = step(state, { kind: 'shieldTower', cardId: `j${i}`, towerId })
    }

    expect(state.towers[0]?.shield).toBe(JACK_SHIELD * 3)
  })

  it('does not touch health', () => {
    const state = withJacks(1)
    const after = step(state, { kind: 'shieldTower', cardId: 'j0', towerId: state.towers[0]!.id })

    expect(after.towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth)
    expect(after.towers[0]?.maxHealth).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('consumes the Card', () => {
    const state = withJacks(1)
    const after = step(state, { kind: 'shieldTower', cardId: 'j0', towerId: state.towers[0]!.id })

    expect(after.deck).toHaveLength(0)
  })

  it('refuses a non-Jack', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')], withTower(5, SQUARE))

    expect(step(state, { kind: 'shieldTower', cardId: 'five', towerId: state.towers[0]!.id })).toBe(state)
  })

  it('refuses an unknown Tower', () => {
    const state = withJacks(1)

    expect(step(state, { kind: 'shieldTower', cardId: 'j0', towerId: 'ghost' })).toBe(state)
  })
})

describe('Queen — Echo', () => {
  function withQueen(): GameState {
    return withDeck([standardCard('q', 'Q', 'diamonds')], withTower(5, SQUARE))
  }

  it('builds a second Tower of the same rank', () => {
    const state = withQueen()
    const after = step(state, {
      kind: 'echoTower',
      cardId: 'q',
      sourceTowerId: state.towers[0]!.id,
      square: ELSEWHERE,
    })

    expect(after.towers).toHaveLength(2)
    expect(after.towers[1]?.cardRank).toBe(5)
    expect(after.towers[1]?.square).toEqual(ELSEWHERE)
  })

  it('copies the rank, not accumulated supports', () => {
    // Otherwise Echo becomes the strongest support multiplier in the game
    // rather than a second Tower.
    const base = withQueen()
    const upgraded: GameState = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, damage: 99, shield: 50, maxHealth: 200 })),
    }

    const after = step(upgraded, {
      kind: 'echoTower',
      cardId: 'q',
      sourceTowerId: upgraded.towers[0]!.id,
      square: ELSEWHERE,
    })

    expect(after.towers[1]?.damage).toBe(TOWER_RANKS[5].damage)
    expect(after.towers[1]?.shield).toBe(0)
    expect(after.towers[1]?.maxHealth).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('refuses an occupied square', () => {
    const state = withQueen()

    expect(
      step(state, { kind: 'echoTower', cardId: 'q', sourceTowerId: state.towers[0]!.id, square: SQUARE }),
    ).toBe(state)
  })

  it('refuses the Core square', () => {
    const state = withQueen()

    expect(
      step(state, {
        kind: 'echoTower',
        cardId: 'q',
        sourceTowerId: state.towers[0]!.id,
        square: state.core.square,
      }),
    ).toBe(state)
  })

  it('refuses an unknown source Tower', () => {
    const state = withQueen()

    expect(
      step(state, { kind: 'echoTower', cardId: 'q', sourceTowerId: 'ghost', square: ELSEWHERE }),
    ).toBe(state)
  })

  it('refuses a non-Queen', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')], withTower(5, SQUARE))

    expect(
      step(state, { kind: 'echoTower', cardId: 'five', sourceTowerId: state.towers[0]!.id, square: ELSEWHERE }),
    ).toBe(state)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/faceCards.test.ts`
Expected: FAIL. Neither command kind exists.

- [ ] **Step 3: Add the commands**

In `src/game/types.ts`, add to `Command`:

```ts
  | { readonly kind: 'shieldTower'; readonly cardId: string; readonly towerId: string }
  | {
      readonly kind: 'echoTower'
      readonly cardId: string
      readonly sourceTowerId: string
      readonly square: Square
    }
```

- [ ] **Step 4: Implement both plays**

In `src/game/cardPlays.ts`, add `JACK_SHIELD` to the `../data/cards` import, then:

```ts
/**
 * Jack: grants a Tower a shield, absorbed before health.
 *
 * A shield differs from ♥ repair in kind, not magnitude: repair is reactive and
 * can be out-paced, a shield is pre-emptive and cannot.
 */
export function shieldTower(state: GameState, cardId: string, towerId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'J') return state

  if (!state.towers.some((tower) => tower.id === towerId)) return state

  return {
    ...state,
    towers: state.towers.map((tower) =>
      tower.id === towerId ? { ...tower, shield: tower.shield + JACK_SHIELD } : tower,
    ),
    deck: removeCard(state.deck, cardId),
  }
}

/**
 * Queen: builds a copy of an existing Tower's RANK on an empty square.
 *
 * Accumulated ♦ ♠ ♣ supports and any shield are deliberately NOT copied —
 * otherwise Echo becomes the strongest support multiplier in the game rather
 * than a second Tower.
 */
export function echoTower(
  state: GameState,
  cardId: string,
  sourceTowerId: string,
  square: Square,
): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'Q') return state

  const source = state.towers.find((tower) => tower.id === sourceTowerId)
  if (!source) return state

  if (!isInBounds(state.board, square)) return state
  if (squaresEqual(square, state.core.square)) return state
  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return state

  const def = towerRank(source.cardRank)

  return {
    ...state,
    towers: [
      ...state.towers,
      {
        id: `tower-${state.nextEntityId}`,
        square,
        cardRank: source.cardRank,
        fireCooldownMs: 0,
        health: def.maxHealth,
        maxHealth: def.maxHealth,
        damage: def.damage,
        fireIntervalMs: def.fireIntervalMs,
        shield: 0,
      },
    ],
    nextEntityId: state.nextEntityId + 1,
    deck: removeCard(state.deck, cardId),
  }
}
```

In `src/game/step.ts`, add:

```ts
    case 'shieldTower':
      return shieldTower(state, command.cardId, command.towerId)
    case 'echoTower':
      return echoTower(state, command.cardId, command.sourceTowerId, command.square)
```

- [ ] **Step 5: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/cardPlays.ts src/game/step.ts src/game/faceCards.test.ts
git commit -m "Add the Jack shield and the Queen echo"
```

---

### Task 9: King reinforces the Core

**Files:**
- Modify: `src/game/types.ts`, `src/game/cardPlays.ts`, `src/game/step.ts`
- Modify: `src/game/faceCards.test.ts`

**Interfaces:**
- Consumes: `KING_CORE_HEALTH` from Task 4; `core.maxHealth` from Task 4.
- Produces: Command `{ kind: 'reinforceCore'; cardId: string }` and `reinforceCore(state, cardId)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/faceCards.test.ts`:

```ts
describe('King — Reinforce', () => {
  function withKing(): GameState {
    return withDeck([standardCard('k', 'K', 'clubs')])
  }

  it('raises both current and maximum Core health', () => {
    const state = withKing()
    const after = step(state, { kind: 'reinforceCore', cardId: 'k' })

    expect(after.core.health).toBe(state.core.health + KING_CORE_HEALTH)
    expect(after.core.maxHealth).toBe(state.core.maxHealth + KING_CORE_HEALTH)
  })

  it('is playable with no Tower on the board, unlike a Jack or Queen', () => {
    const state = withKing()

    expect(state.towers).toHaveLength(0)
    expect(step(state, { kind: 'reinforceCore', cardId: 'k' }).core.health).toBeGreaterThan(
      state.core.health,
    )
  })

  it('heals a damaged Core rather than only granting headroom', () => {
    const state = withKing()
    const hurt: GameState = { ...state, core: { ...state.core, health: 5 } }

    expect(step(hurt, { kind: 'reinforceCore', cardId: 'k' }).core.health).toBe(5 + KING_CORE_HEALTH)
  })

  it('consumes the Card', () => {
    expect(step(withKing(), { kind: 'reinforceCore', cardId: 'k' }).deck).toHaveLength(0)
  })

  it('refuses a non-King', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')])

    expect(step(state, { kind: 'reinforceCore', cardId: 'five' })).toBe(state)
  })
})
```

Add `KING_CORE_HEALTH` to the `../data/cards` import at the top of that file.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/faceCards.test.ts`
Expected: FAIL. `reinforceCore` is not a known command kind.

- [ ] **Step 3: Add the command**

In `src/game/types.ts`, add to `Command`:

```ts
  | { readonly kind: 'reinforceCore'; readonly cardId: string }
```

- [ ] **Step 4: Implement the play**

In `src/game/cardPlays.ts`, add `KING_CORE_HEALTH` to the `../data/cards` import, then:

```ts
/**
 * King: raises Core health, current and maximum together.
 *
 * The only card in the game that touches the Core, and the only Core recovery
 * that exists — `tick` otherwise only ever subtracts from it. Each leak costs
 * exactly 1 Core health, so this buys exactly one extra leak.
 */
export function reinforceCore(state: GameState, cardId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'K') return state

  return {
    ...state,
    core: {
      ...state.core,
      health: state.core.health + KING_CORE_HEALTH,
      maxHealth: state.core.maxHealth + KING_CORE_HEALTH,
    },
    deck: removeCard(state.deck, cardId),
  }
}
```

In `src/game/step.ts`, add:

```ts
    case 'reinforceCore':
      return reinforceCore(state, command.cardId)
```

- [ ] **Step 5: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/cardPlays.ts src/game/step.ts src/game/faceCards.test.ts
git commit -m "Add the King, the only card that reinforces the Core"
```

---

### Task 10: Ace grows the board

The board gains a rank, lengthening the run to the Core. This requires removing the static `SPAWN_RANK`.

**Files:**
- Modify: `src/data/board.ts`
- Modify: `src/game/tick.ts:1,206`
- Modify: `src/game/types.ts`, `src/game/cardPlays.ts`, `src/game/step.ts`
- Modify: `src/game/faceCards.test.ts`

**Interfaces:**
- Consumes: `ACE_BOARD_RANKS` from Task 4.
- Produces: Command `{ kind: 'expandBoard'; cardId: string }` and `expandBoard(state, cardId)`. `SPAWN_RANK` is **removed** from `src/data/board.ts`; `tick.ts` derives the spawn rank as `state.board.ranks - 1`.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/faceCards.test.ts`:

```ts
describe('Ace — Expand', () => {
  function withAce(): GameState {
    return withDeck([standardCard('a', 'A', 'hearts')])
  }

  it('adds a rank to the board', () => {
    const state = withAce()
    const after = step(state, { kind: 'expandBoard', cardId: 'a' })

    expect(after.board.ranks).toBe(state.board.ranks + ACE_BOARD_RANKS)
  })

  it('leaves the files alone, so spawn files stay valid', () => {
    const state = withAce()

    expect(step(state, { kind: 'expandBoard', cardId: 'a' }).board.files).toBe(state.board.files)
  })

  it('leaves the Core where it is, so the run to it lengthens', () => {
    const state = withAce()

    expect(step(state, { kind: 'expandBoard', cardId: 'a' }).core.square).toEqual(state.core.square)
  })

  it('is playable with no Tower on the board', () => {
    const state = withAce()

    expect(state.towers).toHaveLength(0)
    expect(step(state, { kind: 'expandBoard', cardId: 'a' }).board.ranks).toBeGreaterThan(
      state.board.ranks,
    )
  })

  it('consumes the Card', () => {
    expect(step(withAce(), { kind: 'expandBoard', cardId: 'a' }).deck).toHaveLength(0)
  })

  it('refuses a non-Ace', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')])

    expect(step(state, { kind: 'expandBoard', cardId: 'five' })).toBe(state)
  })

  it('spawns Pieces from the new far rank, not the old one', () => {
    const grown = step(withAce(), { kind: 'expandBoard', cardId: 'a' })
    const started = step(grown, { kind: 'startRound' })

    const after = tick(started, 1000 / 60)
    const spawned = after.pieces[0]

    expect(spawned).toBeDefined()
    expect(spawned?.square.rank).toBe(grown.board.ranks - 1)
  })
})
```

Add `ACE_BOARD_RANKS` to the `../data/cards` import and `tick` to the `./index` import at the top of that file.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/faceCards.test.ts`
Expected: FAIL. `expandBoard` is not a known command kind.

- [ ] **Step 3: Remove the static spawn rank**

In `src/data/board.ts`, delete the `SPAWN_RANK` export (lines 19-20) and update the comment above `CORE_SQUARE`:

```ts
/**
 * The Core sits on the player's back rank, and stays there. Pieces spawn from
 * whatever the far rank currently is — an Ace grows the board, so the spawn rank
 * is read from state rather than fixed here.
 */
export const CORE_SQUARE: Square = { file: 3, rank: 0 }
```

Also update the header comment, which says the board "remains an open design decision — whether the board is a literal 8x8": it is now settled as *growable*, starting at 8x8.

- [ ] **Step 4: Read the spawn rank from state**

In `src/game/tick.ts`, remove the `SPAWN_RANK` import from line 1. In `drainDueSpawns`, replace line 206:

```ts
    // Read from state, not a constant: an Ace grows the board and Pieces must
    // then enter from the new far rank.
    const square: Square = { file: spawn.file, rank: state.board.ranks - 1 }
```

- [ ] **Step 5: Add the command**

In `src/game/types.ts`, add to `Command`:

```ts
  | { readonly kind: 'expandBoard'; readonly cardId: string }
```

- [ ] **Step 6: Implement the play**

In `src/game/cardPlays.ts`, add `ACE_BOARD_RANKS` to the `../data/cards` import, then:

```ts
/**
 * Ace: grows the board by a rank, lengthening the run to the Core.
 *
 * Ranks only, never files — `data/rounds.ts` derives spawn files from
 * `BOARD.files`, and leaving files fixed keeps that correct.
 *
 * Growth is uncapped, which is safe only because this slice's Deck is authored
 * and holds a known number of Aces. Once packs land, unlimited copies mean an
 * arbitrarily long board — a rendering and camera problem as much as a balance
 * one. It will want a cap then.
 */
export function expandBoard(state: GameState, cardId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'standard' || card.rank !== 'A') return state

  return {
    ...state,
    board: { ...state.board, ranks: state.board.ranks + ACE_BOARD_RANKS },
    deck: removeCard(state.deck, cardId),
  }
}
```

In `src/game/step.ts`, add:

```ts
    case 'expandBoard':
      return expandBoard(state, command.cardId)
```

- [ ] **Step 7: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS. The renderer already derives every position from `board`, so nothing in `src/scene/` needs changing — `pnpm build` confirms it.

- [ ] **Step 8: Commit**

```bash
git add src/data/board.ts src/game/tick.ts src/game/types.ts src/game/cardPlays.ts \
        src/game/step.ts src/game/faceCards.test.ts
git commit -m "Add the Ace, which grows the board and lengthens the run to the Core"
```

---

### Task 11: Joker clears the board

**Files:**
- Modify: `src/game/types.ts`, `src/game/cardPlays.ts`, `src/game/step.ts`
- Modify: `src/game/faceCards.test.ts`

**Interfaces:**
- Consumes: `jokerCard` from Task 6's fixtures.
- Produces: Command `{ kind: 'clearPieces'; cardId: string }` and `clearPieces(state, cardId)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/faceCards.test.ts`:

```ts
describe('Joker — Clear', () => {
  function withJoker(): GameState {
    const built = withTower(5, SQUARE)
    const seeded = withDeck([jokerCard('joker')], built)

    return liveRound(seeded, [pawnAt('a', { file: 1, rank: 6 }), pawnAt('b', { file: 6, rank: 3 })])
  }

  it('destroys every Piece on the board', () => {
    const after = step(withJoker(), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.pieces).toHaveLength(0)
  })

  it('spares the Towers, which are only ever destroyed by Pieces', () => {
    const after = step(withJoker(), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.towers).toHaveLength(1)
  })

  it('leaves pendingSpawns alone, so a round still spawning continues', () => {
    const state = withJoker()
    const spawning: GameState = {
      ...state,
      pendingSpawns: [{ atMs: 9_000, typeId: 'pawn', file: 2 }],
    }

    const after = step(spawning, { kind: 'clearPieces', cardId: 'joker' })

    expect(after.pendingSpawns).toHaveLength(1)
    expect(after.phase).toBe('inProgress')
  })

  it('consumes the Card', () => {
    expect(step(withJoker(), { kind: 'clearPieces', cardId: 'joker' }).deck).toHaveLength(0)
  })

  it('refuses a standard card, since Clear is a Joker’s only play', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')], withTower(5, SQUARE))

    expect(step(state, { kind: 'clearPieces', cardId: 'five' })).toBe(state)
  })

  it('breaks a grind, so a stalled round can always be resolved', () => {
    // A rank-5 diagonal Tower cannot cover the square directly up-file, so this
    // Pawn grinds it forever. The Joker is the one card that always ends it.
    const built = withTower(5, { file: 3, rank: 4 })
    const seeded = withDeck([jokerCard('joker')], built)
    const stalled = liveRound(seeded, [pawnAt('grinder', { file: 3, rank: 5 })])

    const cleared = step(stalled, { kind: 'clearPieces', cardId: 'joker' })
    const after = tick(cleared, 1000 / 60)

    expect(after.phase).toBe('gap')
  })
})
```

Add `jokerCard`, `liveRound` and `pawnAt` to the `./fixtures` import at the top of that file.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/game/faceCards.test.ts`
Expected: FAIL. `clearPieces` is not a known command kind.

- [ ] **Step 3: Add the command**

In `src/game/types.ts`, add to `Command`:

```ts
  | { readonly kind: 'clearPieces'; readonly cardId: string }
```

- [ ] **Step 4: Implement the play**

In `src/game/cardPlays.ts`:

```ts
/**
 * Joker: destroys every Piece standing on the board.
 *
 * Towers are untouched — they are permanent once placed and only ever destroyed
 * by Pieces. `pendingSpawns` is untouched too, so a round still spawning
 * continues rather than ending early.
 *
 * Being suitless, this is a Joker's only play.
 *
 * It is also the one card that can always break a grind, which makes it the
 * safety valve for the repair-versus-the-wall stall. See the spec.
 *
 * NOTE for when Ink lands: clearing twenty Pawns must not pay twenty kill
 * rewards, or this becomes an income exploit.
 */
export function clearPieces(state: GameState, cardId: string): GameState {
  if (state.phase === 'defeated') return state

  const card = findCard(state.deck, cardId)
  if (!card || card.kind !== 'joker') return state

  return {
    ...state,
    pieces: [],
    deck: removeCard(state.deck, cardId),
  }
}
```

In `src/game/step.ts`, add:

```ts
    case 'clearPieces':
      return clearPieces(state, command.cardId)
```

- [ ] **Step 5: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/cardPlays.ts src/game/step.ts src/game/faceCards.test.ts
git commit -m "Add the Joker, which clears every Piece from the board"
```

---

### Task 12: The Deck UI

The whole Deck is always visible — no hand, no drawing, nothing hidden. Selecting a card and choosing its mode is the player's whole interface to the card system.

**Files:**
- Create: `src/ui/Deck.tsx`
- Modify: `src/ui/Hud.tsx`, `src/state/uiStore.ts`, `src/index.css`, `src/scene/Board.tsx`

**Interfaces:**
- Consumes: every command from Tasks 6–11; `uiStore.selectedCardId` from Task 6.
- Produces:
  - `uiStore.playMode: 'build' | 'support'`, `setPlayMode`
  - `<Deck />`, rendered by `Hud`

- [ ] **Step 1: Add the play mode to the UI store**

In `src/state/uiStore.ts`, add:

```ts
  /**
   * Which of a Card's two modes the next click applies. Rank builds, suit
   * supports — the choice happens at play time, not at selection time.
   */
  playMode: 'build' | 'support'
  setPlayMode: (mode: 'build' | 'support') => void
```

```ts
  playMode: 'build',
  setPlayMode: (playMode) => set({ playMode }),
```

- [ ] **Step 2: Build the Deck component**

Create `src/ui/Deck.tsx`:

```tsx
import { supportMagnitude } from '../data/cards'
import { towerRank } from '../data/towerRanks'
import { isBuildableRank, type Card } from '../game'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'

const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' } as const

const SUIT_ACTION = {
  hearts: 'Repair',
  diamonds: 'Speed',
  spades: 'Health',
  clubs: 'Damage',
} as const

const FACE_ACTION = {
  J: 'Shield a Tower',
  Q: 'Copy a Tower',
  K: 'Reinforce the Core',
  A: 'Grow the board',
} as const

function cardLabel(card: Card): string {
  if (card.kind === 'joker') return 'Joker'
  return `${card.rank}${SUIT_GLYPH[card.suit]}`
}

/**
 * What playing this Card for its rank would do.
 *
 * A numbered Card builds; a face Card acts instead; a Joker has one play and no
 * rank at all.
 */
function rankModeLabel(card: Card): string {
  if (card.kind === 'joker') return 'Clear every Piece'
  if (!isBuildableRank(card.rank)) return FACE_ACTION[card.rank]

  const def = towerRank(card.rank)
  return `Build — range ${def.range}, ${def.damage} dmg`
}

/**
 * The Deck: every Card held this run, always visible and always playable.
 *
 * There is no hand and no draw pile, so nothing here is hidden. Duplicates are
 * individually selectable — three 5♦ are three distinct Cards, and playing one
 * leaves two.
 */
export function Deck() {
  const deck = useGameStore((store) => store.snapshot.deck)
  const towers = useGameStore((store) => store.snapshot.towers)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const setSelectedCardId = useUiStore((store) => store.setSelectedCardId)
  const playMode = useUiStore((store) => store.playMode)
  const setPlayMode = useUiStore((store) => store.setPlayMode)

  const selected = deck.find((card) => card.id === selectedCardId)

  // King, Ace and Joker take no target, so they resolve from here rather than
  // waiting for a board click.
  const untargeted = selected && resolveUntargeted(selected)

  return (
    <div className="deck">
      <div className="deck__header">
        <span className="hud__label">Deck</span>
        <span className="hud__muted">{deck.length} cards</span>
      </div>

      <ul className="deck__cards">
        {deck.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className={`deck__card${card.id === selectedCardId ? ' deck__card--active' : ''}${
                card.kind === 'standard' ? ` deck__card--${card.suit}` : ' deck__card--joker'
              }`}
              onClick={() => setSelectedCardId(card.id === selectedCardId ? null : card.id)}
            >
              {cardLabel(card)}
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="deck__detail">
          <div className="deck__modes">
            <button
              type="button"
              className={`deck__mode${playMode === 'build' ? ' deck__mode--active' : ''}`}
              onClick={() => setPlayMode('build')}
            >
              {rankModeLabel(selected)}
            </button>

            {selected.kind === 'standard' ? (
              <button
                type="button"
                className={`deck__mode${playMode === 'support' ? ' deck__mode--active' : ''}`}
                onClick={() => setPlayMode('support')}
              >
                {SUIT_ACTION[selected.suit]} {supportMagnitude(selected.rank)}
              </button>
            ) : null}
          </div>

          {untargeted ? (
            <button
              type="button"
              className="hud__button"
              onClick={() => {
                dispatch(untargeted)
                setSelectedCardId(null)
              }}
            >
              Play
            </button>
          ) : (
            <p className="hud__hint">
              {playMode === 'support' || (selected.kind === 'standard' && selected.rank === 'J')
                ? `Click a Tower${towers.length === 0 ? ' — you have none yet' : ''}`
                : 'Click a square on the board'}
            </p>
          )}
        </div>
      ) : (
        <p className="hud__hint">Pick a Card to play it.</p>
      )}
    </div>
  )
}

/** The command for a Card that needs no target, or null if it needs one. */
function resolveUntargeted(card: Card) {
  if (card.kind === 'joker') return { kind: 'clearPieces', cardId: card.id } as const
  if (card.rank === 'K') return { kind: 'reinforceCore', cardId: card.id } as const
  if (card.rank === 'A') return { kind: 'expandBoard', cardId: card.id } as const
  return null
}
```

- [ ] **Step 3: Dispatch the right command on a board click**

In `src/scene/Board.tsx`, replace the `onClick` handler so it respects the play mode. A Support or Shield play needs a Tower, so it resolves the clicked square to one:

```tsx
      onClick={(event) => {
        event.stopPropagation()

        const { selectedCardId, playMode, setSelectedCardId } = useUiStore.getState()
        if (!selectedCardId) return

        const square = {
          file: worldXToFile(board, event.point.x),
          rank: worldZToRank(board, event.point.z),
        }

        const state = simulation.getState()
        const card = findCard(state.deck, selectedCardId)
        if (!card) return

        const clickedTower = state.towers.find(
          (tower) => tower.square.file === square.file && tower.square.rank === square.rank,
        )

        if (playMode === 'support' && card.kind === 'standard') {
          if (!clickedTower) return
          dispatch({ kind: 'supportTower', cardId: selectedCardId, towerId: clickedTower.id })
          setSelectedCardId(null)
          return
        }

        if (card.kind === 'standard' && card.rank === 'J') {
          if (!clickedTower) return
          dispatch({ kind: 'shieldTower', cardId: selectedCardId, towerId: clickedTower.id })
          setSelectedCardId(null)
          return
        }

        if (card.kind === 'standard' && card.rank === 'Q') {
          // Echo needs a source Tower as well as a destination. Copy the
          // player's only Tower when there is exactly one; otherwise require
          // them to hold a Tower selected first is out of scope for this slice,
          // so refuse rather than guess.
          const source = state.towers.length === 1 ? state.towers[0] : undefined
          if (!source) return
          dispatch({
            kind: 'echoTower',
            cardId: selectedCardId,
            sourceTowerId: source.id,
            square,
          })
          setSelectedCardId(null)
          return
        }

        dispatch({ kind: 'buildTower', cardId: selectedCardId, square })
        setSelectedCardId(null)
      }}
```

Add the imports it needs:

```tsx
import { allSquares, findCard, squareKey, type BoardSpec } from '../game'
import * as simulation from '../state/simulation'
```

**Note on the Queen:** copying works only when the player has exactly one Tower. Picking a source Tower needs a second selection step, which this slice does not build. Record it as a known limitation in the commit message rather than guessing at a UI.

- [ ] **Step 4: Render the Deck**

In `src/ui/Hud.tsx`, import and render it inside `hud__panel`, after the stats list:

```tsx
import { Deck } from './Deck'
```

```tsx
        <Deck />
```

- [ ] **Step 5: Style it**

In `src/index.css`, add styles alongside the existing `hud__*` rules. Match the file's existing conventions — read it first and follow whatever custom properties and spacing scale it already defines.

```css
.deck {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.deck__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.deck__cards {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0;
  margin: 0;
  list-style: none;
  max-height: 9rem;
  overflow-y: auto;
}

.deck__card {
  min-width: 2.75rem;
  padding: 0.35rem 0.4rem;
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 0.25rem;
  background: rgb(255 255 255 / 0.06);
  color: inherit;
}

.deck__card--hearts,
.deck__card--diamonds {
  color: #f08a8a;
}

.deck__card--active {
  border-color: #4fd1c5;
  background: rgb(79 209 197 / 0.18);
}

.deck__detail {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.deck__modes {
  display: flex;
  gap: 0.25rem;
}

.deck__mode {
  flex: 1;
  padding: 0.35rem 0.5rem;
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgb(255 255 255 / 0.18);
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
}

.deck__mode--active {
  border-color: #4fd1c5;
  background: rgb(79 209 197 / 0.14);
}
```

- [ ] **Step 6: Verify by hand**

Run: `pnpm dev`

Confirm in the browser:
- The Deck lists 28 cards, with duplicates shown separately.
- Selecting a numbered card and hovering the board previews its coverage; clicking builds and the card disappears from the Deck.
- Switching to the suit mode and clicking a Tower applies the support.
- A King or Ace shows a Play button and resolves with no board click. After an Ace, the board is visibly one rank longer.
- A Joker clears the Pieces mid-round.

- [ ] **Step 7: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/Deck.tsx src/ui/Hud.tsx src/state/uiStore.ts src/scene/Board.tsx src/index.css
git commit -m "Add the visible Deck and play a Card for its rank or its suit

Queen Echo currently copies only when the player has exactly one Tower;
choosing a source Tower needs a second selection step this slice does not
build."
```

---

### Task 13: Pin the round-termination bound

The round-end rule leans on an invariant nothing states: Towers only ever lose health, so a blocked Piece always unblocks eventually. ♥ Repair is the first mechanic that can break it. This task asserts the bound that keeps deferring the decision safe, and names the invariant in the code.

**Files:**
- Create: `src/game/roundTermination.test.ts`
- Modify: `src/game/tick.ts:72-85`

**Interfaces:**
- Consumes: `applySupport` and the `supportTower` command from Task 7; fixtures from Task 6.
- Produces: no new exports.

- [ ] **Step 1: Write the test**

Create `src/game/roundTermination.test.ts`:

```ts
/**
 * The round-end rule depends on an invariant that nothing else states:
 * **Towers only ever lose health**, so a grind is always a countdown and a
 * blocked Piece always unblocks eventually.
 *
 * ♥ Repair is the first mechanic that can break it. The design defers the fix
 * deliberately, because a finite unreplenished Deck bounds the problem: repair
 * runs out, the Tower falls, the round ends. These tests pin that bound so the
 * safety property is asserted rather than assumed — and so that whoever adds
 * packs sees exactly what they are removing.
 */
import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { coversSquare } from './coverage'
import { liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState } from './types'

const DT = 1000 / 60
const TOWER_SQUARE = { file: 3, rank: 4 }
const GRINDER_SQUARE = { file: 3, rank: 5 }

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A rank-5 diagonal Tower with a Pawn grinding it from directly up-file. */
function grind(hearts: number): GameState {
  const deck = Array.from({ length: hearts }, (_, i) => standardCard(`h${i}`, 10, 'hearts'))
  const built = withDeck(deck, withTower(5, TOWER_SQUARE))

  return liveRound(built, [pawnAt('grinder', GRINDER_SQUARE)])
}

describe('the diagonal blind spot', () => {
  it('cannot cover the square directly up-file, so it never shoots its attacker', () => {
    const { geometry, range } = TOWER_RANKS[5]

    expect(coversSquare(geometry, range, TOWER_SQUARE, GRINDER_SQUARE)).toBe(false)
  })

  it('leaves the grinding Pawn completely undamaged', () => {
    const after = runFor(grind(0), 10_000)

    expect(after.pieces[0]?.health).toBe(3)
  })
})

describe('the wall is bounded by card scarcity', () => {
  it('stalls the round for as long as the Tower is kept alive', () => {
    // Repair on every pass, standing in for a player with cards to spare.
    let state = grind(40)

    for (let elapsed = 0; elapsed < 30_000; elapsed += DT) {
      state = tick(state, DT)

      const tower = state.towers[0]
      const heart = state.deck[0]
      if (tower && heart && tower.health < tower.maxHealth) {
        state = step(state, { kind: 'supportTower', cardId: heart.id, towerId: tower.id })
      }
    }

    expect(state.phase).toBe('inProgress')
    expect(state.towers).toHaveLength(1)
  })

  it('ends once the ♥ supply is exhausted — the bound that makes deferring safe', () => {
    // Two repairs only. The Tower must still fall, and the round must still end.
    let state = grind(2)

    for (let elapsed = 0; elapsed < 60_000; elapsed += DT) {
      state = tick(state, DT)

      const tower = state.towers[0]
      const heart = state.deck[0]
      if (tower && heart && tower.health < tower.maxHealth) {
        state = step(state, { kind: 'supportTower', cardId: heart.id, towerId: tower.id })
      }

      if (state.phase === 'gap') break
    }

    expect(state.deck).toHaveLength(0)
    expect(state.towers).toHaveLength(0)
    expect(state.phase).toBe('gap')
  })

  it('a Joker always breaks the grind, whatever the ♥ supply', () => {
    const state = withDeck(
      [{ id: 'joker', kind: 'joker' }],
      withTower(5, TOWER_SQUARE),
    )
    const stalled = liveRound(state, [pawnAt('grinder', GRINDER_SQUARE)])

    const after = tick(step(stalled, { kind: 'clearPieces', cardId: 'joker' }), DT)

    expect(after.phase).toBe('gap')
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run src/game/roundTermination.test.ts`
Expected: PASS. Nothing new is being implemented — these tests document and lock in behaviour that already holds. If the exhaustion test fails, the bound does not actually exist and the deferral in the spec is unsafe: stop and report rather than adjusting the test to pass.

- [ ] **Step 3: Name the invariant in the code**

In `src/game/tick.ts`, extend the comment above the `stillActive` calculation:

```ts
  // A round ends when nothing on the board can still act — not when the board is
  // empty. Chess movement leaves Pieces genuinely stranded: a pawn that reaches
  // the back rank off the Core's file has no legal move for the rest of the run.
  // Waiting for an empty board would hang the round forever.
  //
  // Stranded Pieces are deliberately left standing rather than quietly deleted,
  // so the gap is visible. The designed answer is Pawn promotion, which is not
  // implemented. See the design doc's open questions.
  //
  // LOAD-BEARING INVARIANT: a Piece blocked by a Tower returns `attackTower`,
  // not `stuck`, so it counts as active and this round cannot end while it
  // grinds. That terminates only because Towers can be healed no more than the
  // Deck allows — cards are consumed and nothing replenishes them, so repair is
  // finite and the Tower always eventually falls.
  //
  // ADDING PACKS REMOVES THAT BOUND. Unlimited ♥ means an unbreakable Tower and
  // a round that never ends — worst against a diagonal Tower, which cannot even
  // shoot a Piece attacking from directly up-file. `roundTermination.test.ts`
  // pins the bound; see "Repair versus the wall" in the design docs before
  // changing anything here.
```

- [ ] **Step 4: Run everything**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/roundTermination.test.ts src/game/tick.ts
git commit -m "Pin the bound that makes deferring the repair-wall decision safe"
```

---

### Task 14: Update the documentation

Three roles, three homes. The design changed, so `game-design.md` changes; several code comments are now false.

**Files:**
- Modify: `docs/design/game-design.md`
- Modify: `CLAUDE.md`
- Modify: `src/game/tick.ts:16-20`, `src/data/pieceTypes.ts:3-14`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing in code.

- [ ] **Step 1: Update the living design doc**

In `docs/design/game-design.md`:

1. Replace the rank ladder table with ranks 2–10 as built, noting that shape carries identity to 7 and target count carries it from 8.
2. Replace the "Ace, the face cards, and the Jokers perform specific actions … Specifics undesigned" paragraph with the five actions: Jack shields, Queen echoes, King reinforces the Core, Ace grows the board, Joker clears the Pieces. State the governing principle — **suits tune numbers, face cards change kind**.
3. Add the suit magnitude rule (face value, J 11 through A 14) and that ♠ raises the ceiling without healing.
4. In "The Deck", state that the Deck is a **multiset** — cards come from random packs, so duplicates are normal and a Card's identity is its own id, not its rank and suit.
5. Change "Board geometry" from an open question to settled: the board starts 8×8 and **grows by rank when an Ace is played**, so it is no longer a literal square. Note that square colour is `(file + rank)` parity and survives this, so the Knight's vulnerability is unaffected.
6. In the open-questions table, **delete** the rows for "Ranks 6–10", "Ace, face cards, Jokers" and "Board geometry".
7. Keep the "Repair versus the wall" row, and update it: it is now reachable, the bound is finite card supply, `roundTermination.test.ts` pins it, and the Joker is the escape hatch.
8. Add a note that the never-stuck property is **not** fully preserved — Jack and Queen need a Tower standing, so a Deck of only those two with an empty board is dead cards. Not a softlock.
9. Add two forward notes: unlimited copies mean unbounded Core health (King) and unbounded board length (Ace) once packs land.

- [ ] **Step 2: Update CLAUDE.md**

1. In "Current state", replace the "What does not exist yet" bullet about Cards — the Deck, Ink and modality claim. The Deck and modality now exist; Ink and packs still do not.
2. Remove "Towers are placed by clicking the board" and "Tower combat … have no health, and cannot be damaged or repaired" — both are false.
3. Update the test count. Run `pnpm test:run` and use the real number rather than guessing.
4. Add to "Invariants that constrain code":
   - **A round ends only when no Piece can act, and a blocked Piece counts as acting.** That terminates only because repair is bounded by a finite Deck. Adding packs removes the bound. See `roundTermination.test.ts`.
   - **A Card's identity is its `id`, never its rank and suit.** The Deck is a multiset; duplicates are normal.
   - **The board grows.** Never derive a spawn rank or board extent from a module constant — read `state.board`.
5. Update the vocabulary table: add **Shield**, **Echo**, **Expand** and **Clear** if the terms are used in UI copy, and confirm **Support** covers only the four suit actions.

- [ ] **Step 3: Fix the false code comments**

In `src/game/tick.ts`, replace the `tick` doc comment's stale final paragraph (lines 16-20):

```ts
 * Towers fire, take damage from blocked Pieces, and are destroyed when their
 * health runs out. Shields absorb before health. See `roundTermination.test.ts`
 * for the invariant that makes round completion safe.
```

In `src/data/pieceTypes.ts`, delete the sentence "What remains genuinely undecided is which Pieces attack Towers" — emergent targeting settled that, and every Piece attacks a Tower that blocks it. Keep the note that the roster and stats are placeholders.

- [ ] **Step 4: Verify the docs against the code**

Run: `pnpm test:run`

Read the reported test count and confirm CLAUDE.md matches. Re-read the open-questions table and confirm no row you deleted is still referenced elsewhere in either document.

- [ ] **Step 5: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md src/game/tick.ts src/data/pieceTypes.ts
git commit -m "Update the design docs for the card mechanics"
```

---

## Plan Self-Review

**Spec coverage.** Every section of the spec maps to a task:

| Spec section | Task |
| --- | --- |
| The Card (types, Joker variant, id identity) | 4 |
| The Deck is pack-shaped | 4 |
| Modality | 6, 7 |
| Rank ladder 2–10, `star`, `targetsPerShot` | 1, 2, 3 |
| Rejected `pierce` as separate | 3 |
| `horizontal` stays orphaned | 2 (left untouched, by design) |
| Jack Shield | 5 (mechanic), 8 (card) |
| Queen Echo | 8 |
| King Reinforce | 4 (`core.maxHealth`), 9 |
| Ace Expand | 10 |
| Joker Clear | 11 |
| Suit support actions | 7 |
| Tower carries own stats | 5 |
| Commands | 6, 7, 8, 9, 10, 11 |
| UI | 6 (minimal), 12 (full) |
| Repair versus the wall | 13 |
| The never-stuck hole | 14 (documented) |
| Open questions closed | 14 |
| Testing | every task |
| Documentation to update | 14 |

**Known deviations from the spec**, both recorded in commit messages:

- **Queen Echo's source Tower** — the spec says Echo copies "an existing Tower". The engine command takes an explicit `sourceTowerId`, but the UI in Task 12 only resolves it when the player has exactly one Tower. A source-selection step is out of slice. The engine is complete; the UI is partial.
- **`data/rounds.ts` still derives spawn files from `BOARD.files`** rather than from state. Correct while the Ace grows ranks only, and Task 10 pins that with a test.

**Type consistency check.** `BuildableRank` is introduced in Task 2 and used in Tasks 5, 6, 8. `CardRank` is deleted in Task 2 and reintroduced in Task 4 with a wider meaning — Task 2's step 5 lists every call site to migrate, and Task 4's `supportMagnitude(rank: CardRank)` relies on the new meaning. `findCard` / `removeCard` / `isBuildableRank` are defined in Task 4 and consumed in 6, 7, 8, 9, 10, 11. Fixtures are defined in Task 6 and consumed in 6, 7, 8, 9, 10, 11, 13. `applySupport` is defined in Task 7 and consumed by Task 13's repair loop. `selectTargets` replaces `selectTarget` in Task 3 only, and stays module-private.

**One ordering constraint worth stating:** Task 5 must land before Task 6, because `buildTower` seeds the Tower stat fields Task 5 introduces. Tasks 8–11 may be done in any order once 7 is in.
