# Rank 10 Band Occlusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rank-10 toll gate (`band` geometry) respect tower blocking across its whole band, not just the center line.

**Architecture:** `isOccluded` in `src/game/coverage.ts` gains an optional `geometry` parameter; when `geometry === 'band'`, a target is occluded by any Tower on the target's own rank, file strictly between the gate and the target (per-rank-line). The three consumers that already hold the geometry — `reachableSquares`, `selectTargets`, and `firePulse.accumulatePulses` — forward it, so targeting, both coverage overlays, and the pulse sweep read the same band-aware answer.

**Tech Stack:** TypeScript strict, Vitest, pnpm.

## Global Constraints

- **`isOccluded` is the single answer for shot occlusion.** Targeting, overlays, and the pulse sweep must all consult the same predicate — do not branch on occlusion anywhere but inside it.
- **`Math.random` must never appear in `src/game/`** (seeded PRNG only) — ESLint-enforced.
- **`src/game/` and `src/data/` must never import React or Three.js** — ESLint-enforced.
- **`src/scene/` must import the engine only through the public surface `src/game/index.ts`** — ESLint-enforced. `isOccluded` and `reachableSquares` are already exported there.
- **TDD.** Every task: write the failing test, run it to confirm it fails, implement, run it to confirm it passes, commit.
- **The parameter is optional.** `isOccluded` callers and tests that omit `geometry` must keep today's compass-ray behavior exactly.

---

### Task 1: Band-aware `isOccluded`

**Files:**
- Modify: `src/game/coverage.ts:104-166` (the `isOccluded` function and its doc comment)
- Test: `src/game/coverage.test.ts` (extend the `describe('isOccluded', ...)` block)

**Interfaces:**
- Consumes: `TowerGeometry` (already imported in `coverage.ts:2`), `squaresEqual` (already imported).
- Produces: `isOccluded(from: Square, target: Square, blockers: readonly Square[], geometry?: TowerGeometry): boolean` — an optional 4th parameter; when `geometry === 'band'`, occlusion is per-rank-line; for every other value or omission, behavior is unchanged.

- [ ] **Step 1: Write the failing tests**

Append this block inside `describe('isOccluded', ...)` in `src/game/coverage.test.ts`, after the existing `'never blocks when the target is the shooter'` test (line 391-394):

```ts
describe('isOccluded: the rank-10 band', () => {
  const BAND = 'band' as const

  it('blocks every band rank behind a full-height wall, not just the center line', () => {
    // The three issue #44 scenarios. A gate at {0,2} covers ranks 1-3 across
    // the full file width. A complete wall at file 2 (one Tower per band rank)
    // must hide Pieces on every rank beyond it.
    const wall = [
      { file: 2, rank: 1 },
      { file: 2, rank: 2 },
      { file: 2, rank: 3 },
    ]
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 3 }, wall, BAND)).toBe(true)
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 2 }, wall, BAND)).toBe(true)
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 1 }, wall, BAND)).toBe(true)
  })

  it('a partial wall blocks only the rank it covers', () => {
    // One Tower on rank 1 hides rank-1 Pieces and nothing else.
    const wall = [{ file: 2, rank: 1 }]
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 1 }, wall, BAND)).toBe(true)
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 2 }, wall, BAND)).toBe(false)
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 3 }, wall, BAND)).toBe(false)
  })

  it('requires the blocker to be strictly between on the target\'s rank', () => {
    const gate = { file: 0, rank: 2 }
    // Beyond the target.
    expect(isOccluded(gate, { file: 3, rank: 1 }, [{ file: 4, rank: 1 }], BAND)).toBe(false)
    // On the target's rank but behind the gate (blocker on the far side).
    expect(isOccluded({ file: 2, rank: 2 }, { file: 3, rank: 1 }, [{ file: 4, rank: 1 }], BAND)).toBe(false)
    // On the gate's own column — not strictly between.
    expect(isOccluded(gate, { file: 3, rank: 3 }, [{ file: 0, rank: 3 }], BAND)).toBe(false)
    // On a different rank entirely.
    expect(isOccluded(gate, { file: 3, rank: 1 }, [{ file: 2, rank: 3 }], BAND)).toBe(false)
  })

  it('blocks the other sweep direction too', () => {
    // The `between` predicate is symmetric: a gate in the middle of the board
    // is blocked toward its left by a Tower on the target's rank to its left.
    expect(isOccluded({ file: 4, rank: 2 }, { file: 2, rank: 2 }, [{ file: 3, rank: 2 }], BAND)).toBe(true)
  })

  it('never blocks without the geometry argument — the parameter is optional', () => {
    // Omitting `geometry` keeps the old geometry-blind behavior: an off-ray
    // band square is never occluded. This pins that the fix only activates
    // when a caller opts in by passing `'band'`.
    expect(isOccluded({ file: 0, rank: 2 }, { file: 3, rank: 1 }, [{ file: 2, rank: 1 }])).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: FAIL — the five new `isOccluded: the rank-10 band` tests fail on assertion mismatches. (Vitest runs through esbuild, which strips types without checking them, so the unused 4th argument is silently ignored and the tests observe the old geometry-blind behavior: `isOccluded({file: 0, rank: 2}, {file: 3, rank: 3}, wall, 'band')` returns `false`, not `true`.)

- [ ] **Step 3: Implement the minimal code**

In `src/game/coverage.ts`, add the optional `geometry` parameter and the band branch at the top of `isOccluded`. The final function:

```ts
export function isOccluded(
  from: Square,
  target: Square,
  blockers: readonly Square[],
  geometry?: TowerGeometry,
): boolean {
  const between = (a: number, b: number, c: number): boolean =>
    (a < b && b < c) || (c < b && b < a)

  // Rank 10's toll gate fires a horizontal beam along every covered rank, so
  // a band target on rank `r` is blocked by a Tower on that same rank `r`,
  // file strictly between the gate and the target. At the band's range of 1
  // this subsumes the compass-ray test on every band square: same-rank
  // targets are caught by both, and the file and diagonal squares the ray
  // test could see have no square strictly between. If the band's range is
  // ever raised, the two tests stop agreeing at diagonal distance 2 and need
  // merging again.
  if (geometry === 'band') {
    if (target.file === from.file) return false
    for (const blocker of blockers) {
      if (blocker.rank === target.rank && between(from.file, blocker.file, target.file)) {
        return true
      }
    }
    return false
  }

  const fileDelta = target.file - from.file
  const rankDelta = target.rank - from.rank
  const onFile = fileDelta === 0 && rankDelta !== 0
  const onRank = rankDelta === 0 && fileDelta !== 0
  const onDiagonal = Math.abs(fileDelta) === Math.abs(rankDelta) && fileDelta !== 0

  // A target on no compass ray cannot be occluded by anything. That is the
  // ring and band off-ray squares, and it is a property, not a gap.
  if (!onFile && !onRank && !onDiagonal) return false

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
```

Also update the function's doc comment (lines 104-119) so it names the new parameter and the band rule, e.g. add a sentence after the existing "strictly between" paragraph: `When passed a `geometry` of `'band'`, a target is occluded instead by any Tower on the target's own rank, file strictly between `from` and `target` — the toll gate fires a beam along each covered rank.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: PASS — all existing `isOccluded` tests still pass (they omit `geometry`, so behavior is unchanged) and the five new band tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/game/coverage.ts src/game/coverage.test.ts
git commit -m "feat(coverage): band targets occlude per rank line

Issue #44: the rank-10 toll gate only blocked on its own rank — a wall in
front of it hid the center line but nothing else. isOccluded gains an optional
geometry; for 'band' a target is blocked by any Tower on the target's own
rank, file strictly between."
```

---

### Task 2: `reachableSquares` forwards the geometry

**Files:**
- Modify: `src/game/coverage.ts:177-187` (the `reachableSquares` function)
- Test: `src/game/coverage.test.ts` (extend the `describe('reachableSquares', ...)` block)

**Interfaces:**
- Consumes: `isOccluded` with its new optional `geometry` parameter (Task 1).
- Produces: `reachableSquares(board, geometry, range, from, blockers)` — unchanged signature, now band-aware. The two scene overlays (`towerCoverage.ts`, `CoveragePreview.tsx`) call this unchanged.

- [ ] **Step 1: Write the failing test**

Append inside `describe('reachableSquares', ...)` in `src/game/coverage.test.ts`, after the existing `'ignores a blocker off the target line'` test (line 415-418):

```ts
it('a walled band footprint omits the far side of each walled rank and keeps the near side', () => {
  // Gate at {0,2}, band range 1: ranks 1-3 across the full file width. A wall
  // at file 2 (one Tower per band rank) hides every band square on the far
  // side of it, while the near side stays lit.
  const gate = { file: 0, rank: 2 }
  const wall = [
    { file: 2, rank: 1 },
    { file: 2, rank: 2 },
    { file: 2, rank: 3 },
  ]
  const reachable = reachableSquares(board, 'band', 1, gate, wall)

  // Far side (file >= 3): covered but occluded.
  expect(reachable).not.toContainEqual({ file: 3, rank: 1 })
  expect(reachable).not.toContainEqual({ file: 3, rank: 2 })
  expect(reachable).not.toContainEqual({ file: 3, rank: 3 })
  // Near side (file 1): before the wall, still lit.
  expect(reachable).toContainEqual({ file: 1, rank: 1 })
  expect(reachable).toContainEqual({ file: 1, rank: 2 })
  expect(reachable).toContainEqual({ file: 1, rank: 3 })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: FAIL — `reachableSquares` does not pass `geometry` to `isOccluded`, so the far-side squares are still in the footprint.

- [ ] **Step 3: Implement the minimal code**

In `src/game/coverage.ts`, pass `geometry` through:

```ts
export function reachableSquares(
  board: BoardSpec,
  geometry: TowerGeometry,
  range: number,
  from: Square,
  blockers: readonly Square[],
): Square[] {
  return coveredSquares(board, geometry, range, from).filter(
    (square) => !isOccluded(from, square, blockers, geometry),
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/coverage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/coverage.ts src/game/coverage.test.ts
git commit -m "feat(coverage): thread geometry into reachableSquares
The band-aware occlusion from Task 1 reaches the two coverage overlays, so a
lit square is a square the toll gate can really hit."
```

---

### Task 3: `selectTargets` threads the geometry

**Files:**
- Modify: `src/game/tick.ts:439` (the `isOccluded` call inside `selectTargets`)
- Test: `src/game/firing.test.ts` (extend the `describe('tower firing: Towers block each other', ...)` block, lines 338-413)

**Interfaces:**
- Consumes: `isOccluded` with its new optional `geometry` parameter (Task 1); `def` is the `TowerRankDef` already in scope in `selectTargets`, so `def.geometry` is available at the call site.
- Produces: a band that retargets to the next-nearest reachable Piece and holds fire (clamped at `fireIntervalMs`) when every Piece it covers is occluded — no new logic, just fewer candidates.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('tower firing: Towers block each other', ...)` in `src/game/firing.test.ts`, after the existing `'a multi-target Tower hits exactly the reachable Pieces'` test (line 395-412):

```ts
it('a full-height wall hides every rank of the toll gate, not just the center line', () => {
  // Issue #44 scenario. The gate at {0,2} covers ranks 1-3 across the full
  // width; a complete wall at file 2 must hide Pieces on every rank behind it.
  const gate = withTower(10, { file: 0, rank: 2 })
  const wall = withTower(
    7,
    { file: 2, rank: 1 },
    withTower(7, { file: 2, rank: 2 }, withTower(7, { file: 2, rank: 3 }, gate)),
  )
  const state = liveRound(wall, [
    pawnAt('center', { file: 3, rank: 2 }),
    pawnAt('above', { file: 3, rank: 3 }),
    pawnAt('below', { file: 3, rank: 1 }),
  ])

  const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

  // A Pawn's 900ms move interval outlasts the shot window, so none of these
  // hop during it — position is stable for the whole assertion.
  expect(wasHit(state, after, 'center')).toBe(false)
  expect(wasHit(state, after, 'above')).toBe(false)
  expect(wasHit(state, after, 'below')).toBe(false)
})

it('a partial wall hides only the rank it covers', () => {
  // One Wall on rank 1 shields rank-1 Pieces and nothing else: the rank-2 and
  // rank-3 Pieces are still reachable and still hit.
  const gate = withTower(10, { file: 0, rank: 2 })
  const state = liveRound(withTower(7, { file: 2, rank: 1 }, gate), [
    pawnAt('sameRank', { file: 3, rank: 1 }),
    pawnAt('centerRank', { file: 3, rank: 2 }),
    pawnAt('otherRank', { file: 3, rank: 3 }),
  ])

  const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

  expect(wasHit(state, after, 'sameRank')).toBe(false)
  expect(wasHit(state, after, 'centerRank')).toBe(true)
  expect(wasHit(state, after, 'otherRank')).toBe(true)
})

it('spares an occluded Piece and still hits a reachable one on another rank', () => {
  // The rank-1 Wall hides the rank-1 Piece nearest the Core; the rank-3 Piece,
  // one rank off the walled line, stays reachable and gets the shot.
  const gate = withTower(10, { file: 0, rank: 2 })
  const state = liveRound(withTower(7, { file: 2, rank: 1 }, gate), [
    pawnAt('hidden', { file: 3, rank: 1 }),
    pawnAt('exposed', { file: 3, rank: 3 }),
  ])

  const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

  expect(wasHit(state, after, 'hidden')).toBe(false)
  expect(wasHit(state, after, 'exposed')).toBe(true)
})

it('holds fire when every rank is walled, and does not bank the shot', () => {
  // The gate's one covered Piece is hidden and nothing else is in reach; the
  // Tower must fire nothing and sit clamped at "ready" — the same cooldown a
  // Tower with no target produces, never a stored shot.
  const gate = withTower(10, { file: 0, rank: 2 })
  const wall = withTower(
    7,
    { file: 2, rank: 1 },
    withTower(7, { file: 2, rank: 2 }, withTower(7, { file: 2, rank: 3 }, gate)),
  )
  const state = liveRound(wall, [pawnAt('target-0', { file: 3, rank: 2 })])

  const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

  expect(wasHit(state, after, 'target-0')).toBe(false)
  const shooter = after.towers.find((tower) => tower.cardRank === 10)
  expect(shooter?.fireCooldownMs).toBe(TOWER_RANKS[10].fireIntervalMs)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/firing.test.ts`
Expected: FAIL — the four new tests fail because the band still shoots through the wall (`wasHit(...)` is true when it should be false).

- [ ] **Step 3: Implement the minimal code**

In `src/game/tick.ts:439`, forward the geometry:

```ts
    if (isOccluded(tower.square, piece.square, blockers, def.geometry)) continue
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/game/firing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/tick.ts src/game/firing.test.ts
git commit -m "feat(tick): the toll gate targets through the band-aware occlusion
The engine now spares Pieces a wall hides on any band rank, retargeting to the
next reachable one or holding fire when every covered Piece is occluded."
```

---

### Task 4: `firePulse` threads the geometry

**Files:**
- Modify: `src/scene/firePulse.ts:288` (the `isOccluded` call inside `accumulatePulses`)
- Test: `src/scene/firePulse.test.ts` (extend the `describe('accumulatePulses', ...)` block)

**Interfaces:**
- Consumes: `isOccluded` (already imported from `'../game'` at `firePulse.ts:5`); `geometry` and `range` are already destructured in `accumulatePulses` (`firePulse.ts:248`) from `towerRank(pulse.cardRank)`; `TowerGeometry` is already imported (`firePulse.ts:10`).
- Produces: a band pulse that does not light a square any Tower on the target's rank occludes — the animation cannot claim a shot the engine will not make.

- [ ] **Step 1: Write the failing test**

Append inside `describe('accumulatePulses', ...)` in `src/scene/firePulse.test.ts`, after the existing `'does not light a square another Tower occludes, but keeps the near side'` test (line 343-372):

```ts
it('does not light a band square on a walled rank, but keeps the near side', () => {
  // A rank-10 band at {0,3} sweeps ranks 2-4 across the full width. A rank-7
  // Wall at {2,4} hides the band's rank-4 line. {3,4} is geometrically
  // covered but occluded — the center line at rank 3 already worked, so this
  // pins the off-rank line the wall now hides. {1,4}, between the shooter and
  // the Wall, still lights.
  const shooter = { ...tower(), id: 'shooter', cardRank: 10 as const, square: { file: 0, rank: 3 } }
  const wall = { ...tower(), id: 'wall', cardRank: 7 as const, square: { file: 2, rank: 4 } }
  const pulse: FirePulse = { file: 0, boardRank: 3, cardRank: 10, startedAt: 0 }

  // {3,4} is 3 squares away: 3/22s for the ring to arrive, then this sample
  // lands halfway through that square's fade window. The same instant with and
  // without the Wall isolates occlusion from timing.
  const arrival = 3 / PULSE_SQUARES_PER_SECOND + PULSE_FADE_MS / 1000 / 2

  const unblocked = new Float32Array(board.files * board.ranks * 3)
  accumulatePulses(unblocked, board, [pulse], arrival, [shooter])
  expect(channel(unblocked, 3, 4)).toBeGreaterThan(0)

  const blocked = new Float32Array(board.files * board.ranks * 3)
  accumulatePulses(blocked, board, [pulse], arrival, [shooter, wall])
  expect(channel(blocked, 3, 4)).toBe(0)

  // {1,4} — between the shooter and the Wall — still lights at its own
  // arrival instant.
  const nearArrival = 1 / PULSE_SQUARES_PER_SECOND
  accumulatePulses(blocked, board, [pulse], nearArrival, [shooter, wall])
  expect(channel(blocked, 1, 4)).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/scene/firePulse.test.ts`
Expected: FAIL — `accumulatePulses` does not pass `geometry`, so `channel(blocked, 3, 4)` is `> 0` instead of `0`.

- [ ] **Step 3: Implement the minimal code**

In `src/scene/firePulse.ts:288`, forward the geometry already in scope:

```ts
        if (isOccluded(scratchOrigin, scratchTarget, scratchBlockers, geometry)) continue
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test:run src/scene/firePulse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/firePulse.ts src/scene/firePulse.test.ts
git commit -m "feat(firepulse): the band sweep honours the band-aware occlusion
The pulse animation cannot light a square on a walled rank the toll gate is
blocked from hitting — the same answer the engine consults before a shot."
```

---

### Task 5: Documentation — the compass-ray claim gains the band exception

**Files:**
- Modify: `docs/design/game-design.md:374`
- Modify: `CLAUDE.md:120`

**Interfaces:**
- Consumes: the behavior shipped in Tasks 1-4.

- [ ] **Step 1: Update `docs/design/game-design.md`**

Read the paragraph at line 374 first (it is long; find the sentence starting "A shot whose line to its target passes through another Tower on a compass ray is blocked"). Append one sentence to that paragraph after the existing text:

```markdown
The rank-10 toll gate is the one exception to the compass-ray reading: it fires
a horizontal beam along every covered rank, so a Piece on any band rank is
hidden by a Tower on that same rank standing between the gate and it — wall the
gate's full height and nothing behind it is shot.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Find the invariant bullet at line 120 ("Towers occlude each other's shots, and auras pass through.") and amend the sentence so it reads:

```markdown
- **Towers occlude each other's shots, and auras pass through.** A shot whose line to the target passes through another Tower on a compass ray is blocked — `isOccluded` in `src/game/coverage.ts` is the single answer, and `selectTargets` retargets to the next-nearest reachable Piece. The rank-10 toll gate is the one exception: it fires a horizontal beam along each covered rank, so a target is blocked by a Tower on the target's own rank between the gate and it. Auras are positional fields, never occluded; the rank-8 and rank-9 overlays draw the full covered zone for exactly that reason.
```

- [ ] **Step 3: Run the checks**

Run: `pnpm typecheck && pnpm lint && pnpm test:run`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/design/game-design.md CLAUDE.md
git commit -m "docs: record the toll gate's per-rank-line occlusion exception
The compass-ray blocking rule now names the band's beam-per-rank reading, in
the design doc and the invariants."
```
