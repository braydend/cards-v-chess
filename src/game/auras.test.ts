import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import {
  BISHOP_HEAL_AMOUNT,
  BISHOP_HEAL_INTERVAL_MS,
  KING_HEALTH_BONUS,
  KING_SLIDE_BONUS,
  KING_SPEED_MULTIPLIER,
  applyHealing,
  applyKingAura,
  kingAdjacentKings,
  kingMoveInterval,
  kingSlideBonus,
} from './auras'
import type { Handedness, Piece, PieceTypeId, Square } from './types'

function piece(id: string, typeId: PieceTypeId, square: Square, handedness: Handedness = 1): Piece {
  return {
    id,
    typeId,
    tier: 'green',
    square,
    prevSquare: square,
    health: 5,
    maxHealth: 5,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness,
    auraCooldownMs: 0,
    kingAuraStacks: 0,
    kingAuraKings: [],
    hunting: false,
    promoted: false,
  }
}

describe('the King aura', () => {
  it('grants one stack, and the defense grant, to a Piece on an adjacent square', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 5, rank: 5 })]

    const adjacent = kingAdjacentKings(pieces)
    const applied = applyKingAura(pieces, adjacent)
    const rook = applied.find((each) => each.id === 'r')

    expect(adjacent.get('r')).toEqual(['k'])
    expect(rook?.kingAuraStacks).toBe(1)
    expect(rook?.maxHealth).toBe(5 + KING_HEALTH_BONUS)
    expect(rook?.health).toBe(5 + KING_HEALTH_BONUS)
    expect(applied.find((each) => each.id === 'k')?.kingAuraStacks).toBe(0)
  })

  it('does not reach two squares away', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 }), piece('r', 'rook', { file: 6, rank: 4 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'r')?.kingAuraStacks).toBe(0)
  })

  it('never buffs the King itself', () => {
    const pieces = [piece('k', 'king', { file: 4, rank: 4 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'k')?.kingAuraStacks).toBe(0)
  })

  it('buffs a King standing beside a different King — exclusion is per-Piece, not per-type', () => {
    const pieces = [piece('k1', 'king', { file: 4, rank: 4 }), piece('k2', 'king', { file: 5, rank: 5 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'k1')?.kingAuraStacks).toBe(1)
    expect(applied.find((each) => each.id === 'k2')?.kingAuraStacks).toBe(1)
  })

  it('is inert when no King is on the board — and returns the input array unchanged', () => {
    const pieces = [piece('r', 'rook', { file: 4, rank: 4 })]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied).toBe(pieces)
  })

  it('gives one stack per adjacency episode: sustained contact adds nothing, leaving and re-entering adds another', () => {
    const king = piece('k', 'king', { file: 4, rank: 4 })
    const rook = piece('r', 'rook', { file: 5, rank: 5 })

    const first = applyKingAura([king, rook], kingAdjacentKings([king, rook]))
    expect(first.find((each) => each.id === 'r')?.kingAuraStacks).toBe(1)

    const sustained = applyKingAura(first, kingAdjacentKings(first))
    expect(sustained.find((each) => each.id === 'r')?.kingAuraStacks).toBe(1)

    const separated = sustained.filter((each) => each.id !== 'k')
    const left = applyKingAura(separated, kingAdjacentKings(separated))
    expect(left.find((each) => each.id === 'r')?.kingAuraStacks).toBe(1)

    const together = [...left, king]
    const reentered = applyKingAura(together, kingAdjacentKings(together))
    expect(reentered.find((each) => each.id === 'r')?.kingAuraStacks).toBe(2)
  })

  it('stacks: two Kings at once grant two stacks', () => {
    const pieces = [
      piece('k1', 'king', { file: 4, rank: 4 }),
      piece('k2', 'king', { file: 6, rank: 4 }),
      piece('r', 'rook', { file: 5, rank: 4 }),
    ]

    const applied = applyKingAura(pieces, kingAdjacentKings(pieces))

    expect(applied.find((each) => each.id === 'r')?.kingAuraStacks).toBe(2)
    expect(applied.find((each) => each.id === 'r')?.maxHealth).toBe(5 + 2 * KING_HEALTH_BONUS)
  })

  it('compounds the move interval multiplier per stack', () => {
    expect(kingMoveInterval(900, 0)).toBe(900)
    expect(kingMoveInterval(900, 1)).toBe(900 * KING_SPEED_MULTIPLIER)
    expect(kingMoveInterval(900, 2)).toBe(900 * KING_SPEED_MULTIPLIER ** 2)
  })

  it('adds one slide per stack, to sliders only', () => {
    expect(kingSlideBonus('rook', 1)).toBe(KING_SLIDE_BONUS)
    expect(kingSlideBonus('rook', 2)).toBe(2 * KING_SLIDE_BONUS)
    expect(kingSlideBonus('pawn', 3)).toBe(0)
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
      {
        ...piece('p', 'pawn', { file: 4, rank: 5 }),
        health: PIECE_TYPES.pawn.maxHealth,
        maxHealth: PIECE_TYPES.pawn.maxHealth,
      },
    ]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(PIECE_TYPES.pawn.maxHealth)
  })

  it('heals a Piece toward its recorded maximum, never a re-read of the authored stat', () => {
    // The heal ceiling is the Piece's own maxHealth — what it spawned with —
    // so a Piece whose maximum is ever set above the authored stat still heals
    // to what it actually had, rather than being pinned down to the table.
    const hurt = { ...piece('p', 'pawn', { file: 4, rank: 5 }), health: 3, maxHealth: 4 }
    const pieces = [piece('b', 'bishop', { file: 4, rank: 4 }), hurt]

    const healed = applyHealing(pieces, BISHOP_HEAL_INTERVAL_MS)

    expect(healed.find((each) => each.id === 'p')?.health).toBe(4)
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
