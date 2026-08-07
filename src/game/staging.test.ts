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
import {
  firstTower,
  jokerCard,
  liveRound,
  pawnAt,
  pieceAt,
  standardCard,
  towersAt,
  withDeck,
  withTower,
} from './fixtures'
import {
  allSquares,
  canBuildOn,
  coversSquare,
  createInitialState,
  isInBounds,
  isStuck,
  nextMove,
  step,
  tick,
} from './index'
import type { GameState, PieceTypeId, Square } from './types'

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
 * directly behind it (file distance 0, rank distance 1 — not a diagonal).
 * What matters is that the walled square itself never has a Piece standing
 * on it.
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

    // `knightDistanceField` (distanceFields.ts) only ever visits in-bounds
    // squares, so the Staging rank was never added to the field. `huntCore`
    // reads that absence as `stuck`. A hunting Knight on the Staging rank
    // would therefore strand there for good — and, now that damage cannot
    // reach the Staging rank, permanently immune to everything except a
    // Joker's Clear too. `stuck` does not remove a Piece, and `startRound`
    // (step.ts) only resets `phase`, `roundElapsedMs`, and `pendingSpawns` —
    // it does not touch `state.pieces` — so a Piece stranded here would ride
    // along into every subsequent round rather than being swept away at the
    // gap. Nothing spawns one in that state today, but if a future change
    // ever made it reachable, this is the consequence it would need to
    // reckon with.
    expect(isStuck(knight, board, core.square, new Map())).toBe(true)
  })
})

describe('an Ace played while Pieces wait', () => {
  it('admits them to the board, on new space no Tower could occupy', () => {
    const initial = createInitialState()
    // A Tower seeded on the OLD far rank, directly behind where the waiting
    // Piece will land. Without it, asserting "no Tower overlaps the Piece"
    // would be true of an empty fixture regardless of whether expansion works
    // — seeding one here means the assertions below pin the actual property:
    // the newly admitted Piece's square is new space no Tower could ever have
    // been built on, not merely a board with nothing on it.
    const base = withTower(3, { file: 3, rank: initial.board.ranks - 1 }, initial)
    const state: GameState = {
      ...withDeck([standardCard('ace', 'A', 'spades')], base),
      phase: 'inProgress',
      pieces: [pawnAt('waiting', { file: 3, rank: stagingRank(base.board) })],
      pendingSpawns: [],
    }

    const grown = step(state, { kind: 'expandBoard', cardId: 'ace' })
    const pawn = grown.pieces[0]
    const pawnSquare = pawn?.square ?? { file: -1, rank: -1 }

    expect(grown.board.ranks).toBe(base.board.ranks + 1)
    // The rank it was standing on is now the far rank, and the Staging rank has
    // moved up past it.
    expect(pawn?.square.rank).toBe(grown.board.ranks - 1)
    expect(stagingRank(grown.board)).toBe(base.board.ranks + 1)
    // The seeded Tower stands one rank behind the Piece's new square — proving
    // the new rank really is new space, not merely a fixture with no Tower on it.
    expect(grown.towers.some((tower) => squareKey(tower.square) === squareKey(pawnSquare))).toBe(
      false,
    )
    // Issue #15's clause doing its job on the newly admitted Piece: it now
    // occupies an in-bounds square, so `canBuildOn` refuses a build there.
    expect(canBuildOn(grown, pawnSquare)).toBe(false)
  })
})

describe('round termination with Pieces still on the Staging rank', () => {
  it('ends the round once the wall they are grinding falls', () => {
    const base = createInitialState()
    // Rank 5 is the diagonal — kept for continuity with the walled tests
    // above, not because its geometry matters here any more. It used to: under
    // the old "ordinary Piece" rule, a diagonal's inability to cover the
    // square directly up-file was what stopped this Tower from also shooting
    // its attacker, which is what made the grind a pure countdown on the
    // Tower's health rather than a race between the grind and the Tower's own
    // fire. That reasoning is now obsolete — no Tower's geometry can reach the
    // Staging rank at all, so the grind is a pure countdown regardless of
    // which rank builds the wall. The test below is the load-bearing version
    // of that claim: a Tower whose geometry WOULD reach the Staging square, if
    // reach were still the deciding factor.
    const built = withTower(5, { file: 3, rank: base.board.ranks - 1 }, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Generous: a Pawn deals 1 per 900ms hop into rank 5's 22 health
    // (towerRanks.ts), then walks the board to the Core. The point is that it
    // terminates at all — a Piece that never got onto the board must not be
    // able to hang the round.
    const after = runFor(state, 60_000)

    expect(after.phase).toBe('gap')
    expect(after.towers).toEqual([])
    expect(after.pieces).toEqual([])
  })

  // The load-bearing case, now that damage cannot reach the Staging rank:
  // Tower fire can no longer break this stall from the Piece's side, ever —
  // not even when the Tower's geometry genuinely covers the Staging square.
  // Round termination therefore rests ENTIRELY on the grind being a strict
  // countdown on the Tower's health, the same bound roundTermination.test.ts
  // pins for an on-board Tower, exercised here for a Piece that never leaves
  // the Staging rank until the wall finally gives out.
  it("ends the round even when the Tower's geometry reaches the Staging rank, because the grind alone is enough", () => {
    const base = createInitialState()
    const towerSquare: Square = { file: 3, rank: base.board.ranks - 1 }

    // Rank 3 is vertical with range 5 (towerRanks.ts): unlike the rank-5 Tower
    // above, this one's geometry genuinely covers the Staging square directly
    // up-file (pinned in the immunity test below). Under the old "ordinary
    // Piece" rule that would have let the Tower finish the grinding Pawn off
    // outright; under the current rule it cannot touch it at all, so the only
    // way this round can ever end is the Pawn's own grind wearing the Tower
    // down.
    const built = withTower(3, towerSquare, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Generous, as above: 1 damage per 900ms hop into rank 3's 14 health
    // (towerRanks.ts), then the walk to the Core once the wall falls.
    const after = runFor(state, 60_000)

    // Reaches the gap on the grind alone — the Tower can never repay the
    // damage it takes, so there is nothing left for it to be a race against.
    expect(after.phase).toBe('gap')
    expect(after.towers).toEqual([])
    expect(after.pieces).toEqual([])
  })

  // Rank 7 is the Wall: no gun at all, and the highest maxHealth on the
  // ladder (towerRanks.ts). Unlike the two Towers above, it cannot end this
  // standoff from its own side even in principle — there is no shot for the
  // Staging rank's immunity to block in the first place. That makes a Wall on
  // the far rank blocking a staged Piece the purest invulnerable standoff the
  // game can produce, and this pins that the grind alone is still enough.
  it('ends the round even behind a gunless Wall, since the grind alone still wears it down', () => {
    const base = createInitialState()
    const towerSquare: Square = { file: 3, rank: base.board.ranks - 1 }

    // The precondition that makes this the extreme case: a Wall never fires,
    // by construction (`fireTowers` in tick.ts skips `geometry === 'none'`
    // before its cooldown loop even starts), not merely because the Staging
    // rank's immunity happens to block its shot.
    expect(TOWER_RANKS[7].geometry).toBe('none')

    const built = withTower(7, towerSquare, base)
    const state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Generous: 1 damage per 900ms hop into the Wall's 45 health (towerRanks.ts)
    // is 40,500ms of grinding alone, then the walk to the Core once it falls.
    const after = runFor(state, 90_000)

    expect(after.phase).toBe('gap')
    expect(after.towers).toEqual([])
    expect(after.pieces).toEqual([])
  })
})

/**
 * A Piece that has entered the true board can never be pushed back onto the
 * Staging rank. This is not a new mechanic — it already falls out of how
 * movement is built: a forward march only ever decreases or holds a Piece's
 * rank, the Knight's zig-zag candidates are `rank - 2` or `rank - 1`, and
 * hunting (movement.ts) is the one place with rank-increasing moves, but it
 * bounds-checks every candidate before
 * committing to one. Nothing here adds a new rule; this test turns that
 * accident of construction into an enforced invariant, checked exhaustively
 * rather than trusted from reading the code.
 *
 * Deliberately no runtime guard in movement.ts or tick.ts for this — that
 * would be defensive code for a state nothing can produce. This test is the
 * stronger guarantee: it fails at BUILD time, over every combination the
 * movement code can actually be asked to resolve, rather than waiting to
 * catch a violation that reaches a live run.
 */
describe('the Staging rank is one-way', () => {
  it('never produces a move outcome whose destination is out of bounds, for every square, Piece type, handedness, hunting state, and slide bonus, and both moveCount parities', () => {
    const { board, core } = createInitialState()
    const offenders: string[] = []

    for (const square of allSquares(board)) {
      for (const typeId of PIECE_TYPE_IDS) {
        for (const handedness of [1, -1] as const) {
          for (const moveCount of [0, 1]) {
            for (const hunting of [false, true]) {
              for (const slideBonus of [0, 1]) {
                const outcome = nextMove(
                  { typeId, from: square, moveCount, handedness, slideBonus, hunting },
                  board,
                  core.square,
                  new Map(),
                )

                if (outcome.kind === 'move' && !isInBounds(board, outcome.to)) {
                  offenders.push(
                    `${typeId} from ${squareKey(square)} (handedness ${handedness}, ` +
                      `moveCount ${moveCount}, hunting ${hunting}, slideBonus ${slideBonus}) ` +
                      `-> ${squareKey(outcome.to)}`,
                  )
                }
              }
            }
          }
        }
      }
    }

    // Collected rather than asserted inline, so a failure names every
    // offending combination at once instead of dying on the first.
    expect(offenders).toEqual([])
  })
})

/**
 * The Staging rank is SAFE FROM DAMAGE, with exactly one exception: a Joker's
 * Clear.
 *
 * Framed as one rule, not two carve-outs, because that is what it is — damage
 * cannot reach the Staging rank, and Clear is not damage. It is a board wipe,
 * and the designed safety valve for the repair-versus-the-wall stall (see
 * `roundTermination.test.ts` and "Repair versus the wall" in the design doc):
 * a Piece camped forever behind an unbreakable Tower's blind spot would
 * otherwise be exactly as permanent a wall as one on the true board, and
 * Clear has to reach it regardless of where it is standing.
 *
 * This reverses the decision the branch shipped with. Issue #22's initial
 * landing made a Piece on the Staging rank an ordinary Piece — reachable by
 * Tower fire, Clear, and auras alike — and pinned that with tests nearly
 * identical to these but with the opposite assertions, reasoning that the
 * rejected alternative was a safe zone excluded from fire. The repo owner
 * reversed that on review of PR #34: a Piece still assembling on the Staging
 * rank should not be killable by Tower fire before it has even entered the
 * fight. Auras were never in question either way — a King's buff and a
 * Bishop's heal are not damage, so the test below keeps them reaching the
 * Staging rank on purpose, not as an oversight left behind by the reversal.
 */
describe("the Staging rank is safe from damage, except a Joker's Clear", () => {
  it('is immune to a Tower whose geometry reaches the Staging rank', () => {
    const base = createInitialState()
    const towerSquare: Square = { file: 3, rank: base.board.ranks - 1 }
    const stagingSquare: Square = { file: 3, rank: stagingRank(base.board) }

    // Rank 3 is vertical with range 5 (src/data/towerRanks.ts), so a Tower on
    // the far rank covers the Staging square directly up-file at file
    // distance 0 — unlike the diagonal rank 5 the walled tests elsewhere in
    // this file deliberately use, which cannot reach it. This precondition is
    // MORE important now than it was for the old ordinary-Piece rule, not
    // less: it proves this Tower's geometry genuinely reaches the Staging
    // square, so the Pawn surviving below is the immunity rule doing the
    // work, rather than the geometry merely falling short the way it
    // deliberately does for the walled tests.
    expect(coversSquare(TOWER_RANKS[3].geometry, TOWER_RANKS[3].range, towerSquare, stagingSquare)).toBe(
      true,
    )

    const built = withTower(3, towerSquare, base)
    let state: GameState = {
      ...built,
      phase: 'inProgress',
      pendingSpawns: [{ atMs: 0, typeId: 'pawn', file: 3 }],
    }

    // Long enough that a vulnerable Pawn (maxHealth 3, pieceTypes.ts) would
    // have died to rank 3's fire (2 damage every 500ms fire interval,
    // towerRanks.ts) several times over — 8 seconds is 16 shots, eight
    // kills' worth — while short of the roughly 12.6 seconds the Pawn's own
    // blocked-attack grind (half of 2 damage every 900ms move interval) needs
    // to fell the Tower's 14 health. That margin matters: it keeps the Tower
    // standing and the Pawn still blocked — actively grinding, not merely
    // present — for the assertions below.
    for (let elapsed = 0; elapsed < 8_000; elapsed += DT) {
      state = tick(state, DT)
    }

    const pawn = state.pieces[0]

    // Alive, at full health, and never left the Staging square — Tower fire
    // never touched it.
    expect(pawn).toBeDefined()
    expect(pawn?.square).toEqual(stagingSquare)
    expect(pawn?.health).toBe(PIECE_TYPES.pawn.maxHealth)
    // The Tower has taken damage regardless, from the Pawn's own blocked
    // attacks — so this cannot pass because nothing happened at all. The
    // Piece is genuinely grinding against the Tower every hop; it simply
    // cannot be hurt by it in return.
    const tower = firstTower(state)
    expect(tower.health).toBeLessThan(tower.maxHealth)
  })

  // Now pins the "except a Joker's Clear" half of the rule above — MORE
  // load-bearing than when a Piece on the Staging rank was ordinary, since
  // Clear was unremarkable there before: everything died the same way
  // regardless of what reached it. Now Clear is the ONE thing on this list
  // still able to touch a Piece on the Staging rank, so this test is what
  // stops that exception from being silently dropped too.
  it("a Joker's Clear destroys a Piece on the Staging rank", () => {
    const base = withDeck([jokerCard('joker-1')], createInitialState())
    const rank = stagingRank(base.board)

    // Four Pawns rather than one: `clearReward` (ink.ts) floors the TOTAL
    // kill reward, never each Piece individually — a single Pawn's reward of
    // 1 floors to 0, which would let this test pass even if Clear silently
    // skipped every Piece on the Staging rank and paid nothing at all. Four
    // Pawns' total floors to a genuine, non-zero share.
    const waiting = [0, 1, 2, 3].map((file) => pawnAt(`waiting-${file}`, { file, rank }))
    const state = liveRound(base, waiting)

    const cleared = step(state, { kind: 'clearPieces', cardId: 'joker-1' })

    expect(cleared.pieces).toEqual([])
    // Proves Clear actually processed the Pieces standing on the Staging
    // rank, rather than the array merely ending up empty for some unrelated
    // reason: floor(4 * 1 * 0.25) = 1.
    expect(cleared.ink).toBe(1)
  })

  // Auras are not damage, so they were never part of this rule either way — a
  // King's buff speeds a waiting Piece's entry to the board, which is a
  // genuine effect worth keeping, and a Bishop's heal is now a harmless no-op
  // since nothing can hurt a Piece here to begin with. Kept passing so the
  // immunity rule above never grows a second carve-out to exclude auras too.
  it("a King's aura reaches a Piece on the Staging rank", () => {
    const base = createInitialState()
    // `buffedPieceIds` (auras.ts) reads Chebyshev distance 1 as adjacent; this
    // King sits diagonally one square from the Pawn's Staging square, which is
    // exactly that distance.
    const king = pieceAt('king', 'king-1', { file: 4, rank: base.board.ranks - 1 })
    const waiting = pawnAt('waiting', { file: 3, rank: stagingRank(base.board) })
    const state = liveRound(base, [king, waiting])

    const after = tick(state, DT)
    const pawn = after.pieces.find((piece) => piece.id === 'waiting')

    expect(pawn?.buffed).toBe(true)
  })
})
