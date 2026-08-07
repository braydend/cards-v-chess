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

  it('says nothing at all for a Tower with no gun', () => {
    // The rank-7 Wall. "hits 0 per shot" is a fact about shooting on a Tower
    // whose design is that it does not shoot, and the geometry line already
    // says so properly. The panel drops the clause on null.
    expect(targetsLabel(0)).toBeNull()
  })

  it('never renders Infinity, and never a zero count, for any rank on the ladder', () => {
    // Asserted across the real table rather than against hardcoded ranks: which
    // ranks carry unlimited targeting, and which carry none, is placeholder
    // balance in src/data/towerRanks.ts. A tuning pass that moves the Wall to
    // another rank, or gives rank 7 a gun, must not break this.
    for (const def of Object.values(TOWER_RANKS)) {
      const label = targetsLabel(def.targetsPerShot)

      // `?? ''` because null is the Wall's correct answer and `toContain`
      // rejects it outright — the empty string satisfies both assertions below
      // for exactly the ranks that should print nothing.
      expect(label ?? '').not.toContain('Infinity')
      expect(label ?? '').not.toBe('hits 0 per shot')
      expect(label === null).toBe(def.targetsPerShot === 0)
    }
  })

  it('covers every rank on the ladder, so a new geometry cannot slip through untested', () => {
    // Guards the loop above from silently testing nothing if the table changes
    // shape.
    expect(Object.values(TOWER_RANKS).length).toBeGreaterThanOrEqual(9)
  })
})
