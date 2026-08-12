import { describe, expect, it } from 'vitest'
import { createInitialState, step, tick } from './index'
import type { GameState } from './types'

const base = (): GameState => createInitialState('dev-test')

describe('devAddInk', () => {
  it('refuses an amount below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devAddInk', amount: 0 })).toBe(state)
  })

  it('adds exactly the amount, mid-round included', () => {
    const state: GameState = { ...base(), phase: 'inProgress' }

    const after = step(state, { kind: 'devAddInk', amount: 150 })

    expect(after.ink).toBe(state.ink + 150)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devAddInk', amount: 10 })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devSetCoreHealth', () => {
  it('refuses health below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devSetCoreHealth', health: 0, maxHealth: 100 })).toBe(state)
  })

  it('refuses a max below health', () => {
    const state = base()

    expect(step(state, { kind: 'devSetCoreHealth', health: 50, maxHealth: 40 })).toBe(state)
  })

  it('refuses once defeated, so the phase cannot contradict the health', () => {
    const defeated: GameState = { ...base(), phase: 'defeated' }

    expect(step(defeated, { kind: 'devSetCoreHealth', health: 100, maxHealth: 100 })).toBe(
      defeated,
    )
  })

  it('sets both current and maximum health', () => {
    const state = base()

    const after = step(state, { kind: 'devSetCoreHealth', health: 40, maxHealth: 50 })

    expect(after.core.health).toBe(40)
    expect(after.core.maxHealth).toBe(50)
  })

  it('survives a tick', () => {
    const state = step(base(), { kind: 'devSetCoreHealth', health: 40, maxHealth: 50 })

    const after = tick(state, 1000 / 60)

    expect(after.core.health).toBe(40)
    expect(after.core.maxHealth).toBe(50)
  })
})
