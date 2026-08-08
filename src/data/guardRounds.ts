/**
 * King's Guard round composition.
 *
 * Every 8th round starting at round 15 is a Guard round: it replaces the
 * normal pool composition with clustered King+slider squads, so the King's
 * aura (0.7x move interval, +1 slide to adjacent pieces) actually fires on
 * entry. See the design spec, docs/superpowers/specs/2026-08-08-kings-guard-rounds-design.md.
 */

/** The first round that can be a Guard round. Kings enter the pool at 11, so 15 gives the player a few rounds to meet one first. */
export const GUARD_ROUND_FIRST = 15

/** How often a Guard round appears once it can. */
export const GUARD_ROUND_EVERY = 8

/**
 * Whether `roundNumber` is a Guard round. Pure arithmetic — no PRNG, so the
 * same run seed reproduces the same guard cadence for free.
 */
export function isGuardRound(roundNumber: number): boolean {
  return roundNumber >= GUARD_ROUND_FIRST && (roundNumber - GUARD_ROUND_FIRST) % GUARD_ROUND_EVERY === 0
}
