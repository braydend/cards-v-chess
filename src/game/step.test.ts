import { describe, expect, it } from 'vitest'
import { createInitialState, step } from './index'
import type { GameState } from './types'

describe('step: startRound', () => {
  it('moves from the untimed gap into live combat', () => {
    const state = step(createInitialState(), { kind: 'startRound' })

    expect(state.phase).toBe('inProgress')
    expect(state.roundElapsedMs).toBe(0)
    expect(state.pendingSpawns.length).toBeGreaterThan(0)
  })

  it('is ignored while a round is already in progress', () => {
    const running = step(createInitialState(), { kind: 'startRound' })

    expect(step(running, { kind: 'startRound' })).toBe(running)
  })

  it('is ignored once defeated', () => {
    const defeated: GameState = { ...createInitialState(), phase: 'defeated' }

    expect(step(defeated, { kind: 'startRound' })).toBe(defeated)
  })
})

describe('step: setAutoStart', () => {
  it('toggles the setting without otherwise disturbing state', () => {
    const initial = createInitialState()
    const enabled = step(initial, { kind: 'setAutoStart', enabled: true })

    expect(enabled.autoStart).toBe(true)
    expect(enabled.phase).toBe(initial.phase)
    expect(enabled.roundNumber).toBe(initial.roundNumber)

    expect(step(enabled, { kind: 'setAutoStart', enabled: false }).autoStart).toBe(false)
  })
})

describe('step: placeTower', () => {
  it('places a tower on an empty square', () => {
    const state = step(createInitialState(), { kind: 'placeTower', square: { file: 2, rank: 2 } })

    expect(state.towers).toHaveLength(1)
    expect(state.towers[0]?.square).toEqual({ file: 2, rank: 2 })
  })

  it('gives each tower a distinct id', () => {
    let state = createInitialState()
    state = step(state, { kind: 'placeTower', square: { file: 1, rank: 1 } })
    state = step(state, { kind: 'placeTower', square: { file: 2, rank: 1 } })

    expect(new Set(state.towers.map((tower) => tower.id)).size).toBe(2)
  })

  it('is allowed during a round, since building is not confined to the gap', () => {
    const running = step(createInitialState(), { kind: 'startRound' })
    const state = step(running, { kind: 'placeTower', square: { file: 4, rank: 4 } })

    expect(state.phase).toBe('inProgress')
    expect(state.towers).toHaveLength(1)
  })

  it.each([
    ['off the left edge', { file: -1, rank: 0 }],
    ['off the far rank', { file: 0, rank: 8 }],
    ['off the right edge', { file: 8, rank: 0 }],
  ])('refuses a square %s', (_label, square) => {
    const initial = createInitialState()

    expect(step(initial, { kind: 'placeTower', square })).toBe(initial)
  })

  it('refuses the Core square', () => {
    const initial = createInitialState()
    const state = step(initial, { kind: 'placeTower', square: initial.core.square })

    expect(state).toBe(initial)
  })

  it('refuses an already occupied square', () => {
    const occupied = step(createInitialState(), {
      kind: 'placeTower',
      square: { file: 5, rank: 5 },
    })
    const state = step(occupied, { kind: 'placeTower', square: { file: 5, rank: 5 } })

    expect(state).toBe(occupied)
    expect(state.towers).toHaveLength(1)
  })
})
