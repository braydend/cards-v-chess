# Tower Placement Occupancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a Tower being built on a square a Piece is standing on, and show the player that the square is illegal before they click it.

**Architecture:** `canBuildOn` — the predicate that already gates both plays that put a Tower on the board — moves out of `src/game/cardPlays.ts` into its own module and gains a `state.pieces` clause. It is exported from the engine's public surface so `CoveragePreview` can call the same function, which is what keeps the on-screen marker and the engine's refusal from ever disagreeing. Two tasks: the rule, then the marker.

**Tech Stack:** TypeScript (strict), React 19, React Three Fiber 9, drei 10, three 0.185, zustand 5, Vitest 4, pnpm.

**Spec:** [`docs/superpowers/specs/2026-08-06-tower-placement-occupancy-design.md`](../specs/2026-08-06-tower-placement-occupancy-design.md) — read it before starting. It records *why* each of these choices beat the alternatives, in particular why occupancy reads `piece.square` and not `prevSquare`.

**Issue:** [#15](https://github.com/braydend/cards-v-chess/issues/15). The mirror case — a Piece spawning on top of a Tower — is [#22](https://github.com/braydend/cards-v-chess/issues/22) and is **out of scope**; do not fix it here.

## Global Constraints

Every task's requirements implicitly include all of these.

- **`src/game/` and `src/data/` must never import `react`, `react-dom`, `three`, `zustand`, `@react-three/fiber`, `@react-three/drei`, or anything under `scene/`, `ui/`, or `state/`.** ESLint enforces this — a violation fails `pnpm lint`, it is not merely a convention.
- **`src/scene/` imports engine code from `src/game` (the `index.ts` barrel) only**, never from a module inside it. If the renderer needs something, export it from `src/game/index.ts`.
- **`Math.random` must never appear in `src/game/`.** ESLint enforces this too.
- **Never call `setState` inside `useFrame`** or in fast handlers like `onPointerMove`. Mutate refs directly.
- **Do not add any per-tick-changing value to `structuralKey`.** This plan adds nothing to it; `structuralKey` already carries every Piece's square, which is the whole reason the marker updates on a hop.
- **A growing `limit` on drei's `Instances` needs a `key` on the same value.** Do not remove the existing `key` on the `Instances` in `CoveragePreview.tsx`, and do not introduce a second `Instances` — see Task 2.
- **State is deeply readonly and every engine function is pure.** Return new state; never mutate.
- **An illegal play returns the state unchanged** — the exact same object, so `toBe` identity assertions hold — never throws, and never consumes the Card.
- **Vocabulary, exactly:** Tower, Piece, Core, Round, Card, rank, suit. Never "wave", never "defender", never "hand", never "tile" in code or comments — the domain word is **square**. (Issue #15 says "tile"; the codebase says "square".) Where a Card's rank and a board rank could both appear, name them `cardRank` and `boardRank`.
- **No new test tooling.** There is no jsdom in this project. `src/scene/` is deliberately untested and excluded from coverage; do not add a component-testing stack for Task 2.
- **Use `pnpm test:run` (not `pnpm test`, which is watch mode) in automation.**

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/placement.ts` | **Create.** The single rule for where a Tower may stand: `canBuildOn`. |
| `src/game/cardPlays.ts` | **Modify.** Drop the private `canBuildOn`, import it from `placement.ts`. Both call sites keep their existing shape. |
| `src/game/index.ts` | **Modify.** Re-export `canBuildOn` so `src/scene/` can reach it. |
| `src/game/step.test.ts` | **Modify.** Build refused on a Piece-occupied square; allowed once the Piece hops away. |
| `src/game/faceCards.test.ts` | **Modify.** Queen's Echo refused on a Piece-occupied square. |
| `src/scene/CoveragePreview.tsx` | **Modify.** Call `canBuildOn` for the hovered square; draw a red marker when it is false. |

**No other file changes.** In particular `src/scene/Board.tsx`, `src/scene/boardClick.ts` and `src/game/commandFor.ts` are **not** touched: `Board.tsx:141-145` already treats a refused `dispatch` as "leave the Card selected, the player has not spent it", so a build aimed at an occupied square takes a path that already exists and already behaves correctly. If you find yourself adding a legality check to any of those three, stop — it is a second copy of Task 1's rule.

---

## Task 1: The placement rule

**Files:**
- Create: `src/game/placement.ts`
- Modify: `src/game/cardPlays.ts` (delete the private `canBuildOn` at lines 41-46, add an import)
- Modify: `src/game/index.ts`
- Test: `src/game/step.test.ts` (inside the existing `describe('step: buildTower')`)
- Test: `src/game/faceCards.test.ts` (inside the existing `describe('Queen — Echo')`)

**Interfaces:**
- Consumes: nothing from earlier tasks. From the existing engine: `isInBounds(board, square)` and `squaresEqual(a, b)` from `./board`; the `GameState` and `Square` types from `./types`.
- Produces: `canBuildOn(state: GameState, square: Square): boolean`, exported from `src/game/placement.ts` and re-exported from `src/game/index.ts`. Task 2 calls exactly this signature, passing the published snapshot as `state`.

- [x] **Step 1: Write the failing tests**

Two files. First, in `src/game/step.test.ts`, add these to the **end of the existing `describe('step: buildTower')` block**, after the `'does not consume the Card when the play is refused'` test. `FIVE` is already declared at the top of that describe. Lines 2-3 of the file currently read:

```ts
import { firstTowerId, jokerCard, standardCard, withDeck, withTower } from './fixtures'
import { createInitialState, step } from './index'
```

They become:

```ts
import { firstTowerId, jokerCard, liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { createInitialState, squaresEqual, step, tick } from './index'
```

Then the tests:

```ts
  it('refuses a square a Piece is standing on', () => {
    // Towers block movement, so a Tower and a Piece cannot share a square —
    // building under a Piece manufactures the state blocking exists to prevent.
    const occupied = { file: 2, rank: 2 }
    const initial = liveRound(withDeck([FIVE]), [pawnAt('p', occupied)])
    const state = step(initial, { kind: 'buildTower', cardId: 'five', square: occupied })

    expect(state).toBe(initial)
    expect(state.towers).toHaveLength(0)
    expect(state.deck).toHaveLength(1)
  })

  it('allows the square once the Piece has hopped away', () => {
    // Occupancy is read live from state, not latched on the square: the rule
    // has to stop refusing the moment the Piece leaves.
    const occupied = { file: 2, rank: 2 }
    let state = liveRound(withDeck([FIVE]), [pawnAt('p', occupied)])

    // A Pawn hops every 900ms (data/pieceTypes.ts), so 1000ms is one hop.
    for (let elapsed = 0; elapsed < 1000; elapsed += 1000 / 60) {
      state = tick(state, 1000 / 60)
    }
    expect(state.pieces.some((piece) => squaresEqual(piece.square, occupied))).toBe(false)

    const built = step(state, { kind: 'buildTower', cardId: 'five', square: occupied })

    expect(built.towers).toHaveLength(1)
    expect(built.towers[0]?.square).toEqual(occupied)
  })
```

Second, in `src/game/faceCards.test.ts`, add this to the **end of the existing `describe('Queen — Echo')` block**. `SQUARE`, `ELSEWHERE`, `withQueen`, `liveRound` and `pawnAt` all already exist in that file:

```ts
  it('refuses a square a Piece is standing on', () => {
    // Echo goes through the same placement rule as a rank build, so this is
    // the second half of the same fix, not a separate one.
    const state = liveRound(withQueen(), [pawnAt('p', ELSEWHERE)])

    expect(
      step(state, { kind: 'echoTower', cardId: 'q', sourceTowerId: firstTowerId(state), square: ELSEWHERE }),
    ).toBe(state)
    expect(state.towers).toHaveLength(1)
  })
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/step.test.ts src/game/faceCards.test.ts`

Expected: FAIL. The two refusal tests fail because the build lands — `expect(state).toBe(initial)` reports the objects are not identical, and `towers` has length 1 where 0 was expected. `'allows the square once the Piece has hopped away'` should already PASS; it is a regression guard, and if it fails now, the hop assumption in it is wrong and needs fixing before continuing.

- [x] **Step 3: Create `src/game/placement.ts`**

The whole file:

```ts
/**
 * Where a Tower may stand.
 *
 * One rule, in one place, because it has two very different callers: the play
 * handlers in `cardPlays.ts` refuse an illegal build, and `CoveragePreview`
 * marks an illegal square before the player clicks it. A predicate with a
 * second, narrower copy in the renderer would disagree with the engine and
 * have to be kept in sync by hand.
 */
import { isInBounds, squaresEqual } from './board'
import type { GameState, Square } from './types'

/**
 * Whether a square is free to build on.
 *
 * The Piece clause is not cosmetic. Towers block movement, and a blocked Piece
 * attacks the Tower instead of advancing — so a Piece sharing a Tower's square
 * is one that walked through what should have stopped it. Building underneath a
 * Piece manufactures exactly that state, which is why it is refused.
 *
 * Occupancy reads `piece.square` and nothing else. `prevSquare` exists only so
 * the renderer can interpolate a hop, and the engine does not read it: a Piece
 * that has just hopped frees its old square immediately, even though the
 * renderer is still animating it leaving. See the spec for why the alternative
 * loses.
 */
export function canBuildOn(state: GameState, square: Square): boolean {
  if (!isInBounds(state.board, square)) return false
  if (squaresEqual(square, state.core.square)) return false
  if (state.towers.some((tower) => squaresEqual(tower.square, square))) return false

  return !state.pieces.some((piece) => squaresEqual(piece.square, square))
}
```

- [x] **Step 4: Wire it into `cardPlays.ts`**

Delete the private `canBuildOn` function and its `/** Whether a square is free to build on. */` comment (lines 41-46), then import the new one. The two call sites — in `buildTower` and `echoTower` — do not change at all.

The import block at the top of `cardPlays.ts` becomes:

```ts
import { ACE_BOARD_RANKS, JACK_SHIELD, KING_CORE_HEALTH, supportMagnitude } from '../data/cards'
import { towerRank } from '../data/towerRanks'
import { canBuildOn } from './placement'
import { findCard, isBuildableRank, removeCard } from './cards'
import type { BuildableRank, GameState, Square, Tower } from './types'
```

Note the `./board` import is gone from that list. `isInBounds` and `squaresEqual` were used **only** inside `canBuildOn` (lines 41, 42 and 44 — verified, there are no other uses in the file), so `import { isInBounds, squaresEqual } from './board'` on line 10 must be **deleted**. An unused import fails `pnpm lint`.

- [x] **Step 5: Export it from the engine's public surface**

In `src/game/index.ts`, add the export. Keep the existing alphabetical-by-module ordering — it goes between the `./movement` and `./state` lines:

```ts
export { canBuildOn } from './placement'
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:run src/game/step.test.ts src/game/faceCards.test.ts`

Expected: PASS, all of them — including the pre-existing refusals for out of bounds, the Core square, and an already-occupied Tower square, which now run through the moved function and must still hold.

- [x] **Step 7: Run the whole suite, the linter, and the type checker**

Run: `pnpm test:run && pnpm lint && pnpm typecheck`

Expected: all green. Watch for two specific things:

- **A test elsewhere that built a Tower on a Piece's square as arrangement** would now silently get a Tower-less state, or throw from `withTower`. If any test outside the two files above fails, read it before changing it: the fixture throwing `withTower: build was refused` means that test's arrangement was relying on the bug.
- `pnpm lint` catching an unused `isInBounds` / `squaresEqual` import in `cardPlays.ts` (Step 4).

- [x] **Step 8: Check coverage still passes**

Run: `pnpm test:coverage`

Expected: PASS. `src/game/placement.ts` is a new measured file — it is inside the `src/game/**` threshold, which is a ratchet just under current coverage, so a new file with an uncovered branch can push the directory under. Every branch in `canBuildOn` is exercised by the tests above plus the pre-existing bounds/Core/Tower refusals, so this should hold; if it does not, add the missing case as a test rather than moving the threshold.

- [x] **Step 9: Commit**

```bash
git add src/game/placement.ts src/game/cardPlays.ts src/game/index.ts src/game/step.test.ts src/game/faceCards.test.ts
git commit -m "Refuse a Tower on a square a Piece stands on

canBuildOn never consulted state.pieces, so a Tower could be built
underneath a Piece — a Piece sharing a Tower's square is one that walked
through what should have blocked it.

Moves the predicate to its own module, because the renderer is about to
call it too, and adds the Piece clause. Both plays that place a Tower — a
rank build and a Queen's Echo — go through it, so both are fixed.

Closes #15"
```

---

## Task 2: The illegal-square marker

**Files:**
- Modify: `src/scene/CoveragePreview.tsx`
- Test: none. `src/scene/` needs a browser and is deliberately untested and excluded from coverage; the decision this component now makes lives in `canBuildOn`, which Task 1 tested directly. **Do not add jsdom or a component test.**

**Interfaces:**
- Consumes: `canBuildOn(state: GameState, square: Square): boolean` from `../game`, exported in Task 1.
- Produces: nothing other tasks rely on. This is the last task.

- [x] **Step 1: Understand what is already there**

Read `src/scene/CoveragePreview.tsx` in full first — it is about 60 lines. Today it subscribes to `snapshot.deck`, computes the footprint a selected build-mode Card would cover from the hovered square, and returns `null` when nothing is covered. Two details matter:

- **`coversSquare` never covers its own square** (`src/game/coverage.ts` returns false at distance 0). So the hovered square is never in `covered`, and the red marker cannot collide with a teal one. No filtering is needed.
- **The `key` on `Instances` is load-bearing** and its comment explains why. Leave both alone.

- [x] **Step 2: Replace the component body**

Three changes: subscribe to the whole snapshot rather than `snapshot.deck`, fold the legality answer into the memo, and render a red marker at the origin when the build is illegal.

The file's imports become:

```tsx
import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { towerRank } from '../data/towerRanks'
import {
  allSquares,
  canBuildOn,
  coversSquare,
  findCard,
  isBuildableRank,
  isInBounds,
  squareKey,
  type BoardSpec,
} from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const COVERED = '#4fd1c5'
const ILLEGAL = '#f56565'
```

And the component:

```tsx
export function CoveragePreview({ board }: { board: BoardSpec }) {
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const playMode = useUiStore((store) => store.playMode)
  // The whole snapshot, not just the Deck: legality depends on Pieces, Towers
  // and the Core square too. Subscribing to the snapshot means this re-renders
  // on every Piece hop, which is what makes the marker clear itself when the
  // Piece leaves — and is affordable here in a way it is not in Board.tsx,
  // because this component draws a handful of planes and only while a build
  // Card is picked, rather than every square on the board.
  const snapshot = useGameStore((store) => store.snapshot)

  const preview = useMemo(() => {
    if (!hoveredSquare || !isInBounds(board, hoveredSquare)) return null
    if (!selectedCardId || playMode !== 'build') return null

    const card = findCard(snapshot.deck, selectedCardId)
    if (!card || card.kind !== 'standard' || !isBuildableRank(card.rank)) return null

    const { geometry, range } = towerRank(card.rank)

    return {
      // `coversSquare` never covers its own square, so `hoveredSquare` is
      // never in here — the red marker below cannot land on a teal one.
      covered: allSquares(board).filter((square) => coversSquare(geometry, range, hoveredSquare, square)),
      // The engine's own predicate, deliberately: a narrower copy here would
      // disagree with the refusal in `cardPlays.ts`. It reads false for a
      // Piece, the Core square and an existing Tower alike.
      legal: canBuildOn(snapshot, hoveredSquare),
      origin: hoveredSquare,
    }
  }, [board, snapshot, hoveredSquare, playMode, selectedCardId])

  if (!preview) return null

  return (
    <>
      {/* `key` is keyed on the slot count for the same reason as the board's
          `Instances` — see the comment in Board.tsx. Unreachable today (this
          unmounts whenever nothing is hovered, and selecting the Ace in the
          Deck empties the preview, so it always remounts at the new size
          anyway) but it is the identical defect, and relying on that unmount
          is relying on a Deck-interaction detail rather than on anything this
          component controls. */}
      <Instances key={board.files * board.ranks} limit={board.files * board.ranks}>
        <boxGeometry args={[SQUARE_SIZE * 0.9, 0.02, SQUARE_SIZE * 0.9]} />
        <meshBasicMaterial color={COVERED} transparent opacity={0.42} depthWrite={false} />
        {preview.covered.map((square) => (
          <Instance
            key={squareKey(square)}
            position={[fileToWorldX(board, square.file), 0.04, rankToWorldZ(board, square.rank)]}
          />
        ))}
      </Instances>

      {/* One square, so a plain mesh. A second `Instances` would need a
          `limit` and a matching `key`, which is the exact hazard that produced
          the Ace wedge; a single mesh cannot have it. */}
      {!preview.legal && (
        <mesh
          position={[
            fileToWorldX(board, preview.origin.file),
            0.04,
            rankToWorldZ(board, preview.origin.rank),
          ]}
        >
          <boxGeometry args={[SQUARE_SIZE * 0.9, 0.02, SQUARE_SIZE * 0.9]} />
          <meshBasicMaterial color={ILLEGAL} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
```

Keep the file's existing top-of-file doc comment, and extend it with a sentence on the marker — the component now says two things, not one: this is the footprint, and this square will not accept it.

- [x] **Step 3: Verify the type checker and linter**

Run: `pnpm typecheck && pnpm lint`

Expected: both PASS. `pnpm lint` is doing real work here — it is what catches an accidental deep import (`from '../game/placement'` instead of `from '../game'`).

- [x] **Step 4: Confirm the whole suite is still green**

Run: `pnpm test:run`

Expected: PASS. Nothing in this task touches the engine, so a failure here means Step 2 changed more than the component.

- [x] **Step 5: Commit**

```bash
git add src/scene/CoveragePreview.tsx
git commit -m "Mark an illegal build square in the coverage preview

The engine now refuses a build on a Piece's square, but the click was a
silent no-op with nothing on screen saying why.

The preview calls the engine's own canBuildOn and reddens the hovered
square when it is false, so it also covers the Core square and an
occupied Tower square rather than keeping a narrower rule of its own that
could drift from the refusal."
```

- [x] **Step 6: Mark the plan complete**

Tick every checkbox in this file, then commit it:

```bash
git add docs/superpowers/plans/2026-08-06-tower-placement-occupancy.md
git commit -m "Mark the tower placement occupancy plan complete"
```

---

## Verification of the finished work

The spec asks for engine tests only, so this is the whole automated bar — run it before opening a pull request:

```bash
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
```

That is exactly what CI runs. All four must pass.

The marker itself has no automated coverage by design. If you want to see it, `pnpm dev`, start a round, pick a rank Card from the Deck, and hover a square with a Piece on it — the footprint stays teal and the hovered square reads red. The same red should appear over the Core and over an existing Tower.
