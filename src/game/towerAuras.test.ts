import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { KING_SPEED_MULTIPLIER } from './auras'
import { firstTowerId, liveRound, pawnAt, pieceAt, withTower } from './fixtures'
import { tick } from './index'
import {
  AMPLIFIER_MULTIPLIER,
  FREEZE_MULTIPLIER,
  amplificationFor,
  amplifierIdsByPiece,
  frozenPieceIds,
} from './towerAuras'
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

describe('frozenPieceIds', () => {
  it('freezes a Piece inside a rank 9 disc', () => {
    // Rank 9 is adjacent at range 2 — a solid 5x5 disc, no hollow core.
    const state = liveRound(withTower(9, { file: 3, rank: 3 }), [
      pawnAt('chilled', { file: 4, rank: 4 }),
    ])

    expect(frozenPieceIds(state.towers, state.pieces).has('chilled')).toBe(true)
  })

  it('leaves a Piece outside the disc alone', () => {
    const state = liveRound(withTower(9, { file: 3, rank: 3 }), [
      pawnAt('warm', { file: 7, rank: 7 }),
    ])

    expect(frozenPieceIds(state.towers, state.pieces).has('warm')).toBe(false)
  })

  it('ignores Towers with no freeze aura', () => {
    const state = liveRound(withTower(8, { file: 3, rank: 3 }), [
      pawnAt('covered', { file: 3, rank: 6 }),
    ])

    expect(frozenPieceIds(state.towers, state.pieces).size).toBe(0)
  })
})

describe('the Freezer in a live round', () => {
  it('makes a Pawn take longer to cross the same distance', () => {
    // Rank 9 sits off to the side so it covers the Pawn's path without ever
    // blocking it — a blocked Pawn would attack instead of moving and this
    // would measure the wrong thing.
    //
    // Verified by hand, not just reasoned: the Pawn has 3 health and a 900ms
    // move interval; rank 9 deals 1 damage every 750ms. In the frozen case the
    // Freezer covers the Pawn (Chebyshev distance 1, inside range 2) for the
    // whole 2000ms window, so it also shoots it — two shots land (at 750ms and
    // 1500ms; the third is due at 2250ms, past the window), for 2 damage total.
    // The Pawn survives on 1 health. The frozen Pawn's move interval is
    // 900 * FREEZE_MULTIPLIER = 1350ms, so it moves exactly once by 2000ms; the
    // free Pawn, at the unmultiplied 900ms, moves twice. The "free" Tower at
    // {file: 7, rank: 0} is Chebyshev distance 5+ from the Pawn's whole path —
    // rank 9's range-2 reach covers none of it.
    const frozen = liveRound(withTower(9, { file: 1, rank: 5 }), [
      pawnAt('runner', { file: 2, rank: 6 }),
    ])
    const free = liveRound(withTower(9, { file: 7, rank: 0 }), [
      pawnAt('runner', { file: 2, rank: 6 }),
    ])

    const afterFrozen = runFor(frozen, 2000)
    const afterFree = runFor(free, 2000)

    const frozenRank = afterFrozen.pieces.find((piece) => piece.id === 'runner')?.square.rank
    const freeRank = afterFree.pieces.find((piece) => piece.id === 'runner')?.square.rank

    // A Pawn moves DOWN in board rank, so a higher remaining rank means it
    // travelled less. Both must still be on the board for this to mean
    // anything.
    expect(frozenRank).toBeDefined()
    expect(freeRank).toBeDefined()
    expect(frozenRank ?? 0).toBeGreaterThan(freeRank ?? 0)
  })

  it('composes with the King buff rather than overriding it', () => {
    // LOAD-BEARING for the composition rule: 0.7 x 1.5 = 1.05, so a King
    // very nearly cancels a freeze rather than being immune to it or losing
    // to it outright. This pins that specifically against the mutation most
    // likely to slip in: applying the freeze to the Pawn's BASE interval
    // instead of its already-buffed one, i.e. replacing the buff rather than
    // stacking with it.
    //
    //  - Correct (compose):        900 * 0.7 * 1.5 = 945ms/hop  -> 1 move by 1300ms -> rank 3
    //  - Freeze REPLACES the buff: 900 * 1.5        = 1350ms/hop -> 0 moves by 1300ms -> rank 4
    //
    // (move count = floor(windowMs / interval); the accumulator's carried
    // leftover cooldown makes that division exact regardless of tick size.)
    //
    // NOT covered here: a mutant where the buff wins outright and the freeze
    // is ignored while buffed (900 * 0.7 = 630ms/hop). Verified by hand that
    // this arrangement cannot catch that one — the King is stationary and the
    // Pawn moves straight down away from it, so the buff is positional and
    // expires the instant the Pawn takes its first hop (Chebyshev distance
    // goes from 1 to 2). After that hop both the correct code and that mutant
    // fall back to the same unbuffed, frozen 1350ms interval, so they agree
    // on the second hop never landing inside 1300ms either. Distinguishing
    // that mutant would need the buff to persist across a hop, which asks a
    // King to keep pace with a Pawn it is chess-slower than.
    const composedInterval = 900 * KING_SPEED_MULTIPLIER * FREEZE_MULTIPLIER
    const replacedInterval = 900 * FREEZE_MULTIPLIER
    const windowMs = 1300

    expect(composedInterval).toBeCloseTo(945)
    expect(Math.floor(windowMs / composedInterval)).toBe(1)
    expect(Math.floor(windowMs / replacedInterval)).toBe(0)

    // The King never moves in this window regardless of buff or freeze — its
    // own base interval is 1800ms, well past 1300ms — so it stays adjacent to
    // the Pawn for its one hop (and the Freezer keeps covering the Pawn
    // throughout, since the Tower doesn't move either).
    const withFreezer = withTower(9, { file: 2, rank: 4 })
    const state = liveRound(withFreezer, [
      pieceAt('king', 'guard', { file: 4, rank: 5 }),
      pawnAt('runner', { file: 4, rank: 4 }),
    ])

    const after = runFor(state, windowMs)
    const runner = after.pieces.find((piece) => piece.id === 'runner')

    expect(runner?.square.rank).toBe(3)
  })
})
