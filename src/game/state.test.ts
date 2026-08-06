import { describe, expect, it } from 'vitest'
import { createInitialState } from './state'

describe('createInitialState', () => {
  it('carries the seed it was given', () => {
    expect(createInitialState('run-a').seed).toBe('run-a')
  })

  it('derives the packs stream from the seed, so two seeds differ', () => {
    expect(createInitialState('run-a').rng.packs).not.toEqual(
      createInitialState('run-b').rng.packs,
    )
  })

  it('is fully reproducible from a seed', () => {
    expect(createInitialState('run-a')).toEqual(createInitialState('run-a'))
  })

  it('defaults to a fixed seed, so a test that does not care gets determinism', () => {
    expect(createInitialState()).toEqual(createInitialState())
  })

  /**
   * Card ids come from their own counter, NOT from `nextEntityId`. Piece
   * handedness is derived from `nextEntityId`'s parity in tick.ts, so spending
   * that counter on cards would silently reverse Piece movement.
   */
  it('counts card ids separately from entity ids', () => {
    const state = createInitialState('run-a')

    expect(state.nextEntityId).toBe(1)
    expect(state.nextCardId).toBeGreaterThanOrEqual(1)
  })
})
