# Remove Piece Health Scaling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pieces spawn at their authored `maxHealth` in every round; the round-based health schedule and its two helper functions are deleted; the spawn-density ramp (`spawnGapMs`) is kept.

**Architecture:** A deletion-and-rewire. `src/data/spawnScaling.ts` drops the health-schedule constants; `src/game/spawnScaling.ts` drops `spawnHealthMultiplier` and `spawnHealth`, keeping only `spawnGapMs`; the three `spawnHealth(...)` call sites (two in `tick.ts`, one in `dev.ts`) use `pieceType(...).maxHealth` directly. Tests and two doc paragraphs follow.

**Tech Stack:** TypeScript (strict), Vitest, pnpm. Verify with `pnpm test:run`, `pnpm typecheck`, `pnpm lint`.

## Global Constraints

- `src/game/` must never import React or Three.js; `Math.random` must never appear in `src/game/` or `src/data/`.
- The spawn-DENSITY ramp is kept: `SPAWN_GAP_BASE_MS` (1200), `SPAWN_GAP_RAMP` (0.98), `SPAWN_GAP_FLOOR_MS` (600), and `spawnGapMs(roundNumber)` stay exactly as they are.
- Authored `PieceTypeDef.maxHealth` becomes the single source of a Piece's health — a Pawn is 3 in round 3 and round 30.
- Tests assert against `PIECE_TYPES[...].maxHealth`, never hardcoded numbers.
- The frozen spec `docs/superpowers/specs/2026-08-08-difficulty-scaling-design.md` is NOT edited — it is a historical decision record.
- Frozen specs/plans directories are never edited.

---

### Task 1: Delete health scaling, rewire call sites, update tests and docs

**Files:**
- Modify: `src/data/spawnScaling.ts`
- Modify: `src/game/spawnScaling.ts`
- Modify: `src/game/tick.ts`
- Modify: `src/game/dev.ts`
- Modify: `src/game/spawnScaling.test.ts`
- Modify: `src/game/dev.test.ts`
- Modify: `docs/design/game-design.md` (~line 178)
- Modify: `CLAUDE.md` (~line 249)

**Interfaces:**
- Consumes: `pieceType(typeId)` from `../data/pieceTypes` (already imported in tick.ts and dev.ts).
- Produces: `spawnScaling.ts` (game) exports only `spawnGapMs`; `data/spawnScaling.ts` exports only `SPAWN_GAP_BASE_MS` / `SPAWN_GAP_RAMP` / `SPAWN_GAP_FLOOR_MS`. `spawnHealth` / `spawnHealthMultiplier` / `SPAWN_HEALTH_*` / `SpawnHealthStep` no longer exist.

- [ ] **Step 1: Rewrite the spawn-health tests to expect authored maxHealth (RED)**

In `src/game/spawnScaling.test.ts`:

1. Change the import line to drop the deleted functions:
   `import { spawnGapMs } from './spawnScaling'`

2. Delete the entire `describe('spawnHealthMultiplier', ...)` block (lines 48-76) and the entire `describe('spawnHealth', ...)` block (lines 78-96).

3. Replace the `describe('a round-N spawn enters with scaled health', ...)` block (lines 98-138) with:

```ts
describe('a spawn enters at its authored max health', () => {
  it('a round-5 Pawn spawns at the authored 3, not a scaled 4', () => {
    const after = tick(liveRoundWithSpawn(5), DT)

    const pawn = after.pieces[0]
    expect(pawn?.health).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('records the authored health as the Piece maximum, so a heal restores to it', () => {
    const after = tick(liveRoundWithSpawn(5), DT)

    const pawn = after.pieces[0]
    expect(pawn?.maxHealth).toBe(pawn?.health)
    expect(pawn?.maxHealth).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('a round-1 Pawn spawns at its authored max', () => {
    const after = tick(liveRoundWithSpawn(1), DT)

    expect(after.pieces[0]?.health).toBe(PIECE_TYPES.pawn.maxHealth)
    expect(after.pieces[0]?.maxHealth).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('a promoted Queen carries no round factor — full Queen health in any round', () => {
    const state: GameState = {
      ...createInitialState(),
      roundNumber: 5,
      phase: 'inProgress',
      pendingSpawns: [],
      pieces: [pawnOnBackRank()],
      nextEntityId: 2,
    }

    const after = runFor(state, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces[0]?.typeId).toBe('queen')
    expect(after.pieces[0]?.health).toBe(PIECE_TYPES.queen.maxHealth)
    expect(after.pieces[0]?.maxHealth).toBe(PIECE_TYPES.queen.maxHealth)
  })
})
```

4. Update the module doc comment at the top of the file to say the tests cover spawn pacing and the authored-health property (the "round-N spawn" framing is gone).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test:run src/game/spawnScaling.test.ts`
Expected: FAIL — the round-5 Pawn still spawns at 4 (scaled), so `toBe(PIECE_TYPES.pawn.maxHealth)` (3) fails; the promoted-Queen test fails the same way.

- [ ] **Step 3: Rewire the call sites to authored maxHealth**

In `src/game/tick.ts`:

1. Line 126:
```ts
    const health = pieceType('queen').maxHealth
```

2. Line 517:
```ts
    const health = pieceType(spawn.typeId).maxHealth
```

3. Remove the `import { spawnHealth } from './spawnScaling'` line (the only other use of that module in tick.ts would then be gone; confirm with a grep that `spawnGapMs` is not imported in tick.ts).

In `src/game/dev.ts`:

4. Line 77:
```ts
  const health = pieceType(typeId).maxHealth
```

5. Remove the `import { spawnHealth } from './spawnScaling'` line. Update the comment above (lines 74-76): "Identical to a normal spawn (drainDueSpawns in tick.ts): authored health and handedness from entity-id parity, so a dev-spawned Piece weaves exactly like one the round would have produced."

- [ ] **Step 4: Delete the health-scaling code**

In `src/game/spawnScaling.ts`, delete `spawnHealthMultiplier` (lines 18-42) and `spawnHealth` (lines 44-54), and their doc comments. Keep `spawnGapMs` (lines 56-66). Rewrite the module doc comment (lines 1-16) to:

```ts
/**
 * Spawn pacing — the only round-scaling that remains.
 *
 * `rounds.ts` calls `spawnGapMs` to pace a round's spawns. Piece health is
 * NOT scaled: every Piece spawns at its authored `maxHealth`, whatever the
 * round. Pure and deterministic by construction: the input is a round number
 * and an authored base, there is no randomness anywhere, and the same round
 * always paces the same way.
 */
```

In `src/data/spawnScaling.ts`, delete `SpawnHealthStep` (lines 17-22), `SPAWN_HEALTH_SCHEDULE` (lines 24-40), `SPAWN_HEALTH_TAIL_ROUNDS` and `SPAWN_HEALTH_TAIL_MULTIPLIER` (lines 42-50). Keep the three `SPAWN_GAP_*` constants (lines 52-65). Rewrite the module doc comment (lines 1-15) to:

```ts
/**
 * Spawn pacing — the only round-scaling that remains.
 *
 * The gap between consecutive spawns shrinks a few percent per round, floored
 * so a very long run does not turn a round into a simultaneous dump. Piece
 * health is NOT scaled: every Piece spawns at its authored `maxHealth`.
 * PLACEHOLDER values — the exact curve belongs to the joint tuning pass.
 */
```

- [ ] **Step 5: Fix `dev.test.ts`**

In `src/game/dev.test.ts`:
1. Remove `spawnHealth` from the import of `./spawnScaling` (line 8) — if that import becomes unused entirely, remove the line.
2. Line 207: `expect(piece?.health).toBe(spawnHealth(PIECE_TYPES.rook.maxHealth, state.roundNumber))` becomes `expect(piece?.health).toBe(PIECE_TYPES.rook.maxHealth)`.
3. Update any doc comments that say "round-scaled health" (grep `spawnHealth` and `round-scaled` in the file and reword).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test:run src/game/spawnScaling.test.ts src/game/dev.test.ts`
Expected: PASS.

- [ ] **Step 7: Update the docs**

In `docs/design/game-design.md` (~line 178), the free-play paragraph currently reads:

> game, the difficulty curve still escalating (`spawnHealthMultiplier`'s tail is unbounded), no further goal, until the Core falls.

Change to:

> game, difficulty still ramping — spawn density tightens (`spawnGapMs`), round composition broadens, but piece health is flat — no further goal, until the Core falls.

In `CLAUDE.md` (~line 249), the Free play vocabulary row currently reads:

> | **Free play** | The run continuing after round 100 is beaten — the same game, difficulty still escalating, no further goal |

Change to:

> | **Free play** | The run continuing after round 100 is beaten — the same game, spawn density still ramping, no further goal |

- [ ] **Step 8: Full verification**

Run: `pnpm test:run && pnpm typecheck && pnpm lint`
Expected: all pass. Then grep to confirm nothing references the deleted symbols:
`rg "spawnHealth|SPAWN_HEALTH|SpawnHealthStep" src/` — expected: only the frozen spec/plan directories or historical docs, nothing in `src/`.

- [ ] **Step 9: Commit**

```bash
git add src/game/tick.ts src/game/dev.ts src/game/spawnScaling.ts src/data/spawnScaling.ts src/game/spawnScaling.test.ts src/game/dev.test.ts docs/design/game-design.md CLAUDE.md
git commit -m "feat(game): remove round-scaled piece health, keep spawn density ramp"
```

---

## Self-review notes

- **Spec coverage:** authored health at all spawn sites (Steps 3-4), density ramp kept (Steps 4's kept constants), tests updated (Steps 1, 5), docs reworded (Step 7), frozen spec untouched (no task edits it).
- **Placeholders:** none — every step has concrete code or exact text.
- **Type consistency:** `spawnGapMs` is the sole surviving export; `spawnHealth`/`spawnHealthMultiplier` are gone everywhere; call sites use `pieceType(...).maxHealth`.
