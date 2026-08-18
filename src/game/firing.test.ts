import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { towerType, type TowerTypeId } from '../data/towerTypes'
import { firstTower, liveRound, pawnAt, pieceAt, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState, Square } from './types'

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
 * Asserting `health < max` alone is a trap: a high-damage Tower can one-shot a
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
  type: TowerTypeId,
  towerSquare: Square,
  pieceSquares: readonly Square[],
): GameState {
  return liveRound(
    withTower(type, towerSquare),
    pieceSquares.map((square, index) => pawnAt(`target-${index}`, square)),
  )
}

describe('tower firing', () => {
  it('damages a Piece inside its coverage', () => {
    // A Rook, not a Pawn: a Pawn would die after two shots and leave nothing
    // to read a health off in the one-shot window.
    const state = liveRound(withTower('vertical', { file: 3, rank: 3 }), [
      pieceAt('rook', 'target-0', { file: 3, rank: 4 }),
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)
    const survivor = after.pieces.find((piece) => piece.id === 'target-0')

    expect(survivor?.health).toBe(PIECE_TYPES.rook.maxHealth - towerType('vertical').damage)
  })

  it('does not fire before its interval has elapsed', () => {
    const state = scenario('splash', { file: 3, rank: 6 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, towerType('splash').fireIntervalMs - 2 * DT)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('leaves a Piece outside its coverage untouched', () => {
    // File 7, well away from both the Tower and the Core. A pawn there marches
    // to the back rank and strands; it never gets near the Core's file, so it
    // stays on the board for the whole window.
    const state = scenario('vertical', { file: 2, rank: 6 }, [{ file: 7, rank: 3 }])

    const after = runFor(state, 3000)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('leaves a Piece beyond its range untouched', () => {
    // Two squares away, one beyond a splash Tower's range-1 reach.
    const state = scenario('splash', { file: 2, rank: 6 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, 3000)

    expect(after.pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('destroys a Piece whose health reaches zero', () => {
    // Vertical fires along its own file. Pawns approach the Core along a file,
    // so this Tower keeps the Piece covered as it advances.
    const state = scenario('vertical', { file: 3, rank: 2 }, [{ file: 3, rank: 6 }])

    const after = runFor(state, 2200)

    expect(after.pieces).toHaveLength(0)
  })

  it('does not damage the Core when it destroys a Piece', () => {
    const state = scenario('vertical', { file: 3, rank: 2 }, [{ file: 3, rank: 6 }])

    const after = runFor(state, 2200)

    expect(after.core.health).toBe(state.core.health)
    expect(after.leaks).toBe(0)
  })

  it('completes the round once the last Piece is destroyed', () => {
    const state = scenario('vertical', { file: 3, rank: 2 }, [{ file: 3, rank: 6 }])

    const after = runFor(state, 2200)

    expect(after.phase).toBe('gap')
    expect(after.roundNumber).toBe(state.roundNumber + 1)
  })

  it('seeds a fresh Tower with zero kills', () => {
    const state = withTower('vertical', { file: 3, rank: 3 })

    expect(firstTower(state).kills).toBe(0)
  })

  it('credits the finishing blow, not every Tower that damaged the Piece', () => {
    // Two splash Towers both in range of one Piece. Both fire in the same tick;
    // the first-listed Tower's shot lands first. Health 3: A deals 2 -> 1,
    // B deals 2 -> -1, so B is the finisher despite A doing half the work.
    const piece = { ...pieceAt('rook', 'victim', { file: 3, rank: 4 }), health: 3 }
    const withA = withTower('splash', { file: 3, rank: 3 })
    const state = liveRound(withTower('splash', { file: 4, rank: 3 }, withA), [piece])

    const after = runFor(state, towerType('splash').fireIntervalMs + DT)

    const [a, b] = after.towers
    expect(a?.kills).toBe(0)
    expect(b?.kills).toBe(1)
  })

  it('counts one kill for an overkill shot', () => {
    // Splash deals 2; a 1-health Piece proves excess damage still counts once.
    const piece = { ...pieceAt('pawn', 'victim', { file: 4, rank: 4 }), health: 1 }
    const state = liveRound(withTower('splash', { file: 3, rank: 3 }), [piece])

    const after = runFor(state, towerType('splash').fireIntervalMs + DT)

    expect(after.pieces).toHaveLength(0)
    expect(firstTower(after).kills).toBe(1)
  })

  it('never credits the Wall, which has no gun', () => {
    const state = liveRound(withTower('wall', { file: 3, rank: 2 }), [
      pieceAt('pawn', 'victim', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, 2000)

    expect(firstTower(after).kills).toBe(0)
  })

  it("a Joker's Clear credits no Tower", () => {
    const state = liveRound(withTower('vertical', { file: 3, rank: 3 }), [
      pieceAt('pawn', 'victim', { file: 4, rank: 4 }),
    ])
    const withJoker = {
      ...state,
      deck: [...state.deck, { id: 'joker', kind: 'joker' as const }],
    }

    const cleared = step(withJoker, { kind: 'clearPieces', cardId: 'joker' })

    expect(cleared.pieces).toHaveLength(0)
    expect(firstTower(cleared).kills).toBe(0)
  })

  it('is lifetime across rounds, never reset', () => {
    // A splash Tower at {3,3} needs two shots to fell the Pawn at {4,4} (2
    // damage into 3 health), and the window below clears both while the Pawn
    // stays inside the eight-neighbour coverage.
    const round1 = liveRound(withTower('splash', { file: 3, rank: 3 }), [
      pieceAt('pawn', 'victim-1', { file: 4, rank: 4 }),
    ])
    const after1 = runFor(round1, 2000)

    expect(after1.phase).toBe('gap')
    expect(firstTower(after1).kills).toBe(1)

    const round2 = liveRound(step(after1, { kind: 'startRound' }), [
      pieceAt('pawn', 'victim-2', { file: 4, rank: 4 }),
    ])
    const after2 = runFor(round2, 2000)

    expect(firstTower(after2).kills).toBe(2)
  })
})

describe('the Wall', () => {
  it('never fires, and never moves fireCooldownMs off its built value of 0', () => {
    // The Wall's geometry is 'none', which covers no square at any range -- but
    // that alone would only make selectTargets return nothing every time,
    // which is a DIFFERENT thing from never entering the cooldown loop at
    // all. Without the guard in fireTowers, a Tower that never finds a
    // target still runs the loop once cooldown crosses fireIntervalMs, and
    // gets clamped to "ready" (fireCooldownMs === fireIntervalMs) rather than
    // banking the shot -- so fireCooldownMs would move off 0 the moment 1000ms
    // passed, guard or no guard. This pins both halves of the guard's claim:
    // nothing takes damage, AND fireCooldownMs never leaves 0.
    const state = liveRound(withTower('wall', { file: 3, rank: 3 }), [
      pawnAt('target-0', { file: 3, rank: 4 }),
    ])

    const after = runFor(state, towerType('wall').fireIntervalMs + DT)
    const survivor = after.pieces.find((piece) => piece.id === 'target-0')

    expect(survivor?.health).toBe(PAWN_HEALTH)
    expect(firstTower(after).fireCooldownMs).toBe(0)
  })
})

describe('tower firing: geometry is respected', () => {
  it('a vertical Tower ignores a Piece on its board rank', () => {
    const state = scenario('vertical', { file: 2, rank: 6 }, [{ file: 4, rank: 6 }])

    expect(runFor(state, 2000).pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('a cross Tower hits along both rank and file', () => {
    const onRank = scenario('cross', { file: 2, rank: 6 }, [{ file: 4, rank: 6 }])
    const onFile = scenario('cross', { file: 4, rank: 4 }, [{ file: 4, rank: 6 }])
    const window = towerType('cross').fireIntervalMs + DT

    expect(wasHit(onRank, runFor(onRank, window), 'target-0')).toBe(true)
    expect(wasHit(onFile, runFor(onFile, window), 'target-0')).toBe(true)
  })

  it('a cross Tower ignores a Piece on a diagonal', () => {
    const state = scenario('cross', { file: 2, rank: 4 }, [{ file: 4, rank: 6 }])

    expect(runFor(state, 500).pieces[0]?.health).toBe(PAWN_HEALTH)
  })

  it('a diagonal Tower hits a Piece on its diagonal', () => {
    const state = scenario('diagonal', { file: 2, rank: 4 }, [{ file: 4, rank: 6 }])

    const after = runFor(state, towerType('diagonal').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(true)
  })

  it('a diagonal Tower ignores a Piece on its own file', () => {
    const state = scenario('diagonal', { file: 4, rank: 4 }, [{ file: 4, rank: 6 }])

    expect(runFor(state, 500).pieces[0]?.health).toBe(PAWN_HEALTH)
  })
})

describe('tower firing: target selection', () => {
  it('shoots the Piece closest to the Core first', () => {
    // Both sit on the Tower's file and within range; one is nearer the Core.
    const state = scenario('vertical', { file: 3, rank: 7 }, [
      { file: 3, rank: 5 },
      { file: 3, rank: 4 },
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)

    const nearer = after.pieces.find((piece) => piece.id === 'target-1')
    const further = after.pieces.find((piece) => piece.id === 'target-0')

    expect(nearer?.health).toBe(PAWN_HEALTH - towerType('vertical').damage)
    expect(further?.health).toBe(PAWN_HEALTH)
  })

  it('breaks ties on the lexicographically smaller id, not numeric order', () => {
    // 'piece-10' < 'piece-2' lexicographically but 10 > 2 numerically, so the
    // two orders disagree here. This pins which comparison selectTargets uses,
    // not merely that some tie-break exists. Both Pawns sit on the cross
    // Tower's own rank, equidistant from the Core, so only the id decides.
    const towerSquare = { file: 3, rank: 4 }
    const state = liveRound(withTower('cross', towerSquare), [
      pawnAt('piece-10', { file: 2, rank: 4 }),
      pawnAt('piece-2', { file: 4, rank: 4 }),
    ])

    const after = runFor(state, towerType('cross').fireIntervalMs + DT)

    expect(wasHit(state, after, 'piece-10')).toBe(true)
    expect(wasHit(state, after, 'piece-2')).toBe(false)
  })

  it('fires once per interval, not once per target', () => {
    const state = scenario('vertical', { file: 3, rank: 7 }, [
      { file: 3, rank: 5 },
      { file: 3, rank: 4 },
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)
    const totalDamage = after.pieces.reduce(
      (sum, piece) => sum + (PAWN_HEALTH - piece.health),
      0,
    )

    expect(totalDamage).toBe(towerType('vertical').damage)
  })
})

describe('tower firing: determinism', () => {
  it('produces identical state from identical inputs', () => {
    const a = runFor(scenario('vertical', { file: 3, rank: 2 }, [{ file: 3, rank: 6 }]), 1500)
    const b = runFor(scenario('vertical', { file: 3, rank: 2 }, [{ file: 3, rank: 6 }]), 1500)

    expect(a).toEqual(b)
  })
})

describe('targets per shot', () => {
  it('a single-target Tower damages only one of two covered Pieces', () => {
    // Vertical fires up its own file; both Pieces sit on it.
    const state = scenario('vertical', { file: 3, rank: 1 }, [
      { file: 3, rank: 2 },
      { file: 3, rank: 3 },
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(1)
  })

  it('a multi-target Tower damages several covered Pieces in one shot', () => {
    // A ring at range 4 covers iff Chebyshev distance is 3 or 4 from the
    // Tower, and is BLIND at 1-2 (the hollow core). All three squares below sit
    // at distance 3, so all three are covered — and the ring hits everything
    // it covers.
    const state = scenario('ring', { file: 3, rank: 3 }, [
      { file: 0, rank: 3 },
      { file: 6, rank: 3 },
      { file: 3, rank: 6 },
    ])

    const after = runFor(state, towerType('ring').fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(3)
  })

  it('caps at its target count', () => {
    // Splash covers the eight neighbours at range 1 but may only hit 5. All six
    // squares below sit at Chebyshev distance 1 from the Tower, so six are
    // covered and one of them is left unhit.
    const state = scenario('splash', { file: 3, rank: 3 }, [
      { file: 2, rank: 2 },
      { file: 2, rank: 3 },
      { file: 3, rank: 2 },
      { file: 3, rank: 4 },
      { file: 4, rank: 2 },
      { file: 4, rank: 3 },
    ])

    const after = runFor(state, towerType('splash').fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(towerType('splash').targetsPerShot)
  })

  it('the toll gate hits everything it covers', () => {
    // A band spans the full file width, so these are spread across the board
    // on purpose — that is the property being tested. Board rank 5 is outside
    // the +/-1 band from board rank 3 and must NOT be hit — a fifth Piece sits
    // there so that claim is actually exercised, not just asserted in a
    // comment: without it, mutating `band` to cover the whole board left
    // this test green.
    const state = scenario('tollgate', { file: 3, rank: 3 }, [
      { file: 0, rank: 4 },
      { file: 3, rank: 4 },
      { file: 7, rank: 2 },
      { file: 6, rank: 3 },
      { file: 3, rank: 5 },
    ])

    const after = runFor(state, towerType('tollgate').fireIntervalMs + DT)
    const hit = state.pieces.filter((piece) => wasHit(state, after, piece.id))

    expect(hit).toHaveLength(4)
  })

  it('is deterministic when more Pieces are covered than can be hit', () => {
    // The point of this test is the id tie-break in selectTargets, which only
    // fires when two candidates tie on Manhattan distance to the Core at
    // {file: 3, rank: 0}. All six squares below sit at Chebyshev distance 1
    // from the splash Tower at {3,3}, so all six are covered, and their
    // Core-distances are:
    //   target-0 {2,2}: |2-3| + |2-0| = 3  (tied for the second slot)
    //   target-1 {2,3}: |2-3| + |3-0| = 4  (tied for the last slot)
    //   target-2 {3,2}: |3-3| + |2-0| = 2  (nearest -- picked outright)
    //   target-3 {3,4}: |3-3| + |4-0| = 4  (tied for the last slot)
    //   target-4 {4,2}: |4-3| + |2-0| = 3  (tied for the second slot)
    //   target-5 {4,3}: |4-3| + |3-0| = 4  (tied for the last slot)
    // targetsPerShot is 5, so the three distance-4 Pieces fight over the last
    // two slots, decided only by id ('target-1' < 'target-3' < 'target-5').
    // Without a tie at the cap boundary, distance alone would decide and the
    // tie-break would never run.
    const build = () =>
      scenario('splash', { file: 3, rank: 3 }, [
        { file: 2, rank: 2 },
        { file: 2, rank: 3 },
        { file: 3, rank: 2 },
        { file: 3, rank: 4 },
        { file: 4, rank: 2 },
        { file: 4, rank: 3 },
      ])

    const a = runFor(build(), 2000)
    const b = runFor(build(), 2000)

    expect(a).toEqual(b)
  })
})

describe('tower firing: Towers block each other', () => {
  it('a Tower between the shooter and the Piece hides the Piece', () => {
    // Vertical fires vertically up its file. A Wall at {3,4} stands
    // between the shooter at {3,7} and a Pawn at {3,2}: geometrically covered,
    // actually hidden.
    const withWall = withTower('wall', { file: 3, rank: 4 })
    const state = liveRound(withTower('vertical', { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
  })

  it('still fires at the same arrangement with no blocker', () => {
    const state = scenario('vertical', { file: 3, rank: 7 }, [{ file: 3, rank: 2 }])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(true)
  })

  it('a Sniper shot passes through a friendly Tower that would hide it from a vertical', () => {
    // The same Wall-and-Pawn arrangement as the vertical occlusion test above:
    // geometrically covered, actually hidden for every other Tower — but the
    // Sniper ignores occlusion, so the Pawn on the far side still dies on the
    // shot (4 damage into its 3 health, inside its 900ms hop).
    const withWall = withTower('wall', { file: 3, rank: 4 })
    const state = liveRound(withTower('sniper', { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, towerType('sniper').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(true)
  })

  it('a Sniper still cannot touch a Piece on the Staging rank', () => {
    // The Sniper's disc geometrically covers rank 8 from {3, 4}, but damage
    // cannot reach the Staging rank for ANY Tower — occlusion immunity is not
    // a bounds exemption. The Pawn steps onto the board at 900ms, so within
    // the shot window it is still staged and must be unharmed.
    const state = liveRound(withTower('sniper', { file: 3, rank: 4 }), [
      pawnAt('staged', { file: 3, rank: 8 }),
    ])

    const after = runFor(state, towerType('sniper').fireIntervalMs + DT)

    expect(after.pieces.find((piece) => piece.id === 'staged')?.health).toBe(PAWN_HEALTH)
  })

  it('retargets to the next-nearest reachable Piece when the nearest is hidden', () => {
    // Core is at {3,0}, so distance to Core is the board rank. target-0 at
    // {3,2} is nearer the Core than target-1 at {3,5} — but the Wall at {3,4}
    // hides it from the shooter at {3,7}. The Tower must hit target-1: nearest
    // REACHABLE, not nearest overall.
    const withWall = withTower('wall', { file: 3, rank: 4 })
    const state = liveRound(withTower('vertical', { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
      pawnAt('target-1', { file: 3, rank: 5 }),
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    expect(wasHit(state, after, 'target-1')).toBe(true)
  })

  it('holds fire when every Piece it covers is hidden, and does not bank the shot', () => {
    // The Pawn is geometrically covered but occluded, and nothing else is in
    // range on the near side of the Wall. The Tower must fire nothing and sit
    // clamped at "ready" — the same cooldown a Tower with no target produces,
    // never a stored shot.
    const withWall = withTower('wall', { file: 3, rank: 4 })
    const state = liveRound(withTower('vertical', { file: 3, rank: 7 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 2 }),
    ])

    const after = runFor(state, towerType('vertical').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    const shooter = after.towers.find((tower) => tower.type === 'vertical')
    expect(shooter?.fireCooldownMs).toBe(towerType('vertical').fireIntervalMs)
  })

  it('a multi-target Tower hits exactly the reachable Pieces', () => {
    // Ring at {3,3} covers Chebyshev distance 3-4. The Wall at {3,4}
    // sits in the hollow core (distance 1) so it never fires, but it hides
    // everything on the file beyond it. target-0 at {3,7} (distance 4, in the
    // ring) is hidden; target-1 at {0,3} (distance 3, in the ring, off the
    // file) is reachable. The ring hits everything it covers, so both would be
    // hit without occlusion; only target-1 is now.
    const withWall = withTower('wall', { file: 3, rank: 4 })
    const state = liveRound(withTower('ring', { file: 3, rank: 3 }, withWall), [
      pawnAt('target-0', { file: 3, rank: 7 }),
      pawnAt('target-1', { file: 0, rank: 3 }),
    ])

    const after = runFor(state, towerType('ring').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    expect(wasHit(state, after, 'target-1')).toBe(true)
  })

  it('a full-height wall hides every rank of the toll gate, not just the center line', () => {
    // Issue #44 scenario. The gate at {0,2} covers ranks 1-3 across the full
    // width; a complete wall at file 2 must hide Pieces on every rank behind it.
    const gate = withTower('tollgate', { file: 0, rank: 2 })
    const wall = withTower(
      'wall',
      { file: 2, rank: 1 },
      withTower('wall', { file: 2, rank: 2 }, withTower('wall', { file: 2, rank: 3 }, gate)),
    )
    const state = liveRound(wall, [
      pawnAt('center', { file: 3, rank: 2 }),
      pawnAt('above', { file: 3, rank: 3 }),
      pawnAt('below', { file: 3, rank: 1 }),
    ])

    const after = runFor(state, towerType('tollgate').fireIntervalMs + DT)

    // A Pawn's 900ms move interval outlasts the shot window, so none of these
    // hop during it — position is stable for the whole assertion.
    expect(wasHit(state, after, 'center')).toBe(false)
    expect(wasHit(state, after, 'above')).toBe(false)
    expect(wasHit(state, after, 'below')).toBe(false)
  })

  it('a partial wall hides only the rank it covers', () => {
    // One Wall on rank 1 shields rank-1 Pieces and nothing else: the rank-2 and
    // rank-3 Pieces are still reachable and still hit.
    const gate = withTower('tollgate', { file: 0, rank: 2 })
    const state = liveRound(withTower('wall', { file: 2, rank: 1 }, gate), [
      pawnAt('sameRank', { file: 3, rank: 1 }),
      pawnAt('centerRank', { file: 3, rank: 2 }),
      pawnAt('otherRank', { file: 3, rank: 3 }),
    ])

    const after = runFor(state, towerType('tollgate').fireIntervalMs + DT)

    expect(wasHit(state, after, 'sameRank')).toBe(false)
    expect(wasHit(state, after, 'centerRank')).toBe(true)
    expect(wasHit(state, after, 'otherRank')).toBe(true)
  })

  it('spares an occluded Piece and still hits a reachable one on another rank', () => {
    // The rank-1 Wall hides the rank-1 Piece nearest the Core; the rank-3 Piece,
    // one rank off the walled line, stays reachable and gets the shot.
    const gate = withTower('tollgate', { file: 0, rank: 2 })
    const state = liveRound(withTower('wall', { file: 2, rank: 1 }, gate), [
      pawnAt('hidden', { file: 3, rank: 1 }),
      pawnAt('exposed', { file: 3, rank: 3 }),
    ])

    const after = runFor(state, towerType('tollgate').fireIntervalMs + DT)

    expect(wasHit(state, after, 'hidden')).toBe(false)
    expect(wasHit(state, after, 'exposed')).toBe(true)
  })

  it('holds fire when every rank is walled, and does not bank the shot', () => {
    // The gate's one covered Piece is hidden and nothing else is in reach; the
    // Tower must fire nothing and sit clamped at "ready" — the same cooldown a
    // Tower with no target produces, never a stored shot.
    const gate = withTower('tollgate', { file: 0, rank: 2 })
    const wall = withTower(
      'wall',
      { file: 2, rank: 1 },
      withTower('wall', { file: 2, rank: 2 }, withTower('wall', { file: 2, rank: 3 }, gate)),
    )
    const state = liveRound(wall, [pawnAt('target-0', { file: 3, rank: 2 })])

    const after = runFor(state, towerType('tollgate').fireIntervalMs + DT)

    expect(wasHit(state, after, 'target-0')).toBe(false)
    const shooter = after.towers.find((tower) => tower.type === 'tollgate')
    expect(shooter?.fireCooldownMs).toBe(towerType('tollgate').fireIntervalMs)
  })
})
