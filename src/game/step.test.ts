import { describe, expect, it } from 'vitest'
import { jokerCard, standardCard, withDeck } from './fixtures'
import { createInitialState, step } from './index'
import type { GameState } from './types'

describe('step: startRound', () => {
  it('moves from the untimed gap into live combat', () => {
    const state = step(createInitialState(), { kind: 'startRound' })

    expect(state.phase).toBe('inProgress')
    expect(state.roundElapsedMs).toBe(0)
    expect(state.pendingSpawns.length).toBeGreaterThan(0)
  })

  it('is ignored while a round is already in progress', () => {
    const running = step(createInitialState(), { kind: 'startRound' })

    expect(step(running, { kind: 'startRound' })).toBe(running)
  })

  it('is ignored once defeated', () => {
    const defeated: GameState = { ...createInitialState(), phase: 'defeated' }

    expect(step(defeated, { kind: 'startRound' })).toBe(defeated)
  })
})

describe('step: setAutoStart', () => {
  it('toggles the setting without otherwise disturbing state', () => {
    const initial = createInitialState()
    const enabled = step(initial, { kind: 'setAutoStart', enabled: true })

    expect(enabled.autoStart).toBe(true)
    expect(enabled.phase).toBe(initial.phase)
    expect(enabled.roundNumber).toBe(initial.roundNumber)

    expect(step(enabled, { kind: 'setAutoStart', enabled: false }).autoStart).toBe(false)
  })
})

describe('step: buildTower', () => {
  const FIVE = standardCard('five', 5, 'clubs')

  it('builds a Tower on an empty square', () => {
    const state = step(withDeck([FIVE]), { kind: 'buildTower', cardId: 'five', square: { file: 2, rank: 2 } })

    expect(state.towers).toHaveLength(1)
    expect(state.towers[0]?.square).toEqual({ file: 2, rank: 2 })
  })

  it('records the Card rank the Tower was built from', () => {
    const state = step(withDeck([FIVE]), { kind: 'buildTower', cardId: 'five', square: { file: 3, rank: 3 } })

    expect(state.towers[0]?.cardRank).toBe(5)
  })

  it('consumes the Card', () => {
    const state = step(withDeck([FIVE]), { kind: 'buildTower', cardId: 'five', square: { file: 3, rank: 3 } })

    expect(state.deck).toHaveLength(0)
  })

  it('consumes only the Card played, leaving its duplicates', () => {
    const deck = [standardCard('a', 5, 'clubs'), standardCard('b', 5, 'clubs'), standardCard('c', 5, 'clubs')]
    const state = step(withDeck(deck), { kind: 'buildTower', cardId: 'b', square: { file: 3, rank: 3 } })

    expect(state.deck.map((card) => card.id)).toEqual(['a', 'c'])
  })

  it('gives each Tower a distinct id', () => {
    let state = withDeck([standardCard('a', 2, 'hearts'), standardCard('b', 3, 'hearts')])
    state = step(state, { kind: 'buildTower', cardId: 'a', square: { file: 1, rank: 1 } })
    state = step(state, { kind: 'buildTower', cardId: 'b', square: { file: 2, rank: 1 } })

    expect(new Set(state.towers.map((tower) => tower.id)).size).toBe(2)
  })

  it('is allowed during a round, since building is not confined to the gap', () => {
    const running = step(withDeck([FIVE]), { kind: 'startRound' })
    const state = step(running, { kind: 'buildTower', cardId: 'five', square: { file: 4, rank: 4 } })

    expect(state.phase).toBe('inProgress')
    expect(state.towers).toHaveLength(1)
  })

  it.each([
    ['off the left edge', { file: -1, rank: 0 }],
    ['off the far rank', { file: 0, rank: 8 }],
    ['off the right edge', { file: 8, rank: 0 }],
  ])('refuses a square %s', (_label, square) => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'buildTower', cardId: 'five', square })).toBe(initial)
  })

  it('refuses the Core square', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'buildTower', cardId: 'five', square: initial.core.square })).toBe(initial)
  })

  it('refuses an already occupied square', () => {
    const deck = [standardCard('a', 5, 'clubs'), standardCard('b', 5, 'clubs')]
    const occupied = step(withDeck(deck), { kind: 'buildTower', cardId: 'a', square: { file: 5, rank: 5 } })
    const state = step(occupied, { kind: 'buildTower', cardId: 'b', square: { file: 5, rank: 5 } })

    expect(state).toBe(occupied)
    expect(state.towers).toHaveLength(1)
  })

  it('refuses a Card that is not in the Deck', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'buildTower', cardId: 'ghost', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('refuses a face card, which acts rather than builds', () => {
    const initial = withDeck([standardCard('king', 'K', 'clubs')])

    expect(step(initial, { kind: 'buildTower', cardId: 'king', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('refuses a Joker, which has no rank', () => {
    const initial = withDeck([jokerCard('joker')])

    expect(step(initial, { kind: 'buildTower', cardId: 'joker', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('does not consume the Card when the play is refused', () => {
    const initial = withDeck([FIVE])
    const state = step(initial, { kind: 'buildTower', cardId: 'five', square: initial.core.square })

    expect(state.deck).toHaveLength(1)
  })
})
