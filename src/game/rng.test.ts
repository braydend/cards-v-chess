import { describe, expect, it } from 'vitest'
import { next, nextWeighted, streamFor, type Rng } from './rng'

function draw(rng: Rng, count: number): number[] {
  const values: number[] = []
  let current = rng
  for (let i = 0; i < count; i += 1) {
    const [value, advanced] = next(current)
    values.push(value)
    current = advanced
  }
  return values
}

describe('streamFor', () => {
  it('gives the same sequence for the same seed and stream', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).toEqual(draw(streamFor('run-a', 'packs'), 8))
  })

  it('gives different sequences for different seeds', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).not.toEqual(draw(streamFor('run-b', 'packs'), 8))
  })

  /**
   * The property named streams exist for. A second random consumer added later
   * draws from its own stream, so it cannot shift what a shared seed deals to
   * packs — which is what makes a seed survive code changes.
   */
  it('gives independent sequences to different streams of one seed', () => {
    expect(draw(streamFor('run-a', 'packs'), 8)).not.toEqual(draw(streamFor('run-a', 'rounds'), 8))
  })

  it('is unaffected by how much another stream has been drawn', () => {
    const packs = streamFor('run-a', 'packs')
    const before = draw(packs, 4)

    draw(streamFor('run-a', 'rounds'), 500)

    expect(draw(packs, 4)).toEqual(before)
  })
})

describe('next', () => {
  it('returns values in [0, 1)', () => {
    for (const value of draw(streamFor('run-a', 'packs'), 500)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('does not mutate the rng it was given', () => {
    const rng = streamFor('run-a', 'packs')
    const stateBefore = rng.state

    next(rng)

    expect(rng.state).toBe(stateBefore)
  })

  it('advances, so consecutive draws differ', () => {
    const values = draw(streamFor('run-a', 'packs'), 20)

    expect(new Set(values).size).toBeGreaterThan(15)
  })
})

describe('nextWeighted', () => {
  it('never returns a zero-weight entry', () => {
    let rng = streamFor('run-a', 'packs')
    for (let i = 0; i < 300; i += 1) {
      const [picked, advanced] = nextWeighted(rng, [
        ['yes', 1],
        ['never', 0],
      ] as const)
      expect(picked).toBe('yes')
      rng = advanced
    }
  })

  it('favours the heavier entry in rough proportion', () => {
    let rng = streamFor('run-a', 'packs')
    let heavy = 0
    const rounds = 4000

    for (let i = 0; i < rounds; i += 1) {
      const [picked, advanced] = nextWeighted(rng, [
        ['heavy', 9],
        ['light', 1],
      ] as const)
      if (picked === 'heavy') heavy += 1
      rng = advanced
    }

    // Expected 0.9. A wide band on purpose: this asserts the weighting works,
    // not that the generator has any particular statistical quality.
    expect(heavy / rounds).toBeGreaterThan(0.85)
    expect(heavy / rounds).toBeLessThan(0.95)
  })

  it('returns the only entry when there is one', () => {
    const [picked] = nextWeighted(streamFor('run-a', 'packs'), [['only', 3]] as const)

    expect(picked).toBe('only')
  })
})
