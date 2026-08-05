import { describe, expect, it } from 'vitest'
import { BLOCKED_ATTACK_MULTIPLIER, PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { createInitialState, step, tick } from './index'
import type { CardRank, GameState, Square } from './types'

const DT = 1000 / 60
const PAWN = PIECE_TYPES.pawn
const BLOCKED_DAMAGE = PAWN.attackDamage * BLOCKED_ATTACK_MULTIPLIER

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/**
 * A live round with one Tower directly in the path of one Piece.
 *
 * The Piece sits one square up-file from the Tower, and the Core is straight
 * down the same file, so its next step lands on the Tower.
 */
function blockedApproach(cardRank: CardRank, towerSquare: Square): GameState {
  const placed = step(createInitialState(), {
    kind: 'placeTower',
    square: towerSquare,
    cardRank,
  })

  const pieceSquare = { file: towerSquare.file, rank: towerSquare.rank + 1 }

  return {
    ...placed,
    phase: 'inProgress',
    pendingSpawns: [],
    pieces: [
      {
        id: 'blocked',
        typeId: 'pawn',
        square: pieceSquare,
        prevSquare: pieceSquare,
        health: PAWN.maxHealth,
        moveCooldownMs: 0,
      },
    ],
  }
}

describe('placeTower: health', () => {
  it('starts a Tower at the full health of its rank', () => {
    const state = step(createInitialState(), {
      kind: 'placeTower',
      square: { file: 1, rank: 1 },
      cardRank: 4,
    })

    expect(state.towers[0]?.health).toBe(TOWER_RANKS[4].maxHealth)
    expect(state.towers[0]?.maxHealth).toBe(TOWER_RANKS[4].maxHealth)
  })
})

describe('Towers block movement', () => {
  it('stops a Piece whose next square holds a Tower', () => {
    const state = blockedApproach(3, { file: 3, rank: 4 })
    const startSquare = state.pieces[0]?.square

    const after = runFor(state, PAWN.moveIntervalMs + DT)

    expect(after.pieces[0]?.square).toEqual(startSquare)
  })

  it('lets the Piece advance once the Tower is destroyed', () => {
    // Rank 5 is the only geometry with a blind spot directly up-file, so this
    // Tower cannot shoot the Piece grinding against it. Every other rank kills
    // a lone attacking Pawn well before the Pawn breaks through.
    const attacksNeeded = TOWER_RANKS[5].maxHealth / BLOCKED_DAMAGE
    const state = blockedApproach(5, { file: 3, rank: 4 })

    const after = runFor(state, PAWN.moveIntervalMs * (attacksNeeded + 2))

    expect(after.towers).toHaveLength(0)
    expect(after.pieces[0]?.square.rank).toBeLessThan(5)
  })
})

describe('blocked Pieces attack at half strength', () => {
  it('damages the Tower it is blocked by', () => {
    const state = blockedApproach(3, { file: 3, rank: 4 })

    const after = runFor(state, PAWN.moveIntervalMs + DT)

    expect(after.towers[0]?.health).toBe(TOWER_RANKS[3].maxHealth - BLOCKED_DAMAGE)
  })

  it('deals half its attack damage, not full', () => {
    const state = blockedApproach(3, { file: 3, rank: 4 })

    const after = runFor(state, PAWN.moveIntervalMs + DT)
    const dealt = TOWER_RANKS[3].maxHealth - (after.towers[0]?.health ?? 0)

    expect(dealt).toBe(PAWN.attackDamage * BLOCKED_ATTACK_MULTIPLIER)
    expect(dealt).toBeLessThan(PAWN.attackDamage)
  })

  it('attacks once per move interval, not once per tick', () => {
    // Rank 5 again: it cannot return fire up-file, so the Piece survives long
    // enough to land a second attack.
    const state = blockedApproach(5, { file: 3, rank: 4 })

    const after = runFor(state, PAWN.moveIntervalMs * 2 + DT)
    const dealt = TOWER_RANKS[5].maxHealth - (after.towers[0]?.health ?? 0)

    expect(dealt).toBe(BLOCKED_DAMAGE * 2)
  })

  it('does not damage a Tower it is not blocked by', () => {
    // Tower off to the side, not on the Piece's path.
    const placed = step(createInitialState(), {
      kind: 'placeTower',
      square: { file: 7, rank: 7 },
      cardRank: 3,
    })
    const state: GameState = {
      ...placed,
      phase: 'inProgress',
      pendingSpawns: [],
      pieces: [
        {
          id: 'passer',
          typeId: 'pawn',
          square: { file: 0, rank: 5 },
          prevSquare: { file: 0, rank: 5 },
          health: PAWN.maxHealth,
          moveCooldownMs: 0,
        },
      ],
    }

    const after = runFor(state, 3000)

    expect(after.towers[0]?.health).toBe(TOWER_RANKS[3].maxHealth)
  })
})

describe('destroyed Towers', () => {
  it('are removed from state', () => {
    const attacksNeeded = TOWER_RANKS[5].maxHealth / BLOCKED_DAMAGE
    const state = blockedApproach(5, { file: 3, rank: 4 })

    const after = runFor(state, PAWN.moveIntervalMs * (attacksNeeded + 1))

    expect(after.towers).toHaveLength(0)
  })

  it('do not take Tower health below zero in the reported state', () => {
    const state = blockedApproach(5, { file: 3, rank: 4 })

    const after = runFor(state, 30_000)

    expect(after.towers.every((tower) => tower.health > 0)).toBe(true)
  })
})

describe('blocking: determinism', () => {
  it('produces identical state from identical inputs', () => {
    const a = runFor(blockedApproach(3, { file: 3, rank: 4 }), 4000)
    const b = runFor(blockedApproach(3, { file: 3, rank: 4 }), 4000)

    expect(a).toEqual(b)
  })
})
