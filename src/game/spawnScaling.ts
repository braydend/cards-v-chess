/**
 * Spawn pacing — the only round-scaling that remains.
 *
 * `rounds.ts` calls `spawnGapMs` to pace a round's spawns. Piece health is
 * NOT scaled: every Piece spawns at its authored `maxHealth`, whatever the
 * round. Pure and deterministic by construction: the input is a round number
 * and an authored base, there is no randomness anywhere, and the same round
 * always paces the same way.
 */
import { SPAWN_GAP_BASE_MS, SPAWN_GAP_FLOOR_MS, SPAWN_GAP_RAMP } from '../data/spawnScaling'

/**
 * The gap, in milliseconds, between consecutive spawns in this round.
 *
 * `SPAWN_GAP_BASE_MS` in round 1, then multiplied by `SPAWN_GAP_RAMP` per
 * round after, floored at `SPAWN_GAP_FLOOR_MS` so a very long run does not
 * turn a round into a simultaneous dump.
 */
export function spawnGapMs(roundNumber: number): number {
  const ramp = Math.pow(SPAWN_GAP_RAMP, Math.max(0, roundNumber - 1))
  return Math.max(SPAWN_GAP_FLOOR_MS, Math.round(SPAWN_GAP_BASE_MS * ramp))
}
