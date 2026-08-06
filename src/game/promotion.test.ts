import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { createInitialState, step, tick } from './index'
import type { GameState, Piece } from './types'

const DT = 1000 / 60

function pawnOn(file: number, rank: number): Piece {
  const square = { file, rank }
  return {
    id: 'piece-1',
    typeId: 'pawn',
    square,
    prevSquare: square,
    health: PIECE_TYPES.pawn.maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
    promoted: false,
  }
}

function withPawn(file: number, rank: number): GameState {
  return {
    ...createInitialState(),
    phase: 'inProgress',
    pieces: [pawnOn(file, rank)],
    nextEntityId: 2,
  }
}

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('pawn promotion', () => {
  it('turns a Pawn on the back rank into a Queen', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces.map((piece) => piece.typeId)).toEqual(['queen'])
  })

  it('gives the Queen a fresh entity id, so the renderer remounts it', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.id).not.toBe('piece-1')
  })

  it('spawns the Queen at full Queen health, on the Pawn square', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.health).toBe(PIECE_TYPES.queen.maxHealth)
    expect(state.pieces[0]?.square).toEqual({ file: 0, rank: 0 })
  })

  it('leaves the round active, because the Queen can still sweep', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.phase).toBe('inProgress')
  })

  // Distinct from "gives the Queen a fresh entity id" above: that test proves
  // the Queen's own id skips past the Pawn's, but not that the *counter*
  // tick hands back is advanced too. If a return statement kept reporting the
  // pre-promotion `nextEntityId` instead of `entityIdAfterPromotion`, the
  // Queen minted here would still get a correct one-off id, but the very next
  // spawn or promotion would be handed that same id right back — a collision
  // one tick later, invisible to a test that only inspects this one tick's
  // Piece ids.
  it('advances nextEntityId past the promoted Queen, so a later Piece can never reuse its id', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.nextEntityId).toBe(3)
  })

  it('flags the promoted Queen, so the renderer can pop it once', () => {
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.promoted).toBe(true)
  })

  it("records the Pawn's exit as a promotion, so the renderer does not burst it", () => {
    // A promoted Pawn was not destroyed but transformed. Without this record it
    // matches nothing in the ring, and the renderer's default — a kill burst —
    // would read as "the Pawn died and a Queen arrived".
    const state = runFor(withPawn(0, 0), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.recentExits).toEqual([
      { pieceId: 'piece-1', typeId: 'pawn', reason: 'promotion', from: { file: 0, rank: 0 } },
    ])
  })

  it('leaves a spawned Piece unflagged', () => {
    // Round 1's first spawn is at atMs 0, so one tick is enough.
    const started = step(createInitialState(), { kind: 'startRound' })
    const after = tick(started, DT)

    expect(after.pieces).toHaveLength(1)
    expect(after.pieces[0]?.promoted).toBe(false)
  })

  it('leaves a Piece that merely moves unflagged', () => {
    const state = runFor(withPawn(0, 5), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(state.pieces[0]?.square).toEqual({ file: 0, rank: 4 })
    expect(state.pieces[0]?.promoted).toBe(false)
  })
})
