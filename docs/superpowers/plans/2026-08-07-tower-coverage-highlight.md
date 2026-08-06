# Tower Coverage Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selecting a Tower lights every square it covers, in amber, so a placed Tower's footprint is readable instead of invisible — and the inspect panel gains the one `TowerRankDef` figure it omits, targets per shot.

**Architecture:** One new pure engine helper (`coveredSquares`) over the existing `coversSquare` predicate, one new pure renderer decision module (`src/scene/towerCoverage.ts`), one new component (`src/scene/TowerCoverage.tsx`) mounted from `Board.tsx`, and one extra line in `TowerPanel`. No `GameState` field, no new Command, no change to `step`, `tick` or `structuralKey`.

**Tech Stack:** TypeScript (strict), React Three Fiber, drei `Instances`, zustand, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-07-tower-coverage-highlight-design.md`](../specs/2026-08-07-tower-coverage-highlight-design.md)

## Global Constraints

- **`src/game/` and `src/data/` must never import React or three.js.** ESLint fails the build. `coveredSquares` is plain TS over plain data.
- **`src/scene/` and `src/ui/` must import engine code through the `../game` barrel**, never a module inside it. `import { coveredSquares } from '../game'` is correct; `'../game/coverage'` is a lint error. **Test files are exempt** — that is what lets a test import `../game/fixtures`.
- **A growing `limit` on drei's `Instances` needs a `key` on the same value.** Non-negotiable; see the Ace wedge in CLAUDE.md. This change adds the third such `Instances`.
- **Never derive a board extent from a constant.** Read `board.files` / `board.ranks`, which the component already receives as a prop.
- **Never call `setState` in `useFrame`** and do not allocate in a frame loop. This change adds no frame loop at all — if you find yourself writing one, stop; the overlay is static between selections.
- **`src/game/**` carries coverage thresholds** (`vite.config.ts`): statements/branches/functions 85, lines 90. A new engine function must be tested or it drags the number down. `src/scene/**` and `src/ui/**` are excluded from coverage — **write the tests anyway**, as `boardClick.ts`, `towerDiff.ts`, `firePulse.ts` and `formatStat.ts` all do. Do not add threshold entries.
- **TypeScript config:** `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`. Indexing an array yields `T | undefined`; type-only imports need `import type`.
- **This codebase has no non-null assertions (`!`).** Guard or default.
- **Vitest runs through esbuild and does not typecheck.** A green suite is not a green `tsc`. Run `pnpm typecheck` separately.
- **Commands:** `pnpm test:run` (never `pnpm test`, which watches), `pnpm typecheck`, `pnpm lint`, `pnpm build`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/game/coverage.ts` | **Modify.** Add `coveredSquares(board, geometry, range, from)` beside `coversSquare`. |
| `src/game/coverage.test.ts` | **Modify.** Tests for the new function: clipping, exclusion of the origin, shape spot-checks, growth. |
| `src/game/index.ts` | **Modify.** Export `coveredSquares` from the barrel. One line. |
| `src/scene/CoveragePreview.tsx` | **Modify.** Refactor the build preview onto `coveredSquares`. Behaviour identical. |
| `src/scene/towerCoverage.ts` | **Create.** Pure: given the board, the Towers and the selected id, return the footprint or null. |
| `src/scene/towerCoverage.test.ts` | **Create.** Tests for the above, including a destroyed Tower and an Ace-grown board. |
| `src/scene/TowerCoverage.tsx` | **Create.** Plumbing only: read the stores, memoise, draw one instanced quad per covered square. |
| `src/scene/Board.tsx` | **Modify.** Mount `<TowerCoverage board={board} />`. One import, one line of JSX. |
| `src/ui/targetsLabel.ts` | **Create.** `targetsLabel(targetsPerShot)` — the whole phrase, so the wording branch is not left in the `.tsx`. |
| `src/ui/targetsLabel.test.ts` | **Create.** Tests for the above, including every rank on the ladder. |
| `src/ui/TowerPanel.tsx` | **Modify.** One extra figure on the stats line. |
| `docs/design/game-design.md` | **Modify.** A short subsection under `## Towers` on reading a Tower's coverage. |
| `CLAUDE.md` | **Modify.** Current state, and the test count. |

The pure/plumbing split is mandatory, not stylistic: there is no jsdom and no component tests in this project, so a decision left inside a `.tsx` file cannot be tested at all.

---

### Task 1: `coveredSquares` in the engine

**Files:**
- Modify: `src/game/coverage.ts`, `src/game/coverage.test.ts`, `src/game/index.ts`
- Modify: `src/scene/CoveragePreview.tsx`

**Interfaces:**
- Produces: `coveredSquares(board: BoardSpec, geometry: TowerGeometry, range: number, from: Square): Square[]`
- Consumes: `allSquares` from `./board`, `coversSquare` from itself.

**Why it belongs in the engine and not in `src/scene/`.** The spec's second decision is that the highlight and the shot cannot disagree because there is one answer about coverage. `coversSquare` is that answer and it lives in `src/game/coverage.ts`; the clipped-to-the-board list is the same answer in the shape a renderer wants. Two copies of `allSquares(board).filter(...)` — one in `CoveragePreview`, one in the new overlay — is two places for it to drift.

**Do not touch `src/scene/firePulse.ts`.** It runs inside `useFrame` and walks the same geometry with module-level scratch `Square`s specifically so it allocates nothing per frame. `coveredSquares` returns a fresh array of fresh objects; calling it 60 times a second per Tower is the exact garbage-collection pressure CLAUDE.md forbids. The apparent duplication there is deliberate and documented in that file.

- [ ] **Step 1: Write the failing tests**

Append to `src/game/coverage.test.ts`:

```ts
describe('coveredSquares', () => {
  const board = { files: 8, ranks: 8 }

  it('never includes the origin', () => {
    expect(coveredSquares(board, 'adjacent', 1, ORIGIN)).not.toContainEqual(ORIGIN)
  })

  it('agrees with coversSquare on every square of the board', () => {
    // The whole reason this function exists: one answer about coverage, not two.
    for (const geometry of ['adjacent', 'horizontal', 'vertical', 'cross', 'diagonal', 'star'] as const) {
      const covered = coveredSquares(board, geometry, 3, ORIGIN)
      const expected = allSquares(board).filter((square) => coversSquare(geometry, 3, ORIGIN, square))
      expect(covered).toEqual(expected)
    }
  })

  it('clips to the board rather than running off the edge', () => {
    const corner = { file: 0, rank: 0 }
    const covered = coveredSquares(board, 'star', 8, corner)

    expect(covered.every((square) => isInBounds(board, square))).toBe(true)
    expect(covered).toContainEqual({ file: 7, rank: 7 })
  })

  it('returns the eight neighbours for an adjacent Tower at range 1', () => {
    expect(coveredSquares(board, 'adjacent', 1, ORIGIN)).toHaveLength(8)
  })

  it('covers 8 squares for a vertical Tower of range 4 on a full file', () => {
    // Range is squares along the pattern, so this is not comparable to a disc.
    expect(coveredSquares(board, 'vertical', 4, ORIGIN)).toHaveLength(7)
  })

  it('reads the extent from the board it is given, so an Ace widens the footprint', () => {
    const grown = { files: 8, ranks: 9 }

    expect(coveredSquares(grown, 'vertical', 8, { file: 4, rank: 0 }).length).toBeGreaterThan(
      coveredSquares(board, 'vertical', 8, { file: 4, rank: 0 }).length,
    )
  })
})
```

Note on the vertical case: `ORIGIN` is `{ file: 4, rank: 4 }` on an 8×8 board, so range 4 up the file reaches ranks 5–8 but rank 8 is off the board — 3 above, 4 below, 7 total. Verify the number by running the test rather than trusting this paragraph; if it disagrees, the arithmetic here is wrong and the assertion should be corrected, not the implementation.

Run `pnpm test:run` and confirm these fail for the right reason (`coveredSquares` is not exported), not because of a typo.

- [ ] **Step 2: Implement**

In `src/game/coverage.ts`, add below `coversSquare`:

```ts
/**
 * Every square on the board this Tower covers, origin excluded and clipped to
 * the board's extent.
 *
 * The list form of `coversSquare`, for callers that want to draw a footprint
 * rather than ask about one square. Kept here, beside the predicate, so the
 * overlay the player reads and the shot the engine takes cannot disagree.
 *
 * Reads the extent from `board` — never a module constant. An Ace grows the
 * board, so a footprint derived from a constant would stop at the old edge.
 *
 * Allocates: not for a frame loop. `src/scene/firePulse.ts` deliberately walks
 * the same geometry with scratch objects because it runs in `useFrame`.
 */
export function coveredSquares(
  board: BoardSpec,
  geometry: TowerGeometry,
  range: number,
  from: Square,
): Square[] {
  return allSquares(board).filter((square) => coversSquare(geometry, range, from, square))
}
```

Import `allSquares` from `./board` and add `BoardSpec` to the existing type import.

- [ ] **Step 3: Export from the barrel**

In `src/game/index.ts`: `export { coveredSquares, coversSquare } from './coverage'`.

- [ ] **Step 4: Refactor `CoveragePreview` onto it**

Replace the `covered:` line's inline filter with `coveredSquares(board, geometry, range, hoveredSquare)`. Drop the now-unused `allSquares` and `coversSquare` imports if nothing else in the file uses them. **Keep the existing comment** explaining that the origin is never in the list — it is what guarantees the red illegal marker cannot land on a teal square. Behaviour must be byte-for-byte identical; this is a de-duplication, not a change.

- [ ] **Step 5: Verify**

`pnpm test:run`, `pnpm typecheck`, `pnpm lint`. All three green. Report the test count.

---

### Task 2: The pure footprint decision

**Files:**
- Create: `src/scene/towerCoverage.ts`, `src/scene/towerCoverage.test.ts`

**Interfaces:**
- Consumes: `coveredSquares` and the `BoardSpec` / `Square` / `Tower` types from the `../game` barrel; `towerRank` from `../data/towerRanks`.
- Produces:
  ```ts
  export interface TowerFootprint {
    readonly origin: Square
    readonly covered: readonly Square[]
  }
  export function selectedFootprint(
    board: BoardSpec,
    towers: readonly Tower[],
    selectedTowerId: string | null,
  ): TowerFootprint | null
  ```

**Amended during implementation.** This shipped as *two* pure functions rather than one — `coverageSelection(towers, selectedTowerId)` reducing the selection to the three scalars that shape a footprint (`cardRank`, `file`, `boardRank`), and `selectedFootprint(board, selection)` turning those into squares. The single signature could not satisfy Task 3's requirement that the component's `useMemo` key on scalars rather than on `towers`: a memo body that reads `towers` needs `towers` in its dependency list, so `react-hooks/exhaustive-deps` warns and `pnpm lint` stops being clean. The split makes the dependency list complete by construction. Both null cases still live in the pure module with tests.

**What it decides.** Nothing is selected → null. The selected id is not in `towers` (the Tower was destroyed while its panel was open) → null. Otherwise the footprint from `towerRank(tower.cardRank)`'s geometry and range, at the Tower's square.

**Why `towerRank(tower.cardRank)` and not fields on the Tower.** `Tower` carries `damage` and `fireIntervalMs` as instance values because ♣ and ♦ supports mutate them. Geometry and range are not on the instance and nothing mutates them — `fireTowers` in `src/game/tick.ts` looks them up from `towerRank(tower.cardRank)` on every shot, and so must this. If a future support ever moves range onto the instance, both this and `fireTowers` change together; do not pre-empt it here.

- [ ] **Step 1: Write the failing tests**

Create `src/scene/towerCoverage.test.ts`. Use the real engine to build the Towers — `withTower` from `../game/fixtures` (test files are exempt from the barrel-only lint rule) — so a test cannot pass against a Tower shape the engine would never produce.

```ts
import { describe, expect, it } from 'vitest'
import { towerRank } from '../data/towerRanks'
import { withTower } from '../game/fixtures'
import { selectedFootprint } from './towerCoverage'

const BOARD = { files: 8, ranks: 8 }

describe('selectedFootprint', () => {
  it('returns null when no Tower is selected', () => { ... })

  it('returns null when the selected Tower is not on the board any more', () => {
    // A Tower destroyed while its panel was open. The overlay must clear itself
    // the way the panel and the selection ring already do.
  })

  it('puts the footprint at the selected Tower\'s square', () => { ... })

  it('uses the Tower\'s own rank geometry, not a neighbour\'s', () => {
    // Two Towers of different ranks; select each in turn and assert the
    // footprints differ in the way the ladder says they should — e.g. a rank-3
    // vertical footprint sits entirely on one file, a rank-4 cross does not.
  })

  it('never includes the Tower\'s own square', () => { ... })

  it('clips to the board it is given', () => { ... })

  it('matches the ladder definition for its rank', () => {
    // Assert against towerRank(rank).geometry/range rather than hardcoded
    // square counts — the values in src/data/towerRanks.ts are placeholders and
    // a balance tweak must not break this test. See CLAUDE.md's testing notes.
  })
})
```

Fill in the bodies; the sketch above is the coverage required, not a literal file.

- [ ] **Step 2: Implement `src/scene/towerCoverage.ts`**

Small and pure. No React, no three.js, no store access — the component passes everything in. Document *why* the module exists (no component tests in this project) in the same voice as `boardClick.ts`.

- [ ] **Step 3: Verify**

`pnpm test:run`, `pnpm typecheck`, `pnpm lint`.

---

### Task 3: The overlay component

**Files:**
- Create: `src/scene/TowerCoverage.tsx`
- Modify: `src/scene/Board.tsx`

**Interfaces:**
- Consumes: `coverageSelection` and `selectedFootprint` from `./towerCoverage`, `useUiStore`, `useGameStore`, `squareKey` from `../game`, `SQUARE_SIZE` / `fileToWorldX` / `rankToWorldZ` from `./coords`.
- Produces: `<TowerCoverage board={board} />`.

**Model it on `CoveragePreview.tsx`** — same `Instances` + `Instance` shape, same flat box geometry, same `meshBasicMaterial` with `transparent` and `depthWrite: false`.

**The four things that must be right:**

1. **`key` on the `Instances`**, on the same expression as `limit` — `board.files * board.ranks`. Third occurrence of the Ace-wedge `key`; the comment should point at `Board.tsx` rather than restating the whole story.
2. **Height band 0.009 … 0.019**, i.e. a box of height 0.01 centred at y = 0.014. Below `CoveragePreview`'s 0.03–0.05 so the teal build preview draws over the amber footprint, and touching neither it nor the `PlacementSurface` plane at 0.02. `SelectionMarker.tsx` documents at length what coplanar overlays with `depthWrite: false` do when the camera orbits; a comment here should say the band is deliberate and not to be closed up.

   **Amended during implementation — this step is wrong, and step 2 of "Mount it in `Board.tsx`" below is wrong for the same reason.** A height band does *not* make the teal preview draw over the amber footprint. three.js sorts the transparent list on the projected z of each object's **world origin**, and drei's `Instances` leaves the `InstancedMesh` at the origin with every instance position in `instanceMatrix` — measured in the running scene, both footprint overlays report a world position of exactly `(0, 0, 0)`, so `FOOTPRINT_Y` cannot reach the sort at all. Forcing `renderOrder` one way and then the other visibly changes the composite, so this is not academic. What shipped: an explicit `renderOrder` ladder across every flat overlay — amber 1, teal box 2, illegal marker 3, selection ring 4, `FirePulses` 5 (raised from 1 to stay topmost) — which is what `FirePulses` had already concluded on its own. The bands stay, for the narrower job they really do: keeping coplanar quads from z-fighting.
3. **Colour `#f6ad55`** as a module constant named for what it means, next to a note that teal is the build preview and amber is a placed Tower.

   **Amended during implementation.** `#f6ad55` at opacity 0.34 shipped first and was then re-measured against screenshots of the running scene: too weak to shift the light squares, reading as dirt on the dark ones, and — worse — indistinguishable from teal alone wherever the two footprints overlapped, which defeats decision 4 of the spec. It shipped as `#ffb84a` at 0.46, where the overlap resolves to a distinct yellow-green and all four states are legible. Spec §3 records the measurement.
4. **Subscribe so a destroyed Tower clears the overlay.** Read `snapshot.towers` from `useGameStore` the way `SelectionMarker` does, and put the footprint behind a `useMemo` keyed on the values that actually change it — the board, the selected id, and the selected Tower's square and rank. A Tower's `health` changes on every hit and publishes a snapshot, so without the memo every hit anywhere on the board would recompute up to a hundred squares' worth of footprint. With it, a hit re-renders the component and reuses the array. **Do not** try to dodge the re-render by reading `simulation.getState()` during render — an unsubscribed read cannot re-render when the Tower dies, which is the one case this overlay has to handle.

- [ ] **Step 1: Write the component**

Plumbing only. Every decision is already in `towerCoverage.ts`; if you find yourself writing a conditional about *what to show*, it belongs in the pure module with a test.

- [ ] **Step 2: Mount it in `Board.tsx`**

Beside `<CoveragePreview>` and `<SelectionMarker>`. Order in JSX does not decide draw order for transparent overlays — the height bands do — so put it first, with the ground overlays, and do not add `renderOrder`.

**Amended during implementation: the last clause is wrong and caused a real defect.** JSX order indeed does not decide it, but neither do the height bands, and `renderOrder` is exactly what is needed — see the amendment on point 2 above for the measurement. The mount position in `Board.tsx` is still first; the ordering now comes from the `renderOrder` ladder.

- [ ] **Step 3: Verify**

`pnpm test:run`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. The build is the one that catches an R3F prop typo, since there are no component tests.

---

### Task 4: Targets per shot in the panel

**Files:**
- Create: `src/ui/targetsLabel.ts`, `src/ui/targetsLabel.test.ts`
- Modify: `src/ui/TowerPanel.tsx`

**Interfaces:**
- Produces: `targetsLabel(targetsPerShot: number): string`.

**Amended during implementation.** This was planned as `formatTargets` in `formatStat.ts`, returning `'3'` or `'all'`, with the panel composing the phrase around it. That left a second `Number.isFinite` branch inside `TowerPanel.tsx` choosing between two wordings — an untestable decision in a `.tsx`, which CLAUDE.md forbids — and made `formatTargets`' own `'all'` return unreachable from its only caller. It shipped instead as `targetsLabel`, returning the whole phrase, in its own file on the `supportLabel.ts` precedent. `formatStat.ts` is untouched.

**Why this is in scope.** It is the second half of "what can this Tower attack". Once the footprint is lit, a wide disc showing dozens of amber squares while hitting only a few Pieces per shot over-promises unless the figure is on screen. `targetsPerShot` is the only field on `TowerRankDef` the panel currently omits.

- [ ] **Step 1: Write the failing tests**

In `src/ui/formatStat.test.ts`:

```ts
describe('formatTargets', () => {
  it('renders a finite count as a number', () => {
    expect(formatTargets(3)).toBe('3')
  })

  it('renders rank 10s unlimited targeting as a word, not Infinity', () => {
    expect(formatTargets(Number.POSITIVE_INFINITY)).toBe('all')
  })
})
```

`String(Number.POSITIVE_INFINITY)` is `'Infinity'`, which is why this needs its own function rather than `formatStat`.

- [ ] **Step 2: Implement**

Add `formatTargets` to `src/ui/formatStat.ts` — same concern (formatting an engine number for the panel), same file, its own doc comment naming rank 10 as the reason.

- [ ] **Step 3: Show it in `TowerPanel`**

Add to the existing muted line, reading `def.targetsPerShot`:

```
range 4 · 6 dmg · 380ms · hits all in range
```

Wording: `hits {formatTargets(def.targetsPerShot)} per shot` for a finite count, and `hits all in range` when unlimited — "hits all per shot" reads wrong. Keep the whole line on one row at the panel's `min-width: 13rem`; if it wraps, prefer shortening (`·  hits 3/shot`) over widening the panel. Use the exact domain words: "Piece", never "enemy" or "unit".

- [ ] **Step 4: Verify**

`pnpm test:run`, `pnpm typecheck`, `pnpm lint`.

---

### Task 5: Documentation

**Files:**
- Modify: `docs/design/game-design.md`, `CLAUDE.md`

- [ ] **Step 1: `game-design.md`**

Add a short subsection under `## Towers`, after "Towers block, and blocked Pieces attack" and before "No walls, no mazing" — it belongs beside the coverage-not-mazing statement it supports. Content: selecting a Tower lights the squares it covers; the highlight is coverage, not what a shot will hit; the panel carries targets per shot; teal is a Card you have not played, amber is a Tower you own. Two short paragraphs. **Do not** restate the implementation, and do not add an open question — nothing here is undecided.

- [ ] **Step 2: `CLAUDE.md`**

Update the **Tower legibility** bullet under "Current state" to include the coverage highlight, and correct the test count from the number `pnpm test:run` actually reports. Do not duplicate design detail from `game-design.md`; CLAUDE.md carries only what constrains code.

- [ ] **Step 3: Verify the docs are true**

Re-read both edits against the code as merged. A stale test count in a plan document has already leaked once — see CLAUDE.md.

---

## Verification checklist

Run all four and read the output; do not claim any of this from inference:

- [ ] `pnpm test:run` — green, and the count is higher than before by the tests this plan adds
- [ ] `pnpm typecheck` — clean
- [ ] `pnpm lint` — clean, which is what proves the engine boundary survived
- [ ] `pnpm build` — clean

Then, by inspection of the diff:

- [ ] No new field on `GameState`, no new `Command`, no change to `structuralKey`
- [ ] `src/game/coverage.ts` imports nothing from React or three.js
- [ ] Every `Instances` with a board-derived `limit` has a matching `key`
- [ ] Nothing reads a board extent from a module constant
- [ ] No `setState` in a frame loop, and no new frame loop at all
