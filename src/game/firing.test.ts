import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { firstTower, liveRound, pawnAt, pieceAt, withTower } from './fixtures'
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
    // A Rook, not a Pawn: rank 2 deals 3 and a Pawn has exactly 3 health, so a
    // Pawn would die on the first shot and leave nothing to read a health off.
    const state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pieceAt('rook', 'target-0', { file: 3, rank: 4 }),
    ])

    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)
    const survivor = after.pieces.find((piece) => piece.id === 'target-0')

    expect(survivor?.health).toBe(PIECE_TYPES.rook.maxHealth - TOWER_RANKS[2].damage)
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

describe('the Wall (rank 7)', () => {
  it('never fires, and never moves fireCooldownMs off its built value of 0', () => {
    // Rank 7's geometry is 'none', which covers no square at any range -- but
    // that alone would only make selectTargets return nothing every time,
    // which is a DIFFERENT thing from never entering the cooldown loop at
    // all. Without the guard in fireTowers, a Tower that never finds a
    // target still runs the loop once cooldown crosses fireIntervalMs, and
    // gets clamped to "ready" (fireCooldownMs === fireIntervalMs) rather than
    // banking the shot -- so fireCooldownMs would move off 0 the moment 1000ms
    // passed, guard or no guard. This pins both halves of the guard's claim:
    // nothing takes damage, AND fireCooldownMs never leaves 0.
    const state = liveRound(withTower(7, { file: 3, rank: 3 }), [
      pawnAt('target-0', { file: 3, rank: 4 }),
    ])

    const after = runFor(state, TOWER_RANKS[7].fireIntervalMs + DT)
    const survivor = after.pieces.find((piece) => piece.id === 'target-0')

    expect(survivor?.health).toBe(PAWN_HEALTH)
    expect(firstTower(after).fireCooldownMs).toBe(0)
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
    // Rank 8 is now a ring at range 4: covered iff Chebyshev distance is 3 or
    // 4 from the Tower, and BLIND at 1-2 (the hollow core). All three squares
    // below sit at distance 3, so all three are covered.
    const state = scenario(8, { file: 3, rank: 3 }, [
      { file: 0, rank: 3 },
      { file: 6, rank: 3 },
      { file: 3, rank: 6 },
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(3)
  })

  it('caps at its target count', () => {
    // Rank 8 covers four Pieces but may only hit 3. All four squares sit at
    // Chebyshev distance 3 from the Tower — inside the ring, not the hollow
    // core distance 1-2 would put them in.
    const state = scenario(8, { file: 3, rank: 3 }, [
      { file: 0, rank: 3 },
      { file: 6, rank: 3 },
      { file: 3, rank: 6 },
      { file: 0, rank: 6 },
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(TOWER_RANKS[8].targetsPerShot)
  })

  it('rank 10 hits everything it covers', () => {
    // A band spans the full file width, so these are spread across the board
    // on purpose — that is the property being tested. Rank 5 is outside the
    // +/-1 band from board rank 3 and must NOT be hit — a fifth Piece sits
    // there so that claim is actually exercised, not just asserted in a
    // comment: without it, mutating `band` to cover the whole board left
    // this test green.
    const state = scenario(10, { file: 3, rank: 3 }, [
      { file: 0, rank: 4 },
      { file: 3, rank: 4 },
      { file: 7, rank: 2 },
      { file: 6, rank: 3 },
      { file: 3, rank: 5 },
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(4)
  })

  it('is deterministic when more Pieces are covered than can be hit', () => {
    // The point of this test is the id tie-break in selectTargets, which only
    // fires when two candidates tie on Manhattan distance to the Core at
    // {file: 3, rank: 0}. All four squares below sit at Chebyshev distance 3
    // or 4 from the Tower, so all four are covered (none in the hollow core),
    // and their Core-distances are:
    //   target-0 {6,1}: |6-3| + |1-0| = 4  (nearest -- picked outright)
    //   target-1 {7,1}: |7-3| + |1-0| = 5  (second -- picked outright)
    //   target-2 {0,3}: |0-3| + |3-0| = 6  (tied for the last slot)
    //   target-3 {6,3}: |6-3| + |3-0| = 6  (tied for the last slot)
    // targetsPerShot is 3, so exactly one of target-2/target-3 is dropped,
    // decided only by id ('target-2' < 'target-3'). Without a tie at the cap
    // boundary, distance alone would decide and the tie-break would never run
    // — which is exactly how this test passed vacuously before this repair,
    // with all four Pieces sitting unhit in the hollow core.
    const build = () =>
      scenario(8, { file: 3, rank: 3 }, [
        { file: 6, rank: 1 },
        { file: 7, rank: 1 },
        { file: 0, rank: 3 },
        { file: 6, rank: 3 },
      ])

    const a = runFor(build(), 2000)
    const b = runFor(build(), 2000)

    expect(a).toEqual(b)
  })
})

describe('tower firing: Towers block each other', () => {
  it('a Tower between the shooter and the Piece hides the Piece', () => {
    // Rank 3 fires vertically up its file. A rank-7 Wall at {3,4} stands
    // between the shooter at {3,7} and a Pawn at {3,2}: geometrically covered,
    // actually hidden.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(3, { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
  })

  it('still fires at the same arrangement with no blocker', () => {
    const state = scenario(3, { file: 3, rank: 7 }, [{ file: 3, rank: 2 }])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(true)
  })

  it('retargets to the next-nearest reachable Piece when the nearest is hidden', () => {
    // Core is at {3,0}, so distance to Core is the board rank. target-0 at
    // {3,2} is nearer the Core than target-1 at {3,5} — but the Wall at {3,4}
    // hides it from the shooter at {3,7}. The Tower must hit target-1: nearest
    // REACHABLE, not nearest overall.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(3, { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
      pawnAt('target-1', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    expect(wasHit(state, after, 'target-1')).toBe(true)
  })

  it('holds fire when every Piece it covers is hidden, and does not bank the shot', () => {
    // The Pawn is geometrically covered but occluded, and nothing else is in
    // range on the near side of the Wall. The Tower must fire nothing and sit
    // clamped at "ready" — the same cooldown a Tower with no target produces,
    // never a stored shot.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(3, { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, TOWER_RANKS[3].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    const shooter = after.towers.find((tower) => tower.cardRank === 3)
    expect(shooter?.fireCooldownMs).toBe(TOWER_RANKS[3].fireIntervalMs)
  })

  it('a multi-target Tower hits exactly the reachable Pieces', () => {
    // Rank 8 ring at {3,3} covers Chebyshev distance 3-4. The Wall at {3,4}
    // sits in the hollow core (distance 1) so it never fires, but it hides
    // everything on the file beyond it. target-0 at {3,7} (distance 4, in the
    // ring) is hidden; target-1 at {0,3} (distance 3, in the ring, off the
    // file) is reachable. targetsPerShot is 3, so both would be hit without
    // occlusion; only target-1 is now.
    const withWall = withTower(7, { file: 3, rank: 4 })
    const state = liveRound(withTower(8, { file: 3, rank: 3 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 7 }),
      pawnAt('target-1', { file: 0, rank: 3 }),
    ])

    const after = runFor(state, TOWER_RANKS[8].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    expect(wasHit(state, after, 'target-1')).toBe(true)
  })

  it('a full-height wall hides every rank of the toll gate, not just the center line', () => {
    // Issue #44 scenario. The gate at {0,2} covers ranks 1-3 across the full
    // width; a complete wall at file 2 must hide Pieces on every rank behind it.
    const gate = withTower(10, { file: 0, rank: 2 })
    const wall = withTower(
      7,
      { file: 2, rank: 1 },
      withTower(7, { file: 2, rank: 2 }, withTower(7, { file: 2, rank: 3 }, gate)),
    )
    const state = liveRound(wall, [
      pawnAt('center', { file: 3, rank: 2 }),
      pawnAt('above', { file: 3, rank: 3 }),
      pawnAt('below', { file: 3, rank: 1 }),
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

    // A Pawn's 900ms move interval outlasts the shot window, so none of these
    // hop during it — position is stable for the whole assertion.
    expect(wasHit(state, after, 'center')).toBe(false)
    expect(wasHit(state, after, 'above')).toBe(false)
    expect(wasHit(state, after, 'below')).toBe(false)
  })

  it('a partial wall hides only the rank it covers', () => {
    // One Wall on rank 1 shields rank-1 Pieces and nothing else: the rank-2 and
    // rank-3 Pieces are still reachable and still hit.
    const gate = withTower(10, { file: 0, rank: 2 })
    const state = liveRound(withTower(7, { file: 2, rank: 1 }, gate), [
      pawnAt('sameRank', { file: 3, rank: 1 }),
      pawnAt('centerRank', { file: 3, rank: 2 }),
      pawnAt('otherRank', { file: 3, rank: 3 }),
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

    expect(wasHit(state, after, 'sameRank')).toBe(false)
    expect(wasHit(state, after, 'centerRank')).toBe(true)
    expect(wasHit(state, after, 'otherRank')).toBe(true)
  })

  it('spares an occluded Piece and still hits a reachable one on another rank', () => {
    // The rank-1 Wall hides the rank-1 Piece nearest the Core; the rank-3 Piece,
    // one rank off the walled line, stays reachable and gets the shot.
    const gate = withTower(10, { file: 0, rank: 2 })
    const state = liveRound(withTower(7, { file: 2, rank: 1 }, gate), [
      pawnAt('hidden', { file: 3, rank: 1 }),
      pawnAt('exposed', { file: 3, rank: 3 }),
    ])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

    expect(wasHit(state, after, 'hidden')).toBe(false)
    expect(wasHit(state, after, 'exposed')).toBe(true)
  })

  it('holds fire when every rank is walled, and does not bank the shot', () => {
    // The gate's one covered Piece is hidden and nothing else is in reach; the
    // Tower must fire nothing and sit clamped at "ready" — the same cooldown a
    // Tower with no target produces, never a stored shot.
    const gate = withTower(10, { file: 0, rank: 2 })
    const wall = withTower(
      7,
      { file: 2, rank: 1 },
      withTower(7, { file: 2, rank: 2 }, withTower(7, { file: 2, rank: 3 }, gate)),
    )
    const state = liveRound(wall, [pawnAt('target-0', { file: 3, rank: 2 })])

    const after = runFor(state, TOWER_RANKS[10].fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    const shooter = after.towers.find((tower) => tower.cardRank === 10)
    expect(shooter?.fireCooldownMs).toBe(TOWER_RANKS[10].fireIntervalMs)
  })
})
