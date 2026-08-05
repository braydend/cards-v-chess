import { describe, expect, it } from 'vitest'
import { ACE_BOARD_RANKS, JACK_SHIELD, KING_CORE_HEALTH } from '../data/cards'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTowerId, jokerCard, liveRound, pawnAt, standardCard, withDeck, withTower } from './fixtures'
import { step, tick } from './index'
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

describe('King — Reinforce', () => {
  function withKing(): GameState {
    return withDeck([standardCard('k', 'K', 'clubs')])
  }

  it('raises both current and maximum Core health', () => {
    const state = withKing()
    const after = step(state, { kind: 'reinforceCore', cardId: 'k' })

    expect(after.core.health).toBe(state.core.health + KING_CORE_HEALTH)
    expect(after.core.maxHealth).toBe(state.core.maxHealth + KING_CORE_HEALTH)
  })

  it('is playable with no Tower on the board, unlike a Jack or Queen', () => {
    const state = withKing()

    expect(state.towers).toHaveLength(0)
    expect(step(state, { kind: 'reinforceCore', cardId: 'k' }).core.health).toBeGreaterThan(
      state.core.health,
    )
  })

  it('heals a damaged Core rather than only granting headroom', () => {
    const state = withKing()
    const hurt: GameState = { ...state, core: { ...state.core, health: 5 } }

    expect(step(hurt, { kind: 'reinforceCore', cardId: 'k' }).core.health).toBe(5 + KING_CORE_HEALTH)
  })

  it('consumes the Card', () => {
    expect(step(withKing(), { kind: 'reinforceCore', cardId: 'k' }).deck).toHaveLength(0)
  })

  it('refuses a non-King', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')])

    expect(step(state, { kind: 'reinforceCore', cardId: 'five' })).toBe(state)
  })
})

describe('Ace — Expand', () => {
  function withAce(): GameState {
    return withDeck([standardCard('a', 'A', 'hearts')])
  }

  it('adds a rank to the board', () => {
    const state = withAce()
    const after = step(state, { kind: 'expandBoard', cardId: 'a' })

    expect(after.board.ranks).toBe(state.board.ranks + ACE_BOARD_RANKS)
  })

  it('leaves the files alone, so spawn files stay valid', () => {
    const state = withAce()

    expect(step(state, { kind: 'expandBoard', cardId: 'a' }).board.files).toBe(state.board.files)
  })

  it('leaves the Core where it is, so the run to it lengthens', () => {
    const state = withAce()

    expect(step(state, { kind: 'expandBoard', cardId: 'a' }).core.square).toEqual(state.core.square)
  })

  it('is playable with no Tower on the board', () => {
    const state = withAce()

    expect(state.towers).toHaveLength(0)
    expect(step(state, { kind: 'expandBoard', cardId: 'a' }).board.ranks).toBeGreaterThan(
      state.board.ranks,
    )
  })

  it('consumes the Card', () => {
    expect(step(withAce(), { kind: 'expandBoard', cardId: 'a' }).deck).toHaveLength(0)
  })

  it('refuses a non-Ace', () => {
    const state = withDeck([standardCard('five', 5, 'hearts')])

    expect(step(state, { kind: 'expandBoard', cardId: 'five' })).toBe(state)
  })

  it('spawns Pieces from the new far rank, not the old one', () => {
    const grown = step(withAce(), { kind: 'expandBoard', cardId: 'a' })
    const started = step(grown, { kind: 'startRound' })

    const after = tick(started, 1000 / 60)
    const spawned = after.pieces[0]

    expect(spawned).toBeDefined()
    expect(spawned?.square.rank).toBe(grown.board.ranks - 1)
  })
})

describe('Joker — Clear', () => {
  function withJoker(): GameState {
    const built = withTower(5, SQUARE)
    const seeded = withDeck([jokerCard('joker')], built)

    return liveRound(seeded, [pawnAt('a', { file: 1, rank: 6 }), pawnAt('b', { file: 6, rank: 3 })])
  }

  it('destroys every Piece on the board', () => {
    const after = step(withJoker(), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.pieces).toHaveLength(0)
  })

  it('spares the Towers, which are only ever destroyed by Pieces', () => {
    const after = step(withJoker(), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.towers).toHaveLength(1)
  })

  it('leaves pendingSpawns alone, so a round still spawning continues', () => {
    const state = withJoker()
    const spawning: GameState = {
      ...state,
      pendingSpawns: [{ atMs: 9_000, typeId: 'pawn', file: 2 }],
    }

    const after = step(spawning, { kind: 'clearPieces', cardId: 'joker' })

    expect(after.pendingSpawns).toHaveLength(1)
    expect(after.phase).toBe('inProgress')
  })

  it('consumes the Card', () => {
    expect(step(withJoker(), { kind: 'clearPieces', cardId: 'joker' }).deck).toHaveLength(0)
  })

  it("refuses a standard card, since Clear is a Joker's only play", () => {
    const state = withDeck([standardCard('five', 5, 'hearts')], withTower(5, SQUARE))

    expect(step(state, { kind: 'clearPieces', cardId: 'five' })).toBe(state)
  })

  it('breaks a grind, so a stalled round can always be resolved', () => {
    // A rank-5 diagonal Tower cannot cover the square directly up-file, so this
    // Pawn grinds it forever. The Joker is the one card that always ends it.
    const built = withTower(5, { file: 3, rank: 4 })
    const seeded = withDeck([jokerCard('joker')], built)
    const stalled = liveRound(seeded, [pawnAt('grinder', { file: 3, rank: 5 })])

    const cleared = step(stalled, { kind: 'clearPieces', cardId: 'joker' })
    const after = tick(cleared, 1000 / 60)

    expect(after.phase).toBe('gap')
  })
})
