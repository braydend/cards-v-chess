/**
 * Every spawn-scaling calculation, in one pure place.
 *
 * `tick.ts` (spawn and promotion health) and `rounds.ts` (spawn pacing) call
 * these; neither does the arithmetic itself. Pure and deterministic by
 * construction: the input is a round number and an authored base, there is no
 * randomness anywhere, and the same round always scales the same way.
 */
import {
  SPAWN_GAP_BASE_MS,
  SPAWN_GAP_FLOOR_MS,
  SPAWN_GAP_RAMP,
  SPAWN_HEALTH_SCHEDULE,
  SPAWN_HEALTH_TAIL_MULTIPLIER,
  SPAWN_HEALTH_TAIL_ROUNDS,
} from '../data/spawnScaling'

/**
 * The health multiplier a Piece spawning this round receives.
 *
 * The schedule is stepped — a multiplier applies from its `atRound` until the
 * next step — and past the last step the tail keeps it rising every
 * `SPAWN_HEALTH_TAIL_ROUNDS`. Anything before the first step (round 0, say) is
 * the first step's multiplier, so a defensive round-0 read is 1.0 rather than
 * an out-of-bounds or a zero.
 */
export function spawnHealthMultiplier(roundNumber: number): number {
  let multiplier = 1
  let atRound = 1

  for (const step of SPAWN_HEALTH_SCHEDULE) {
    if (step.atRound <= roundNumber) {
      multiplier = step.multiplier
      atRound = step.atRound
    } else {
      break
    }
  }

  const tailSteps = Math.max(0, Math.floor((roundNumber - atRound) / SPAWN_HEALTH_TAIL_ROUNDS))
  return multiplier + tailSteps * SPAWN_HEALTH_TAIL_MULTIPLIER
}

/**
 * The health a Piece of `baseHealth` (its authored `maxHealth`) spawns with in
 * this round.
 *
 * Integer: health in this game is integer, so the scaled value rounds rather
 * than carrying fractions. Floored at 1 so the multiplier can never make a
 * Piece unkillable-weak, even if a future schedule were to drop below 1.
 */
export function spawnHealth(baseHealth: number, roundNumber: number): number {
  return Math.max(1, Math.round(baseHealth * spawnHealthMultiplier(roundNumber)))
}

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
