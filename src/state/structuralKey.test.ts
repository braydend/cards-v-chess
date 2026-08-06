import { describe, expect, it } from 'vitest'
import { withTower } from '../game/fixtures'
import { structuralKey } from './structuralKey'

describe('structuralKey', () => {
  it("changes when a Tower's maxHealth changes, even if health does not", () => {
    // Towers.tsx renders `tower.health / tower.maxHealth` and TowerPanel
    // prints the ceiling itself, so a maxHealth change must repaint. No play
    // moves maxHealth alone today — a ♠ moves health with it — so this state
    // is constructed by hand rather than driven through a command. It guards
    // the field the renderer reads, not a transition any card produces.
    const base = withTower(5, { file: 2, rank: 2 })
    const raisedCeiling = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, maxHealth: tower.maxHealth + 10 })),
    }

    expect(structuralKey(raisedCeiling)).not.toBe(structuralKey(base))
  })
})
