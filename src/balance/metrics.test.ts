import { describe, expect, it } from 'vitest'
import { aggregateMetrics, formatReport } from './metrics'
import type { RunResult } from './types'

function result(partial: Partial<RunResult> & { seed: string; botName: string }): RunResult {
  return {
    outcome: 'stopped',
    finalRound: 1,
    coreHealth: 0,
    coreMaxHealth: 100,
    ink: 0,
    leaks: 0,
    clears: 0,
    totalKills: 0,
    starved: false,
    starvationRounds: [],
    rounds: [],
    ...partial,
  }
}

describe('aggregateMetrics', () => {
  it('computes win rate and margin across the matrix', () => {
    const results = [
      result({ seed: 'a', botName: 'v', outcome: 'won', coreHealth: 80, ink: 120 }),
      result({ seed: 'b', botName: 'v', outcome: 'won', coreHealth: 40, ink: 60 }),
      result({ seed: 'c', botName: 'v', outcome: 'defeated', finalRound: 60, ink: 30 }),
    ]
    const metrics = aggregateMetrics(results)

    expect(metrics.runs).toBe(3)
    expect(metrics.wins).toBe(2)
    expect(metrics.winRate).toBeCloseTo(2 / 3)
    expect(metrics.medianCoreHealthAtWin).toBe(60)
    expect(metrics.meanInkAtWin).toBeCloseTo(90)
    expect(metrics.meanInkAtLoss).toBeCloseTo(30)
    expect(metrics.medianFailureRound).toBe(60)
  })

  it('reports no failure round when nothing was lost', () => {
    const results = [result({ seed: 'a', botName: 'v', outcome: 'won' })]
    expect(aggregateMetrics(results).medianFailureRound).toBeNull()
  })

  it('lists starved runs as bot:seed', () => {
    const results = [
      result({ seed: 'a', botName: 'value', starved: true, starvationRounds: [4, 5] }),
      result({ seed: 'b', botName: 'aggro', starved: false }),
    ]
    expect(aggregateMetrics(results).starvedRuns).toEqual(['value:a'])
  })

  it('averages per-round traces across runs', () => {
    const results = [
      result({
        seed: 'a',
        botName: 'v',
        rounds: [{ roundNumber: 1, spawned: 3, killed: 2, leaked: 1, clearTimeMs: 10_000 }],
      }),
      result({
        seed: 'b',
        botName: 'v',
        rounds: [{ roundNumber: 1, spawned: 3, killed: 3, leaked: 0, clearTimeMs: 12_000 }],
      }),
    ]
    const perRound = aggregateMetrics(results).perRound
    const first = perRound[0]
    if (first === undefined) throw new Error('expected a per-round mean')

    expect(perRound).toHaveLength(1)
    expect(first).toEqual({
      roundNumber: 1,
      meanKilled: 2.5,
      meanLeaked: 0.5,
      meanClearTimeMs: 11_000,
    })
  })

  it('returns zero win rate for an empty matrix', () => {
    const metrics = aggregateMetrics([])
    expect(metrics.runs).toBe(0)
    expect(metrics.winRate).toBe(0)
  })
})

describe('formatReport', () => {
  it('renders the headline numbers as text', () => {
    const metrics = aggregateMetrics([result({ seed: 'a', botName: 'v', outcome: 'won' })])
    const report = formatReport(metrics)
    expect(report).toContain('winRate=100.0%')
    expect(report).toContain('medianFailureRound=n/a')
  })
})
