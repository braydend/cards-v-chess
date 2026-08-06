import { describe, expect, it } from 'vitest'
import { JOKER_CLEAR_SHARE, ROUND_INCOME_BASE, ROUND_INCOME_PER_ROUND } from '../data/ink'
import { PIECE_TYPES } from '../data/pieceTypes'
import { pieceAt } from './fixtures'
import { clearReward, killReward, roundIncome, totalKillReward } from './ink'

const SQUARE = { file: 3, rank: 5 }

function pawns(count: number) {
  return Array.from({ length: count }, (_, i) => pieceAt('pawn', `p${i}`, SQUARE))
}

describe('kill rewards', () => {
  it("pays the Piece type's authored reward", () => {
    expect(killReward(pieceAt('queen', 'q', SQUARE))).toBe(PIECE_TYPES.queen.inkReward)
  })

  it('sums across a mixed set of Pieces', () => {
    const mixed = [
      pieceAt('pawn', 'a', SQUARE),
      pieceAt('rook', 'b', SQUARE),
      pieceAt('king', 'c', SQUARE),
    ]

    expect(totalKillReward(mixed)).toBe(
      PIECE_TYPES.pawn.inkReward + PIECE_TYPES.rook.inkReward + PIECE_TYPES.king.inkReward,
    )
  })

  it('pays nothing for an empty set', () => {
    expect(totalKillReward([])).toBe(0)
  })

  it('pays a Queen more than a Rook, which has more health but is less of an event', () => {
    // Pins the decision to author rewards rather than derive them from
    // maxHealth, which would invert this pair.
    expect(PIECE_TYPES.queen.inkReward).toBeGreaterThan(PIECE_TYPES.rook.inkReward)
  })
})

describe('round income', () => {
  it('pays the base plus one round-scaled share for round 1', () => {
    expect(roundIncome(1)).toBe(ROUND_INCOME_BASE + ROUND_INCOME_PER_ROUND)
  })

  it('pays more for a later round, since rounds grow', () => {
    expect(roundIncome(9) - roundIncome(8)).toBe(ROUND_INCOME_PER_ROUND)
  })
})

describe("a Joker's Clear", () => {
  it('floors the total, not each Piece — a Pawn swarm pays rather than rounding to nothing', () => {
    const swarm = pawns(20)

    // At a quarter share a Pawn is worth a fraction of one Ink, so flooring
    // per Piece would pay ZERO for the whole swarm — nothing for exactly the
    // chaff a Clear is used on. This assertion is the reason the rounding rule
    // is fixed in one place.
    expect(clearReward(swarm)).toBeGreaterThan(0)
    expect(clearReward(swarm)).toBe(Math.floor(totalKillReward(swarm) * JOKER_CLEAR_SHARE))
  })

  it('pays less than killing the same Pieces would', () => {
    const swarm = pawns(20)

    expect(clearReward(swarm)).toBeLessThan(totalKillReward(swarm))
  })

  it('pays nothing for an empty board', () => {
    expect(clearReward([])).toBe(0)
  })
})
