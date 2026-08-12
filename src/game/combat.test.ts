import { describe, expect, it } from 'vitest'
import { BLOCKED_ATTACK_MULTIPLIER, PIECE_TYPES } from '../data/pieceTypes'
import { towerType } from '../data/towerTypes'
import { firstTower, liveRound, pieceAt, withTower } from './fixtures'
import { tick } from './index'
import type { GameState } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('the universal combat rule', () => {
  it('a Rook blocked by a Tower ahead deals full damage', () => {
    // Rook on the Tower's file, one square up — its next hop lands on the Tower.
    const state = liveRound(withTower('diagonal', { file: 3, rank: 4 }), [
      pieceAt('rook', 'grinder', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, PIECE_TYPES.rook.moveIntervalMs + DT)

    expect(firstTower(after).health).toBe(
      towerType('diagonal').maxHealth - PIECE_TYPES.rook.attackDamage,
    )
  })

  it('a Knight blocked on an L-square deals full damage', () => {
    // The Knight's zig-zag hop from (2,5) lands on (3,3); a Tower there blocks it.
    const state = liveRound(withTower('diagonal', { file: 3, rank: 3 }), [
      pieceAt('knight', 'hopper', { file: 2, rank: 5 }),
    ])

    const after = runFor(state, PIECE_TYPES.knight.moveIntervalMs + DT)

    expect(firstTower(after).health).toBe(
      towerType('diagonal').maxHealth - PIECE_TYPES.knight.attackDamage,
    )
  })

  it('a Pawn blocked straight ahead still deals half damage', () => {
    const state = liveRound(withTower('diagonal', { file: 3, rank: 4 }), [
      pieceAt('pawn', 'grinder', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(firstTower(after).health).toBe(
      towerType('diagonal').maxHealth -
        PIECE_TYPES.pawn.attackDamage * BLOCKED_ATTACK_MULTIPLIER,
    )
  })
})
