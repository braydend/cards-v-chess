import { describe, expect, it } from 'vitest'
import { JACK_SHIELD } from '../data/cards'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTowerId, standardCard, withDeck, withTower } from './fixtures'
import { step } from './index'
import type { GameState } from './types'

const SQUARE = { file: 2, rank: 2 }
const ELSEWHERE = { file: 5, rank: 5 }

function withJacks(count: number): GameState {
  return withDeck(
    Array.from({ length: count }, (_, i) => standardCard(`j${i}`, 'J', 'hearts')),
    withTower(5, SQUARE),
  )
}

describe('Jack — Shield', () => {
  it('grants a shield', () => {
    const state = withJacks(1)
    const after = step(state, { kind: 'shieldTower', cardId: 'j0', towerId: firstTowerId(state) })

    expect(after.towers[0]?.shield).toBe(JACK_SHIELD)
  })

  it('stacks additively', () => {
    let state = withJacks(3)
    const towerId = firstTowerId(state)

    for (let i = 0; i < 3; i += 1) {
      state = step(state, { kind: 'shieldTower', cardId: `j${i}`, towerId })
    }

    expect(state.towers[0]?.shield).toBe(JACK_SHIELD * 3)
  })

  it('does not touch health', () => {
    const state = withJacks(1)
    const after = step(state, { kind: 'shieldTower', cardId: 'j0', towerId: firstTowerId(state) })

    expect(after.towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth)
    expect(after.towers[0]?.maxHealth).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('consumes the Card', () => {
    const state = withJacks(1)
    const after = step(state, { kind: 'shieldTower', cardId: 'j0', towerId: firstTowerId(state) })

    expect(after.deck).toHaveLength(0)
  })

  it('refuses a non-Jack', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')], withTower(5, SQUARE))

    expect(step(state, { kind: 'shieldTower', cardId: 'five', towerId: firstTowerId(state) })).toBe(state)
  })

  it('refuses an unknown Tower', () => {
    const state = withJacks(1)

    expect(step(state, { kind: 'shieldTower', cardId: 'j0', towerId: 'ghost' })).toBe(state)
  })
})

describe('Queen — Echo', () => {
  function withQueen(): GameState {
    return withDeck([standardCard('q', 'Q', 'diamonds')], withTower(5, SQUARE))
  }

  it('builds a second Tower of the same rank', () => {
    const state = withQueen()
    const after = step(state, {
      kind: 'echoTower',
      cardId: 'q',
      sourceTowerId: firstTowerId(state),
      square: ELSEWHERE,
    })

    expect(after.towers).toHaveLength(2)
    expect(after.towers[1]?.cardRank).toBe(5)
    expect(after.towers[1]?.square).toEqual(ELSEWHERE)
  })

  it('copies the rank, not accumulated supports', () => {
    // Otherwise Echo becomes the strongest support multiplier in the game
    // rather than a second Tower.
    const base = withQueen()
    const upgraded: GameState = {
      ...base,
      towers: base.towers.map((tower) => ({
        ...tower,
        damage: 99,
        shield: 50,
        maxHealth: 200,
        health: 50,
        fireIntervalMs: 123,
      })),
    }

    const after = step(upgraded, {
      kind: 'echoTower',
      cardId: 'q',
      sourceTowerId: firstTowerId(upgraded),
      square: ELSEWHERE,
    })

    expect(after.towers[1]?.damage).toBe(TOWER_RANKS[5].damage)
    expect(after.towers[1]?.shield).toBe(0)
    expect(after.towers[1]?.maxHealth).toBe(TOWER_RANKS[5].maxHealth)
    expect(after.towers[1]?.fireIntervalMs).toBe(TOWER_RANKS[5].fireIntervalMs)
    expect(after.towers[1]?.health).toBe(TOWER_RANKS[5].maxHealth)
  })

  it('consumes the Card', () => {
    const state = withQueen()
    const after = step(state, {
      kind: 'echoTower',
      cardId: 'q',
      sourceTowerId: firstTowerId(state),
      square: ELSEWHERE,
    })

    expect(after.deck).toHaveLength(0)
  })

  it('refuses an occupied square', () => {
    const state = withQueen()

    expect(
      step(state, { kind: 'echoTower', cardId: 'q', sourceTowerId: firstTowerId(state), square: SQUARE }),
    ).toBe(state)
  })

  it('refuses the Core square', () => {
    const state = withQueen()

    expect(
      step(state, {
        kind: 'echoTower',
        cardId: 'q',
        sourceTowerId: firstTowerId(state),
        square: state.core.square,
      }),
    ).toBe(state)
  })

  it('refuses an unknown source Tower', () => {
    const state = withQueen()

    expect(
      step(state, { kind: 'echoTower', cardId: 'q', sourceTowerId: 'ghost', square: ELSEWHERE }),
    ).toBe(state)
  })

  it('refuses a non-Queen', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')], withTower(5, SQUARE))

    expect(
      step(state, { kind: 'echoTower', cardId: 'five', sourceTowerId: firstTowerId(state), square: ELSEWHERE }),
    ).toBe(state)
  })
})
