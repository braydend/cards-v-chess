/**
 * The Staging rank: the off-board rank Pieces spawn onto, one past the board's
 * last rank.
 *
 * These tests exist because a Piece used to spawn directly onto the far rank
 * without consulting `state.towers`, so a Tower built there got a Piece placed
 * on top of it — a Piece sharing a Tower's square is one that walked through
 * what should have stopped it. See
 * `docs/superpowers/specs/2026-08-07-piece-staging-rank-design.md`.
 *
 * The whole fix rests on the Staging rank being OUT OF BOUNDS, which is what
 * makes `canBuildOn` refuse it without a new clause. That property is pinned
 * here directly rather than left to be inferred.
 */
import { describe, expect, it } from 'vitest'
import { squareKey, stagingRank } from './board'
import { firstTower, withTower } from './fixtures'
import { canBuildOn, createInitialState, isInBounds, step, tick } from './index'
import type { GameState } from './types'

/** The fixed timestep the app runs at. Tests drive time; nothing reads a clock. */
const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/**
 * Every square of the far rank holding a rank-5 Tower, with the round started.
 *
 * Rank 5 is the diagonal, chosen so a Tower cannot cover the Staging square
 * directly behind it (file distance 0, rank distance 1 — not a diagonal). Its
 * neighbours can, so the Pieces still die; what matters is that the walled
 * square itself never has a Piece standing on it.
 */
function walledFarRank(): GameState {
  const base = createInitialState()
  let state = base

  for (let file = 0; file < base.board.files; file += 1) {
    state = withTower(5, { file, rank: base.board.ranks - 1 }, state)
  }

  return step(state, { kind: 'startRound' })
}

describe('the Staging rank', () => {
  it('is one rank past the board', () => {
    expect(stagingRank({ files: 8, ranks: 8 })).toBe(8)
    expect(stagingRank({ files: 8, ranks: 12 })).toBe(12)
  })

  it('is out of bounds on every file, which is what keeps a Tower off it', () => {
    const { board } = createInitialState()

    for (let file = 0; file < board.files; file += 1) {
      expect(isInBounds(board, { file, rank: stagingRank(board) })).toBe(false)
    }
  })

  it('refuses a build on every one of its squares', () => {
    const state = createInitialState()

    for (let file = 0; file < state.board.files; file += 1) {
      expect(canBuildOn(state, { file, rank: stagingRank(state.board) })).toBe(false)
    }
  })
})

describe('spawning', () => {
  it('places a new Piece on the Staging rank, not the far rank', () => {
    const started = step(createInitialState(), { kind: 'startRound' })
    const afterFirstSpawn = tick(started, DT)
    const piece = afterFirstSpawn.pieces[0]

    expect(piece).toBeDefined()
    expect(piece?.square.rank).toBe(stagingRank(afterFirstSpawn.board))
  })

  it('never lets a Piece share a square with a Tower, with the far rank walled', () => {
    let state = walledFarRank()
    const overlaps: string[] = []
    const seen = new Set<string>()

    for (let elapsed = 0; elapsed < 120_000 && state.phase === 'inProgress'; elapsed += DT) {
      state = tick(state, DT)

      const towerSquares = new Set(state.towers.map((tower) => squareKey(tower.square)))

      for (const piece of state.pieces) {
        seen.add(piece.id)
        if (towerSquares.has(squareKey(piece.square))) {
          overlaps.push(`${piece.id} on ${squareKey(piece.square)} at ${state.roundElapsedMs}ms`)
        }
      }
    }

    // Guards against a vacuous pass: an arrangement that spawned nothing would
    // satisfy the assertion below without testing anything.
    expect(seen.size).toBeGreaterThan(0)
    expect(overlaps).toEqual([])
  })

  it('grinds a walled far-rank square from the Staging rank instead of standing on it', () => {
    const base = createInitialState()
    const built = withTower(5, { file: 3, rank: base.board.ranks - 1 }, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Two Pawn hops' worth of time: the first spawns it, the rest attack.
    const after = runFor(state, 2_000)
    const tower = firstTower(after)
    const pawn = after.pieces[0]

    expect(pawn?.square).toEqual({ file: 3, rank: stagingRank(after.board) })
    expect(tower.health).toBeLessThan(tower.maxHealth)
  })
})
