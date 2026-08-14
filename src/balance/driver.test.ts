import { describe, expect, it } from 'vitest'
import { createInitialState, DEV_SEED } from '../game'
import { isStarved, runSimulation } from './driver'
import type { Bot } from './types'

const NOOP: Bot = { name: 'noop', decide: () => null }

/** A bot that only ever issues one invalid command — must not hang the driver. */
const BAD: Bot = {
  name: 'bad',
  decide: () => ({ kind: 'buyPack', pack: 'court', cullCardIds: [] }),
}

describe('isStarved', () => {
  it('flags an empty deck with nothing affordable', () => {
    const state = { ...createInitialState(DEV_SEED), deck: [], ink: 0 }
    expect(isStarved(state)).toBe(true)
  })

  it('does not flag an empty deck when a pack is affordable', () => {
    const state = { ...createInitialState(DEV_SEED), deck: [], ink: 500 }
    expect(isStarved(state)).toBe(false)
  })

  it('does not flag a deck with cards', () => {
    expect(isStarved(createInitialState(DEV_SEED))).toBe(false)
  })
})

describe('runSimulation', () => {
  it('a no-op bot loses deterministically', () => {
    const first = runSimulation(DEV_SEED, NOOP)
    const second = runSimulation(DEV_SEED, NOOP)

    expect(first.outcome).toBe('defeated')
    expect(second.outcome).toBe('defeated')
    expect(first.finalRound).toBe(second.finalRound)
    expect(first.coreHealth).toBe(0)
    // One trace per round played, including the round that ended the run.
    expect(first.rounds).toHaveLength(first.finalRound)
  })

  it('records leaks and clear time per round', () => {
    const result = runSimulation(DEV_SEED, NOOP)
    const last = result.rounds[result.rounds.length - 1]
    if (last === undefined) throw new Error('expected at least one round trace')
    expect(result.leaks).toBeGreaterThan(0)
    expect(last.clearTimeMs).toBeGreaterThan(0)
    expect(result.totalKills).toBe(0)
  })

  it('skips refused commands without hanging', () => {
    const result = runSimulation(DEV_SEED, BAD)
    expect(result.outcome).toBe('defeated')
    expect(result.finalRound).toBeGreaterThan(0)
  })

  it('stops at maxRounds with outcome stopped', () => {
    const result = runSimulation(DEV_SEED, NOOP, { maxRounds: 2 })
    expect(result.outcome).toBe('stopped')
    expect(result.finalRound).toBe(3)
    expect(result.rounds).toHaveLength(2)
  })

  it('does not flag starvation when the opening deck is playable', () => {
    const result = runSimulation(DEV_SEED, NOOP, { maxRounds: 2 })
    expect(result.starved).toBe(false)
    expect(result.starvationRounds).toEqual([])
  })
})
