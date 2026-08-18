import { describe, expect, it } from 'vitest'
import { TOWER_TYPE_IDS } from '../data/towerTypes'
import { towerHeight } from './towerGeometry'

describe('towerHeight', () => {
  it('grows strictly with the tower type rarity order', () => {
    const heights = TOWER_TYPE_IDS.map((type) => towerHeight(type))
    for (let index = 1; index < heights.length; index += 1) {
      expect(heights[index]).toBeGreaterThan(heights[index - 1] ?? 0)
    }
  })

  it('starts at the base height for the lowest tower type', () => {
    expect(towerHeight(TOWER_TYPE_IDS[0]!)).toBe(0.55)
  })
})
