import { describe, expect, it } from 'vitest'
import { MIN_FIRE_INTERVAL_MS, supportMagnitude } from '../data/cards'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTower, firstTowerId, standardCard, withDeck, withTower } from './fixtures'
import { step } from './index'
import type { GameState } from './types'

const SQUARE = { file: 2, rank: 2 }

/** A rank-5 Tower plus the one support Card under test. */
function withSupport(cardId: string, rank: 2 | 5 | 'K', suit: 'hearts' | 'diamonds' | 'spades' | 'clubs') {
  const built = withTower(5, SQUARE)
  return withDeck([standardCard(cardId, rank, suit)], built)
}

function play(state: GameState, cardId: string): GameState {
  return step(state, { kind: 'supportTower', cardId, towerId: firstTowerId(state) })
}

describe('♥ Repair', () => {
  it('restores lost health', () => {
    const state = withSupport('h', 5, 'hearts')
    const hurt: GameState = {
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, health: 4 })),
    }

    expect(play(hurt, 'h').towers[0]?.health).toBe(4 + supportMagnitude(5))
  })

  it('never heals past maxHealth', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(play(state, 'h').towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('heals more from a higher rank', () => {
    const low = withSupport('h', 2, 'hearts')
    const high = withSupport('h', 'K', 'hearts')
    const hurt = (state: GameState): GameState => ({
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, health: 1 })),
    })

    const healedLow = firstTower(play(hurt(low), 'h')).health
    const healedHigh = firstTower(play(hurt(high), 'h')).health

    expect(healedHigh).toBeGreaterThan(healedLow)
  })
})

describe('♦ Speed', () => {
  it('shortens the fire interval', () => {
    const state = withSupport('d', 5, 'diamonds')

    expect(play(state, 'd').towers[0]?.fireIntervalMs).toBeLessThan(TOWER_RANKS[5].fireIntervalMs)
  })

  it('never drops below the floor, however many are stacked', () => {
    let state = withDeck(
      Array.from({ length: 20 }, (_, i) => standardCard(`d${i}`, 'A', 'diamonds')),
      withTower(5, SQUARE),
    )

    for (let i = 0; i < 20; i += 1) {
      state = play(state, `d${i}`)
    }

    expect(state.towers[0]?.fireIntervalMs).toBe(MIN_FIRE_INTERVAL_MS)
  })
})

describe('♠ Health', () => {
  it('raises maxHealth', () => {
    const state = withSupport('s', 5, 'spades')

    expect(play(state, 's').towers[0]?.maxHealth).toBe(TOWER_RANKS[5].maxHealth + supportMagnitude(5))
  })

  it('does not heal — it raises the ceiling only, which is what keeps it distinct from ♥', () => {
    const state = withSupport('s', 5, 'spades')
    const hurt: GameState = {
      ...state,
      towers: state.towers.map((tower) => ({ ...tower, health: 4 })),
    }

    expect(play(hurt, 's').towers[0]?.health).toBe(4)
  })
})

describe('♣ Damage', () => {
  it('raises damage', () => {
    const state = withSupport('c', 5, 'clubs')

    expect(play(state, 'c').towers[0]?.damage).toBeGreaterThan(TOWER_RANKS[5].damage)
  })

  it('always adds at least one, even from the lowest rank', () => {
    const state = withSupport('c', 2, 'clubs')

    expect(play(state, 'c').towers[0]?.damage).toBeGreaterThanOrEqual(TOWER_RANKS[5].damage + 1)
  })
})

describe('supportTower: refusals', () => {
  it('consumes the Card on a successful play', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(play(state, 'h').deck).toHaveLength(0)
  })

  it('refuses an unknown Card', () => {
    const state = withSupport('h', 5, 'hearts')

    expect(step(state, { kind: 'supportTower', cardId: 'ghost', towerId: firstTowerId(state) })).toBe(state)
  })

  it('refuses an unknown Tower, and keeps the Card', () => {
    const state = withSupport('h', 5, 'hearts')
    const after = step(state, { kind: 'supportTower', cardId: 'h', towerId: 'ghost' })

    expect(after).toBe(state)
    expect(after.deck).toHaveLength(1)
  })

  it('refuses a Joker, which has no suit', () => {
    const state = withDeck([{ id: 'j', kind: 'joker' }], withTower(5, SQUARE))

    expect(step(state, { kind: 'supportTower', cardId: 'j', towerId: firstTowerId(state) })).toBe(state)
  })

  it('supports from a face card, since suits work at every rank', () => {
    const state = withSupport('k', 'K', 'clubs')

    expect(play(state, 'k').towers[0]?.damage).toBeGreaterThan(TOWER_RANKS[5].damage)
  })
})
