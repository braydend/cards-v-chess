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
import { PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { squareKey, stagingRank } from './board'
import { firstTower, pawnAt, pieceAt, standardCard, towersAt, withDeck, withTower } from './fixtures'
import {
  allSquares,
  canBuildOn,
  createInitialState,
  isInBounds,
  isStuck,
  step,
  tick,
} from './index'
import type { GameState, PieceTypeId } from './types'

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
    // Only Pieces actually caught waiting on the Staging rank while a Tower
    // still stands count here — not every Piece ever seen. Recording every
    // Piece would let this pass even if a future change destroyed each one
    // before it ever attempted entry, which would prove nothing about the
    // wait behind the wall this test is named for.
    const seenWaiting = new Set<string>()

    for (let elapsed = 0; elapsed < 120_000 && state.phase === 'inProgress'; elapsed += DT) {
      state = tick(state, DT)

      const towerSquares = new Set(state.towers.map((tower) => squareKey(tower.square)))

      for (const piece of state.pieces) {
        if (piece.square.rank === stagingRank(state.board) && state.towers.length > 0) {
          seenWaiting.add(piece.id)
        }
        if (towerSquares.has(squareKey(piece.square))) {
          overlaps.push(`${piece.id} on ${squareKey(piece.square)} at ${state.roundElapsedMs}ms`)
        }
      }
    }

    // Guards against a vacuous pass: proves a Piece was actually observed
    // waiting on the Staging rank behind a still-standing wall, not merely
    // that some Piece existed at some point during the run.
    expect(seenWaiting.size).toBeGreaterThan(0)
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

describe('the rank-5 precondition the walled tests rely on', () => {
  // `walledFarRank`, the grind test above, and the round-termination test
  // below all wall the board with rank-5 Towers specifically because rank 5
  // is the diagonal geometry, which cannot cover the Staging square directly
  // behind it (file distance 0, rank distance 1 — not a diagonal). If a
  // future balance tweak changed rank 5's geometry, those tests would fail
  // for a reason invisible from their own diffs; this test asserts the
  // precondition directly so a failure here names its own cause.
  it('rank 5 builds a diagonal Tower', () => {
    expect(TOWER_RANKS[5].geometry).toBe('diagonal')
  })
})

const PIECE_TYPE_IDS = Object.keys(PIECE_TYPES) as PieceTypeId[]

describe('entering the board from the Staging rank', () => {
  /**
   * Where each type's first hop lands. Everything steps or slides one rank in,
   * onto the far rank; a Knight's L crosses two ranks and so skips it.
   */
  function entryRank(typeId: PieceTypeId, ranks: number): number {
    return typeId === 'knight' ? ranks - 2 : ranks - 1
  }

  it.each(PIECE_TYPE_IDS)('gets onto the board on its first hop (%s)', (typeId) => {
    const base = createInitialState()
    const state: GameState = {
      ...base,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId, file: 3 }],
    }

    // One full move interval past the spawn, plus a tick of slack.
    const after = runFor(state, PIECE_TYPES[typeId].moveIntervalMs + DT * 2)
    const piece = after.pieces[0]

    expect(piece).toBeDefined()
    expect(piece?.square.rank).toBe(entryRank(typeId, after.board.ranks))
    expect(isInBounds(after.board, piece?.square ?? { file: -1, rank: -1 })).toBe(true)
  })

  it.each(PIECE_TYPE_IDS)('is never stuck on the Staging rank with the way clear (%s)', (typeId) => {
    const { board, core } = createInitialState()
    const piece = pieceAt(typeId, 'waiting', { file: 3, rank: stagingRank(board) })

    expect(isStuck(piece, board, core.square, new Map())).toBe(false)
  })

  it.each(PIECE_TYPE_IDS)('is never stuck on the Staging rank behind a full wall (%s)', (typeId) => {
    const { board, core } = createInitialState()
    const piece = pieceAt(typeId, 'waiting', { file: 3, rank: stagingRank(board) })

    // Every in-bounds square walled, so whichever candidate the type commits
    // to holds a Tower. That must read as `attackTower` — which is acting —
    // never as `stuck`, or the round could end with Pieces still queued.
    const walled = towersAt(...allSquares(board))

    expect(isStuck(piece, board, core.square, walled)).toBe(false)
  })

  it('records what a hunting Knight on the Staging rank actually does, since it would strand there', () => {
    const { board, core } = createInitialState()

    // Unreachable today: a spawned Knight always starts `hunting: false`, the
    // zig-zag branch only ever produces rank-decreasing hops (so a Knight
    // reaches rank 0 before it could ever start hunting), and `huntCore`'s own
    // candidates must be in bounds — so nothing can put a hunting Knight back
    // on the Staging rank. This test forces the combination directly anyway,
    // to record the actual behaviour rather than leave the design's argument
    // resting on reachability alone.
    const knight = {
      ...pieceAt('knight', 'hunting-knight', { file: 3, rank: stagingRank(board) }),
      hunting: true,
    }

    // `buildDistanceField` (knightDistance.ts) only ever visits in-bounds
    // squares, so the Staging rank was never added to the field. `huntCore`
    // reads that absence as `stuck`. A hunting Knight on the Staging rank
    // would therefore strand there for good — nothing spawns one in that
    // state today, but if a future change ever made it reachable, this is
    // the consequence it would need to reckon with.
    expect(isStuck(knight, board, core.square, new Map())).toBe(true)
  })
})

describe('an Ace played while Pieces wait', () => {
  it('admits them to the board, on new space no Tower could occupy', () => {
    const base = withDeck([standardCard('ace', 'A', 'spades')], createInitialState())
    const waiting = pawnAt('waiting', { file: 3, rank: stagingRank(base.board) })
    const state: GameState = { ...base, phase: 'inProgress', pieces: [waiting], pendingSpawns: [] }

    const grown = step(state, { kind: 'expandBoard', cardId: 'ace' })
    const pawn = grown.pieces[0]

    expect(grown.board.ranks).toBe(base.board.ranks + 1)
    // The rank it was standing on is now the far rank, and the Staging rank has
    // moved up past it.
    expect(pawn?.square.rank).toBe(grown.board.ranks - 1)
    expect(stagingRank(grown.board)).toBe(base.board.ranks + 1)
    expect(grown.towers).toEqual([])
  })
})

describe('round termination with Pieces still on the Staging rank', () => {
  it('ends the round once the wall they are grinding falls', () => {
    const base = createInitialState()
    // Rank 5 is the diagonal, which cannot cover the square directly up-file —
    // so this Tower never shoots its attacker and the grind is a pure countdown
    // on the Tower's health. Nothing else is on the board to shoot it either.
    const built = withTower(5, { file: 3, rank: base.board.ranks - 1 }, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Generous: a Pawn deals 1 per 900ms hop into 20 health, then walks the
    // board to the Core. The point is that it terminates at all — a Piece that
    // never got onto the board must not be able to hang the round.
    const after = runFor(state, 60_000)

    expect(after.phase).toBe('gap')
    expect(after.towers).toEqual([])
    expect(after.pieces).toEqual([])
  })
})
