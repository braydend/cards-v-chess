import { beforeEach, describe, expect, it } from 'vitest'
import { advance, dispatch, getState, reset } from './simulation'
import { useGameStore } from './store'

const FRAME_MS = 1000 / 60
const MAX_CATCHUP_STEPS = 5

beforeEach(() => {
  reset()
})

describe('fixed-timestep accumulator', () => {
  it('does not advance the sim on a partial step', () => {
    dispatch({ kind: 'startRound' })
    const before = getState()

    advance(FRAME_MS / 4)

    expect(getState()).toBe(before)
  })

  it('advances the sim once a full step has accumulated', () => {
    dispatch({ kind: 'startRound' })
    const before = getState()

    advance(FRAME_MS)

    expect(getState()).not.toBe(before)
    expect(getState().roundElapsedMs).toBeCloseTo(FRAME_MS)
  })

  it('accumulates partial frames rather than discarding them', () => {
    dispatch({ kind: 'startRound' })

    advance(FRAME_MS * 0.6)
    advance(FRAME_MS * 0.6)

    expect(getState().roundElapsedMs).toBeCloseTo(FRAME_MS)
  })

  it('caps catch-up so a long stall slows the sim instead of hanging the page', () => {
    dispatch({ kind: 'startRound' })

    // Simulate a 60 second stall — a backgrounded tab or a hit breakpoint.
    advance(60_000)

    // Asserted as a bound rather than an exact step count: repeatedly
    // subtracting 1000/60 from the accumulator does not land cleanly in
    // floating point, so the cap can resolve to one step fewer.
    const elapsed = getState().roundElapsedMs
    expect(elapsed).toBeGreaterThan(0)
    expect(elapsed).toBeLessThanOrEqual(FRAME_MS * MAX_CATCHUP_STEPS + 1e-6)
  })

  it('discards stalled time rather than banking it for later frames', () => {
    dispatch({ kind: 'startRound' })

    advance(60_000)
    const afterStall = getState().roundElapsedMs

    // If the 60s had been banked, this frame would drain more of it.
    advance(FRAME_MS)

    expect(getState().roundElapsedMs - afterStall).toBeLessThanOrEqual(FRAME_MS + 1e-6)
  })
})

describe('React re-render pressure', () => {
  it('publishes a snapshot only on structural change, not per frame', () => {
    dispatch({ kind: 'startRound' })

    let publishes = 0
    const unsubscribe = useGameStore.subscribe(() => {
      publishes += 1
    })

    const frames = 600 // ten seconds at 60fps
    for (let frame = 0; frame < frames; frame += 1) advance(FRAME_MS)

    unsubscribe()

    // Pieces hop a few times a second, so the structural key changes on the
    // order of tens of times across 600 frames. If this ever approaches the
    // frame count, the store is re-rendering React every frame and the
    // interpolation-by-mutation design has been broken somewhere.
    expect(publishes).toBeGreaterThan(0)
    expect(publishes).toBeLessThan(frames / 4)
  })

  it('does not publish at all while idling in the gap', () => {
    let publishes = 0
    const unsubscribe = useGameStore.subscribe(() => {
      publishes += 1
    })

    for (let frame = 0; frame < 120; frame += 1) advance(FRAME_MS)

    unsubscribe()

    expect(publishes).toBe(0)
  })
})

describe('dispatch', () => {
  it('applies commands to the live state', () => {
    dispatch({ kind: 'placeTower', square: { file: 2, rank: 3 }, cardRank: 2 })

    expect(getState().towers).toHaveLength(1)
  })

  it('keeps the same state object when a command is refused', () => {
    const before = getState()

    dispatch({ kind: 'placeTower', square: { file: -1, rank: 0 }, cardRank: 2 })

    expect(getState()).toBe(before)
  })
})
