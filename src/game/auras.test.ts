import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { BISHOP_HEAL_AMOUNT, BISHOP_HEAL_INTERVAL_MS, applyHealing, buffedPieceIds } from './auras'
import type { Handedness, Piece, PieceTypeId, Square } from './types'

function piece(id: string, typeId: PieceTypeId, square: Square, handedness: Handedness = 1): Piece {
  return {
    id,
    typeId,
    tier: 'green',
    square,
    prevSquare: square,
    health: 5,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
    promoted: false,
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

  it('buffs a King standing beside a different King — exclusion is per-Piece, not per-type', () => {
    const pieces = [piece('k1', 'king', { file: 4, rank: 4 }), piece('k2', 'king', { file: 5, rank: 5 })]

    expect(buffedPieceIds(pieces).has('k1')).toBe(true)
    expect(buffedPieceIds(pieces).has('k2')).toBe(true)
  })

  it('is empty when no King is on the board', () => {
    expect(buffedPieceIds([piece('r', 'rook', { file: 4, rank: 4 })]).size).toBe(0)
  })
})

describe('the Bishop healing aura', () => {
  it('heals a damaged Piece within range when its pulse comes due', () => {
    const hurt = { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBeGreaterThan(1)
  })

  it('does nothing before its pulse comes due', () => {
    const hurt = { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, 100)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(1)
  })

  it('resolves every pulse a single large dtMs spans, not just one', () => {
    // A Rook, not a Pawn: its 14 max health absorbs two pulses (2 * 2 = 4)
    // without hitting the cap, so a dropped or double-counted pulse actually
    // shows up in the asserted amount instead of being hidden by clamping.
    const hurt = { ...piece('r', 'rook', { file: 4, rank: 5 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, 2 * BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'r')?.health).toBe(1 + 2 * BISHOP_HEAL_AMOUNT)
  })

  it('never heals past a Piece maximum health', () => {
    const pieces = [
      piece('b', 'bishop', { file: 4, rank: 4 }),
      { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: PIECE_TYPES.pawn.maxHealth },
    ]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('never heals itself, so killing it first still works', () => {
    const hurt = { ...piece('b', 'bishop', { file: 4, rank: 4 }), health: 1 }

    const healed = applyHealing([hurt], BISHOP_HEAL_INTERVAL_MS)

    expect(healed[0]?.health).toBe(1)
  })

  it('does not reach three squares away', () => {
    const hurt = { ...piece('p', 'pawn', { file: 7, rank: 4 }), health: 1 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(1)
  })

  it('stacks across separate Bishops, which are separate sources', () => {
    // A Rook, not a Pawn: the target's max health must exceed what one Bishop
    // heals, or the cap hides the difference.
    const hurt = { ...piece('r', 'rook', { file: 4, rank: 5 }), health: 1 }
    const one = [piece('b1', 'bishop', { file: 4, rank: 4 }), hurt]
    const two = [...one, piece('b2', 'bishop', { file: 3, rank: 5 })]

    const healedOnce = applyHealing(one, BISHOP_HEAL_INTERVAL_MS).find((e) => e.id === 'r')
    const healedTwice = applyHealing(two, BISHOP_HEAL_INTERVAL_MS).find((e) => e.id === 'r')

    expect(healedTwice?.health).toBeGreaterThan(healedOnce?.health ?? 0)
  })
})
