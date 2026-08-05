import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { liveRound, pawnAt, withTower } from './fixtures'
import { tick } from './index'
import type { BuildableRank, GameState, Square } from './types'

const DT = 1000 / 60
const PAWN_HEALTH = PIECE_TYPES.pawn.maxHealth

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/**
 * Whether a Piece took damage — true whether it was hurt or outright destroyed.
 *
 * Asserting `health < max` alone is a trap: a high-rank Tower can one-shot a
 * Pawn, which removes it from `pieces` entirely and makes a health lookup
 * undefined. This keeps "was it hit?" independent of the balance numbers.
 */
function wasHit(before: GameState, after: GameState, pieceId: string): boolean {
  const original = before.pieces.find((piece) => piece.id === pieceId)
  const survivor = after.pieces.find((piece) => piece.id === pieceId)

  if (!original) throw new Error(`no Piece ${pieceId} in the starting state`)
  if (!survivor) return true

  return survivor.health < original.health
}

/**
 * A live round containing one Tower and the given Pieces, with nothing left to
 * spawn — so the round resolves purely on what the Tower does.
 */
function scenario(
  cardRank: BuildableRank,
  towerSquare: Square,
  pieceSquares: readonly Square[],
): GameState {
  return liveRound(
    withTower(cardRank, towerSquare),
    pieceSquares.map((square, index) => pawnAt(`target-${index}`, square)),
  )
}

describe('tower firing', () => {
  it('damages a Piece inside its coverage', () => {
    // Rank 2 covers only its eight neighbours, so the Piece sits alongside it.
    const state = scenario(2, { file: 3, rank: 6 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH - TOWER_RANKS[2].damage)
  })

  it('does not fire before its interval has elapsed', () => {
    const state = scenario(2, { file: 3, rank: 6 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs - 2 * DT)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('leaves a Piece outside its coverage untouched', () => {
    // File 7, well away from both the Tower and the Core. A pawn there marches
    // to the back rank and strands; it never gets near the Core's file, so it
    // stays on the board for the whole window.
    const state = scenario(2, { file: 2, rank: 6 }, [{ file: 7, rank: 3 }])

    const after = runFor(state, 3000)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('leaves a Piece beyond its range untouched', () => {
    // Two squares away, one beyond a rank 2 Tower's reach.
    const state = scenario(2, { file: 2, rank: 6 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, 3000)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('destroys a Piece whose health reaches zero', () => {
    // Rank 3 fires vertically. Pawns approach the Core along a file, so this
    // Tower keeps the Piece covered as it advances.
    const state = scenario(3, { file: 3, rank: 2 }, [{ file: 3, rank: 6 }])

    const after = runFor(state, 2200)

    expect(after.pieces).toHaveLength(0)
  })

  it('does not damage the Core when it destroys a Piece', () => {
    const state = scenario(3, { file: 3, rank: 2 }, [{ file: 3, rank: 6 }])

    const after = runFor(state, 2200)

    expect(after.core.health).toBe(state.core.health)
    expect(after.leaks).toBe(0)
  })

  it('completes the round once the last Piece is destroyed', () => {
    const state = scenario(3, { file: 3, rank: 2 }, [{ file: 3, rank: 6 }])

    const after = runFor(state, 2200)

    expect(after.phase).toBe('gap')
    expect(after.roundNumber).toBe(state.roundNumber + 1)
  })
})

describe('tower firing: geometry is respected', () => {
  it('a vertical Tower ignores a Piece on its board rank', () => {
    const state = scenario(3, { file: 2, rank: 6 }, [{ file: 4, rank: 6 }])

    expect(runFor(state, 2000).pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('a cross Tower hits along both rank and file', () => {
    const onRank = scenario(4, { file: 2, rank: 6 }, [{ file: 4, rank: 6 }])
    const onFile = scenario(4, { file: 4, rank: 4 }, [{ file: 4, rank: 6 }])
    const window = TOWER_RANKS[4].fireIntervalMs + DT

    expect(wasHit(onRank, runFor(onRank, window), 'target-0')).toBe(true)
    expect(wasHit(onFile, runFor(onFile, window), 'target-0')).toBe(true)
  })

  it('a cross Tower ignores a Piece on a diagonal', () => {
    const state = scenario(4, { file: 2, rank: 4 }, [{ file: 4, rank: 6 }])

    expect(runFor(state, 500).pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('a diagonal Tower hits a Piece on its diagonal', () => {
    const state = scenario(5, { file: 2, rank: 4 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, TOWER_RANKS[5].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(true)
  })

  it('a diagonal Tower ignores a Piece on its own file', () => {
    const state = scenario(5, { file: 4, rank: 4 }, [{ file: 4, rank: 6 }])

    expect(runFor(state, 500).pieces[0]?.health).toBe(PAWN_HEALTH)
  })
})

describe('tower firing: target selection', () => {
  it('shoots the Piece closest to the Core first', () => {
    // Both sit on the Tower's file and within range; one is nearer the Core.
    const state = scenario(3, { file: 3, rank: 7 }, [
      { file: 3, rank: 5 },
      { file: 3, rank: 4 },
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    const nearer = after.pieces.find((piece) => piece.id === 'target-1')
    const further = after.pieces.find((piece) => piece.id === 'target-0')

    expect(nearer?.health).toBe(PAWN_HEALTH - TOWER_RANKS[3].damage)
    expect(further?.health).toBe(PAWN_HEALTH)
  })

  it('breaks ties on the lexicographically smaller id, not numeric order', () => {
    // 'piece-10' < 'piece-2' lexicographically but 10 > 2 numerically, so the
    // two orders disagree here. This pins which comparison selectTargets uses,
    // not merely that some tie-break exists.
    const towerSquare = { file: 3, rank: 4 }
    const state = liveRound(withTower(2, towerSquare), [
      pawnAt('piece-10', { file: 2, rank: 4 }),
      pawnAt('piece-2', { file: 4, rank: 4 }),
    ])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)

    expect(wasHit(state, after, 'piece-10')).toBe(true)
    expect(wasHit(state, after, 'piece-2')).toBe(false)
  })

  it('fires once per interval, not once per target', () => {
    const state = scenario(3, { file: 3, rank: 7 }, [
      { file: 3, rank: 5 },
      { file: 3, rank: 4 },
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)
    const totalDamage = after.pieces.reduce(
      (sum, piece) => sum + (PAWN_HEALTH - piece.health),
      0,
    )

    expect(totalDamage).toBe(TOWER_RANKS[3].damage)
  })
})

describe('tower firing: determinism', () => {
  it('produces identical state from identical inputs', () => {
    const a = runFor(scenario(3, { file: 3, rank: 2 }, [{ file: 3, rank: 6 }]), 1500)
    const b = runFor(scenario(3, { file: 3, rank: 2 }, [{ file: 3, rank: 6 }]), 1500)

    expect(a).toEqual(b)
  })
})

describe('targets per shot', () => {
  it('a single-target Tower damages only one of two covered Pieces', () => {
    // Rank 3 fires up its own file; both Pieces sit on it.
    const state = scenario(3, { file: 3, rank: 1 }, [
      { file: 3, rank: 2 },
      { file: 3, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(1)
  })

  it('a multi-target Tower damages several covered Pieces in one shot', () => {
    // Rank 8 is a star with 3 targets. Three Pieces on three different rays.
    const state = scenario(8, { file: 3, rank: 3 }, [
      { file: 3, rank: 4 },
      { file: 4, rank: 4 },
      { file: 4, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(3)
  })

  it('caps at its target count', () => {
    // Rank 8 covers four Pieces but may only hit 3.
    const state = scenario(8, { file: 3, rank: 3 }, [
      { file: 3, rank: 4 },
      { file: 4, rank: 4 },
      { file: 4, rank: 3 },
      { file: 2, rank: 2 },
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(TOWER_RANKS[8].targetsPerShot)
  })

  it('rank 10 hits everything it covers', () => {
    const state = scenario(10, { file: 3, rank: 3 }, [
      { file: 3, rank: 4 },
      { file: 4, rank: 4 },
      { file: 2, rank: 2 },
      { file: 5, rank: 5 },
      { file: 1, rank: 3 },
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(5)
  })

  it('is deterministic when more Pieces are covered than can be hit', () => {
    const build = () =>
      scenario(8, { file: 3, rank: 3 }, [
        { file: 3, rank: 4 },
        { file: 4, rank: 4 },
        { file: 4, rank: 3 },
        { file: 2, rank: 2 },
      ])

    const a = runFor(build(), 2000)
    const b = runFor(build(), 2000)

    expect(a).toEqual(b)
  })
})
