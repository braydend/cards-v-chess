import { describe, expect, it } from 'vitest'
import { towerType } from '../data/towerTypes'
import { firstTower, withTower } from './fixtures'
import { step } from './step'
import { pendingUpgrades, thresholdsCleared, upgradeThreshold } from './upgrades'
import type { GameState } from './types'

describe('upgradeThreshold', () => {
  it('starts at 10, jumps to 22, then escalates 20% each level, ceiled', () => {
    expect(upgradeThreshold(1)).toBe(10)
    expect(upgradeThreshold(2)).toBe(22)
    expect(upgradeThreshold(3)).toBe(27)
    expect(upgradeThreshold(4)).toBe(33)
    expect(upgradeThreshold(5)).toBe(40)
  })
})

describe('thresholdsCleared', () => {
  it('counts how many thresholds a kill count reaches', () => {
    expect(thresholdsCleared(0)).toBe(0)
    expect(thresholdsCleared(9)).toBe(0)
    expect(thresholdsCleared(10)).toBe(1)
    expect(thresholdsCleared(21)).toBe(1)
    expect(thresholdsCleared(22)).toBe(2)
    expect(thresholdsCleared(26)).toBe(2)
    expect(thresholdsCleared(27)).toBe(3)
    expect(thresholdsCleared(32)).toBe(3)
    expect(thresholdsCleared(33)).toBe(4)
    expect(thresholdsCleared(40)).toBe(5)
    expect(thresholdsCleared(47)).toBe(5)
    expect(thresholdsCleared(48)).toBe(6)
  })
})

describe('pendingUpgrades', () => {
  it('is thresholds cleared minus upgrades spent', () => {
    expect(pendingUpgrades(10, 0)).toBe(1)
    expect(pendingUpgrades(22, 0)).toBe(2)
    expect(pendingUpgrades(27, 2)).toBe(1)
    expect(pendingUpgrades(48, 3)).toBe(3)
  })

  it('never goes below zero', () => {
    expect(pendingUpgrades(5, 1)).toBe(0)
    expect(pendingUpgrades(0, 3)).toBe(0)
    expect(pendingUpgrades(10, 5)).toBe(0)
  })

  it('clamps to the remaining room under the cap', () => {
    // 9 spent leaves room for one more; 2 are banked (kills 122 clear 11
    // thresholds, 11 - 9 = 2), so the reported balance is 1, not 2.
    expect(pendingUpgrades(122, 9)).toBe(1)
  })

  it('clamps to zero at the cap, even with kills past more thresholds', () => {
    expect(pendingUpgrades(2000, 10)).toBe(0)
    expect(pendingUpgrades(254, 10)).toBe(0)
  })
})

describe('upgradeTower', () => {
  /** A live Tower with a chosen kill count. */
  function towerWithKills(state: GameState, kills: number): GameState {
    return {
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, kills })),
    }
  }

  function damageOf(state: GameState): number {
    return firstTower(state).damage
  }

  it('spends one upgrade on +1 damage', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)

    const after = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    expect(damageOf(after)).toBe(vertical.damage + 1)
    expect(firstTower(after).upgradesSpent).toBe(1)
  })

  it('spends one upgrade on 10% faster firing, additive off the base interval', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 22)

    const once = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })
    const twice = step(once, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })

    expect(firstTower(once).fireIntervalMs).toBe(
      vertical.fireIntervalMs - 0.1 * vertical.fireIntervalMs,
    )
    // Second pick still subtracts 10% of BASE — 450 -> 400 — not 10% of 450.
    expect(firstTower(twice).fireIntervalMs).toBe(
      vertical.fireIntervalMs - 0.2 * vertical.fireIntervalMs,
    )
  })

  it('spends one upgrade on +10% health, healing by exactly the increase', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)
    const damaged = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, health: 10 })),
    }

    const after = step(damaged, { kind: 'upgradeTower', towerId: firstTower(damaged).id, stat: 'health' })

    const tower = firstTower(after)
    // Old max was vertical.maxHealth; both fields gain 10% of the OLD max.
    expect(tower.maxHealth).toBe(vertical.maxHealth + 0.1 * vertical.maxHealth)
    expect(tower.health).toBe(10 + 0.1 * vertical.maxHealth)
    expect(tower.upgradesSpent).toBe(1)
  })

  it('refuses when no upgrade is pending', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 9)

    const after = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    expect(after).toBe(base)
  })

  it('refuses after the pending balance is spent', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)
    const spent = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    const refused = step(spent, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'health' })

    expect(refused).toBe(spent)
  })

  it('refuses for a missing Tower', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10)

    const after = step(base, { kind: 'upgradeTower', towerId: 'nope', stat: 'damage' })

    expect(after).toBe(base)
  })

  it('refuses for the Wall, which can never earn an upgrade', () => {
    // Defense in depth: a Wall's kills can only ever be 0 through the engine,
    // but the refusal must be explicit so a hand-built state cannot slip one.
    const base = towerWithKills(withTower('wall', { file: 3, rank: 3 }), 10)

    const after = step(base, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'health' })

    expect(after).toBe(base)
  })

  it('is valid mid-round and in the gap', () => {
    const midRound: GameState = { ...towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10), phase: 'inProgress' }
    const after = step(midRound, { kind: 'upgradeTower', towerId: firstTower(midRound).id, stat: 'damage' })

    expect(damageOf(after)).toBeGreaterThan(damageOf(midRound))
  })

  it('is refused in a terminal phase', () => {
    const defeated: GameState = { ...towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 10), phase: 'defeated' }

    const after = step(defeated, { kind: 'upgradeTower', towerId: firstTower(defeated).id, stat: 'damage' })

    expect(after).toBe(defeated)
  })

  it('refuses a fire-rate spend that would drive the interval to zero, leaving it pending', () => {
    // The guard refuses any spend whose result would be <= 0, so the spend that
    // would hit 0 is itself refused: the interval floors at 10% of base (9
    // spends on a 500ms interval), never 0. A 0ms interval hangs the engine's
    // firing loop, so the spend must be refused and the upgrade kept.
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)

    let state = base
    for (let i = 0; i < 10; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })
    }
    const tenth = firstTower(state)
    expect(tenth.fireIntervalMs).toBeCloseTo(0.1 * vertical.fireIntervalMs, 10)

    const refused = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })

    expect(refused).toBe(state)
    expect(firstTower(refused).fireIntervalMs).toBe(tenth.fireIntervalMs)
  })

  it('still allows damage after fire-rate is maxed, because the upgrade stays pending', () => {
    const vertical = towerType('vertical')
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)

    let state = base
    for (let i = 0; i < 10; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })
    }

    const after = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })

    expect(firstTower(after).damage).toBe(vertical.damage + 1)
    expect(firstTower(after).fireIntervalMs).toBe(firstTower(state).fireIntervalMs)
  })

  it('allows the tenth spend and refuses the eleventh', () => {
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)
    let state = base
    for (let i = 0; i < 9; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    }
    expect(firstTower(state).upgradesSpent).toBe(9)

    const tenth = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    expect(firstTower(tenth).upgradesSpent).toBe(10)
    expect(firstTower(tenth).damage).toBe(firstTower(state).damage + 1)

    const refused = step(tenth, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    expect(refused).toBe(tenth)
  })

  it('refuses every stat once the cap of 10 is spent', () => {
    // 500 kills clear far more than 10 thresholds, so pending is large; only
    // the cap stops these spends.
    const base = towerWithKills(withTower('vertical', { file: 3, rank: 3 }), 500)
    let state = base
    for (let i = 0; i < 10; i += 1) {
      state = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'damage' })
    }
    expect(firstTower(state).upgradesSpent).toBe(10)
    const capped = firstTower(state)

    const refused = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'health' })
    const alsoRefused = step(state, { kind: 'upgradeTower', towerId: firstTower(base).id, stat: 'fireRate' })

    expect(refused).toBe(state)
    expect(alsoRefused).toBe(state)
    expect(firstTower(refused).upgradesSpent).toBe(10)
    expect(firstTower(refused).damage).toBe(capped.damage)
    expect(firstTower(alsoRefused).fireIntervalMs).toBe(capped.fireIntervalMs)
  })
})
