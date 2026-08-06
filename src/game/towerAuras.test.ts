import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTowerId, liveRound, pawnAt, pieceAt, withTower } from './fixtures'
import { tick } from './index'
import { AMPLIFIER_MULTIPLIER, amplificationFor, amplifierIdsByPiece } from './towerAuras'
import type { GameState } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

describe('amplifierIdsByPiece', () => {
  it('lists the Amplifier covering a Piece inside its ring', () => {
    // Rank 8 is a ring at range 4: distance 3 and 4 are covered, 1 and 2 are
    // the hollow core.
    const state = liveRound(withTower(8, { file: 3, rank: 3 }), [
      pawnAt('inside-ring', { file: 3, rank: 6 }),
    ])
    const amplifiers = amplifierIdsByPiece(state.towers, state.pieces)

    expect(amplifiers.get('inside-ring')).toEqual(new Set([firstTowerId(state)]))
  })

  it('does not list a Piece standing in the hollow core', () => {
    const state = liveRound(withTower(8, { file: 3, rank: 3 }), [
      pawnAt('in-core', { file: 3, rank: 4 }),
    ])

    expect(amplifierIdsByPiece(state.towers, state.pieces).get('in-core')).toBeUndefined()
  })

  it('ignores Towers with no amplify aura', () => {
    const state = liveRound(withTower(4, { file: 3, rank: 3 }), [
      pawnAt('covered', { file: 3, rank: 5 }),
    ])

    expect(amplifierIdsByPiece(state.towers, state.pieces).size).toBe(0)
  })
})

describe('amplificationFor', () => {
  const amplifiers = new Map([['piece-1', new Set(['tower-8'])]])

  it('amplifies another Tower firing into the ring', () => {
    expect(amplificationFor('tower-2', 'piece-1', amplifiers)).toBe(AMPLIFIER_MULTIPLIER)
  })

  it('NEVER amplifies the Amplifier itself', () => {
    // Load-bearing. A self-amplifying rank 8 is self-sufficient, which rebuilds
    // the dominance problem issue #19 reported, one rank along. Mirrors the
    // King never buffing itself and applyHealing's own self-check.
    expect(amplificationFor('tower-8', 'piece-1', amplifiers)).toBe(1)
  })

  it('leaves an unamplified Piece alone', () => {
    expect(amplificationFor('tower-2', 'piece-9', amplifiers)).toBe(1)
  })

  it('does not stack when two Amplifiers cover the same Piece', () => {
    const two = new Map([['piece-1', new Set(['tower-8', 'tower-9'])]])

    expect(amplificationFor('tower-2', 'piece-1', two)).toBe(AMPLIFIER_MULTIPLIER)
  })
})

describe('the Amplifier in a live round', () => {
  it('doubles what another Tower deals inside the ring', () => {
    // A Rook has 14 health, enough to survive and be measured. It sits at
    // Chebyshev distance 3 from the rank 8 and distance 1 from the rank 2,
    // so it is inside the ring AND inside the rank 2's reach.
    const withRing = withTower(8, { file: 0, rank: 0 })
    const both = withTower(2, { file: 3, rank: 2 }, withRing)
    const state = liveRound(both, [pieceAt('rook', 'victim', { file: 3, rank: 3 })])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)
    const victim = after.pieces.find((piece) => piece.id === 'victim')
    const dealt = 14 - (victim?.health ?? 0)

    expect(dealt).toBe(TOWER_RANKS[2].damage * AMPLIFIER_MULTIPLIER)
  })

  it('does not double its own shot', () => {
    // The same Piece, with only the Amplifier present. It must take exactly
    // rank 8's damage, unmultiplied.
    const state = liveRound(withTower(8, { file: 0, rank: 0 }), [
      pieceAt('rook', 'victim', { file: 3, rank: 3 }),
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const victim = after.pieces.find((piece) => piece.id === 'victim')

    expect(14 - (victim?.health ?? 0)).toBe(TOWER_RANKS[8].damage)
  })
})
