import { describe, expect, it } from 'vitest'
import { towerType } from '../data/towerTypes'
import type { Tower } from '../game'
import { isUpgradeReady } from './upgradeReady'

function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower-1',
    square: { file: 3, rank: 3 },
    type: 'vertical',
    range: towerType('vertical').range,
    fireCooldownMs: 0,
    health: 14,
    maxHealth: 14,
    damage: 2,
    fireIntervalMs: 500,
    fireIntervalBaseMs: 500,
    shield: 0,
    damageTaken: 0,
    shotsFired: 0,
    kills: 0,
    upgradesSpent: 0,
    ...overrides,
  }
}

describe('isUpgradeReady', () => {
  it('is false at zero kills', () => {
    expect(isUpgradeReady(tower())).toBe(false)
  })

  it('is true once the first threshold clears', () => {
    expect(isUpgradeReady(tower({ kills: 10 }))).toBe(true)
  })

  it('is false once the pending balance is spent', () => {
    expect(isUpgradeReady(tower({ kills: 10, upgradesSpent: 1 }))).toBe(false)
  })
})
