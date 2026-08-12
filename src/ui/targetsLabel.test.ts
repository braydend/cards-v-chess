import { describe, expect, it } from 'vitest'
import { TOWER_TYPE_IDS, towerType } from '../data/towerTypes'
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
    // The Wall tower type. "hits 0 per shot" is a fact about shooting on a Tower
    // whose design is that it does not shoot, and the geometry line already
    // says so properly. The panel drops the clause on null.
    expect(targetsLabel(0)).toBeNull()
  })

  it('never renders Infinity, and never a zero count, for any tower on the roster', () => {
    // Asserted across the real table rather than against hardcoded ids: which
    // tower types carry unlimited targeting, and which carry none, is
    // placeholder balance in src/data/towerTypes.ts. A tuning pass that moves
    // the Wall, or gives a gun to a type that has none, must not break this.
    for (const id of TOWER_TYPE_IDS) {
      const label = targetsLabel(towerType(id).targetsPerShot)

      // `?? ''` because null is the Wall's correct answer and `toContain`
      // rejects it outright — the empty string satisfies both assertions below
      // for exactly the types that should print nothing.
      expect(label ?? '').not.toContain('Infinity')
      expect(label ?? '').not.toBe('hits 0 per shot')
      expect(label === null).toBe(towerType(id).targetsPerShot === 0)
    }
  })

  it('covers every tower type on the roster, so a new type cannot slip through untested', () => {
    // Guards the loop above from silently testing nothing if the table changes
    // shape.
    expect(TOWER_TYPE_IDS.length).toBe(9)
  })
})
