import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState, tick } from './index'
import { spawnGapMs, spawnHealth, spawnHealthMultiplier } from './spawnScaling'
import type { GameState, Piece } from './types'

const DT = 1000 / 60

function liveRoundWithSpawn(roundNumber: number): GameState {
  return {
    ...createInitialState(),
    roundNumber,
    phase: 'inProgress',
    pendingSpawns: [{ atMs: 0, typeId: 'pawn', tier: 'green', file: 3 }],
    pieces: [],
  }
}

/** A Pawn on the back rank, about to promote on its next hop. */
function pawnOnBackRank(): Piece {
  const square = { file: 0, rank: 0 }
  return {
    id: 'piece-1',
    typeId: 'pawn',
    tier: 'green',
    square,
    prevSquare: square,
    health: PIECE_TYPES.pawn.maxHealth,
    maxHealth: PIECE_TYPES.pawn.maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
    promoted: false,
  }
}

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('spawnHealthMultiplier', () => {
  it('is 1.0 in the opening rounds, so nothing existing changes', () => {
    expect(spawnHealthMultiplier(1)).toBe(1)
    expect(spawnHealthMultiplier(4)).toBe(1)
  })

  it('steps at the authored breakpoints', () => {
    expect(spawnHealthMultiplier(5)).toBe(1.3)
    expect(spawnHealthMultiplier(9)).toBe(1.3)
    expect(spawnHealthMultiplier(10)).toBe(1.6)
    expect(spawnHealthMultiplier(15)).toBe(2)
    expect(spawnHealthMultiplier(19)).toBe(2)
    expect(spawnHealthMultiplier(20)).toBe(2.5)
  })

  it('keeps rising every tail step past the last authored round', () => {
    expect(spawnHealthMultiplier(24)).toBe(2.5)
    expect(spawnHealthMultiplier(25)).toBe(3)
    expect(spawnHealthMultiplier(30)).toBe(3.5)
  })

  it('treats anything before round 1 as round 1', () => {
    expect(spawnHealthMultiplier(0)).toBe(1)
  })

  it('is deterministic — the same round always scales the same way', () => {
    expect(spawnHealthMultiplier(11)).toBe(spawnHealthMultiplier(11))
  })
})

describe('spawnHealth', () => {
  it('returns the authored health when the multiplier is 1', () => {
    expect(spawnHealth(PIECE_TYPES.pawn.maxHealth, 1)).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('rounds the scaled value to an integer', () => {
    // 3 × 1.3 = 3.9 → 4, not 3.9.
    expect(spawnHealth(PIECE_TYPES.pawn.maxHealth, 5)).toBe(4)
  })

  it('never drops below 1', () => {
    expect(spawnHealth(1, 1)).toBe(1)
  })

  it('scales every type by the same round multiplier', () => {
    const rook = spawnHealth(PIECE_TYPES.rook.maxHealth, 5)
    expect(rook).toBe(Math.round(PIECE_TYPES.rook.maxHealth * spawnHealthMultiplier(5)))
  })
})

describe('a round-N spawn enters with scaled health', () => {
  it('a round-5 Pawn spawns at 4, not the authored 3', () => {
    const after = tick(liveRoundWithSpawn(5), DT)

    const pawn = after.pieces[0]
    expect(pawn?.health).toBe(spawnHealth(PIECE_TYPES.pawn.maxHealth, 5))
    expect(pawn?.health).not.toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('records the scaled health as the Piece maximum, so a heal restores to it', () => {
    const after = tick(liveRoundWithSpawn(5), DT)

    const pawn = after.pieces[0]
    expect(pawn?.maxHealth).toBe(pawn?.health)
    expect(pawn?.maxHealth).toBe(4)
  })

  it('a round-1 Pawn spawns at its authored max', () => {
    const after = tick(liveRoundWithSpawn(1), DT)

    expect(after.pieces[0]?.health).toBe(PIECE_TYPES.pawn.maxHealth)
    expect(after.pieces[0]?.maxHealth).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('a promoted Queen carries the same round factor', () => {
    const state: GameState = {
      ...createInitialState(),
      roundNumber: 5,
      phase: 'inProgress',
      pendingSpawns: [],
      pieces: [pawnOnBackRank()],
      nextEntityId: 2,
    }

    const after = runFor(state, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces[0]?.typeId).toBe('queen')
    expect(after.pieces[0]?.health).toBe(spawnHealth(PIECE_TYPES.queen.maxHealth, 5))
    expect(after.pieces[0]?.maxHealth).toBe(spawnHealth(PIECE_TYPES.queen.maxHealth, 5))
  })
})

describe('spawnGapMs', () => {
  it('is the authored base in round 1, unchanged from today', () => {
    expect(spawnGapMs(1)).toBe(1200)
  })

  it('shrinks a few percent per round', () => {
    expect(spawnGapMs(2)).toBeLessThan(spawnGapMs(1))
    expect(spawnGapMs(10)).toBeLessThan(spawnGapMs(5))
  })

  it('never falls below the floor', () => {
    expect(spawnGapMs(100)).toBeGreaterThanOrEqual(600)
  })

  it('is deterministic', () => {
    expect(spawnGapMs(7)).toBe(spawnGapMs(7))
  })
})
