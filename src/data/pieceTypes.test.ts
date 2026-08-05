import { describe, expect, it } from 'vitest'
import { PIECE_TYPES, pieceType } from './pieceTypes'
import type { PieceTypeId } from '../game/types'

const ALL: PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

describe('piece roster', () => {
  it('defines every Piece type', () => {
    for (const id of ALL) {
      expect(pieceType(id).id).toBe(id)
    }
  })

  it('marks exactly the sliding Pieces as sliders', () => {
    const sliders = ALL.filter((id) => pieceType(id).slides)

    expect(sliders).toEqual(['bishop', 'rook', 'queen'])
  })

  it('gives the Rook the most health, since high health is its armour', () => {
    const health = ALL.map((id) => pieceType(id).maxHealth)

    expect(Math.max(...health)).toBe(PIECE_TYPES.rook.maxHealth)
  })

  it('gives the Bishop the weakest attack, since healing is its job', () => {
    const attacks = ALL.map((id) => pieceType(id).attackDamage)

    expect(Math.min(...attacks)).toBe(PIECE_TYPES.bishop.attackDamage)
  })
})
