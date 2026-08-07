# Towers Block Each Other's Fire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Tower occlude the shots of Towers behind it, so placement becomes strategic — with retargeting to the next-nearest reachable Piece, auras unaffected, and both coverage overlays showing only reachable squares.

**Architecture:** Two new pure engine predicates in `src/game/coverage.ts` — `isOccluded` (one Tower strictly between two others on a compass ray) and `reachableSquares` (the list form, `coveredSquares` filtered through occlusion). `selectTargets` in `src/game/tick.ts` filters candidates through `isOccluded` using the standing Towers as blockers, then sorts by distance-to-Core as before. The two scene overlays (`TowerCoverage` amber, `CoveragePreview` teal) switch to `reachableSquares`, with the blocker list selected identity-stably from the store so a hit or cooldown tick costs them nothing.

**Tech Stack:** TypeScript (strict), Vitest, zustand v5, React Three Fiber. No new dependencies.

## Global Constraints

- `src/game/` and `src/data/` must never import React or Three.js — ESLint fails `pnpm lint` (and CI).
- No `Math.random` in `src/game/` or `src/data/` — runs are seeded; ESLint enforces it.
- `src/scene/` must import engine code through the `../game` barrel, never a module inside it.
- A Tower is never strictly between itself and a target — `isOccluded` must exclude the origin.
- Auras (rank 8 Amplify, rank 9 Freeze) are positional fields — occlusion applies to shots only, never to auras.
- No `GameState` field, no new Command, no `structuralKey` change. Occlusion is derived per tick from the existing Tower layout, exactly like the auras.
- Run `pnpm test:run`, `pnpm typecheck`, and `pnpm lint` after each task; all must pass.
- Every task ends with a commit.
- The design spec is `docs/superpowers/specs/2026-08-07-towers-block-each-other-design.md`. Read it before starting; it is the source of truth for the semantics.

---

### Task 1: `isOccluded` and `reachableSquares` in the engine

**Files:**
- Modify: `src/game/coverage.ts` (imports, doc comment on `coversSquare`, two new functions)
- Modify: `src/game/index.ts:11`
- Test: `src/game/coverage.test.ts`

**Interfaces:**
- Produces:
  - `export function isOccluded(from: Square, target: Square, blockers: readonly Square[]): boolean`
  - `export function reachableSquares(board: BoardSpec, geometry: TowerGeometry, range: number, from: Square, blockers: readonly Square[]): Square[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/game/coverage.test.ts`, after the existing `describe('coveredSquares', ...)` block (which ends at line 336). Update the import on line 5 to include the two new functions:

```ts
import { coveredSquares, coversSquare, isOccluded, reachableSquares } from './coverage'
```

```ts
describe('isOccluded', () => {
  it('blocks a Tower strictly between on the same file', () => {
    expect(isOccluded({ file: 4, rank: 2 }, { file: 4, rank: 6 }, [{ file: 4, rank: 4 }])).toBe(true)
  })

  it('blocks a Tower strictly between on the same rank', () => {
    expect(isOccluded({ file: 2, rank: 4 }, { file: 6, rank: 4 }, [{ file: 4, rank: 4 }])).toBe(true)
  })

  it('blocks a Tower strictly between on the same diagonal', () => {
    expect(isOccluded({ file: 2, rank: 2 }, { file: 6, rank: 6 }, [{ file: 4, rank: 4 }])).toBe(true)
  })

  it('does not block a Tower beyond the target', () => {
    expect(isOccluded({ file: 4, rank: 2 }, { file: 4, rank: 4 }, [{ file: 4, rank: 6 }])).toBe(false)
  })

  it('does not block a Tower on the anti-diagonal', () => {
    // The blocker is on the diagonal through the shooter that the target is
    // NOT on: both are "on a diagonal" but they are different diagonals.
    expect(isOccluded({ file: 2, rank: 2 }, { file: 6, rank: 6 }, [{ file: 4, rank: 0 }])).toBe(false)
  })

  it('does not block a Tower off the ray', () => {
    expect(isOccluded({ file: 4, rank: 2 }, { file: 4, rank: 6 }, [{ file: 5, rank: 4 }])).toBe(false)
  })

  it('never counts the shooter itself as a blocker', () => {
    const from = { file: 4, rank: 4 }
    expect(isOccluded(from, { file: 4, rank: 7 }, [from])).toBe(false)
  })

  it('never blocks a distance-1 target — no square is strictly between', () => {
    const from = { file: 4, rank: 4 }
    const target = { file: 5, rank: 4 }
    expect(isOccluded(from, target, [])).toBe(false)
    expect(isOccluded(from, target, [{ file: 4, rank: 4 }])).toBe(false)
    expect(isOccluded(from, target, [{ file: 5, rank: 5 }])).toBe(false)
    expect(isOccluded(from, target, [{ file: 6, rank: 4 }])).toBe(false)
  })

  it('keeps an off-ray ring square reachable through a Tower inside the ring', () => {
    // Rank 8's ring covers Chebyshev distance 3-4. The target at {7,5} is at
    // distance 3 — inside the ring — but not on any compass ray from {4,4}
    // (fileDelta 3, rankDelta 1), so no Tower can be "between" on a line that
    // does not exist. This is the hollow-core socket case.
    expect(isOccluded({ file: 4, rank: 4 }, { file: 7, rank: 5 }, [{ file: 4, rank: 5 }])).toBe(false)
  })
})

describe('reachableSquares', () => {
  const board = { files: 8, ranks: 8 }

  it('equals coveredSquares when nothing blocks', () => {
    expect(reachableSquares(board, 'vertical', 4, ORIGIN, [])).toEqual(
      coveredSquares(board, 'vertical', 4, ORIGIN),
    )
  })

  it('drops the squares a blocker hides and keeps the ones on its side', () => {
    const covered = coveredSquares(board, 'vertical', 4, ORIGIN)
    const reachable = reachableSquares(board, 'vertical', 4, ORIGIN, [{ file: 4, rank: 6 }])

    expect(reachable.length).toBeLessThan(covered.length)
    expect(reachable).toContainEqual({ file: 4, rank: 5 })
    expect(reachable).not.toContainEqual({ file: 4, rank: 7 })
  })

  it('ignores a blocker off the target line', () => {
    const withBlocker = reachableSquares(board, 'vertical', 4, ORIGIN, [{ file: 3, rank: 6 }])
    expect(withBlocker).toEqual(coveredSquares(board, 'vertical', 4, ORIGIN))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/coverage.test.ts`
Expected: FAIL — `isOccluded` and `reachableSquares` are not exported from `./coverage`.

- [ ] **Step 3: Write the minimal implementation**

Update `src/game/coverage.ts`:

1. Change the import on line 1 to add `squaresEqual`:
```ts
import { allSquares, squaresEqual } from './board'
```

2. Rewrite the stale doc comment on `coversSquare` (lines 9-11). The old text — "Nothing blocks line of fire — a Tower hits any covered square regardless of what sits between. Piercing and blocking are not part of the design." — is now false. Replace with:
```ts
 * Geometry answers "does this Tower see this square at all?" Occlusion is a
 * separate question answered by `isOccluded`: a Tower can see a square and
 * still not hit it, because another Tower stands between. `coversSquare` is
 * deliberately occlusion-blind — auras and `firePulse` read it and neither is
 * a shot.
```

3. Append after the `coveredSquares` function (end of file):
```ts
/**
 * Whether a Tower at `from` can actually hit `target` given the Towers that
 * stand between — the occlusion half of "preview cannot lie about a shot".
 *
 * `target` is occluded when some blocker stands STRICTLY between `from` and
 * `target` on one of the 8 compass rays: the same file, the same rank, or the
 * same diagonal. "Strictly" is load-bearing twice over — a blocker on the
 * shooter's own square and one beyond the target are both not between. A
 * target not on any compass ray (a ring or band square off the eight
 * directions) can never be occluded at all: there is no line to sit between
 * on. See the design spec for how this reads per geometry.
 *
 * Reads only the positions of the blocker set, so the answer cannot depend on
 * which Tower a caller happened to process first — the same order-independence
 * discipline as `amplifierIdsByPiece` in `towerAuras.ts`.
 */
export function isOccluded(
  from: Square,
  target: Square,
  blockers: readonly Square[],
): boolean {
  const fileDelta = target.file - from.file
  const rankDelta = target.rank - from.rank
  const onFile = fileDelta === 0 && rankDelta !== 0
  const onRank = rankDelta === 0 && fileDelta !== 0
  const onDiagonal = Math.abs(fileDelta) === Math.abs(rankDelta) && fileDelta !== 0

  // A target on no compass ray cannot be occluded by anything. That is the
  // ring and band off-ray squares, and it is a property, not a gap.
  if (!onFile && !onRank && !onDiagonal) return false

  const between = (a: number, b: number, c: number): boolean =>
    (a < b && b < c) || (c < b && b < a)

  for (const blocker of blockers) {
    if (squaresEqual(blocker, from)) continue

    if (onFile && blocker.file === from.file && between(from.rank, blocker.rank, target.rank)) {
      return true
    }
    if (onRank && blocker.rank === from.rank && between(from.file, blocker.file, target.file)) {
      return true
    }
    if (onDiagonal) {
      const blockerFileDelta = blocker.file - from.file
      const blockerRankDelta = blocker.rank - from.rank
      if (
        // On the same diagonal line as `from`...
        Math.abs(blockerFileDelta) === Math.abs(blockerRankDelta) &&
        // ...headed the same way as the target (blocks the anti-diagonal),
        // ...and strictly between rather than at or beyond the target.
        blockerFileDelta !== 0 &&
        Math.sign(blockerFileDelta) === Math.sign(fileDelta) &&
        Math.sign(blockerRankDelta) === Math.sign(rankDelta) &&
        Math.abs(blockerFileDelta) < Math.abs(fileDelta)
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Every square this Tower can actually hit, given the Towers standing between.
 *
 * The list form of `coversSquare` + `isOccluded`, for the callers that want a
 * footprint rather than one square — the two coverage overlays in `src/scene`.
 * An empty blocker list is exactly `coveredSquares`: a Tower alone never
 * occludes itself, because a Tower is never strictly between itself and a
 * target.
 */
export function reachableSquares(
  board: BoardSpec,
  geometry: TowerGeometry,
  range: number,
  from: Square,
  blockers: readonly Square[],
): Square[] {
  return coveredSquares(board, geometry, range, from).filter(
    (square) => !isOccluded(from, square, blockers),
  )
}
```

4. Export both from the barrel. In `src/game/index.ts`, change line 11 to:
```ts
export { coveredSquares, coversSquare, isOccluded, reachableSquares } from './coverage'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/coverage.test.ts`
Expected: PASS. Then run the full suite `pnpm test:run`, `pnpm typecheck`, and `pnpm lint` — all must pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/coverage.ts src/game/index.ts src/game/coverage.test.ts
git commit -m "feat(towers): add isOccluded and reachableSquares to the engine"
```

---

### Task 2: Wire occlusion into Tower targeting

**Files:**
- Modify: `src/game/tick.ts` (imports, `fireTowers`, `selectTargets`, `selectTargets` call site)
- Test: `src/game/firing.test.ts`

**Interfaces:**
- Consumes: `isOccluded` from `./coverage` (Task 1).
- Produces: `selectTargets` gains a sixth parameter `blockers: readonly Square[]`; `fireTowers` computes the blocker list once from its `towers` argument and passes it down. No exported signature changes.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/firing.test.ts`, after the existing `describe('targets per shot', ...)` block (ends at line 336). Update the imports: `liveRound` and `withTower` are already imported from `./fixtures`; `pawnAt` is already imported. No new imports needed beyond what is there.

```ts
describe('tower firing: Towers block each other', () => {
  it('a Tower between the shooter and the Piece hides the Piece', () => {
    // Rank 3 fires vertically up its file. A rank-7 Wall at {3,4} stands
    // between the shooter at {3,7} and a Pawn at {3,2}: geometrically covered,
    // actually hidden.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(3, { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
  })

  it('still fires at the same arrangement with no blocker', () => {
    const state = scenario(3, { file: 3, rank: 7 }, [{ file: 3, rank: 2 }])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(true)
  })

  it('retargets to the next-nearest reachable Piece when the nearest is hidden', () => {
    // Core is at {3,0}, so distance to Core is the board rank. target-0 at
    // {3,2} is nearer the Core than target-1 at {3,5} — but the Wall at {3,4}
    // hides it from the shooter at {3,7}. The Tower must hit target-1: nearest
    // REACHABLE, not nearest overall.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(3, { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
      pawnAt('target-1', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    expect(wasHit(state, after, 'target-1')).toBe(true)
  })

  it('holds fire when every Piece it covers is hidden, and does not bank the shot', () => {
    // The Pawn is geometrically covered but occluded, and nothing else is in
    // range on the near side of the Wall. The Tower must fire nothing and sit
    // clamped at "ready" — the same cooldown a Tower with no target produces,
    // never a stored shot.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(3, { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    const shooter = after.towers.find((tower) => tower.cardRank === 3)
    expect(shooter?.fireCooldownMs).toBe(TOWER_RANKS[3].fireIntervalMs)
  })

  it('a multi-target Tower hits exactly the reachable Pieces', () => {
    // Rank 8 ring at {3,3} covers Chebyshev distance 3-4. The Wall at {3,4}
    // sits in the hollow core (distance 1) so it never fires, but it hides
    // everything on the file beyond it. target-0 at {3,7} (distance 4, in the
    // ring) is hidden; target-1 at {0,3} (distance 3, in the ring, off the
    // file) is reachable. targetsPerShot is 3, so both would be hit without
    // occlusion; only target-1 is now.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(8, { file: 3, rank: 3 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 7 }),
      pawnAt('target-1', { file: 0, rank: 3 }),
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    expect(wasHit(state, after, 'target-1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/game/firing.test.ts`
Expected: FAIL. The "hides the Piece" test fails because today nothing blocks; the retarget test fails because the hidden nearest Piece gets hit instead of the reachable one.

- [ ] **Step 3: Write the minimal implementation**

In `src/game/tick.ts`:

1. Update the import on line 6 to add `isOccluded`:
```ts
import { coversSquare, isOccluded } from './coverage'
```

2. In `fireTowers`, before the `for (const tower of towers)` loop (after `const amplifiers = amplifierIdsByPiece(towers, pieces)` at line 332), compute the blocker list once:
```ts
  // Every standing Tower occludes, including the shooter itself (which can
  // never be strictly between itself and anything) and the Wall (which never
  // shoots but blocks for everyone else). Computed once so no Tower's outcome
  // depends on which Tower fires first.
  const blockers = towers.map((tower) => tower.square)
```

3. Update the `selectTargets` call inside the firing loop (line 349) to pass `blockers`:
```ts
      const targets = selectTargets(tower, def, pieces, remainingHealth, board, coreSquare, blockers)
```

4. Add the parameter to `selectTargets` (signature at line 411) and the occlusion filter after the `coversSquare` check (line 426):
```ts
function selectTargets(
  tower: Tower,
  def: TowerRankDef,
  pieces: readonly Piece[],
  remainingHealth: Map<string, number>,
  board: BoardSpec,
  coreSquare: Square,
  blockers: readonly Square[],
): Piece[] {
  ...
    if (!coversSquare(def.geometry, def.range, tower.square, piece.square)) continue
    // A Tower can see a square and still not hit it: another Tower strictly
    // between blocks the shot. The Staging-rank bounds check above this is
    // untouched — damage still cannot reach a Piece assembling off-board.
    if (isOccluded(tower.square, piece.square, blockers)) continue
```

5. Update the stale doc comment on `fireTowers` (line 287). "Nothing blocks line of fire and nothing pierces." is now false. Replace the sentence with:
```ts
 * A Tower fires at most one shot per elapsed interval, hitting up to its rank's
 * `targetsPerShot` Pieces. Towers block each other's fire: a shot whose line to
 * the target passes through another Tower is occluded, and `selectTargets`
 * skips the occluded candidate rather than wasting the shot.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/firing.test.ts`
Expected: PASS. Then the full suite `pnpm test:run`, `pnpm typecheck`, and `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add src/game/tick.ts src/game/firing.test.ts
git commit -m "feat(towers): occluded shots retarget to the next reachable Piece"
```

---

### Task 3: Pin that auras are not blocked

**Files:**
- Test: `src/game/towerAuras.test.ts`

**Interfaces:**
- Consumes: existing `amplifierIdsByPiece`, `frozenPieceIds`, `withTower`, `liveRound`, `pieceAt`, `pawnAt`, `firstTowerId`.

- [ ] **Step 1: Write the pinning tests**

Add to `src/game/towerAuras.test.ts`, inside `describe('the Amplifier in a live round', ...)` after its last `it` (ends at line 108), one test; and inside `describe('frozenPieceIds', ...)` after its last `it` (ends at line 150), one test. All imports needed are already at the top of the file.

```ts
  it('does not cut the field when a Tower stands between the Amplifier and the Piece', () => {
    // The aura is positional, not a beam: a Wall between the Amplifier and a
    // Piece inside its ring changes nothing. This pins the design decision —
    // occlusion is for shots, never for fields.
    const withAmplifier = withTower(8, { file: 3, rank: 3 })
    const withWall = withTower(7, { file: 3, rank: 5 }, withAmplifier)
    const state = liveRound(withWall, [pieceAt('rook', 'victim', { file: 3, rank: 7 })])

    // Chebyshev distance 4 from the Amplifier — inside the ring, with the Wall
    // at distance 2 strictly between them on the file.
    const amplifiers = amplifierIdsByPiece(state.towers, state.pieces)
    expect(amplifiers.get('victim')).toEqual(new Set([firstTowerId(state)]))
  })
```

```ts
  it('does not cut the field when a Tower stands between the Freezer and the Piece', () => {
    const withFreezer = withTower(9, { file: 3, rank: 3 })
    const withWall = withTower(7, { file: 3, rank: 4 }, withFreezer)
    const state = liveRound(withWall, [pawnAt('chilled', { file: 3, rank: 5 })])

    // Chebyshev distance 2 from the Freezer — inside its range-2 disc, with
    // the Wall strictly between them on the file.
    expect(frozenPieceIds(state.towers, state.pieces).has('chilled')).toBe(true)
  })
```

- [ ] **Step 2: Run the tests to verify they pass immediately**

Run: `pnpm test:run -- src/game/towerAuras.test.ts`
Expected: PASS — these are pinning tests for behaviour the engine already has. Both aura functions (`amplifierIdsByPiece`, `frozenPieceIds` in `src/game/towerAuras.ts`) derive their field from `coversSquare` alone and never consult occlusion. The Amplifier test builds the rank-8 Tower first, so `state.towers[0]` is the Amplifier and `firstTowerId(state)` is its id; the Wall is `state.towers[1]`, and its rank-7 def has no aura, so it is skipped.

- [ ] **Step 3: Full verification**

There is no production change in this task. Run the full suite `pnpm test:run`, `pnpm typecheck`, and `pnpm lint` — all must pass.

If a test FAILS here, the arrangement is wrong (a test in the wrong describe, or the Towers built in the wrong order) — do not "fix" it by touching the aura functions, which is exactly what these tests exist to forbid.

- [ ] **Step 4: Commit**

```bash
git add src/game/towerAuras.test.ts
git commit -m "test(towers): auras pass through blocking Towers"
```

---

### Task 4: Re-point the preview/engine agreement test and cover occlusion

**Files:**
- Modify: `src/game/coverage.test.ts`

**Interfaces:**
- Consumes: `reachableSquares`, `withTower`, `liveRound`, `pawnAt`, `tick`, `towerRank`, `PIECE_TYPES` — all already imported in this file.

- [ ] **Step 1: Modify the existing agreement test**

The test `describe('coveredSquares agrees with what a Tower shoots', ...)` (lines 338-392) pins that a lit square is a square the Tower really shoots. The overlay now lights `reachableSquares`, not `coveredSquares`, so the oracle must follow or the pin goes stale.

Within that test, in the `it('damages a Piece on every covered square ...')` body, change the oracle (line 375) from:
```ts
    const covered = coveredSquares(board, def.geometry, def.range, ORIGIN)
```
to:
```ts
    // The shooter alone is the blocker list: a single Tower never occludes
    // itself, so with this one-Tower arrangement reachableSquares equals
    // coveredSquares — but the overlay now reads reachableSquares, so that is
    // what must agree with the shot.
    const covered = reachableSquares(board, def.geometry, def.range, ORIGIN, [ORIGIN])
```

And rename the describe and its `it` so the pin says what it means:
- `describe('coveredSquares agrees with what a Tower shoots', ...)` → `describe('reachableSquares agrees with what a Tower shoots', ...)`
- The `it` message `'damages a Piece on every covered square and spares one on every other square'` → `'damages a Piece on every reachable square and spares one on every other square'`

- [ ] **Step 2: Write a new occlusion agreement test**

Add a new describe after the modified one (end of file). It drives the real engine with a blocker Tower and checks that the pawn's fate matches `reachableSquares` for that layout — the same end-to-end discipline the original test uses, now with occlusion in the picture.

```ts
/**
 * The same claim under occlusion: reachableSquares — not coveredSquares — is
 * what the overlay lights, so a Piece a Tower can see but not hit must be
 * spared, and one it can hit must not.
 */
describe('reachableSquares agrees with what a Tower shoots under occlusion', () => {
  const SHOOTER = { file: 4, rank: 7 }
  const WALL = { file: 4, rank: 5 }
  const WINDOW_MS = 704
  const DT_MS = 16

  function damagedAt(square: Square): boolean {
    const withWall = withTower(7, WALL)
    const state = withTower(3, SHOOTER, withWall)
    let live = liveRound(state, [pawnAt('probe', square)])
    const before = PIECE_TYPES.pawn.maxHealth

    for (let elapsed = 0; elapsed < WINDOW_MS; elapsed += DT_MS) live = tick(live, DT_MS)

    const probe = live.pieces.find((piece) => piece.id === 'probe')

    return probe === undefined || probe.health < before
  }

  it('spares a covered-but-hidden Piece and damages a reachable one', () => {
    const board = { files: 8, ranks: 8 }
    const def = towerRank(3)
    const reachable = reachableSquares(board, def.geometry, def.range, SHOOTER, [WALL])

    // {4,6} is between the shooter and the Wall — reachable. {4,2} is beyond
    // the Wall on the same file — covered, but occluded.
    expect(reachable).toContainEqual({ file: 4, rank: 6 })
    expect(reachable).not.toContainEqual({ file: 4, rank: 2 })

    expect(damagedAt({ file: 4, rank: 6 })).toBe(true)
    expect(damagedAt({ file: 4, rank: 2 })).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm test:run -- src/game/coverage.test.ts`
Expected: PASS. Then the full suite, `pnpm typecheck`, and `pnpm lint`.

- [ ] **Step 4: Commit**

```bash
git add src/game/coverage.test.ts
git commit -m "test(towers): pin reachable-square agreement with occlusion"
```

---

### Task 5: The footprint decision module understands occlusion

**Files:**
- Modify: `src/scene/towerCoverage.ts`
- Test: `src/scene/towerCoverage.test.ts`

**Interfaces:**
- Consumes: `reachableSquares`, `squareKey`, `squaresEqual` from the `../game` barrel (all exported); `Tower` type from the barrel.
- Produces:
  - `export function blockerSquares(towers: readonly Tower[]): Square[]` — one square per Tower, sorted by `squareKey` so the order is canonical.
  - `export function squaresListsEqual(a: readonly Square[], b: readonly Square[]): boolean` — element-wise equality for the store selector.
  - `selectedFootprint(board, cardRank, file, boardRank, blockers: readonly Square[])` — gains a fifth positional parameter.

- [ ] **Step 1: Write the failing tests**

In `src/scene/towerCoverage.test.ts`, update the `../game` import (lines 3-12) to add `coveredSquares` — the "never lets a Tower hide itself" test below uses it as its oracle:
```ts
import {
  allSquares,
  coveredSquares,
  coversSquare,
  isInBounds,
  squaresEqual,
  type BoardSpec,
  type GameState,
  type Square,
  type Tower,
} from '../game'
```

And update the import on line 14 to add `blockerSquares` and `squaresListsEqual`:
```ts
import {
  blockerSquares,
  coverageSelection,
  selectedFootprint,
  squaresListsEqual,
  type TowerFootprint,
} from './towerCoverage'
```

Update the `footprintOf` helper (lines 49-55) so it passes the standing Towers as blockers:
```ts
function footprintOf(state: GameState, towerId: string, board: BoardSpec = state.board): TowerFootprint {
  const selection = coverageSelection(state.towers, towerId)
  const footprint = selectedFootprint(
    board,
    selection?.cardRank,
    selection?.file,
    selection?.boardRank,
    blockerSquares(state.towers),
  )
  if (!footprint) throw new Error(`expected a footprint for ${towerId}`)

  return footprint
}
```

Update the three direct `selectedFootprint` calls in the existing `describe('selectedFootprint', ...)` null cases (lines 134, 141-142) to pass an empty blocker list — the selection is undefined in all three, so they return null regardless, but the fifth parameter is now required:
```ts
    expect(selectedFootprint(BOARD, undefined, undefined, undefined, [])).toBeNull()
```
```ts
    expect(selectedFootprint(BOARD, 3, undefined, undefined, [])).toBeNull()
    expect(selectedFootprint(BOARD, 3, 4, undefined, [])).toBeNull()
```

Add these new describe blocks after the existing `describe('selectedFootprint', ...)` (ends at line 202):

```ts
describe('selectedFootprint under occlusion', () => {
  it('omits squares another Tower hides', () => {
    // Rank 3 vertical at {4,7}. A rank-7 Wall at {4,5} sits between it and
    // every square below rank 5 on the file, so those leave the footprint even
    // though the geometry covers them.
    const withWall = withTower(7, { file: 4, rank: 5 })
    const state = withTower(3, { file: 4, rank: 7 }, withWall)
    const shooter = state.towers.find((tower) => tower.cardRank === 3)
    if (!shooter) throw new Error('expected the rank-3 Tower')

    const footprint = footprintOf(state, shooter.id)

    expect(footprint.covered).toContainEqual({ file: 4, rank: 6 })
    expect(footprint.covered).not.toContainEqual({ file: 4, rank: 2 })
  })

  it('never lets a Tower hide itself', () => {
    // The selected Tower is in the blocker list (blockerSquares returns every
    // standing Tower), and must not occlude its own shots.
    const state = withTower(3, CENTRE)
    const def = towerRank(3)

    const footprint = footprintOf(state, firstTower(state).id)

    expect(footprint.covered).toEqual(
      coveredSquares(state.board, def.geometry, def.range, CENTRE),
    )
  })
})

describe('blockerSquares', () => {
  it('returns one square per Tower, sorted into a canonical order', () => {
    const withFirst = withTower(3, { file: 4, rank: 5 })
    const state = withTower(7, { file: 2, rank: 3 }, withFirst)

    // Sorted by squareKey, not by build order: {2,3} then {4,5}.
    expect(blockerSquares(state.towers)).toEqual([
      { file: 2, rank: 3 },
      { file: 4, rank: 5 },
    ])
  })
})

describe('squaresListsEqual', () => {
  it('is true for identical lists', () => {
    const a = [{ file: 1, rank: 2 }]
    expect(squaresListsEqual(a, [...a])).toBe(true)
  })

  it('is false on a length mismatch', () => {
    expect(squaresListsEqual([], [{ file: 1, rank: 2 }])).toBe(false)
  })

  it('is false when any square differs', () => {
    expect(squaresListsEqual([{ file: 1, rank: 2 }], [{ file: 1, rank: 3 }])).toBe(false)
  })
})
```

Note: the existing `describe('selectedFootprint', ...)` tests that go through `footprintOf` now pass `blockerSquares(state.towers)` — with a single Tower that is `[that Tower's own square]`, which never occludes itself, so every such assertion (including the `matchesLadder` sweep over all ranks) stays green unchanged. The three null-case tests call `selectedFootprint` directly and were updated above to pass `[]`. The `matchesLadder` helper needs no change: for a single-Tower state, `reachableSquares` equals `coveredSquares`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run -- src/scene/towerCoverage.test.ts`
Expected: FAIL — `selectedFootprint` takes four arguments and the `blockerSquares` / `squaresListsEqual` imports do not exist.

- [ ] **Step 3: Write the minimal implementation**

In `src/scene/towerCoverage.ts`:

1. Update the import on line 2. Replace `coveredSquares` with `reachableSquares`, and add `squareKey` and `squaresEqual` and the `Tower` type:
```ts
import {
  reachableSquares,
  squareKey,
  squaresEqual,
  type BoardSpec,
  type BuildableRank,
  type Square,
  type Tower,
} from '../game'
```
(`coveredSquares` is no longer used by this file.)

2. Add the two helpers and update `selectedFootprint`. Add after the `CoverageSelection` interface (line 39):
```ts
/**
 * The squares of every standing Tower, sorted into a canonical order.
 *
 * The blocker set for a Tower's footprint and its shots. Sorted so the list's
 * identity — not any particular insertion order — is what changes, which is
 * what lets the component memoise the footprint on this list via
 * `squaresListsEqual`: two publishes that only moved a Piece or a cooldown
 * produce the same sorted squares, so the same list.
 */
export function blockerSquares(towers: readonly Tower[]): Square[] {
  return [...towers]
    .map((tower) => tower.square)
    .sort((a, b) => (squareKey(a) < squareKey(b) ? -1 : 1))
}

/**
 * Element-wise equality for two square lists, for a store selector.
 *
 * zustand's `useStore(selector, equalityFn)` keeps the previous selector value
 * when the equality function says the new one is equal, so a selector that
 * returns `blockerSquares(towers)` with this as its equality fn hands back the
 * SAME array reference across publishes where no Tower was built or destroyed.
 * The footprint memo keys on that reference, so a hit or a cooldown tick costs
 * it nothing — the property the scalars in `CoverageSelection` exist to
 * preserve.
 */
export function squaresListsEqual(a: readonly Square[], b: readonly Square[]): boolean {
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]
    const right = b[index]
    if (left === undefined || right === undefined || !squaresEqual(left, right)) return false
  }

  return true
}
```

3. Update `selectedFootprint` (line 97). Add the fifth parameter and switch the footprint source:
```ts
export function selectedFootprint(
  board: BoardSpec,
  cardRank: BuildableRank | undefined,
  file: number | undefined,
  boardRank: number | undefined,
  blockers: readonly Square[],
): TowerFootprint | null {
  if (cardRank === undefined || file === undefined || boardRank === undefined) return null

  const origin: Square = { file, rank: boardRank }
  const { geometry, range } = towerRank(cardRank)

  // Reachable, not merely covered: a Tower can see a square and still not hit
  // it because another Tower stands between. The same function the shot takes
  // its answer from, so the highlight and the firing cannot disagree.
  return { origin, covered: reachableSquares(board, geometry, range, origin, blockers) }
}
```

4. Update the doc comment above `selectedFootprint` (lines 69-96): the paragraph that begins "The squares themselves come from the engine's `coveredSquares`, which is the list form of the same `coversSquare` predicate `fireTowers` tests before it shoots" (line 79-83) is now about `reachableSquares`. Replace that paragraph with:
```
 * The squares come from the engine's `reachableSquares`, which is the list
 * form of `coversSquare` + `isOccluded` — the exact answer `fireTowers` gets
 * before it shoots. That is the whole point of the overlay: the highlight the
 * player reads and the shot the Tower takes cannot disagree, because there is
 * one answer and both ask for it. A blocked square is a square the Tower can
 * see but cannot hit, so it is not lit.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run -- src/scene/towerCoverage.test.ts`
Expected: PASS. Then the full suite, `pnpm typecheck`, and `pnpm lint`.

- [ ] **Step 5: Commit**

```bash
git add src/scene/towerCoverage.ts src/scene/towerCoverage.test.ts
git commit -m "feat(towers): footprints show only reachable squares"
```

---

### Task 6: Wire the two overlays to identity-stable blockers

**Files:**
- Modify: `src/scene/TowerCoverage.tsx`
- Modify: `src/scene/CoveragePreview.tsx`

**Interfaces:**
- Consumes: `blockerSquares`, `squaresListsEqual` from `./towerCoverage` (Task 5); `reachableSquares` from the `../game` barrel (Task 1); `towerRank` from `../data/towerRanks` (already imported in both files).

- [ ] **Step 1: Wire `TowerCoverage.tsx`**

The selected Tower's amber footprint must reflect the current layout. The component already subscribes to `towers` (line 129); add an identity-stable blocker subscription next to it and pass the list into the memoised footprint.

In `src/scene/TowerCoverage.tsx`:

1. Update the import on line 7:
```ts
import { blockerSquares, coverageSelection, selectedFootprint, squaresListsEqual } from './towerCoverage'
```

2. After the existing `towers` subscription (line 129), add:
```tsx
  // Identity-stable blocker squares: zustand keeps the previous selector value
  // when `squaresListsEqual` says the new one is equal, so this array reference
  // changes only when a Tower is built or destroyed. The memo keys on it, so a
  // hit or a cooldown tick — which refresh the `towers` array on every publish
  // — costs the footprint nothing. See `blockerSquares` in towerCoverage.ts.
  const blockers = useGameStore(
    (store) => blockerSquares(store.snapshot.towers),
    squaresListsEqual,
  )
```

3. Update the memo (lines 146-149) to pass `blockers` and depend on it:
```tsx
  const footprint = useMemo(
    () => selectedFootprint(board, cardRank, file, boardRank, blockers),
    [board, cardRank, file, boardRank, blockers],
  )
```

4. Update the comment above `selectedFootprint`'s memo usage (lines 131-140): the parenthetical starting "What the memo skips is the `allSquares` walk" still holds; add one line noting the blocker list. Insert after line 140 (`// publish regardless.`):
```
 * The blocker list is a second, identity-stable dependency: it is the one
 * thing that genuinely reshapes the footprint beyond the selected Tower's own
 * rank and square, and `squaresListsEqual` keeps it stable between build and
 * destroy events.
```

- [ ] **Step 2: Wire `CoveragePreview.tsx`**

The build preview's teal footprint must show what the candidate would actually hit once placed, given the standing layout.

In `src/scene/CoveragePreview.tsx`:

1. Update the imports on lines 4-12 — replace `coveredSquares` with `reachableSquares` in the barrel import, and add the two scene helpers:
```ts
import {
  canBuildOn,
  findCard,
  isBuildableRank,
  isInBounds,
  reachableSquares,
  squareKey,
  type BoardSpec,
} from '../game'
```
```ts
import { blockerSquares, squaresListsEqual } from './towerCoverage'
```

2. Add a blocker subscription after the `deck` subscription (line 64):
```tsx
  // Identity-stable blocker squares, for the same reason as TowerCoverage:
  // this reference changes only on build/destroy, so a Piece hop or a hit
  // cannot recompute the footprint below.
  const blockers = useGameStore(
    (store) => blockerSquares(store.snapshot.towers),
    squaresListsEqual,
  )
```

3. Update the footprint memo (lines 73-90). Change the `coveredSquares` call to `reachableSquares` passing `blockers`, and add `blockers` to the dependency array:
```ts
    const { geometry, range } = towerRank(card.rank)

    return {
      // The engine's own footprint, shared with the selected-Tower overlay so
      // the two cannot clip differently. It excludes the origin, because
      // `coversSquare` never covers its own square — so `hoveredSquare` is
      // never in here, and the red marker below cannot land on a teal one.
      // Reachable, not merely covered: the candidate's own square is never in
      // the blocker list (it is not built yet), and every standing Tower is.
      covered: reachableSquares(board, geometry, range, hoveredSquare, blockers),
      origin: hoveredSquare,
    }
  }, [board, blockers, deck, hoveredSquare, playMode, selectedCardId])
```

- [ ] **Step 3: Verify**

Run: `pnpm test:run` — all tests pass.
Run: `pnpm typecheck` — clean.
Run: `pnpm lint` — clean.

Then run the game with `pnpm dev` and verify by hand:
- Build a rank-3 Tower, then a rank-7 Wall between it and the Core on the same file.
- The amber footprint of the rank-3 Tower no longer lights squares beyond the Wall.
- The teal preview of a new build behind the Wall shows only reachable squares.
- A rank-8 Amplifier's ring still amplifies through a Wall (its own shot may be blocked, but the field is not).
- Build/destroy a Tower and confirm the overlays update.

- [ ] **Step 4: Commit**

```bash
git add src/scene/TowerCoverage.tsx src/scene/CoveragePreview.tsx
git commit -m "feat(towers): overlays show reachable squares against the standing layout"
```
