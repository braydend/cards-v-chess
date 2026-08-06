import { describe, expect, it } from 'vitest'
import { CHESS_COLOUR, PIECE_COLOURS } from './pieceColours'
import { RANK_COLOURS } from './rankColours'

// Both modules are plain data — no React, no three.js — so this runs in the
// suite's default `node` environment with no DOM, same as the rules-engine
// tests.
describe('piece colours', () => {
  it('never collides with a Tower rank colour, so the two factions stay readable apart', () => {
    const rankValues = Object.values(RANK_COLOURS)

    for (const [typeId, colour] of Object.entries(PIECE_COLOURS)) {
      expect(rankValues, `${typeId}'s colour ${colour} collides with a Tower rank colour`).not.toContain(
        colour,
      )
    }
  })

  it('draws every type from a small deliberate set: three share CHESS_COLOUR, Bishop, Queen, and King get their own', () => {
    expect(PIECE_COLOURS.pawn).toBe(CHESS_COLOUR)
    expect(PIECE_COLOURS.knight).toBe(CHESS_COLOUR)
    expect(PIECE_COLOURS.rook).toBe(CHESS_COLOUR)

    expect(PIECE_COLOURS.bishop).not.toBe(CHESS_COLOUR)
    expect(PIECE_COLOURS.king).not.toBe(CHESS_COLOUR)
    expect(PIECE_COLOURS.queen).not.toBe(CHESS_COLOUR)
    expect(PIECE_COLOURS.bishop).not.toBe(PIECE_COLOURS.king)
    expect(PIECE_COLOURS.bishop).not.toBe(PIECE_COLOURS.queen)
    expect(PIECE_COLOURS.king).not.toBe(PIECE_COLOURS.queen)

    // Pins the palette to exactly four distinct colours, so a future edit
    // can't quietly give every type its own colour one at a time without a
    // test noticing.
    expect(new Set(Object.values(PIECE_COLOURS)).size).toBe(4)
  })
})
