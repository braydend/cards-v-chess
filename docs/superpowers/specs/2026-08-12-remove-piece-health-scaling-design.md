# Piece Health Scaling Removed

**Status:** Approved design — implementation follows.
**Date:** 2026-08-12
**Supersedes:** the health-scaling half of `2026-08-08-difficulty-scaling-design.md` (frozen record, left untouched as history).

## Change

Pieces spawn at their **authored `maxHealth`** in every round. The round-based
spawn-health schedule is deleted. The **spawn-gap density ramp is kept** — the
gap between spawns still shrinks 2% per round toward the 600ms floor, so later
rounds still press harder by density and roster composition, just not by bulk.

A Pawn has 3 health in round 3 and round 30.

## What is deleted

- `SPAWN_HEALTH_SCHEDULE`, `SPAWN_HEALTH_TAIL_ROUNDS`,
  `SPAWN_HEALTH_TAIL_MULTIPLIER`, and the `SpawnHealthStep` interface in
  `src/data/spawnScaling.ts`.
- `spawnHealthMultiplier` and `spawnHealth` in `src/game/spawnScaling.ts`.
  The module keeps `spawnGapMs` and becomes spawn-pacing only.
- Both `spawnHealth(...)` call sites in `src/game/tick.ts` (promoted Queen and
  `drainDueSpawns`) and the one in `src/game/dev.ts` (`devSpawnPiece`); each
  uses `pieceType(...).maxHealth` directly.

## What is kept

- `SPAWN_GAP_BASE_MS` / `SPAWN_GAP_RAMP` / `SPAWN_GAP_FLOOR_MS` and
  `spawnGapMs(roundNumber)` — spawn density still ramps.
- Authored `PieceTypeDef.maxHealth` as the single source of a Piece's health.

## Tests

- `src/game/spawnScaling.test.ts`: delete the `spawnHealthMultiplier` and
  `spawnHealth` describes; keep `spawnGapMs`. The "round-N spawn enters with
  scaled health" block becomes "a spawn enters at its authored max health" —
  a round-5 Pawn is 3, not 4, and a promoted Queen carries no round factor.
- `src/game/dev.test.ts`: the `spawnHealth(...)` expectation becomes authored
  `maxHealth`.

## Docs

- `docs/design/game-design.md:178-179` — the free-play paragraph's
  "difficulty curve still escalating (`spawnHealthMultiplier`'s tail is
  unbounded)" is reworded: the density ramp continues, piece health is flat.
- `CLAUDE.md:249` — the Free play vocabulary row's "difficulty still
  escalating" is reworded the same way.
- The frozen `2026-08-08-difficulty-scaling-design.md` spec is NOT edited — it
  is a decision record; this spec is the new decision.

## Consequence

The frozen 2026-08-08 spec justified bulk scaling as the fix for the snowball
(game too easy). Removing it re-tilts the run toward the early game being the
hard part — round composition and density still ramp, but a Pawn stops getting
tougher. This is a deliberate balance choice.
