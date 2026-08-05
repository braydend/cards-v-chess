import { describe, expect, it } from 'vitest'
import { withTower } from '../game/fixtures'
import { structuralKey } from './structuralKey'

describe('structuralKey', () => {
  it("changes when a Tower's maxHealth changes, even if health does not", () => {
    // Towers.tsx renders `tower.health / tower.maxHealth`. A ♠ raises the
    // ceiling without touching health, so maxHealth can be the ONLY field
    // that changed on a given tick — deck.length also changes today only
    // because playing the ♠ consumes a Card, which is an accidental,
    // undocumented coupling this key should not rely on.
    const base = withTower(5, { file: 2, rank: 2 })
    const raisedCeiling = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, maxHealth: tower.maxHealth + 10 })),
    }

    expect(structuralKey(raisedCeiling)).not.toBe(structuralKey(base))
  })
})
