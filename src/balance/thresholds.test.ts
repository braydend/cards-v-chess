import { describe, expect, it } from 'vitest'
import { aggregateMetrics } from './metrics'
import { checkThresholds } from './thresholds'
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

const PASSING = [
  { seed: 'a', botName: 'v', outcome: 'won' as const, coreHealth: 90, starved: false },
  { seed: 'b', botName: 'v', outcome: 'won' as const, coreHealth: 70, starved: false },
]

const lenient = {
  minWinRate: 0,
  maxStarvedRuns: 99,
  minMedianCoreHealthAtWin: 0,
  minMedianFailureRound: null,
}

describe('checkThresholds', () => {
  it('passes every check under a lenient ratchet', () => {
    const metrics = aggregateMetrics(PASSING.map((p) => result(p)))
    const checks = checkThresholds(metrics, lenient)
    expect(checks.every((check) => check.pass)).toBe(true)
  })

  it('fails on a win rate below the floor', () => {
    const metrics = aggregateMetrics([
      result({ seed: 'a', botName: 'v', outcome: 'won' as const, coreHealth: 90 }),
      result({ seed: 'b', botName: 'v', outcome: 'defeated' as const, finalRound: 30 }),
    ])
    const checks = checkThresholds(metrics, { ...lenient, minWinRate: 0.9 })
    const winRate = checks.find((check) => check.label === 'win rate')
    expect(winRate?.pass).toBe(false)
    expect(winRate?.actual).toBe(0.5)
    expect(winRate?.limit).toBe(0.9)
  })

  it('fails on a starved run', () => {
    const metrics = aggregateMetrics([
      result({ seed: 'a', botName: 'v', starved: true, starvationRounds: [2] }),
    ])
    const checks = checkThresholds(metrics, { ...lenient, maxStarvedRuns: 0 })
    const starved = checks.find((check) => check.label === 'starved runs')
    expect(starved?.pass).toBe(false)
  })

  it('omits the failure-round check while minMedianFailureRound is null', () => {
    const metrics = aggregateMetrics(PASSING.map((p) => result(p)))
    const checks = checkThresholds(metrics, lenient)
    expect(checks.some((check) => check.label === 'median failure round')).toBe(false)
  })

  it('flags a difficulty cliff when runs fail before the floor', () => {
    const metrics = aggregateMetrics([
      result({ seed: 'a', botName: 'v', outcome: 'defeated', finalRound: 30 }),
    ])
    const checks = checkThresholds(metrics, { ...lenient, minMedianFailureRound: 40 })
    const failure = checks.find((check) => check.label === 'median failure round')
    expect(failure?.pass).toBe(false)
    expect(failure?.actual).toBe(30)
    expect(failure?.limit).toBe(40)
  })
})
