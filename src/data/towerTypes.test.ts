import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from './pieceTypes'
import { TOWER_TYPES, TOWER_TYPE_IDS, towerType } from './towerTypes'

/** Every type that actually shoots — the ladder minus the Wall. */
const FIRING_TYPES = TOWER_TYPE_IDS.filter((id) => towerType(id).geometry !== 'none')

describe('the tower type table', () => {
  it('has exactly the nine types in rarity order', () => {
    expect(TOWER_TYPE_IDS).toEqual([
      'vertical', 'wall', 'sniper', 'diagonal', 'cross', 'star', 'splash', 'ring', 'tollgate',
    ])
  })

  it('defines every type', () => {
    for (const id of TOWER_TYPE_IDS) expect(TOWER_TYPES[id]).toBeDefined()
  })

  it('has exactly one tower that never fires — the Wall', () => {
    expect(FIRING_TYPES).toHaveLength(TOWER_TYPE_IDS.length - 1)
    expect(towerType('wall').geometry).toBe('none')
  })

  it('gives the Wall no damage and no targets, and a positive fire interval', () => {
    const wall = towerType('wall')
    expect(wall.damage).toBe(0)
    expect(wall.targetsPerShot).toBe(0)
    expect(wall.fireIntervalMs).toBeGreaterThan(0)
  })

  it('never fires slower than a Pawn moves, so every firing tower gets a shot', () => {
    for (const id of FIRING_TYPES) {
      expect(towerType(id).fireIntervalMs).toBeLessThan(PIECE_TYPES.pawn.moveIntervalMs)
    }
  })

  it('gives the vertical a 700ms fire interval (issue #71 nerf)', () => {
    expect(towerType('vertical').fireIntervalMs).toBe(700)
  })

  it('makes the Sniper a filled radius-6 disc that sees through friendly Towers', () => {
    const sniper = towerType('sniper')
    expect(sniper.geometry).toBe('adjacent')
    expect(sniper.range).toBe(6)
    expect(sniper.ignoresOcclusion).toBe(true)
  })

  it('gives the occlusion exemption to no Tower but the Sniper', () => {
    for (const id of TOWER_TYPE_IDS) {
      expect(towerType(id).ignoresOcclusion === true).toBe(id === 'sniper')
    }
  })

  it('pins the Sniper shots-to-kill contract against every Piece type', () => {
    const sniper = towerType('sniper')
    expect(Math.ceil(PIECE_TYPES.pawn.maxHealth / sniper.damage)).toBe(1)
    expect(Math.ceil(PIECE_TYPES.knight.maxHealth / sniper.damage)).toBe(1)
    expect(Math.ceil(PIECE_TYPES.bishop.maxHealth / sniper.damage)).toBe(2)
    expect(Math.ceil(PIECE_TYPES.rook.maxHealth / sniper.damage)).toBe(4)
    expect(Math.ceil(PIECE_TYPES.queen.maxHealth / sniper.damage)).toBe(3)
    expect(Math.ceil(PIECE_TYPES.king.maxHealth / sniper.damage)).toBe(3)
  })

  it('rises in health across the firing types, and the Wall out-tanks all of them', () => {
    const healths = FIRING_TYPES.map((id) => towerType(id).maxHealth)
    healths.reduce((previous, current) => {
      expect(current).toBeGreaterThan(previous)
      return current
    })
    for (const id of FIRING_TYPES) {
      expect(towerType('wall').maxHealth).toBeGreaterThan(towerType(id).maxHealth)
    }
  })

  it('puts no aura anywhere — auras are gone with the Amplifier and Freezer', () => {
    for (const id of TOWER_TYPE_IDS) expect('aura' in TOWER_TYPES[id]).toBe(false)
  })
})
