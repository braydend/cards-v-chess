import { describe, expect, it } from 'vitest'
import { createInitialState, type GameState, type Tower } from '../game'
import { diffTowers, type TowerAnimation } from './towerDiff'

function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower-1',
    square: { file: 3, rank: 3 },
    cardRank: 2,
    fireCooldownMs: 0,
    health: 10,
    maxHealth: 10,
    damageTaken: 0,
    ...overrides,
  }
}

function snapshotWith(overrides: Partial<GameState>): GameState {
  return { ...createInitialState(), ...overrides }
}

describe('diffTowers', () => {
  it('seeds a new record for a Tower id not seen before, and yields no ghost', () => {
    const animations = new Map<string, TowerAnimation>()
    const t = tower({ id: 'tower-1', health: 8, maxHealth: 8 })

    const ghosts = diffTowers(animations, snapshotWith({ towers: [t] }))

    expect(ghosts).toEqual([])
    expect(animations.get('tower-1')).toEqual({
      cardRank: t.cardRank,
      file: t.square.file,
      boardRank: t.square.rank,
      lastHealth: t.health,
      flashPending: false,
      flashStartedAt: -1,
    })
  })

  it('flags flashPending when health drops between snapshots', () => {
    const animations = new Map<string, TowerAnimation>()
    diffTowers(animations, snapshotWith({ towers: [tower({ health: 10, maxHealth: 10 })] }))

    diffTowers(animations, snapshotWith({ towers: [tower({ health: 7, maxHealth: 10 })] }))

    expect(animations.get('tower-1')?.flashPending).toBe(true)
  })

  it('does not flag flashPending when health rises between snapshots (repair)', () => {
    const animations = new Map<string, TowerAnimation>()
    diffTowers(animations, snapshotWith({ towers: [tower({ health: 4, maxHealth: 10 })] }))

    diffTowers(animations, snapshotWith({ towers: [tower({ health: 9, maxHealth: 10 })] }))

    expect(animations.get('tower-1')?.flashPending).toBe(false)
  })

  it('yields a ghost with the remembered cardRank, file, and boardRank when a Tower vanishes mid-round, and deletes its record', () => {
    const animations = new Map<string, TowerAnimation>()
    const fallen = tower({ id: 'tower-1', cardRank: 4, square: { file: 5, rank: 6 } })
    diffTowers(animations, snapshotWith({ phase: 'inProgress', towers: [fallen] }))

    const ghosts = diffTowers(animations, snapshotWith({ phase: 'inProgress', towers: [] }))

    expect(ghosts).toEqual([
      { id: 'tower-1', meshKey: 'ghost:tower-1', cardRank: 4, file: 5, boardRank: 6 },
    ])
    expect(animations.has('tower-1')).toBe(false)
  })

  it('mints a meshKey distinct from the Tower id, so a ghost can never collide with a live Tower in the renderer\'s mesh map', () => {
    const animations = new Map<string, TowerAnimation>()
    const fallen = tower({ id: 'tower-1' })
    diffTowers(animations, snapshotWith({ phase: 'inProgress', towers: [fallen] }))

    const ghosts = diffTowers(animations, snapshotWith({ phase: 'inProgress', towers: [] }))

    expect(ghosts[0]?.meshKey).toBe('ghost:tower-1')
    expect(ghosts[0]?.meshKey).not.toBe(fallen.id)
  })

  it('yields no ghost when a Tower vanishes during the gap phase, but still deletes its record', () => {
    const animations = new Map<string, TowerAnimation>()
    diffTowers(animations, snapshotWith({ phase: 'inProgress', towers: [tower({ id: 'tower-1' })] }))

    const ghosts = diffTowers(animations, snapshotWith({ phase: 'gap', towers: [] }))

    expect(ghosts).toEqual([])
    expect(animations.has('tower-1')).toBe(false)
  })
})
