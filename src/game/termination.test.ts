import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { BOARD } from '../data/board'
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

  it('strands a Knight on the back rank rather than letting it bounce forever', () => {
    const settled = settle(roundWith([pieceOn('n', 'knight', 5, 0)]))

    expect(settled.phase).toBe('gap')
    // Left standing, not deleted — the gap stays visible.
    expect(settled.pieces.map((piece) => piece.typeId)).toEqual(['knight'])
  })

  it('a whole mixed board settles', () => {
    const settled = settle(
      roundWith(ALL.map((typeId, index) => pieceOn(`p${index}`, typeId, index, BOARD.ranks - 1))),
    )

    expect(settled.phase).not.toBe('inProgress')
  })
})
