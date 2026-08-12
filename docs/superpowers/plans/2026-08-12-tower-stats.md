# Tower Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lifetime per-Tower "pieces defeated" counter and a theoretical DPS figure to the Tower inspect panel (issue #58).

**Architecture:** A monotonic `kills` field on `Tower` in the rules engine, incremented in `fireTowers` when a Tower's damage is the finishing blow. DPS is derived at display time as `damage / (fireIntervalMs / 1000)` in `TowerPanel.tsx`. The counter stays out of `structuralKey` because every kill removes a Piece from the keyed `pieces` string, so the panel already refreshes on each kill.

**Tech Stack:** TypeScript (strict), Vitest, React Three Fiber, Vite, pnpm.

## Global Constraints

- No `Math.random` in `src/game/` — runs are seeded, everything deterministic. Enforced by ESLint.
- `src/game/` must never import React or Three.js.
- A Tower's `id` is its identity, never its rank+suit.
- `kills` must NOT be added to `structuralKey` — it changes only when a Piece dies, and a death already changes the keyed `pieces` string.
- `killers` attribution must be deterministic: iterate towers in array order, targets in `selectTargets`'s sorted order.
- Run `pnpm test:run`, `pnpm typecheck`, and `pnpm lint` before claiming a task done. All three must pass.
- Commit after each task with a message matching repo style (`feat(engine): ...`, `feat(ui): ...`).

---
## Task 1: `Tower.kills` field, seeded to 0 everywhere

**Files:**
- Modify: `src/game/types.ts:251-297` (the `Tower` interface)
- Modify: `src/game/cardPlays.ts:36-38` (the `newTower` seed)
- Modify: `src/game/fixtures.ts:84-86` (the `towersAt` test helper)
- Modify: `src/game/tick.test.ts:485-496` (a literal `Tower` object)
- Modify: `src/scene/boardClick.test.ts:8-18` (a literal `Tower` object)
- Modify: `src/scene/towerDiff.test.ts:8-19` (a literal `Tower` object)
- Modify: `src/scene/firePulse.test.ts:44-54` (the `tower()` helper)
- Test: `src/game/firing.test.ts` (new test in the `tower firing` describe)

**Interfaces:**
- Produces: `Tower.kills: number` — a required field on every `Tower`. Monotonic lifetime count of Pieces whose finishing blow this Tower dealt. Never reset. A Joker's Clear never credits a Tower.
- Consumes: `withTower(cardRank, square, state?)`, `firstTower(state)` from `src/game/fixtures.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/game/firing.test.ts`, inside the `describe('tower firing', ...)` block:

```ts
it('seeds a fresh Tower with zero kills', () => {
  const state = withTower(2, { file: 3, rank: 3 })

  expect(firstTower(state).kills).toBe(0)
})
```

`firstTower` and `withTower` are already imported at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:run`
Expected: FAIL — `kills` does not exist on `Tower`, so the assertion reads `undefined` and fails.

- [ ] **Step 3: Add the field to the `Tower` interface**

In `src/game/types.ts`, after the `shotsFired` field (line 296), add:

```ts
  /**
   * Lifetime count of Pieces whose finishing blow this Tower dealt.
   *
   * Monotonic and never reset within a run. Incremented in `fireTowers`
   * (`src/game/tick.ts`) when this Tower's damage takes a Piece's health to
   * zero or below — the finishing blow, even when another Tower did most of
   * the work. A Joker's Clear destroys Pieces but is a board wipe by the
   * Joker, never a Tower's shot, so it credits no Tower.
   *
   * Kept out of `structuralKey` on purpose: a kill removes the dead Piece
   * from the keyed `pieces` string, so the panel already publishes on every
   * kill — keying the counter would add no publishes and just bloat the key.
   */
  readonly kills: number
```

- [ ] **Step 4: Seed the field everywhere a Tower is constructed**

`src/game/cardPlays.ts` (`newTower`, after `shotsFired: 0,`):
```ts
    shotsFired: 0,
    kills: 0,
```

`src/game/fixtures.ts` (`towersAt`, after `shotsFired: 0,`):
```ts
        shotsFired: 0,
        kills: 0,
```

`src/game/tick.test.ts` (the literal `tower` object, after `shotsFired: 0,`):
```ts
      shotsFired: 0,
      kills: 0,
```

`src/scene/boardClick.test.ts` (the literal `Tower`, after `shotsFired: 0,`):
```ts
    shotsFired: 0,
    kills: 0,
```

`src/scene/towerDiff.test.ts` (the `tower()` helper, after `shotsFired: 0,`):
```ts
    shotsFired: 0,
    kills: 0,
```

`src/scene/firePulse.test.ts` (the `tower()` helper, after `shotsFired: 0,`):
```ts
    shotsFired: 0,
    kills: 0,
```

- [ ] **Step 5: Run the test suite, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass. The new test passes because `newTower` seeds `kills: 0`.

- [ ] **Step 6: Commit**

```bash
git add src/game/types.ts src/game/cardPlays.ts src/game/fixtures.ts src/game/tick.test.ts src/scene/boardClick.test.ts src/scene/towerDiff.test.ts src/scene/firePulse.test.ts src/game/firing.test.ts
git commit -m "feat(engine): Tower kills counter (#58)"
```

---
## Task 2: Attribute kills to the finishing Tower in `fireTowers`

**Files:**
- Modify: `src/game/tick.ts:312-429` (`fireTowers`)
- Test: `src/game/firing.test.ts` (new tests in the `tower firing` describe)
- Test: `src/game/miss.test.ts` (new test in the `the black miss` describe)

**Interfaces:**
- Consumes: `Tower.kills` (Task 1); `amplificationFor` from `towerAuras.ts`; `withTower`, `liveRound`, `pawnAt`, `pieceAt`, `firstTower` from `src/game/fixtures.ts`; `step` and `tick` from `./index`.
- Produces: `fireTowers` continues to return `{ towers, pieces, destroyed, rng, missed }` unchanged in shape; `towers[i].kills` now counts finishing blows.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/firing.test.ts`. The file already imports `describe, expect, it`, `PIECE_TYPES`, `TOWER_RANKS`, `firstTower, liveRound, pawnAt, pieceAt, withTower`, `tick`, and types. Add `step` to the `./index` import:

```ts
import { step, tick } from './index'
```

Tests, appended inside `describe('tower firing', ...)`:

```ts
it('credits the finishing blow, not every Tower that damaged the Piece', () => {
  // Two rank-2 Towers both in range of one Piece. Both fire in the same tick;
  // the first-listed Tower's shot lands first. Health 5: A deals 3 -> 2,
  // B deals 3 -> -1, so B is the finisher despite A doing half the work.
  const piece = { ...pieceAt('rook', 'victim', { file: 3, rank: 4 }), health: 5 }
  const withA = withTower(2, { file: 3, rank: 3 })
  const state = liveRound(withTower(2, { file: 4, rank: 3 }, withA), [piece])

  const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)

  const [a, b] = after.towers
  expect(a?.kills).toBe(0)
  expect(b?.kills).toBe(1)
})

it('counts one kill for an overkill shot', () => {
  // Rank 2 deals 3; a 1-health Piece proves excess damage still counts once.
  const piece = { ...pieceAt('pawn', 'victim', { file: 4, rank: 4 }), health: 1 }
  const state = liveRound(withTower(2, { file: 3, rank: 3 }), [piece])

  const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)

  expect(after.pieces).toHaveLength(0)
  expect(firstTower(after).kills).toBe(1)
})

it('never credits the Wall, which has no gun', () => {
  const state = liveRound(withTower(7, { file: 3, rank: 2 }), [
    pieceAt('pawn', 'victim', { file: 3, rank: 5 }),
  ])

  const after = runFor(state, 2000)

  expect(firstTower(after).kills).toBe(0)
})

it("a Joker's Clear credits no Tower", () => {
  const state = liveRound(withTower(2, { file: 3, rank: 3 }), [
    pieceAt('pawn', 'victim', { file: 4, rank: 4 }),
  ])
  const withJoker = {
    ...state,
    deck: [...state.deck, { id: 'joker', kind: 'joker' as const }],
  }

  const cleared = step(withJoker, { kind: 'clearPieces', cardId: 'joker' })

  expect(cleared.pieces).toHaveLength(0)
  expect(firstTower(cleared).kills).toBe(0)
})

it('is lifetime across rounds, never reset', () => {
  const round1 = liveRound(withTower(2, { file: 3, rank: 3 }), [
    pieceAt('pawn', 'victim-1', { file: 4, rank: 4 }),
  ])
  const after1 = runFor(round1, TOWER_RANKS[2].fireIntervalMs + DT)

  expect(after1.phase).toBe('gap')
  expect(firstTower(after1).kills).toBe(1)

  const round2 = liveRound(step(after1, { kind: 'startRound' }), [
    pieceAt('pawn', 'victim-2', { file: 4, rank: 4 }),
  ])
  const after2 = runFor(round2, TOWER_RANKS[2].fireIntervalMs + DT)

  expect(firstTower(after2).kills).toBe(2)
})
```

Add to `src/game/miss.test.ts`, inside `describe('the black miss', ...)`. The file already imports `describe, expect, it`, `TOWER_RANKS`, `firstTower, liveRound, pieceAt, withTower`, `step, tick`, types:

```ts
it('a miss acquires nothing, so it never credits a kill', () => {
  // The window never lets the Rook die — 6 shots at 2 damage = 12, under its
  // 14 health even if every shot landed — so kills must stay 0 throughout.
  const black = runFor(underFire('black'), WINDOW_MS)

  expect(black.recentMisses.length).toBeGreaterThan(0)
  expect(firstTower(black).kills).toBe(0)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL — every Tower still reports `kills: 0` because nothing increments it yet.

- [ ] **Step 3: Implement attribution in `fireTowers`**

In `src/game/tick.ts`, add a local attribution map next to `remainingHealth` (after line 332):

```ts
  // Which Tower dealt the finishing blow to which Piece. A Piece dies at most
  // once per tick — `selectTargets` skips anything already at <= 0 health — so
  // each entry is a distinct kill, and iteration order makes the owner exact.
  const killers = new Map<string, string>()
```

Replace the acquired-damage loop (lines 403-409) so it records the finisher:

```ts
      for (const target of acquired) {
        const multiplier = amplificationFor(tower.id, target.id, amplifiers)
        const before = remainingHealth.get(target.id) ?? target.health
        const after = before - tower.damage * multiplier
        remainingHealth.set(target.id, after)
        if (before > 0 && after <= 0) killers.set(target.id, tower.id)
      }
```

Replace the `nextTowers.push` (line 412) so kills accumulate:

```ts
    const kills = tower.kills + [...killers.values()].filter((id) => id === tower.id).length
    nextTowers.push({ ...tower, fireCooldownMs: cooldown, shotsFired, kills })
```

Notes on what NOT to change:
- The Wall's early push at line 355 stays as `nextTowers.push(tower)` — a gunless Tower never acquires a target, so it can never be a finisher.
- The empty-`towers` early return at line 326 is untouched.
- A Clear (`clearPieces` in `cardPlays.ts`) never reaches `fireTowers`, so it credits nothing by construction.

- [ ] **Step 4: Run the tests, typecheck, and lint**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass, including the six new tests and the `structuralKey` suite.

- [ ] **Step 5: Commit**

```bash
git add src/game/tick.ts src/game/firing.test.ts src/game/miss.test.ts
git commit -m "feat(engine): attribute kills to the finishing Tower (#58)"
```

---
## Task 3: Show pieces defeated and DPS in the Tower panel

**Files:**
- Modify: `src/ui/TowerPanel.tsx:50-68` (the `hud__stats` definition list)

**Interfaces:**
- Consumes: `Tower.kills` (Task 1); `formatStat` from `./formatStat`; `towerRank` and `def` already in scope; `tower.damage` and `tower.fireIntervalMs` already in `structuralKey`.
- Produces: two new rows in the Tower inspect panel. No engine or store changes.

- [ ] **Step 1: Add the rows to the panel**

In `src/ui/TowerPanel.tsx`, after the "Damage taken" `<div>` (after line 67), add:

```tsx
        <div>
          <dt>Pieces defeated</dt>
          <dd>{formatStat(tower.kills)}</dd>
        </div>
        {def.geometry !== 'none' && (
          <div>
            <dt>DPS</dt>
            <dd>{formatStat(tower.damage / (tower.fireIntervalMs / 1000))}</dd>
          </div>
        )}
```

The `def.geometry !== 'none'` gate hides DPS for the rank-7 Wall only — the Amplifier and Freezer do deal their (low) own damage, and their aura is a separate figure the board shows. Do NOT gate on `tower.damage > 0`: a ♣-supported Wall would still never fire, yet its damage would be nonzero.

- [ ] **Step 2: Verify typecheck and lint pass**

Run: `pnpm typecheck && pnpm lint`
Expected: pass. There is no jsdom, so the panel itself is untested by design (this is the accepted trade-off of the chosen approach); `formatStat` already has coverage.

- [ ] **Step 3: Run the full suite**

Run: `pnpm test:run`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/TowerPanel.tsx
git commit -m "feat(ui): show kills and DPS in the Tower panel (#58)"
```
