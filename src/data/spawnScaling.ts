/**
 * Spawn pacing — the only round-scaling that remains.
 *
 * The gap between consecutive spawns shrinks a few percent per round, floored
 * so a very long run does not turn a round into a simultaneous dump. Piece
 * health is NOT scaled: every Piece spawns at its authored `maxHealth`.
 * PLACEHOLDER values — the exact curve belongs to the joint tuning pass.
 */

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
