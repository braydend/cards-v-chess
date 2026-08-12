import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { roundSpec } from '../data/rounds'
import { stagingRank } from './board'
import { pieceAt, liveRound, withTower } from './fixtures'
import { createInitialState, step, tick } from './index'
import { spawnHealth } from './spawnScaling'
import type { GameState } from './types'

const base = (): GameState => createInitialState('dev-test')

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
    const state = withTower(2, { file: 2, rank: 2 }, base())

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
