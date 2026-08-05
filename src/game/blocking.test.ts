import { describe, expect, it } from 'vitest'
import { BLOCKED_ATTACK_MULTIPLIER, PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { liveRound, pawnAt, withTower } from './fixtures'
import { tick } from './index'
import type { BuildableRank, GameState, Square } from './types'

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
function blockedApproach(cardRank: BuildableRank, towerSquare: Square): GameState {
  const placed = withTower(cardRank, towerSquare)
  const pieceSquare = { file: towerSquare.file, rank: towerSquare.rank + 1 }

  return liveRound(placed, [pawnAt('blocked', pieceSquare)])
}

describe('buildTower: health', () => {
  it('starts a Tower at the full health of its rank', () => {
    const state = withTower(4, { file: 1, rank: 1 })

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
    const state = liveRound(withTower(3, { file: 7, rank: 7 }), [pawnAt('passer', { file: 0, rank: 5 })])

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
    // The claim is about every reported state, not just the final one — a
    // Tower dies partway through this run, so sampling only the end (where
    // `after.towers` is already `[]`) would make `.every(...)` vacuously true
    // no matter what health value was reported on the way down. Stepping one
    // tick at a time and asserting after each closes that gap.
    let state = blockedApproach(5, { file: 3, rank: 4 })

    for (let elapsed = 0; elapsed < 30_000; elapsed += DT) {
      state = tick(state, DT)
      expect(state.towers.every((tower) => tower.health > 0)).toBe(true)
    }
  })
})

describe('blocking: determinism', () => {
  it('produces identical state from identical inputs', () => {
    const a = runFor(blockedApproach(3, { file: 3, rank: 4 }), 4000)
    const b = runFor(blockedApproach(3, { file: 3, rank: 4 }), 4000)

    expect(a).toEqual(b)
  })
})

describe('Tower shields', () => {
  it('seeds a new Tower with no shield', () => {
    const state = blockedApproach(3, { file: 3, rank: 4 })

    expect(state.towers[0]?.shield).toBe(0)
  })

  it('absorbs damage before health', () => {
    const shielded = blockedApproach(3, { file: 3, rank: 4 })
    const state: GameState = {
      ...shielded,
      towers: shielded.towers.map((tower) => ({ ...tower, shield: 4 })),
    }

    const after = runFor(state, PAWN.moveIntervalMs + DT)

    expect(after.towers[0]?.health).toBe(TOWER_RANKS[3].maxHealth)
    expect(after.towers[0]?.shield).toBe(4 - BLOCKED_DAMAGE)
  })

  it('splits a single hit across shield and health', () => {
    // Rank 5's diagonal geometry cannot cover the square directly up-file, so
    // the Piece is never shot and the hits land on schedule.
    const shielded = blockedApproach(5, { file: 3, rank: 4 })
    const partial = BLOCKED_DAMAGE / 2
    const state: GameState = {
      ...shielded,
      towers: shielded.towers.map((tower) => ({ ...tower, shield: partial })),
    }

    const after = runFor(state, PAWN.moveIntervalMs + DT)

    expect(after.towers[0]?.shield).toBe(0)
    expect(after.towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth - partial)
  })

  it('carries overflow into health once the shield is gone', () => {
    // Shield equal to exactly one hit: the first hop is fully absorbed, the
    // second lands on health.
    const shielded = blockedApproach(5, { file: 3, rank: 4 })
    const state: GameState = {
      ...shielded,
      towers: shielded.towers.map((tower) => ({ ...tower, shield: BLOCKED_DAMAGE })),
    }

    const after = runFor(state, PAWN.moveIntervalMs * 2 + DT)

    expect(after.towers[0]?.shield).toBe(0)
    expect(after.towers[0]?.health).toBe(TOWER_RANKS[5].maxHealth - BLOCKED_DAMAGE)
  })
})

describe('Tower stats are per-Tower', () => {
  it('seeds damage and fire interval from the rank', () => {
    const state = blockedApproach(5, { file: 3, rank: 4 })

    expect(state.towers[0]?.damage).toBe(TOWER_RANKS[5].damage)
    expect(state.towers[0]?.fireIntervalMs).toBe(TOWER_RANKS[5].fireIntervalMs)
  })

  it('fires using the Tower’s own damage, not its rank’s', () => {
    // A Tower whose damage has been raised kills faster than its rank would.
    const base = blockedApproach(3, { file: 3, rank: 6 })
    const boosted: GameState = {
      ...base,
      towers: base.towers.map((tower) => ({ ...tower, damage: PAWN.maxHealth })),
      pieces: base.pieces.map((piece) => ({
        ...piece,
        square: { file: 3, rank: 2 },
        prevSquare: { file: 3, rank: 2 },
      })),
    }

    const after = runFor(boosted, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(after.pieces).toHaveLength(0)
  })
})
