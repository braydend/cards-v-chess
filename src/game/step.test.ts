import { describe, expect, it } from 'vitest'
import { firstTowerId, jokerCard, liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { createInitialState, squaresEqual, step, tick } from './index'
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

  it('refuses a square a Piece is standing on', () => {
    // Towers block movement, so a Tower and a Piece cannot share a square —
    // building under a Piece manufactures the state blocking exists to prevent.
    const occupied = { file: 2, rank: 2 }
    const initial = liveRound(withDeck([FIVE]), [pawnAt('p', occupied)])
    const refused = step(initial, { kind: 'buildTower', cardId: 'five', square: occupied })

    expect(refused).toBe(initial)
    // Asserted on `refused`, the play's own outcome, not on `initial` — it
    // only holds of `initial` too because the refusal returned it unchanged.
    expect(refused.towers).toHaveLength(0)
    expect(refused.deck).toHaveLength(1)
  })

  it('allows the square once the Piece has hopped away', () => {
    // Occupancy is read live from state, not latched on the square: the rule
    // has to stop refusing the moment the Piece leaves.
    const occupied = { file: 2, rank: 2 }
    let state = liveRound(withDeck([FIVE]), [pawnAt('p', occupied)])

    // A Pawn hops every 900ms (data/pieceTypes.ts), so 1000ms is one hop.
    for (let elapsed = 0; elapsed < 1000; elapsed += 1000 / 60) {
      state = tick(state, 1000 / 60)
    }
    expect(state.pieces.some((piece) => squaresEqual(piece.square, occupied))).toBe(false)

    const built = step(state, { kind: 'buildTower', cardId: 'five', square: occupied })

    expect(built.towers).toHaveLength(1)
    expect(built.towers[0]?.square).toEqual(occupied)
  })
})

describe('step: the defeated guard', () => {
  // src/ui/Hud.tsx only swaps the round button once defeated — <Deck /> stays
  // mounted and clickable — so every one of these seven plays is genuinely
  // reachable from a defeated game, not just theoretically.
  //
  // Every card and target below is otherwise entirely legal: a real Tower to
  // support/shield/echo onto, a free square to build or echo onto, and one
  // Card of the exact right kind for each play. If any handler's `if
  // (state.phase === 'defeated') return state` guard were missing, that play
  // would succeed instead of being refused.
  const BUILD_SQUARE = { file: 4, rank: 4 }

  function defeatedState(): GameState {
    const built = withTower(5, { file: 2, rank: 2 })
    const withCards = withDeck(
      [
        standardCard('build', 3, 'hearts'),
        standardCard('support', 5, 'diamonds'),
        standardCard('shield', 'J', 'hearts'),
        standardCard('echo', 'Q', 'diamonds'),
        standardCard('king', 'K', 'clubs'),
        standardCard('ace', 'A', 'hearts'),
        jokerCard('joker'),
      ],
      built,
    )

    return { ...withCards, phase: 'defeated' }
  }

  it.each<[string, (towerId: string) => Command]>([
    ['buildTower', () => ({ kind: 'buildTower', cardId: 'build', square: BUILD_SQUARE })],
    ['supportTower', (towerId) => ({ kind: 'supportTower', cardId: 'support', towerId })],
    ['shieldTower', (towerId) => ({ kind: 'shieldTower', cardId: 'shield', towerId })],
    [
      'echoTower',
      (towerId) => ({ kind: 'echoTower', cardId: 'echo', sourceTowerId: towerId, square: BUILD_SQUARE }),
    ],
    ['reinforceCore', () => ({ kind: 'reinforceCore', cardId: 'king' })],
    ['expandBoard', () => ({ kind: 'expandBoard', cardId: 'ace' })],
    ['clearPieces', () => ({ kind: 'clearPieces', cardId: 'joker' })],
  ])('%s: refuses to act once defeated, leaving state (and the Card) untouched', (_kind, buildCommand) => {
    const state = defeatedState()

    expect(step(state, buildCommand(firstTowerId(state)))).toBe(state)
  })
})
