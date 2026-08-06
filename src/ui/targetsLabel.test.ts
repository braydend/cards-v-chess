import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { targetsLabel } from './targetsLabel'

describe('targetsLabel', () => {
  it('states a finite count', () => {
    expect(targetsLabel(1)).toBe('hits 1 per shot')
    expect(targetsLabel(3)).toBe('hits 3 per shot')
  })

  it('states rank 10s unlimited targeting in words, never as Infinity', () => {
    // The trap this function exists for: String(Number.POSITIVE_INFINITY) is
    // 'Infinity', a word from the language rather than from the game.
    const label = targetsLabel(Number.POSITIVE_INFINITY)

    expect(label).toBe('hits all in range')
    expect(label).not.toContain('Infinity')
  })

  it('never renders Infinity for any rank on the ladder', () => {
    // Asserted across the real table rather than against hardcoded ranks: which
    // ranks carry unlimited targeting is placeholder balance in
    // src/data/towerRanks.ts, and a tuning pass moving it must not break this.
    for (const def of Object.values(TOWER_RANKS)) {
      expect(targetsLabel(def.targetsPerShot)).not.toContain('Infinity')
    }
  })
})
