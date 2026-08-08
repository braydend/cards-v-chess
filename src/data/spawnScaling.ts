/**
 * Spawn difficulty scaling — the round-scaled health schedule and the spawn
 * pacing ramp, from `docs/superpowers/specs/2026-08-08-difficulty-scaling-design.md`.
 *
 * **Every number here is a PLACEHOLDER.** The spec settles direction only:
 * enemy bulk scales with the round, and spawn density ramps. The exact curve
 * belongs to the joint tuning pass the design doc's open questions demand
 * ("Ink income values" and "Pack weighting and prices" resolve together with
 * these), so nothing in this file should be read as balance. It is
 * table-editing by design — a tuning pass changes data, never logic.
 *
 * Round 1 is deliberately 1.0 health at the full 1200ms gap: the opening
 * rounds must read exactly as the authored stats describe, so the earliest
 * play is unchanged and only later rounds press harder.
 */

export interface SpawnHealthStep {
  /** The first round this multiplier applies to. */
  readonly atRound: number
  /** Health multiplier for any spawn on or after `atRound`. */
  readonly multiplier: number
}

/**
 * Round → spawn health multiplier, applied where a Piece is built.
 *
 * Sorted ascending by `atRound`. A multiplier applies from its `atRound` until
 * the next step, and past the last step the tail in
 * `SPAWN_HEALTH_TAIL_ROUNDS` / `SPAWN_HEALTH_TAIL_MULTIPLIER` keeps it rising.
 *
 * PLACEHOLDER — the shape (stepped, BTD6-style "important rounds" rather than
 * a smooth curve) is the decision; the values are for feel only.
 */
export const SPAWN_HEALTH_SCHEDULE: readonly SpawnHealthStep[] = [
  { atRound: 1, multiplier: 1 },
  { atRound: 5, multiplier: 1.3 },
  { atRound: 10, multiplier: 1.6 },
  { atRound: 15, multiplier: 2 },
  { atRound: 20, multiplier: 2.5 },
]

/**
 * Past the last authored step, the multiplier gains
 * `SPAWN_HEALTH_TAIL_MULTIPLIER` every `SPAWN_HEALTH_TAIL_ROUNDS` rounds,
 * unbounded — the spec's "rounds 20+ ×2.5, rising one step every 5 rounds".
 * Authored as a tail rather than folded into the table so the ramp never
 * silently runs out at the last row. PLACEHOLDER.
 */
export const SPAWN_HEALTH_TAIL_ROUNDS = 5
export const SPAWN_HEALTH_TAIL_MULTIPLIER = 0.5

/**
 * The gap between consecutive spawns in round 1 — today's flat 1200ms,
 * unchanged so the opening rounds play exactly as before. PLACEHOLDER.
 */
export const SPAWN_GAP_BASE_MS = 1200

/**
 * Each round multiplies the gap by this, shrinking it a few percent at a time
 * so the same round presses harder without adding Pieces. PLACEHOLDER.
 */
export const SPAWN_GAP_RAMP = 0.98

/** Spawns never come faster than this, whatever the ramp says. PLACEHOLDER. */
export const SPAWN_GAP_FLOOR_MS = 600
