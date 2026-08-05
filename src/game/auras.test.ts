import { describe, expect, it } from 'vitest'
import { buffedPieceIds } from './auras'
import type { Handedness, Piece, PieceTypeId, Square } from './types'

function piece(id: string, typeId: PieceTypeId, square: Square, handedness: Handedness = 1): Piece {
  return {
    id,
    typeId,
    square,
    prevSquare: square,
    health: 5,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness,
    auraCooldownMs: 0,
    buffed: false,
  }
}

describe('the King aura', () => {
  it('buffs a Piece on an adjacent square', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 5, rank: 5 })]

    expect(buffedPieceIds(pieces).has('r')).toBe(true)
  })

  it('does not reach two squares away', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 6, rank: 4 })]

    expect(buffedPieceIds(pieces).has('r')).toBe(false)
  })

  it('never buffs the King itself', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 })]

    expect(buffedPieceIds(pieces).has('k')).toBe(false)
  })

  it('does not stack — two Kings buff exactly as much as one', () => {
    const one = [piece('k1', 'king', { file: 4, rank: 4 }), piece('p', 'pawn', { file: 4, rank: 5 })]
    const two = [...one, piece('k2', 'king', { file: 3, rank: 5 })]

    expect(buffedPieceIds(two).has('p')).toBe(buffedPieceIds(one).has('p'))
  })

  it('is empty when no King is on the board', () => {
    expect(buffedPieceIds([piece('r', 'rook', { file: 4, rank: 4 })]).size).toBe(0)
  })
})
