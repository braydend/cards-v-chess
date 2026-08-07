import { describe, expect, it } from 'vitest'
import { BUILDABLE_RANKS, towerRank, type TowerRankDef } from '../data/towerRanks'
import {
  allSquares,
  coveredSquares,
  coversSquare,
  isInBounds,
  squaresEqual,
  type BoardSpec,
  type GameState,
  type Square,
  type Tower,
} from '../game'
import { firstTower, withTower } from '../game/fixtures'
import {
  blockerSquares,
  coverageSelection,
  selectedFootprint,
  squaresListsEqual,
  type TowerFootprint,
} from './towerCoverage'

/**
 * Towers are built through the engine rather than hand-written, so a test can
 * never pass against a Tower shape the engine would not produce. The Core sits
 * on {file: 3, rank: 0} and `canBuildOn` refuses that square, so every square
 * below avoids it.
 */
const CENTRE: Square = { file: 4, rank: 4 }
const CORNER: Square = { file: 0, rank: 0 }
/** On the far rank of an 8x8 board, so an extra rank always widens a footprint. */
const FAR_RANK: Square = { file: 4, rank: 7 }

/**
 * The Tower on this square, or a loud failure.
 *
 * Throws rather than returning undefined for the reason `firstTower` in
 * `src/game/fixtures.ts` gives: a test that reaches here without a Tower has a
 * broken arrangement, and asserting against `undefined` would misdiagnose it.
 */
function towerOn(state: GameState, square: Square): Tower {
  const tower = state.towers.find((candidate) => squaresEqual(candidate.square, square))
  if (!tower) throw new Error(`expected a Tower on file ${square.file}, rank ${square.rank}`)

  return tower
}

/**
 * The whole overlay decision, end to end, the way `TowerCoverage.tsx` composes
 * it: resolve the selection, then ask for its footprint.
 *
 * The component reads the selection's fields through `?.` so it can key a
 * `useMemo` on them one at a time; passing them positionally here is the same
 * input in the same shape.
 */
function footprintOf(state: GameState, towerId: string, board: BoardSpec = state.board): TowerFootprint {
  const selection = coverageSelection(state.towers, towerId)
  const footprint = selectedFootprint(
    board,
    selection?.cardRank,
    selection?.file,
    selection?.boardRank,
    blockerSquares(state.towers),
  )
  if (!footprint) throw new Error(`expected a footprint for ${towerId}`)

  return footprint
}

/**
 * Whether a footprint is exactly what a ladder entry says, on this board, from
 * this square.
 *
 * Checked against `coversSquare` — the engine's own predicate, the one
 * `fireTowers` tests before it shoots — rather than against a square count,
 * because every value in `src/data/towerRanks.ts` bar the geometry is a
 * placeholder and a balance tweak must not break this file.
 */
function matchesLadder(board: BoardSpec, def: TowerRankDef, footprint: TowerFootprint): boolean {
  return allSquares(board).every((square) => {
    const lit = footprint.covered.some((covered) => squaresEqual(covered, square))

    return lit === coversSquare(def.geometry, def.range, footprint.origin, square)
  })
}

describe('coverageSelection', () => {
  it('returns null when no Tower is selected', () => {
    const state = withTower(3, CENTRE)

    expect(coverageSelection(state.towers, null)).toBeNull()
  })

  it('returns null when the selected Tower is not on the board any more', () => {
    // A Tower destroyed while its panel was open. The overlay clears itself the
    // way the panel and the selection ring already do — the id simply stops
    // being found, so there is no stale id to invalidate.
    const state = withTower(3, CENTRE)

    expect(coverageSelection([], firstTower(state).id)).toBeNull()
  })

  it('reduces the selected Tower to the rank and square that shape its footprint', () => {
    const state = withTower(5, CENTRE)

    expect(coverageSelection(state.towers, firstTower(state).id)).toEqual({
      cardRank: 5,
      file: CENTRE.file,
      boardRank: CENTRE.rank,
    })
  })

  it('picks the selected Tower rather than the first one on the board', () => {
    const state = withTower(4, CORNER, withTower(3, CENTRE))

    expect(coverageSelection(state.towers, towerOn(state, CORNER).id)).toEqual({
      cardRank: 4,
      file: CORNER.file,
      boardRank: CORNER.rank,
    })
  })

  it('distinguishes two Towers of the same rank, so the id selects and not the rank', () => {
    // Duplicate ranks are normal — packs are random, and a Queen's Echo exists
    // precisely to copy a rank onto another square. Selecting on anything but the
    // id would light the wrong Tower's footprint the moment a run holds two of a
    // kind. `CLAUDE.md` makes the same point about Cards being a multiset.
    const state = withTower(3, CORNER, withTower(3, CENTRE))

    expect(coverageSelection(state.towers, towerOn(state, CORNER).id)).toEqual({
      cardRank: 3,
      file: CORNER.file,
      boardRank: CORNER.rank,
    })
    expect(coverageSelection(state.towers, towerOn(state, CENTRE).id)).toEqual({
      cardRank: 3,
      file: CENTRE.file,
      boardRank: CENTRE.rank,
    })
  })
})

describe('selectedFootprint', () => {
  const BOARD: BoardSpec = { files: 8, ranks: 8 }

  it('returns null when there is no selection', () => {
    expect(selectedFootprint(BOARD, undefined, undefined, undefined, [])).toBeNull()
  })

  it('returns null when a selection is missing the square it would be drawn at', () => {
    // The component reads the three fields off a possibly-null selection, so a
    // partial one is reachable. Half a selection draws nothing, not a footprint
    // at the board's origin.
    expect(selectedFootprint(BOARD, 3, undefined, undefined, [])).toBeNull()
    expect(selectedFootprint(BOARD, 3, 4, undefined, [])).toBeNull()
  })

  it("puts the footprint at the selected Tower's square", () => {
    const state = withTower(3, CENTRE)

    expect(footprintOf(state, firstTower(state).id).origin).toEqual(CENTRE)
  })

  it("never includes the Tower's own square", () => {
    // A Tower never covers the square it stands on, and nothing can stand there
    // anyway — a Piece that would land on a Tower attacks it instead.
    const state = withTower(6, CENTRE)

    expect(footprintOf(state, firstTower(state).id).covered).not.toContainEqual(CENTRE)
  })

  it('clips to the board rather than running off the edge', () => {
    const state = withTower(6, CORNER)

    const { covered } = footprintOf(state, firstTower(state).id)

    expect(covered.length).toBeGreaterThan(0)
    expect(covered.every((square) => isInBounds(state.board, square))).toBe(true)
  })

  it("uses each Tower's own rank, not a neighbour's", () => {
    // Two Towers of different ranks on the board at once. Reading the wrong
    // Tower, or sharing one rank across both, is what this catches.
    const state = withTower(4, CORNER, withTower(3, CENTRE))

    expect(matchesLadder(state.board, towerRank(3), footprintOf(state, towerOn(state, CENTRE).id))).toBe(
      true,
    )
    expect(matchesLadder(state.board, towerRank(4), footprintOf(state, towerOn(state, CORNER).id))).toBe(
      true,
    )
  })

  it('matches the ladder definition for every buildable rank', () => {
    for (const cardRank of BUILDABLE_RANKS) {
      const state = withTower(cardRank, CENTRE)

      expect(
        matchesLadder(state.board, towerRank(cardRank), footprintOf(state, firstTower(state).id)),
      ).toBe(true)
    }
  })

  it('reads the extent from the board it is given, so an Ace widens the footprint', () => {
    // The board grows: an Ace adds a rank, and a footprint derived from a
    // module constant would stop at the old edge.
    const state = withTower(3, FAR_RANK)
    const towerId = firstTower(state).id
    const grown: BoardSpec = { files: state.board.files, ranks: state.board.ranks + 1 }

    expect(footprintOf(state, towerId, grown).covered.length).toBeGreaterThan(
      footprintOf(state, towerId).covered.length,
    )
  })
})

describe('selectedFootprint under occlusion', () => {
  it('omits squares another Tower hides', () => {
    // Rank 3 vertical at {4,7}. A rank-7 Wall at {4,5} sits between it and
    // every square below rank 5 on the file, so those leave the footprint even
    // though the geometry covers them.
    const withWall = withTower(7, { file: 4, rank: 5 })
    const state = withTower(3, { file: 4, rank: 7 }, withWall)
    const shooter = state.towers.find((tower) => tower.cardRank === 3)
    if (!shooter) throw new Error('expected the rank-3 Tower')

    const footprint = footprintOf(state, shooter.id)

    expect(footprint.covered).toContainEqual({ file: 4, rank: 6 })
    expect(footprint.covered).not.toContainEqual({ file: 4, rank: 2 })
  })

  it('never lets a Tower hide itself', () => {
    // The selected Tower is in the blocker list (blockerSquares returns every
    // standing Tower), and must not occlude its own shots.
    const state = withTower(3, CENTRE)
    const def = towerRank(3)

    const footprint = footprintOf(state, firstTower(state).id)

    expect(footprint.covered).toEqual(
      coveredSquares(state.board, def.geometry, def.range, CENTRE),
    )
  })
})

describe('blockerSquares', () => {
  it('returns one square per Tower, sorted into a canonical order', () => {
    const withFirst = withTower(3, { file: 4, rank: 5 })
    const state = withTower(7, { file: 2, rank: 3 }, withFirst)

    // Sorted by squareKey, not by build order: {2,3} then {4,5}.
    expect(blockerSquares(state.towers)).toEqual([
      { file: 2, rank: 3 },
      { file: 4, rank: 5 },
    ])
  })
})

describe('squaresListsEqual', () => {
  it('is true for identical lists', () => {
    const a = [{ file: 1, rank: 2 }]
    expect(squaresListsEqual(a, [...a])).toBe(true)
  })

  it('is false on a length mismatch', () => {
    expect(squaresListsEqual([], [{ file: 1, rank: 2 }])).toBe(false)
  })

  it('is false when any square differs', () => {
    expect(squaresListsEqual([{ file: 1, rank: 2 }], [{ file: 1, rank: 3 }])).toBe(false)
  })
})
