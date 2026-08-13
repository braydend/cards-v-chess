import { describe, expect, it } from 'vitest'
import { BOTS } from './bots'
import { runSimulation } from './driver'
import { aggregateMetrics, formatReport } from './metrics'
import { SEEDS } from './seeds'
import { BALANCE_THRESHOLDS, checkThresholds } from './thresholds'

/**
 * The power balance gate (issue #72).
 *
 * Runs every bot × every pinned seed to round 100 through the real engine and
 * asserts the aggregated metrics stay inside the ratchet. A full run is slow —
 * the fixed timestep is 16.7ms — hence the generous per-file timeout.
 */
describe('power balance gate', () => {
  it('keeps the game inside the ratchet thresholds', () => {
    const results = []
    for (const bot of BOTS) {
      for (const seed of SEEDS) {
        results.push(runSimulation(seed, bot))
      }
    }

    const metrics = aggregateMetrics(results)
    // The report prints on every run — a failure should show the numbers,
    // not just a threshold crossed.
    console.log(formatReport(metrics))

    const failures = checkThresholds(metrics, BALANCE_THRESHOLDS).filter(
      (threshold) => !threshold.pass,
    )
    expect(
      failures.map((threshold) => `${threshold.label}: ${threshold.actual} vs ${threshold.limit}`),
    ).toEqual([])
  })
}, 600_000)
