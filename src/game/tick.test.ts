import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState, step, tick } from './index'
import type { GameState } from './types'

/** The fixed timestep the app runs at. Tests drive time; nothing reads a clock. */
const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

function startedRound(): GameState {
  return step(createInitialState(), { kind: 'startRound' })
}

describe('tick: phase handling', () => {
  it('does nothing during the gap when auto-start is off', () => {
    const initial = createInitialState()

    expect(tick(initial, DT)).toBe(initial)
  })

  it('starts the next round on its own when auto-start is on', () => {
    const waiting = step(createInitialState(), { kind: 'setAutoStart', enabled: true })
    const state = tick(waiting, DT)

    expect(state.phase).toBe('inProgress')
  })

  it('is inert once defeated', () => {
    const defeated: GameState = { ...createInitialState(), phase: 'defeated' }

    expect(tick(defeated, DT)).toBe(defeated)
  })
})

describe('tick: spawning', () => {
  it('spawns the pieces that are due and holds back the rest', () => {
    const state = tick(startedRound(), DT)

    // The placeholder round schedules spawns 1200ms apart, so only the first is due.
    expect(state.pieces).toHaveLength(1)
    expect(state.pendingSpawns.length).toBeGreaterThan(0)
  })

  it('spawns pieces on the far rank', () => {
    const state = tick(startedRound(), DT)

    expect(state.pieces[0]?.square.rank).toBe(state.board.ranks - 1)
  })

  it('eventually spawns the whole round', () => {
    const started = startedRound()
    const expected = started.pendingSpawns.length
    const state = runFor(started, expected * 1200 + DT)

    expect(state.pendingSpawns).toHaveLength(0)
    expect(state.nextEntityId).toBe(started.nextEntityId + expected)
  })

  it('gives each spawned piece a distinct id', () => {
    const state = runFor(startedRound(), 4000)
    const ids = state.pieces.map((piece) => piece.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('tick: movement', () => {
  it('holds a piece on its square until its interval elapses', () => {
    const spawned = tick(startedRound(), DT)
    const startSquare = spawned.pieces[0]?.square

    const beforeHop = runFor(spawned, PIECE_TYPES.pawn.moveIntervalMs - 2 * DT)

    expect(beforeHop.pieces[0]?.square).toEqual(startSquare)
  })

  it('hops the piece toward the Core once its interval elapses', () => {
    const spawned = tick(startedRound(), DT)
    const startRank = spawned.pieces[0]?.square.rank ?? 0

    const afterHop = runFor(spawned, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const piece = afterHop.pieces[0]

    // The Core is on rank 0, so approaching it means the rank decreases.
    expect(piece?.square.rank).toBeLessThan(startRank)
  })

  it('records the previous square so the renderer can interpolate', () => {
    const spawned = tick(startedRound(), DT)
    const afterHop = runFor(spawned, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const piece = afterHop.pieces[0]

    expect(piece?.prevSquare).not.toEqual(piece?.square)
  })
})

describe('tick: leaks', () => {
  it('damages the Core and removes the piece when one reaches it', () => {
    const started = startedRound()
    const state = runFor(started, 30_000)

    expect(state.leaks).toBeGreaterThan(0)
    expect(state.core.health).toBe(started.core.health - state.leaks)
  })

  it('ends the game when the Core is exhausted', () => {
    const fragile: GameState = {
      ...startedRound(),
      core: { ...createInitialState().core, health: 1 },
    }
    const state = runFor(fragile, 30_000)

    expect(state.phase).toBe('defeated')
    expect(state.core.health).toBe(0)
  })

  it('never drives Core health below zero', () => {
    const fragile: GameState = {
      ...startedRound(),
      core: { ...createInitialState().core, health: 1 },
    }

    expect(runFor(fragile, 60_000).core.health).toBe(0)
  })
})

describe('tick: round completion', () => {
  it('returns to the untimed gap and advances the round number', () => {
    // Towers cannot kill anything yet, so a round resolves by leaking out.
    const state = runFor(startedRound(), 60_000)

    expect(state.phase).toBe('gap')
    expect(state.roundNumber).toBe(2)
    expect(state.pieces).toHaveLength(0)
    expect(state.pendingSpawns).toHaveLength(0)
    expect(state.roundElapsedMs).toBe(0)
  })

  it('scales the next round up', () => {
    const first = startedRound()
    const second = step(runFor(first, 60_000), { kind: 'startRound' })

    expect(second.pendingSpawns.length).toBeGreaterThan(first.pendingSpawns.length)
  })
})

describe('tick: determinism', () => {
  it('produces identical state from identical inputs', () => {
    const a = runFor(startedRound(), 20_000)
    const b = runFor(startedRound(), 20_000)

    expect(a).toEqual(b)
  })

  it('is refresh-rate independent for a whole-number step ratio', () => {
    const atSixty = runFor(startedRound(), 9000)

    let atThirty = startedRound()
    for (let elapsed = 0; elapsed < 9000; elapsed += DT * 2) {
      atThirty = tick(atThirty, DT * 2)
    }

    expect(atThirty.pieces.map((piece) => piece.square)).toEqual(
      atSixty.pieces.map((piece) => piece.square),
    )
  })
})
