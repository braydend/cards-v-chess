import { describe, expect, it } from 'vitest'
import { DECK_CAP } from '../data/deck'
import { PIECE_TYPES } from '../data/pieceTypes'
import { roundSpec } from '../data/rounds'
import { stagingRank } from './board'
import { pieceAt, liveRound, withTower, firstTowerId, standardCard, withDeck } from './fixtures'
import { createInitialState, step, tick } from './index'
import { spawnHealth } from './spawnScaling'
import type { Card, GameState } from './types'

const base = (): GameState => createInitialState('dev-test')

function filler(size: number): Card[] {
  return Array.from({ length: size }, (_, i) => standardCard(`f${i}`, 2, 'hearts'))
}

describe('devAddInk', () => {
  it('refuses an amount below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devAddInk', amount: 0 })).toBe(state)
  })

  it('adds exactly the amount, mid-round included', () => {
    const state: GameState = { ...base(), phase: 'inProgress' }

    const after = step(state, { kind: 'devAddInk', amount: 150 })

    expect(after.ink).toBe(state.ink + 150)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devAddInk', amount: 10 })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devSetCoreHealth', () => {
  it('refuses health below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devSetCoreHealth', health: 0, maxHealth: 100 })).toBe(state)
  })

  it('refuses a max below health', () => {
    const state = base()

    expect(step(state, { kind: 'devSetCoreHealth', health: 50, maxHealth: 40 })).toBe(state)
  })

  it('refuses once defeated, so the phase cannot contradict the health', () => {
    const defeated: GameState = { ...base(), phase: 'defeated' }

    expect(step(defeated, { kind: 'devSetCoreHealth', health: 100, maxHealth: 100 })).toBe(
      defeated,
    )
  })

  it('sets both current and maximum health', () => {
    const state = base()

    const after = step(state, { kind: 'devSetCoreHealth', health: 40, maxHealth: 50 })

    expect(after.core.health).toBe(40)
    expect(after.core.maxHealth).toBe(50)
  })

  it('survives a tick', () => {
    const state = step(base(), { kind: 'devSetCoreHealth', health: 40, maxHealth: 50 })

    const after = tick(state, 1000 / 60)

    expect(after.core.health).toBe(40)
    expect(after.core.maxHealth).toBe(50)
  })
})

describe('devSetRound', () => {
  it('is refused while a round is live', () => {
    const state: GameState = { ...base(), phase: 'inProgress' }

    expect(step(state, { kind: 'devSetRound', roundNumber: 9 })).toBe(state)
  })

  it('refuses a round below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devSetRound', roundNumber: 0 })).toBe(state)
  })

  it('changes the round the next Start round loads', () => {
    const state = step(base(), { kind: 'devSetRound', roundNumber: 7 })

    expect(state.roundNumber).toBe(7)

    const started = step(state, { kind: 'startRound' })

    expect(started.pendingSpawns).toEqual(roundSpec(7).spawns)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devSetRound', roundNumber: 7 })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devGrowBoard', () => {
  it('refuses a rank count below 1', () => {
    const state = base()

    expect(step(state, { kind: 'devGrowBoard', ranks: 0 })).toBe(state)
  })

  it('grows ranks only, leaving files untouched', () => {
    const state = base()

    const after = step(state, { kind: 'devGrowBoard', ranks: 2 })

    expect(after.board.ranks).toBe(state.board.ranks + 2)
    expect(after.board.files).toBe(state.board.files)
  })

  it('moves the staging rank with the board', () => {
    const after = step(base(), { kind: 'devGrowBoard', ranks: 1 })

    expect(stagingRank(after.board)).toBe(after.board.ranks)
  })
})

describe('devSpawnPiece', () => {
  it('is refused off the board and off the staging rank', () => {
    const state = base()

    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'rook',
        tier: 'red',
        square: { file: 0, rank: -1 },
      }),
    ).toBe(state)
    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'rook',
        tier: 'red',
        square: { file: 0, rank: 9 },
      }),
    ).toBe(state)
    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'rook',
        tier: 'red',
        square: { file: 8, rank: 0 },
      }),
    ).toBe(state)
  })

  it('is refused onto a Tower, so the no-shared-square invariant holds', () => {
    const state = withTower('vertical', { file: 2, rank: 2 }, base())

    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'pawn',
        tier: 'green',
        square: { file: 2, rank: 2 },
      }),
    ).toBe(state)
  })

  it('is refused onto an occupied square', () => {
    const state = liveRound(base(), [pieceAt('pawn', 'p0', { file: 1, rank: 1 })])

    expect(
      step(state, {
        kind: 'devSpawnPiece',
        typeId: 'pawn',
        tier: 'green',
        square: { file: 1, rank: 1 },
      }),
    ).toBe(state)
  })

  it('spawns a round-scaled Piece with its tier flags', () => {
    const state = base()

    const after = step(state, {
      kind: 'devSpawnPiece',
      typeId: 'rook',
      tier: 'yellow',
      square: { file: 0, rank: 4 },
    })

    const piece = after.pieces[0]
    expect(piece?.typeId).toBe('rook')
    expect(piece?.tier).toBe('yellow')
    expect(piece?.square).toEqual({ file: 0, rank: 4 })
    expect(piece?.prevSquare).toEqual({ file: 0, rank: 4 })
    expect(piece?.health).toBe(spawnHealth(PIECE_TYPES.rook.maxHealth, state.roundNumber))
    expect(piece?.maxHealth).toBe(piece?.health)
    expect(piece?.hunting).toBe(true)
    expect(after.nextEntityId).toBe(state.nextEntityId + 1)
  })

  it('spawns onto the staging rank', () => {
    const state = base()
    const square = { file: 3, rank: stagingRank(state.board) }

    const after = step(state, { kind: 'devSpawnPiece', typeId: 'king', tier: 'green', square })

    expect(after.pieces[0]?.square).toEqual(square)
  })

  it('weaves handedness from entity-id parity', () => {
    const first = step(base(), {
      kind: 'devSpawnPiece',
      typeId: 'pawn',
      tier: 'green',
      square: { file: 0, rank: 0 },
    })
    const second = step(first, {
      kind: 'devSpawnPiece',
      typeId: 'pawn',
      tier: 'green',
      square: { file: 1, rank: 0 },
    })

    expect(second.pieces[0]?.handedness).not.toBe(second.pieces[1]?.handedness)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, {
      kind: 'devSpawnPiece',
      typeId: 'pawn',
      tier: 'green',
      square: { file: 0, rank: 0 },
    })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devRemoveTower', () => {
  it('removes the named Tower and leaves the rest', () => {
    const seeded = withTower('vertical', { file: 0, rank: 0 }, base())
    const state = withTower('diagonal', { file: 3, rank: 3 }, seeded)
    const target = firstTowerId(state)

    const after = step(state, { kind: 'devRemoveTower', towerId: target })

    expect(after.towers).toHaveLength(1)
    expect(after.towers[0]?.id).not.toBe(target)
  })

  it('is a no-op for an unknown id', () => {
    const state = withTower('vertical', { file: 0, rank: 0 }, base())

    expect(step(state, { kind: 'devRemoveTower', towerId: 'ghost' })).toBe(state)
  })

  it('does not touch the rng streams', () => {
    const state = withTower('vertical', { file: 0, rank: 0 }, base())

    const after = step(state, { kind: 'devRemoveTower', towerId: firstTowerId(state) })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devClearPieces', () => {
  it('empties pieces but leaves pending spawns', () => {
    const state: GameState = {
      ...liveRound(base(), [pieceAt('pawn', 'p0', { file: 1, rank: 1 })]),
      pendingSpawns: roundSpec(1).spawns,
    }

    const after = step(state, { kind: 'devClearPieces' })

    expect(after.pieces).toHaveLength(0)
    expect(after.pendingSpawns).toEqual(state.pendingSpawns)
  })

  it('pays no ink and does not bump the clears counter', () => {
    const state: GameState = {
      ...liveRound(base(), [pieceAt('queen', 'q0', { file: 2, rank: 2 })]),
      ink: 5,
      clears: 3,
    }

    const after = step(state, { kind: 'devClearPieces' })

    expect(after.ink).toBe(5)
    expect(after.clears).toBe(3)
  })

  it('is a no-op when the board is already clear', () => {
    const state = liveRound(base(), [])

    expect(step(state, { kind: 'devClearPieces' })).toBe(state)
  })

  it('does not touch the rng streams', () => {
    const state = liveRound(base(), [pieceAt('pawn', 'p0', { file: 1, rank: 1 })])

    const after = step(state, { kind: 'devClearPieces' })

    expect(after.rng).toBe(state.rng)
  })
})

describe('devAddCard', () => {
  it('adds a standard Card of the chosen rank and suit', () => {
    const state = base()

    const after = step(state, { kind: 'devAddCard', rank: 7, suit: 'spades' })

    const added = after.deck[after.deck.length - 1]
    expect(added).toEqual({
      id: `card-${state.nextCardId}`,
      kind: 'standard',
      rank: 7,
      suit: 'spades',
    })
    expect(after.nextCardId).toBe(state.nextCardId + 1)
  })

  it('adds a Joker when no rank is given', () => {
    const state = base()

    const after = step(state, { kind: 'devAddCard' })

    const added = after.deck[after.deck.length - 1]
    expect(added).toEqual({ id: `card-${state.nextCardId}`, kind: 'joker' })
  })

  it('is refused for a standard Card without a suit', () => {
    const state = base()

    expect(step(state, { kind: 'devAddCard', rank: 5 })).toBe(state)
  })

  it('is refused for a Joker with a suit', () => {
    const state = base()

    expect(step(state, { kind: 'devAddCard', suit: 'hearts' })).toBe(state)
  })

  it('breaks the deck cap deliberately', () => {
    const state = withDeck(filler(DECK_CAP), base())

    const after = step(state, { kind: 'devAddCard', rank: 10, suit: 'clubs' })

    expect(after.deck).toHaveLength(DECK_CAP + 1)
  })

  it('numbers cards on nextCardId, never nextEntityId', () => {
    const state: GameState = { ...base(), nextEntityId: 5 }

    const after = step(state, { kind: 'devAddCard', rank: 3, suit: 'hearts' })

    expect(after.nextCardId).toBe(state.nextCardId + 1)
    expect(after.nextEntityId).toBe(5)
  })

  it('does not touch the rng streams', () => {
    const state = base()

    const after = step(state, { kind: 'devAddCard', rank: 3, suit: 'hearts' })

    expect(after.rng).toBe(state.rng)
  })
})
