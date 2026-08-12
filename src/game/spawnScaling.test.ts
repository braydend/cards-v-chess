/**
 * Spawn pacing and the authored-health property: a spawn enters at its authored
 * `maxHealth` in every round — health no longer scales with the round — and the
 * spawn gap is the only round-scaling that remains.
 */
import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState, tick } from './index'
import { spawnGapMs } from './spawnScaling'
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

describe('a spawn enters at its authored max health', () => {
  it('a round-5 Pawn spawns at the authored 3, not a scaled 4', () => {
    const after = tick(liveRoundWithSpawn(5), DT)

    const pawn = after.pieces[0]
    expect(pawn?.health).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('records the authored health as the Piece maximum, so a heal restores to it', () => {
    const after = tick(liveRoundWithSpawn(5), DT)

    const pawn = after.pieces[0]
    expect(pawn?.maxHealth).toBe(pawn?.health)
    expect(pawn?.maxHealth).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('a round-1 Pawn spawns at its authored max', () => {
    const after = tick(liveRoundWithSpawn(1), DT)

    expect(after.pieces[0]?.health).toBe(PIECE_TYPES.pawn.maxHealth)
    expect(after.pieces[0]?.maxHealth).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('a promoted Queen carries no round factor — full Queen health in any round', () => {
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
    expect(after.pieces[0]?.health).toBe(PIECE_TYPES.queen.maxHealth)
    expect(after.pieces[0]?.maxHealth).toBe(PIECE_TYPES.queen.maxHealth)
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
