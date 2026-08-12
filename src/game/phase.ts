import type { RoundPhase } from './types'

/**
 * Whether the run is in a terminal phase: `defeated` or `victory`.
 *
 * `tick` freezes and every card-play command is refused in both — a victorious
 * run is not playing, it is deciding whether to continue. One predicate so the
 * seven card-play guards and the tick guard cannot drift apart.
 */
export function isTerminal(phase: RoundPhase): boolean {
  return phase === 'defeated' || phase === 'victory'
}
