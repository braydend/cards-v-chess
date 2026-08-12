import { describe, expect, it } from 'vitest'
import { VICTORY_ROUND } from '../data/rounds'
import { firstTowerId, jokerCard, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { createInitialState, step } from './index'
import type { Command, GameState } from './types'

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

describe('step: playHand and placeTower', () => {
  const FIVE = standardCard('five', 5, 'clubs')
  const HAND_FOR_VERTICAL = ['five'] as const

  function royalFlush(): GameState['deck'] {
    return [
      standardCard('r0', 10, 'clubs'),
      standardCard('r1', 'J', 'clubs'),
      standardCard('r2', 'Q', 'clubs'),
      standardCard('r3', 'K', 'clubs'),
      standardCard('r4', 'A', 'clubs'),
    ]
  }

  it('a legal hand on a square places a Tower', () => {
    const pending = step(withDeck([FIVE]), { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })
    const placed = step(pending, { kind: 'placeTower', square: { file: 2, rank: 2 } })

    expect(placed.towers).toHaveLength(1)
    expect(placed.towers[0]?.square).toEqual({ file: 2, rank: 2 })
    expect(placed.pendingTower).toBeNull()
  })

  it('records the Tower type the hand purchased', () => {
    const pending = step(withDeck([FIVE]), { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })
    const placed = step(pending, { kind: 'placeTower', square: { file: 3, rank: 3 } })

    expect(placed.towers[0]?.type).toBe('vertical')
  })

  it('consumes the Cards', () => {
    const pending = step(withDeck([FIVE]), { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })

    expect(pending.deck).toHaveLength(0)
  })

  it('consumes only the Cards played, leaving their duplicates', () => {
    const deck = [standardCard('a', 5, 'clubs'), standardCard('b', 5, 'clubs'), standardCard('c', 5, 'clubs')]
    const pending = step(withDeck(deck), { kind: 'playHand', cardIds: ['b'] })

    expect(pending.deck.map((card) => card.id)).toEqual(['a', 'c'])
  })

  it('gives each Tower a distinct id', () => {
    let state = withDeck([standardCard('a', 2, 'hearts'), standardCard('b', 3, 'hearts')])
    state = step(state, { kind: 'playHand', cardIds: ['a'] })
    state = step(state, { kind: 'placeTower', square: { file: 1, rank: 1 } })
    state = step(state, { kind: 'playHand', cardIds: ['b'] })
    state = step(state, { kind: 'placeTower', square: { file: 2, rank: 1 } })

    expect(new Set(state.towers.map((tower) => tower.id)).size).toBe(2)
  })

  it('refuses a hand mid-round, since building is confined to the gap', () => {
    const running = step(withDeck([FIVE]), { kind: 'startRound' })
    const refused = step(running, { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })

    expect(refused).toBe(running)
    expect(refused.pendingTower).toBeNull()
  })

  it.each([
    ['off the left edge', { file: -1, rank: 0 }],
    ['off the far rank', { file: 0, rank: 8 }],
    ['off the right edge', { file: 8, rank: 0 }],
  ])('refuses a square %s', (_label, square) => {
    const pending = step(withDeck([FIVE]), { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })

    expect(step(pending, { kind: 'placeTower', square })).toBe(pending)
  })

  it('refuses the Core square', () => {
    const initial = withDeck([FIVE])
    const pending = step(initial, { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })

    expect(step(pending, { kind: 'placeTower', square: initial.core.square })).toBe(pending)
  })

  it('refuses an already occupied square', () => {
    const deck = [standardCard('a', 5, 'clubs'), standardCard('b', 5, 'clubs')]
    let state = step(withDeck(deck), { kind: 'playHand', cardIds: ['a'] })
    state = step(state, { kind: 'placeTower', square: { file: 5, rank: 5 } })

    const pending = step(state, { kind: 'playHand', cardIds: ['b'] })
    const refused = step(pending, { kind: 'placeTower', square: { file: 5, rank: 5 } })

    expect(refused).toBe(pending)
    expect(refused.towers).toHaveLength(1)
  })

  it('refuses a Card that is not in the Deck', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'playHand', cardIds: ['ghost'] })).toBe(initial)
  })

  it('refuses an invalid hand, and keeps the Cards', () => {
    // Two Cards of different ranks form no valid hand of size 2.
    const initial = withDeck([standardCard('a', 5, 'clubs'), standardCard('b', 6, 'hearts')])
    const refused = step(initial, { kind: 'playHand', cardIds: ['a', 'b'] })

    expect(refused).toBe(initial)
    expect(refused.deck).toHaveLength(2)
  })

  it('refuses a Joker, which is never hand material', () => {
    const initial = withDeck([jokerCard('joker')])

    expect(step(initial, { kind: 'playHand', cardIds: ['joker'] })).toBe(initial)
  })

  it('refuses a hand while a pending Tower already stands', () => {
    const initial = withDeck([standardCard('a', 5, 'clubs'), standardCard('b', 5, 'hearts')])
    const pending = step(initial, { kind: 'playHand', cardIds: ['a'] })

    expect(pending.pendingTower).toBe('vertical')
    expect(step(pending, { kind: 'playHand', cardIds: ['b'] })).toBe(pending)
  })

  it('placeTower without a pending Tower returns unchanged', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'placeTower', square: { file: 2, rank: 2 } })).toBe(initial)
  })

  it('refuses a square a Piece is standing on', () => {
    // Towers block movement, so a Tower and a Piece cannot share a square —
    // placing under a Piece manufactures the state blocking exists to prevent.
    const occupied = { file: 2, rank: 2 }
    const withPiece = { ...createInitialState(), pieces: [pawnAt('p', occupied)] }
    const pending = step(withDeck([FIVE], withPiece), { kind: 'playHand', cardIds: HAND_FOR_VERTICAL })
    const refused = step(pending, { kind: 'placeTower', square: occupied })

    expect(refused).toBe(pending)
    expect(refused.towers).toHaveLength(0)
  })

  it('a royal flush without a chosenType is refused', () => {
    const initial = withDeck(royalFlush())

    expect(
      step(initial, { kind: 'playHand', cardIds: ['r0', 'r1', 'r2', 'r3', 'r4'] }),
    ).toBe(initial)
  })

  it('a royal flush with a valid chosenType places that Tower', () => {
    const initial = withDeck(royalFlush())
    const pending = step(initial, {
      kind: 'playHand',
      cardIds: ['r0', 'r1', 'r2', 'r3', 'r4'],
      chosenType: 'ring',
    })

    expect(pending.pendingTower).toBe('ring')

    const placed = step(pending, { kind: 'placeTower', square: { file: 4, rank: 4 } })

    expect(placed.towers[0]?.type).toBe('ring')
  })

  it('refuses a non-royal hand carrying a chosenType', () => {
    const initial = withDeck([FIVE])

    expect(step(initial, { kind: 'playHand', cardIds: ['five'], chosenType: 'ring' })).toBe(initial)
  })
})

describe('step: the defeated guard', () => {
  // src/ui/Hud.tsx only swaps the round button once defeated — <Deck /> stays
  // mounted and clickable — so every one of these five plays is genuinely
  // reachable from a defeated game, not just theoretically.
  //
  // Every card and target below is otherwise entirely legal: a real Tower to
  // shield, a valid single-card high-card hand, and one Card of the exact
  // right kind for each play. If any handler's `if (state.phase === 'defeated')
  // return state` guard were missing, that play would succeed instead of being
  // refused.
  function defeatedState(): GameState {
    const built = withTower('diagonal', { file: 2, rank: 2 })
    const withCards = withDeck(
      [
        standardCard('play', 3, 'hearts'),
        standardCard('shield', 'J', 'hearts'),
        standardCard('king', 'K', 'clubs'),
        standardCard('ace', 'A', 'hearts'),
        jokerCard('joker'),
      ],
      built,
    )

    return { ...withCards, phase: 'defeated' }
  }

  it.each<[string, (towerId: string) => Command]>([
    ['playHand', () => ({ kind: 'playHand', cardIds: ['play'] })],
    ['shieldTower', (towerId) => ({ kind: 'shieldTower', cardId: 'shield', towerId })],
    ['reinforceCore', () => ({ kind: 'reinforceCore', cardId: 'king' })],
    ['expandBoard', () => ({ kind: 'expandBoard', cardId: 'ace' })],
    ['clearPieces', () => ({ kind: 'clearPieces', cardId: 'joker' })],
  ])('%s: refuses to act once defeated, leaving state (and the Card) untouched', (_kind, buildCommand) => {
    const state = defeatedState()

    expect(step(state, buildCommand(firstTowerId(state)))).toBe(state)
  })

  it.each<[string, (towerId: string) => Command]>([
    ['playHand', () => ({ kind: 'playHand', cardIds: ['play'] })],
    ['shieldTower', (towerId) => ({ kind: 'shieldTower', cardId: 'shield', towerId })],
    ['reinforceCore', () => ({ kind: 'reinforceCore', cardId: 'king' })],
    ['expandBoard', () => ({ kind: 'expandBoard', cardId: 'ace' })],
    ['clearPieces', () => ({ kind: 'clearPieces', cardId: 'joker' })],
  ])('%s: refuses to act once victorious, leaving state (and the Card) untouched', (_kind, buildCommand) => {
    const state = { ...defeatedState(), phase: 'victory' as const }

    expect(step(state, buildCommand(firstTowerId(state)))).toBe(state)
  })
})

describe('step: continueToFreePlay', () => {
  it('is refused outside the victory phase', () => {
    const state = createInitialState()

    expect(step(state, { kind: 'continueToFreePlay' })).toBe(state)
  })

  it('moves from victory into the round-101 gap, keeping the win', () => {
    const victor: GameState = {
      ...createInitialState(),
      phase: 'victory',
      won: true,
      roundNumber: VICTORY_ROUND,
    }

    const after = step(victor, { kind: 'continueToFreePlay' })

    expect(after.phase).toBe('gap')
    expect(after.roundNumber).toBe(VICTORY_ROUND + 1)
    expect(after.won).toBe(true)
    expect(after.roundElapsedMs).toBe(0)
    expect(after.pendingSpawns).toHaveLength(0)
  })
})
