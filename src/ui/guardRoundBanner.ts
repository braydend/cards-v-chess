import { isGuardRound } from '../data/guardRounds'
import type { RoundPhase } from '../game'

/** The single line the banner shows the moment a Guard round starts. */
export const GUARD_BANNER_MESSAGE = "The King's Guard approaches"

/**
 * Whether the banner should announce a Guard round, and what it says.
 *
 * Pure and deterministic: a Guard round is pure arithmetic on the round
 * number, so the message needs nothing but the current phase and round
 * number — no engine events, no timers. Returns null in the gap, after
 * defeat, and for any non-Guard round in progress.
 */
export function guardRoundBanner(phase: RoundPhase, roundNumber: number): string | null {
  return phase === 'inProgress' && isGuardRound(roundNumber) ? GUARD_BANNER_MESSAGE : null
}
