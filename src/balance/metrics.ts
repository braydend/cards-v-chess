import type { RunResult } from './types'

export interface RoundMean {
  readonly roundNumber: number
  readonly meanKilled: number
  readonly meanLeaked: number
  readonly meanClearTimeMs: number
}

export interface BalanceMetrics {
  readonly runs: number
  readonly wins: number
  readonly winRate: number
  readonly medianCoreHealthAtWin: number
  readonly meanInkAtWin: number
  readonly meanInkAtLoss: number
  readonly medianFailureRound: number | null
  readonly starvedRuns: readonly string[]
  readonly perRound: readonly RoundMean[]
}

export function aggregateMetrics(results: readonly RunResult[]): BalanceMetrics {
  const runs = results.length
  const wins = results.filter((result) => result.outcome === 'won')
  const losses = results.filter((result) => result.outcome === 'defeated')

  return {
    runs,
    wins: wins.length,
    winRate: runs === 0 ? 0 : wins.length / runs,
    medianCoreHealthAtWin: median(wins.map((result) => result.coreHealth)) ?? 0,
    meanInkAtWin: mean(wins.map((result) => result.ink)),
    meanInkAtLoss: mean(losses.map((result) => result.ink)),
    medianFailureRound: median(losses.map((result) => result.finalRound)),
    starvedRuns: results
      .filter((result) => result.starved)
      .map((result) => `${result.botName}:${result.seed}`),
    perRound: meanPerRound(results),
  }
}

function meanPerRound(results: readonly RunResult[]): RoundMean[] {
  const maxRound = Math.max(0, ...results.map((result) => result.finalRound))
  const perRound: RoundMean[] = []

  for (let roundNumber = 1; roundNumber <= maxRound; roundNumber += 1) {
    const traces = results.flatMap((result) =>
      result.rounds.filter((trace) => trace.roundNumber === roundNumber),
    )
    if (traces.length === 0) continue
    perRound.push({
      roundNumber,
      meanKilled: mean(traces.map((trace) => trace.killed)),
      meanLeaked: mean(traces.map((trace) => trace.leaked)),
      meanClearTimeMs: mean(traces.map((trace) => trace.clearTimeMs)),
    })
  }

  return perRound
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** The human-readable report the gate prints. No file artifact. */
export function formatReport(metrics: BalanceMetrics): string {
  return [
    `runs=${metrics.runs} wins=${metrics.wins} winRate=${(metrics.winRate * 100).toFixed(1)}%`,
    `medianCoreHealthAtWin=${metrics.medianCoreHealthAtWin}`,
    `meanInkAtWin=${metrics.meanInkAtWin.toFixed(1)} meanInkAtLoss=${metrics.meanInkAtLoss.toFixed(1)}`,
    `medianFailureRound=${metrics.medianFailureRound ?? 'n/a'}`,
    `starvedRuns=${metrics.starvedRuns.length > 0 ? metrics.starvedRuns.join(',') : 'none'}`,
  ].join('\n')
}
