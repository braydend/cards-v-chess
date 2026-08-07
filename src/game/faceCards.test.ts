import { describe, expect, it } from 'vitest'
import { ACE_BOARD_RANKS, JACK_SHIELD, KING_CORE_HEALTH } from '../data/cards'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTowerId, jokerCard, liveRound, pawnAt, pieceAt, standardCard, withDeck, withTower } from './fixtures'
import { createInitialState, stagingRank, step, tick } from './index'
import { clearReward, roundIncome, totalKillReward } from './ink'
import type { GameState, Piece } from './types'

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

  it('refuses a square a Piece is standing on', () => {
    // Echo goes through the same placement rule as a rank build, so this is
    // the second half of the same fix, not a separate one.
    const state = liveRound(withQueen(), [pawnAt('p', ELSEWHERE)])
    const refused = step(state, {
      kind: 'echoTower',
      cardId: 'q',
      sourceTowerId: firstTowerId(state),
      square: ELSEWHERE,
    })

    expect(refused).toBe(state)
    // The Echo source Tower is unchanged — asserted on `refused`, the play's
    // own outcome, not on `state`, which this holds true of only because the
    // refusal returned it unchanged.
    expect(refused.towers).toHaveLength(1)
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

  it('spawns Pieces from the new Staging rank, not the old one', () => {
    const grown = step(withAce(), { kind: 'expandBoard', cardId: 'a' })
    const started = step(grown, { kind: 'startRound' })

    const after = tick(started, 1000 / 60)
    const spawned = after.pieces[0]

    expect(spawned).toBeDefined()
    expect(spawned?.square.rank).toBe(stagingRank(grown.board))
  })
})

describe('Joker — Clear', () => {
  function withJoker(): GameState {
    return withJokerAnd([pawnAt('a', { file: 1, rank: 6 }), pawnAt('b', { file: 6, rank: 3 })])
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
      pendingSpawns: [{ atMs: 9_000, typeId: 'pawn', tier: 'green', file: 2 }],
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

  // Seven Pawns and a Queen, not the two Pawns `withJoker` uses. Two Pawns'
  // quarter share floors to nothing, which would assert the rule without ever
  // demonstrating that it pays. The mix matters too: it totals an amount whose
  // quarter share is genuinely fractional, so the floor has real work to do
  // here rather than landing on a whole number by luck.
  function fullBoard(): Piece[] {
    const pawns = Array.from({ length: 7 }, (_, file) => pawnAt(`p${file}`, { file, rank: 6 }))

    return [...pawns, pieceAt('queen', 'q', { file: 7, rank: 6 })]
  }

  function withJokerAnd(pieces: readonly Piece[]): GameState {
    return liveRound(withDeck([jokerCard('joker')], withTower(5, SQUARE)), pieces)
  }

  it('pays a quarter share of the kill rewards for what it cleared', () => {
    const board = fullBoard()
    const after = step(withJokerAnd(board), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.ink).toBe(clearReward(board))
    expect(after.ink).toBeGreaterThan(0)
  })

  it('pays less than shooting the same Pieces would, so stalling to Clear never pays best', () => {
    const board = fullBoard()
    const after = step(withJokerAnd(board), { kind: 'clearPieces', cardId: 'joker' })

    expect(after.ink).toBeLessThan(totalKillReward(board))
  })

  it('leaves the round prize whole — the quarter share is on the kills only', () => {
    const board = fullBoard()
    const cleared = step(withJokerAnd(board), { kind: 'clearPieces', cardId: 'joker' })
    // Clearing empties the board with nothing left to spawn, so the very next
    // tick completes the round. The lump sum is paid in full.
    const ended = tick(cleared, 1000 / 60)

    expect(ended.phase).toBe('gap')
    expect(ended.ink).toBe(clearReward(board) + roundIncome(1))
  })
})

describe('Joker Clear: the renderer signal', () => {
  function clearable(): GameState {
    return withDeck(
      [jokerCard('joker-1')],
      liveRound(createInitialState(), [
        pawnAt('a', { file: 0, rank: 5 }),
        pawnAt('b', { file: 1, rank: 5 }),
      ]),
    )
  }

  it('counts the Clear, so the renderer flashes the board instead of bursting every Piece', () => {
    // Monotonic on purpose. The renderer compares this per frame, and a
    // per-tick flag would be lost when `advance` runs five ticks per emit.
    const state = clearable()
    const after = step(state, { kind: 'clearPieces', cardId: 'joker-1' })

    expect(after.pieces).toEqual([])
    expect(after.clears).toBe(state.clears + 1)
  })

  it('records no per-Piece exits for a Clear', () => {
    // A Clear is one board-wide event, not fifteen exits. The renderer needs
    // the count and nothing else.
    const after = step(clearable(), { kind: 'clearPieces', cardId: 'joker-1' })

    expect(after.recentExits).toEqual([])
  })

  it('does not count a refused Clear', () => {
    const state = clearable()
    const refused = step(state, { kind: 'clearPieces', cardId: 'no-such-card' })

    expect(refused).toBe(state)
    expect(refused.clears).toBe(0)
  })
})
