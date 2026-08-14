import type { BalanceMetrics } from './metrics'

export interface BalanceThresholds {
  readonly minWinRate: number
  readonly maxStarvedRuns: number
  readonly minMedianCoreHealthAtWin: number
  /**
   * A floor on the median round defeated runs die on — the difficulty-cliff
   * guard. Runs failing much earlier than today's game did is a regression.
   * `null` disables the check while the ratchet is being bootstrapped.
   */
  readonly minMedianFailureRound: number | null
}

export interface ThresholdResult {
  readonly label: string
  readonly actual: number
  readonly limit: number
  readonly pass: boolean
}

/**
 * The ratchet. Values measured from the game on 2026-08-13 (issue #72
 * bootstrap): 4 wins of 15 (0.267), 10 starved runs, median core health at
 * win 61.5, median failure round 14. Slack set just under the measured
 * reality; raised by hand as tuning lands. Not a statement of what a balanced
 * game should be — a floor under today's reality.
 */
export const BALANCE_THRESHOLDS: BalanceThresholds = {
  // Measured from the game on 2026-08-13 (issue #72 bootstrap). A ratchet,
  // not a target — raise by hand as tuning lands. minWinRate is a fraction
  // (0.5 = 50%), not a percentage.
  minWinRate: 0.16,
  maxStarvedRuns: 10,
  minMedianCoreHealthAtWin: 30,
  minMedianFailureRound: 11,
}

export function checkThresholds(
  metrics: BalanceMetrics,
  thresholds: BalanceThresholds = BALANCE_THRESHOLDS,
): ThresholdResult[] {
  const results: ThresholdResult[] = [
    {
      label: 'win rate',
      actual: metrics.winRate,
      limit: thresholds.minWinRate,
      pass: metrics.winRate >= thresholds.minWinRate,
    },
    {
      label: 'starved runs',
      actual: metrics.starvedRuns.length,
      limit: thresholds.maxStarvedRuns,
      pass: metrics.starvedRuns.length <= thresholds.maxStarvedRuns,
    },
    {
      label: 'median core health at win',
      actual: metrics.medianCoreHealthAtWin,
      limit: thresholds.minMedianCoreHealthAtWin,
      pass: metrics.medianCoreHealthAtWin >= thresholds.minMedianCoreHealthAtWin,
    },
  ]

  if (thresholds.minMedianFailureRound !== null) {
    const medianFailureRound = metrics.medianFailureRound ?? 0
    results.push({
      label: 'median failure round',
      actual: medianFailureRound,
      limit: thresholds.minMedianFailureRound,
      // No defeats means no difficulty cliff to guard — a tuning pass that
      // makes every run win must not trip the failure-round floor.
      pass:
        (metrics.medianFailureRound ?? Number.POSITIVE_INFINITY) >= thresholds.minMedianFailureRound,
    })
  }

  return results
}
