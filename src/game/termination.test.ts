import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { BOARD, CORE_SQUARE } from '../data/board'
import { createInitialState, tick } from './index'
import type { GameState, Piece, PieceTypeId } from './types'

const DT = 1000 / 60

/** Generous: the slowest hunt — a Bishop's diagonal climb — needs well under this. */
const CAP_MS = 300_000

function pieceOn(id: string, typeId: PieceTypeId, file: number, rank: number): Piece {
  const square = { file, rank }
  return {
    id,
    typeId,
    tier: 'green',
    square,
    prevSquare: square,
    health: PIECE_TYPES[typeId].maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
    promoted: false,
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

  it('a Piece left of the Core file still reaches it, hunting rightward', () => {
    // Before hunting, this case needed the handedness flip off the file-0
    // edge to keep the sweep from oscillating. Direction now comes from the
    // field, not from handedness, so the Core is reached from either side.
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

  it('a colour-locked Bishop still leaks, from the square in front of the Core', () => {
    // (4,0) is the opposite colour from the Core, so it can never stand on
    // the Core's square. It hunts the square directly in front of it and
    // leaks from there — same interaction with the Core as every other Piece.
    const settled = settle(roundWith([pieceOn('b', 'bishop', 4, 0)]))

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
    // knight-distance field in distanceFields.ts is finite everywhere else on
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
