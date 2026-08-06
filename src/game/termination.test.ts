import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { BOARD, CORE_SQUARE } from '../data/board'
import { createInitialState, tick } from './index'
import type { GameState, Piece, PieceTypeId } from './types'

const DT = 1000 / 60

/** Generous: the slowest Piece sweeping the full rank needs well under this. */
const CAP_MS = 300_000

function pieceOn(id: string, typeId: PieceTypeId, file: number, rank: number): Piece {
  const square = { file, rank }
  return {
    id,
    typeId,
    square,
    prevSquare: square,
    health: PIECE_TYPES[typeId].maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
  }
}

function roundWith(pieces: Piece[]): GameState {
  return { ...createInitialState(), phase: 'inProgress', pieces, pendingSpawns: [] }
}

/** Runs until the round leaves `inProgress`, or gives up. */
function settle(state: GameState): GameState {
  let current = state
  for (let elapsed = 0; elapsed < CAP_MS; elapsed += DT) {
    current = tick(current, DT)
    if (current.phase !== 'inProgress') return current
  }
  return current
}

const ALL: PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

describe('round termination', () => {
  it.each(ALL)('a lone %s never hangs the round', (typeId) => {
    const settled = settle(roundWith([pieceOn('p1', typeId, 5, BOARD.ranks - 1)]))

    expect(settled.phase).not.toBe('inProgress')
  })

  it.each(ALL)('a %s starting on the back rank never hangs the round', (typeId) => {
    const settled = settle(roundWith([pieceOn('p1', typeId, 5, 0)]))

    expect(settled.phase).not.toBe('inProgress')
  })

  it('a sweeper left of the Core file still reaches it, thanks to reflection', () => {
    // File 1 sweeping toward file 0 would oscillate 0-1 forever without the
    // handedness flip. It must reflect and cross file 3.
    const settled = settle(roundWith([{ ...pieceOn('r', 'rook', 1, 0), handedness: -1 }]))

    expect(settled.phase).not.toBe('inProgress')
  })

  it('a Knight on the back rank hunts the Core rather than stranding there', () => {
    // Stranding is what this same scenario used to assert: a Knight on rank 0
    // had no legal move ever again and was left standing. It hunts instead
    // now, so the Piece is removed by leaking rather than left on the board —
    // `leaks` is the only durable record of that, since a leaked Piece
    // disappears from `pieces`.
    const settled = settle(roundWith([pieceOn('n', 'knight', 5, 0)]))

    expect(settled.phase).toBe('gap')
    expect(settled.pieces).toHaveLength(0)
    expect(settled.leaks).toBe(1)
  })

  it.each(
    Array.from({ length: BOARD.files }, (_, file) => file).filter(
      (file) => file !== CORE_SQUARE.file,
    ),
  )('a Knight starting on back-rank file %i hunts all the way to the Core', (file) => {
    // Every file but the Core's own — a Piece can never actually start on the
    // Core's square in real play, since the Core sits there and nothing
    // spawns on rank 0. Covering every other file is what makes this a
    // property of the whole back rank rather than one lucky square: the
    // knight-distance field in knightDistance.ts is finite everywhere else on
    // an 8x8 board, so every one of these settles by leaking, never by
    // hanging or re-stranding.
    const settled = settle(roundWith([pieceOn('n', 'knight', file, 0)]))

    expect(settled.phase).toBe('gap')
    expect(settled.pieces).toHaveLength(0)
    expect(settled.leaks).toBe(1)
  })

  it('a whole mixed board settles', () => {
    const settled = settle(
      roundWith(ALL.map((typeId, index) => pieceOn(`p${index}`, typeId, index, BOARD.ranks - 1))),
    )

    expect(settled.phase).not.toBe('inProgress')
  })
})
