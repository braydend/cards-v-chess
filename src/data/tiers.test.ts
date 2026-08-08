import { describe, expect, it } from 'vitest'
import { TIERS, tierDef } from './tiers'

describe('piece tiers', () => {
  it('green is the all-false baseline', () => {
    expect(TIERS.green.huntsFromSpawn).toBe(false)
    expect(TIERS.green.seeksTowers).toBe(false)
    expect(TIERS.green.missChance).toBe(0)
  })

  it('has exactly the four tiers', () => {
    expect(Object.keys(TIERS).sort()).toEqual(['black', 'green', 'red', 'yellow'])
  })

  it('gives every tier a label', () => {
    for (const tier of Object.values(TIERS)) expect(tier.label.length).toBeGreaterThan(0)
  })

  it('only red seeks Towers and only black misses', () => {
    expect(TIERS.red.seeksTowers).toBe(true)
    expect(TIERS.black.missChance).toBeGreaterThan(0)
    for (const [id, def] of Object.entries(TIERS)) {
      if (id !== 'red') expect(def.seeksTowers).toBe(false)
      if (id !== 'black') expect(def.missChance).toBe(0)
    }
  })

  it('yellow hunts from spawn', () => {
    expect(TIERS.yellow.huntsFromSpawn).toBe(true)
  })

  it('tierDef is a lookup, not a copy', () => {
    expect(tierDef('black')).toBe(TIERS.black)
  })
})
