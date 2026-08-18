import { describe, expect, it } from 'vitest'
import type { Square } from '../game'
import { ease, ghostFor, tiltX, tiltZ } from './placementGhost'

const ACTIVE: Square = { file: 3, rank: 2 }

describe('ghostFor', () => {
  it('renders nothing with no pending Tower', () => {
    expect(ghostFor(null, ACTIVE, true)).toBeNull()
  })

  it('renders nothing with no active square', () => {
    expect(ghostFor('vertical', null, true)).toBeNull()
  })

  it('renders nothing with neither', () => {
    expect(ghostFor(null, null, true)).toBeNull()
  })

  it('reports the pending type as legal on a legal square', () => {
    expect(ghostFor('cross', ACTIVE, true)).toEqual({ type: 'cross', illegal: false })
  })

  it('flags an illegal square', () => {
    expect(ghostFor('ring', ACTIVE, false)).toEqual({ type: 'ring', illegal: true })
  })
})

describe('ease', () => {
  it('moves partway toward the target in one step', () => {
    const value = ease(0, 10, 0.016, 12)
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThan(10)
  })

  it('converges asymptotically without ever overshooting', () => {
    let value = 0
    for (let step = 0; step < 1000; step += 1) {
      value = ease(value, 10, 0.1, 12)
      expect(value).toBeLessThanOrEqual(10)
    }
    expect(value).toBeCloseTo(10, 3)
  })

  it('scales with dt — a larger dt converges faster', () => {
    const slow = ease(0, 10, 0.016, 12)
    const fast = ease(0, 10, 0.032, 12)
    expect(fast).toBeGreaterThan(slow)
  })

  it('does not move when dt is zero', () => {
    expect(ease(5, 10, 0, 12)).toBe(5)
  })

  it('does not move when the rate is zero', () => {
    expect(ease(5, 10, 1, 0)).toBe(5)
  })

  it('converges monotonically upward toward a higher target', () => {
    let value = 0
    let previous = value
    // 50 steps, not 100: exponential damp saturates in double precision once
    // the remaining gap falls below half an ulp of the target (~step 61), and
    // then `value` stops strictly increasing. The property holds forever in
    // the reals; the loop just has to stop before the floats run out.
    for (let step = 0; step < 50; step += 1) {
      value = ease(value, 10, 0.05, 12)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })
})

describe('tiltX and tiltZ', () => {
  it('are upright with no displacement', () => {
    expect(tiltX(0)).toBe(0)
    // toBeCloseTo, not toBe: tiltZ(0) is -0 (a negated zero displacement), and
    // toBe's Object.is treats -0 and +0 as different even though the lean is
    // the same zero rotation.
    expect(tiltZ(0)).toBeCloseTo(0, 10)
  })

  it('tilt proportionally to displacement', () => {
    expect(Math.abs(tiltX(0.2))).toBeGreaterThan(Math.abs(tiltX(0.1)))
    expect(Math.abs(tiltZ(0.2))).toBeGreaterThan(Math.abs(tiltZ(0.1)))
  })

  it('clamp so a huge displacement never exceeds a moderate one', () => {
    expect(tiltX(1000)).toBe(tiltX(10))
    expect(tiltZ(1000)).toBe(tiltZ(10))
  })

  it('lean opposite ways for opposite displacements', () => {
    expect(tiltZ(0.2)).toBeCloseTo(-tiltZ(-0.2), 10)
    expect(tiltX(0.2)).toBeCloseTo(-tiltX(-0.2), 10)
  })
})
