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
 * The ratchet. PLACEHOLDER values measured from the game during the bootstrap
 * task and committed there; raised by hand as tuning lands. Not a statement of
 * what a balanced game should be — a floor under today's reality.
 */
export const BALANCE_THRESHOLDS: BalanceThresholds = {
  minWinRate: 0,
  maxStarvedRuns: 0,
  minMedianCoreHealthAtWin: 0,
  minMedianFailureRound: null,
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
    results.push({
      label: 'median failure round',
      actual: metrics.medianFailureRound ?? 0,
      limit: thresholds.minMedianFailureRound,
      pass: (metrics.medianFailureRound ?? 0) >= thresholds.minMedianFailureRound,
    })
  }

  return results
}
