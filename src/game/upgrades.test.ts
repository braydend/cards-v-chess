import { describe, expect, it } from 'vitest'
import { pendingUpgrades, thresholdsCleared, upgradeThreshold } from './upgrades'

describe('upgradeThreshold', () => {
  it('starts at the first threshold and escalates 20% each level, ceiled', () => {
    expect(upgradeThreshold(1)).toBe(10)
    expect(upgradeThreshold(2)).toBe(12)
    expect(upgradeThreshold(3)).toBe(15)
    expect(upgradeThreshold(4)).toBe(18)
    expect(upgradeThreshold(5)).toBe(22)
  })
})

describe('thresholdsCleared', () => {
  it('counts how many thresholds a kill count reaches', () => {
    expect(thresholdsCleared(0)).toBe(0)
    expect(thresholdsCleared(9)).toBe(0)
    expect(thresholdsCleared(10)).toBe(1)
    expect(thresholdsCleared(11)).toBe(1)
    expect(thresholdsCleared(12)).toBe(2)
    expect(thresholdsCleared(14)).toBe(2)
    expect(thresholdsCleared(15)).toBe(3)
    expect(thresholdsCleared(22)).toBe(5)
    expect(thresholdsCleared(23)).toBe(5)
  })
})

describe('pendingUpgrades', () => {
  it('is thresholds cleared minus upgrades spent', () => {
    expect(pendingUpgrades(10, 0)).toBe(1)
    expect(pendingUpgrades(23, 2)).toBe(3)
    expect(pendingUpgrades(22, 5)).toBe(0)
  })

  it('never goes below zero', () => {
    expect(pendingUpgrades(5, 1)).toBe(0)
    expect(pendingUpgrades(0, 3)).toBe(0)
  })
})
