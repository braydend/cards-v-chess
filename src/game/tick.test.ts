import { describe, expect, it } from 'vitest'
import { CORE_SQUARE } from '../data/board'
import { PIECE_TYPES } from '../data/pieceTypes'
import { VICTORY_ROUND } from '../data/rounds'
import { TOWER_RANKS } from '../data/towerRanks'
import { BISHOP_HEAL_INTERVAL_MS, KING_SPEED_MULTIPLIER } from './auras'
import { liveRound, pawnAt, withTower } from './fixtures'
import { createInitialState, stagingRank, step, tick } from './index'
import { roundIncome } from './ink'
import { EXIT_RING_SIZE } from './tick'
import type { GameState, Handedness, Piece, PieceTypeId, Square, Tower } from './types'

/** The fixed timestep the app runs at. Tests drive time; nothing reads a clock. */
const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

function startedRound(): GameState {
  return step(createInitialState(), { kind: 'startRound' })
}

/**
 * A single Rook placed directly on the back rank, bypassing the spawn
 * pipeline entirely. `startedRound()` always drives round 1, which spawns
 * Pawns exclusively, so this is the only way to get a back-rank slider under
 * test — from rank 0 a Rook hunts, and a Pawn never exercises the hunt at all.
 */
function rookOnBackRank(file: number, handedness: Handedness): GameState {
  return {
    ...createInitialState(),
    phase: 'inProgress',
    pieces: [
      {
        id: 'test-rook',
        typeId: 'rook',
        tier: 'green',
        square: { file, rank: 0 },
        prevSquare: { file, rank: 0 },
        health: PIECE_TYPES.rook.maxHealth,
        maxHealth: PIECE_TYPES.rook.maxHealth,
        moveCooldownMs: 0,
        moveCount: 0,
        handedness,
        auraCooldownMs: 0,
        buffed: false,
        hunting: false,
        promoted: false,
      },
    ],
  }
}

/**
 * A Piece placed directly, bypassing the spawn pipeline, with just the square
 * and any overrides spelled out — everything else defaulted the way a fresh
 * spawn would have it.
 */
function pieceAt(
  id: string,
  typeId: PieceTypeId,
  square: Square,
  overrides: Partial<Piece> = {},
): Piece {
  return {
    id,
    typeId,
    tier: 'green',
    square,
    prevSquare: square,
    health: PIECE_TYPES[typeId].maxHealth,
    maxHealth: PIECE_TYPES[typeId].maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
    promoted: false,
    ...overrides,
  }
}

describe('tick: phase handling', () => {
  it('does nothing during the gap when auto-start is off', () => {
    const initial = createInitialState()

    expect(tick(initial, DT)).toBe(initial)
  })

  it('starts the next round on its own when auto-start is on', () => {
    const waiting = step(createInitialState(), { kind: 'setAutoStart', enabled: true })
    const state = tick(waiting, DT)

    expect(state.phase).toBe('inProgress')
  })

  it('is inert once defeated', () => {
    const defeated: GameState = { ...createInitialState(), phase: 'defeated' }

    expect(tick(defeated, DT)).toBe(defeated)
  })

  it('is inert once victorious', () => {
    const victor: GameState = { ...createInitialState(), phase: 'victory' }

    expect(tick(victor, DT)).toBe(victor)
  })
})

describe('tick: spawning', () => {
  it('spawns the pieces that are due and holds back the rest', () => {
    const state = tick(startedRound(), DT)

    // The placeholder round schedules spawns 1200ms apart, so only the first is due.
    expect(state.pieces).toHaveLength(1)
    expect(state.pendingSpawns.length).toBeGreaterThan(0)
  })

  it('spawns pieces on the Staging rank', () => {
    const state = tick(startedRound(), DT)

    expect(state.pieces[0]?.square.rank).toBe(stagingRank(state.board))
  })

  it('eventually spawns the whole round', () => {
    const started = startedRound()
    const expected = started.pendingSpawns.length
    const state = runFor(started, expected * 1200 + DT)

    expect(state.pendingSpawns).toHaveLength(0)
    expect(state.nextEntityId).toBe(started.nextEntityId + expected)
  })

  it('gives each spawned piece a distinct id', () => {
    const state = runFor(startedRound(), 4000)
    const ids = state.pieces.map((piece) => piece.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('tick: movement', () => {
  it('holds a piece on its square until its interval elapses', () => {
    const spawned = tick(startedRound(), DT)
    const startSquare = spawned.pieces[0]?.square

    const beforeHop = runFor(spawned, PIECE_TYPES.pawn.moveIntervalMs - 2 * DT)

    expect(beforeHop.pieces[0]?.square).toEqual(startSquare)
  })

  it('hops the piece toward the Core once its interval elapses', () => {
    const spawned = tick(startedRound(), DT)
    const startRank = spawned.pieces[0]?.square.rank ?? 0

    const afterHop = runFor(spawned, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const piece = afterHop.pieces[0]

    // The Core is on rank 0, so approaching it means the rank decreases.
    expect(piece?.square.rank).toBeLessThan(startRank)
  })

  it('records the previous square so the renderer can interpolate', () => {
    const spawned = tick(startedRound(), DT)
    const afterHop = runFor(spawned, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const piece = afterHop.pieces[0]

    expect(piece?.prevSquare).not.toEqual(piece?.square)
  })
})

describe('tick: leaks', () => {
  it('damages the Core and removes the piece when one reaches it', () => {
    const started = startedRound()
    const state = runFor(started, 30_000)

    expect(state.leaks).toBeGreaterThan(0)
    expect(state.core.health).toBe(started.core.health - state.leaks)
  })

  it('ends the game when the Core is exhausted', () => {
    const fragile: GameState = {
      ...startedRound(),
      core: { ...createInitialState().core, health: 1 },
    }
    const state = runFor(fragile, 30_000)

    expect(state.phase).toBe('defeated')
    expect(state.core.health).toBe(0)
  })

  it('never drives Core health below zero', () => {
    const fragile: GameState = {
      ...startedRound(),
      core: { ...createInitialState().core, health: 1 },
    }

    expect(runFor(fragile, 60_000).core.health).toBe(0)
  })
})

describe('tick: round completion', () => {
  it('returns to the untimed gap and advances the round number', () => {
    const state = runFor(startedRound(), 60_000)

    expect(state.phase).toBe('gap')
    expect(state.roundNumber).toBe(2)
    expect(state.pendingSpawns).toHaveLength(0)
    expect(state.roundElapsedMs).toBe(0)
  })

  it('completes the round once a hunting Knight leaks, not merely when the board looks stalled', () => {
    // A Knight on the back rank used to have no legal move ever again, and
    // this test proved the round still completed with that Piece left
    // standing. It hunts to the Core instead now, so the same starting
    // position demonstrates the same underlying rule — completion tracks
    // "can anything still act", not the board's contents — through a
    // different route: the Piece disappears by leaking rather than by being
    // left behind stuck. Placed directly rather than spawned, since
    // `startedRound()` always drives round 1, which schedules Pawns
    // exclusively.
    const huntingKnight: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [pieceAt('knight', 'knight', { file: 5, rank: 0 })],
    }
    const state = runFor(huntingKnight, 60_000)

    expect(state.phase).toBe('gap')
    expect(state.pieces).toHaveLength(0)
    expect(state.leaks).toBe(1)
  })

  it('scales the next round up', () => {
    const first = startedRound()
    const second = step(runFor(first, 60_000), { kind: 'startRound' })

    expect(second.pendingSpawns.length).toBeGreaterThan(first.pendingSpawns.length)
  })

  it('lands on the victory phase when round 100 completes, and pays its income', () => {
    const hundredth: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      roundNumber: VICTORY_ROUND,
      pieces: [pieceAt('victory-knight', 'knight', { file: 5, rank: 0 })],
    }

    const state = runFor(hundredth, 60_000)

    expect(state.phase).toBe('victory')
    expect(state.won).toBe(true)
    expect(state.roundNumber).toBe(VICTORY_ROUND)
    expect(state.pieces).toHaveLength(0)
    expect(state.pendingSpawns).toHaveLength(0)
    expect(state.roundElapsedMs).toBe(0)
    expect(state.ink).toBe(roundIncome(VICTORY_ROUND))
  })

  it('completes round 99 into a normal gap at round 100, without the win', () => {
    const ninetyNinth: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      roundNumber: VICTORY_ROUND - 1,
      pieces: [pieceAt('last-knight', 'knight', { file: 5, rank: 0 })],
    }

    const state = runFor(ninetyNinth, 60_000)

    expect(state.phase).toBe('gap')
    expect(state.roundNumber).toBe(VICTORY_ROUND)
    expect(state.won).toBe(false)
  })
})

describe('tick: hunting Knight latch', () => {
  it('latches hunting even when the very first hunt hop lands on a Tower', () => {
    // (5,0) has no legal forward hop, so it hunts immediately, and (4,2) is
    // its one distance-1 neighbour (see distanceFields.ts). A Tower there
    // forces the Knight's very first hunting decision down the attackTower
    // branch — exactly the path that used to leave `hunting` unpersisted on
    // the surviving Piece, because `movePieces`' attackTower branch never
    // touched it.
    const state: GameState = {
      ...withTower(2, { file: 4, rank: 2 }),
      phase: 'inProgress',
      pendingSpawns: [],
      pieces: [pieceAt('n', 'knight', { file: 5, rank: 0 })],
    }

    const after = runFor(state, PIECE_TYPES.knight.moveIntervalMs + DT)

    // Attacked rather than moved, proving this hop actually took the
    // Tower-blocked path rather than some other candidate.
    expect(after.pieces[0]?.square).toEqual({ file: 5, rank: 0 })
    expect(after.towers[0]?.health).toBeLessThan(TOWER_RANKS[2].maxHealth)
    expect(after.pieces[0]?.hunting).toBe(true)
  })
})

describe('tick: motion state', () => {
  it('counts a Piece hops so zig-zag and alternation advance', () => {
    const started = startedRound()
    const state = runFor(started, PIECE_TYPES.pawn.moveIntervalMs * 2 + DT)

    expect(state.pieces[0]?.moveCount).toBeGreaterThan(0)
  })

  it('gives consecutively spawned Pieces opposite handedness', () => {
    const state = runFor(startedRound(), 1200 + DT)
    const sides = state.pieces.map((piece) => piece.handedness)

    expect(new Set(sides).size).toBe(2)
  })

  // A Pawn's `move` outcome never carries a `handedness` (it isn't a slider),
  // so the tests above never actually exercise threading the *returned*
  // handedness forward — they pass on spawn-parity alone, which predates this
  // fix. A Rook no longer reflects off file edges — it hunts from the back
  // rank. The Bishop still reflects during her forward march, so the
  // handedness-threading property this test pins now rides on her.
  it('carries the handedness a slide reflection returns, not just the spawned value', () => {
    const bishop: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        {
          id: 'test-bishop',
          typeId: 'bishop',
          tier: 'green',
          square: { file: 7, rank: 3 },
          prevSquare: { file: 7, rank: 3 },
          health: PIECE_TYPES.bishop.maxHealth,
          maxHealth: PIECE_TYPES.bishop.maxHealth,
          moveCooldownMs: 0,
          moveCount: 0,
          handedness: 1,
          auraCooldownMs: 0,
          buffed: false,
          hunting: false,
          promoted: false,
        },
      ],
    }
    const state = runFor(bishop, PIECE_TYPES.bishop.moveIntervalMs * 2 + DT)

    // Hop 1: the diagonal to (8,2) is off the board, so the Bishop reflects
    // to (6,2) and the returned handedness flips to -1. Hop 2 continues with
    // that flip: (6,2) -> (5,1). Discarding the returned handedness (the bug
    // this test guards) would send hop 2 back to (7,1) instead.
    expect(state.pieces[0]?.square).toEqual({ file: 5, rank: 1 })
    expect(state.pieces[0]?.handedness).toBe(-1)
  })

  // Task 11 adds a dedicated termination.test.ts covering every Piece type.
  // This test narrows that down to the one case this task's fix addresses —
  // deliberately redundant with that future coverage, not duplication to
  // prune, because a permanent round hang is severe enough to guard twice.
  it('lets a back-rank Rook hunt the Core and leak', () => {
    const rook = rookOnBackRank(6, 1)
    // Three hunt hops: (6,0) -> (5,0) -> (4,0) -> Core. Before hunting this
    // same scenario swept the whole rank; the round still ends either way,
    // but the hunt is what issue #13 asked for.
    const state = runFor(rook, PIECE_TYPES.rook.moveIntervalMs * 5 + DT)

    expect(state.phase).not.toBe('inProgress')
    expect(state.leaks).toBeGreaterThan(0)
  })
})

describe('tick: the King aura', () => {
  it('speeds up a Piece standing beside a King', () => {
    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [pieceAt('king', 'king', { file: 0, rank: 7 }), pieceAt('pawn', 'pawn', { file: 1, rank: 7 })],
    }

    // Buffed, the Pawn's 900ms interval becomes 900 * KING_SPEED_MULTIPLIER =
    // 630ms (exact in IEEE754). Unbuffed it would need the full 900ms and
    // would still be standing on rank 7 at this mark.
    const buffedIntervalMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER
    const after = runFor(state, buffedIntervalMs + DT)

    expect(after.pieces.find((piece) => piece.id === 'pawn')?.square.rank).toBe(6)
  })

  it('grants extra slide distance to a buffed slider but not a buffed non-slider, and records both', () => {
    // A single tick, not runFor: the buffed threshold is crossed on this one
    // tick for both the Rook and the Pawn, and both slide away from the King
    // in that same hop. Running longer would let the Rook's own movement carry
    // it out of adjacency before the assertion runs, making `buffed` correctly
    // read false again on some later tick for an unrelated reason — a single
    // tick pins the flag to the moment the buffed hop actually happens.
    const rookBuffedMs = PIECE_TYPES.rook.moveIntervalMs * KING_SPEED_MULTIPLIER
    const pawnBuffedMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER

    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king', 'king', { file: 0, rank: 7 }),
        pieceAt('rook', 'rook', { file: 1, rank: 7 }, { moveCooldownMs: rookBuffedMs }),
        pieceAt('pawn', 'pawn', { file: 1, rank: 6 }, { moveCooldownMs: pawnBuffedMs }),
      ],
    }

    const after = tick(state, DT)

    const king = after.pieces.find((piece) => piece.id === 'king')
    const rook = after.pieces.find((piece) => piece.id === 'rook')
    const pawn = after.pieces.find((piece) => piece.id === 'pawn')

    // The Rook's hop covers 1 + KING_SLIDE_BONUS squares. The Pawn is buffed
    // too — equally adjacent to the King — but is not a slider, so
    // slideBonusFor returns 0 for it regardless: it covers only one square.
    // That contrast is what pins "sliders only".
    expect(rook?.square).toEqual({ file: 1, rank: 5 })
    expect(pawn?.square).toEqual({ file: 1, rank: 5 })
    expect(rook?.buffed).toBe(true)
    expect(king?.buffed).toBe(false)
  })

  it('computes the aura once per tick, from tick-start positions, not per Piece mid-loop', () => {
    // The King is listed first, so it is processed first. Its moveCooldownMs
    // starts at exactly its own 1800ms interval, so it hops this very tick —
    // from (4,6) to (4,5). At tick start King and Pawn are Chebyshev distance
    // 1 apart (buffed, 630ms threshold); after the King's hop they would be
    // distance 2 apart (unbuffed, 900ms threshold). The Pawn's moveCooldownMs
    // starts at 630, so +DT clears 630 but not 900 (630 + DT ≈ 646.67).
    // The Pawn hops this tick if and only if its buff was decided from
    // tick-start positions rather than recomputed after the King had already
    // moved — which is the property under test. Recomputing it per Piece
    // mid-loop would see the King's post-move square and leave the Pawn
    // unbuffed, so it would not hop at all this tick.
    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king', 'king', { file: 4, rank: 6 }, { moveCooldownMs: PIECE_TYPES.king.moveIntervalMs }),
        pieceAt('pawn', 'pawn', { file: 5, rank: 7 }, { moveCooldownMs: 630 }),
      ],
    }

    const after = tick(state, DT)

    expect(after.pieces.find((piece) => piece.id === 'pawn')?.square.rank).toBe(6)
  })

  it('does not stack — a Pawn beside two Kings moves at exactly the cadence of one', () => {
    // Comparing "did it move" alone couldn't tell stacking apart from not: a
    // stacked interval would still complete this hop, just with a different
    // leftover cooldown. Starting cooldown at exactly the buffed threshold and
    // comparing the post-tick remainder pins the actual interval used, not
    // just whether *a* hop happened — this is what would fail if the King
    // aura were ever reworked into something additive.
    const buffedIntervalMs = PIECE_TYPES.pawn.moveIntervalMs * KING_SPEED_MULTIPLIER

    const oneKing: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king1', 'king', { file: 0, rank: 7 }),
        pieceAt('pawn', 'pawn', { file: 1, rank: 7 }, { moveCooldownMs: buffedIntervalMs }),
      ],
    }

    const twoKings: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('king1', 'king', { file: 0, rank: 7 }),
        pieceAt('king2', 'king', { file: 2, rank: 7 }),
        pieceAt('pawn', 'pawn', { file: 1, rank: 7 }, { moveCooldownMs: buffedIntervalMs }),
      ],
    }

    const afterOne = tick(oneKing, DT).pieces.find((piece) => piece.id === 'pawn')
    const afterTwo = tick(twoKings, DT).pieces.find((piece) => piece.id === 'pawn')

    expect(afterOne?.square.rank).toBe(6)
    expect(afterTwo?.square.rank).toBe(6)
    expect(afterTwo?.moveCooldownMs).toBe(afterOne?.moveCooldownMs)
  })
})

describe('tick: the Bishop healing aura', () => {
  it('heals a damaged Piece in range as part of a tick, not just the standalone aura function', () => {
    // Task 7 and 8 each shipped a new aura module whose `tick.ts` wiring stayed
    // completely inert under the suite — revert the `applyHealing` call below
    // and this is the test that would still catch it, since `auras.test.ts`
    // only exercises `applyHealing` directly and never goes through `tick`.
    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      pieces: [
        pieceAt('bishop', 'bishop', { file: 4, rank: 4 }),
        pieceAt('king', 'king', { file: 4, rank: 4 }, { health: 1 }),
      ],
    }

    // Long enough for the Bishop's first pulse to land, with a margin tick so
    // floating-point summation across many small steps cannot undershoot the
    // threshold. The King's own 1800ms move interval keeps it from hopping
    // away within this window, and its 12 max health means the pulse's +2
    // cannot be mistaken for a cap effect.
    const after = runFor(state, BISHOP_HEAL_INTERVAL_MS + DT)

    expect(after.pieces.find((piece) => piece.id === 'king')?.health).toBeGreaterThan(1)
  })

  it('leaves a Piece dead even when a Bishop pulse comes due on the same tick that kills it', () => {
    // Both cooldowns are primed to cross their threshold on this exact tick.
    // `600 - DT + DT` and `1500 - DT + DT` round-trip to exactly 600 and 1500
    // in IEEE754 for this DT, so both the Tower's shot and the Bishop's pulse
    // land on the very same `tick` call — the one scenario where getting the
    // call order backwards in `tick.ts` would actually show up as a survivor.
    const rank2 = TOWER_RANKS[2]
    const tower: Tower = {
      id: 'tower',
      square: { file: 4, rank: 4 },
      cardRank: 2,
      fireCooldownMs: rank2.fireIntervalMs - DT,
      health: rank2.maxHealth,
      maxHealth: rank2.maxHealth,
      damageTaken: 0,
      damage: rank2.damage,
      fireIntervalMs: rank2.fireIntervalMs,
      shield: 0,
      shotsFired: 0,
      kills: 0,
    }

    const state: GameState = {
      ...createInitialState(),
      phase: 'inProgress',
      towers: [tower],
      pieces: [
        // Adjacent to the Tower (distance 1, within its range-1 coverage) and
        // already hurt, so the Tower's 1 damage is exactly lethal.
        pieceAt('target', 'pawn', { file: 4, rank: 5 }, { health: 1 }),
        // Within the Bishop's healing radius of the target (distance 1) but
        // outside the Tower's adjacent coverage (distance 2), so the Tower
        // can only ever target the Pawn, never the Bishop.
        pieceAt('bishop', 'bishop', { file: 5, rank: 6 }, { auraCooldownMs: BISHOP_HEAL_INTERVAL_MS - DT }),
      ],
    }

    const after = tick(state, DT)

    // Correct order — fire, then heal — means fireTowers has already dropped
    // the dead Pawn from the list before applyHealing ever runs, so there is
    // nothing left for the Bishop's same-tick pulse to top up. Swap the order
    // and the Bishop heals the Pawn from 1 to 3 (capped at its max of 3)
    // before the Tower's damage lands, so it would survive this tick at
    // health 2 instead of being gone.
    expect(after.pieces.find((piece) => piece.id === 'target')).toBeUndefined()
  })
})

describe('tick: determinism', () => {
  it('produces identical state from identical inputs', () => {
    const a = runFor(startedRound(), 20_000)
    const b = runFor(startedRound(), 20_000)

    expect(a).toEqual(b)
  })

  it('is refresh-rate independent for a whole-number step ratio', () => {
    const atSixty = runFor(startedRound(), 9000)

    let atThirty = startedRound()
    for (let elapsed = 0; elapsed < 9000; elapsed += DT * 2) {
      atThirty = tick(atThirty, DT * 2)
    }

    expect(atThirty.pieces.map((piece) => piece.square)).toEqual(
      atSixty.pieces.map((piece) => piece.square),
    )
  })
})

describe('Ink from kills', () => {
  // A rank-4 Tower is `cross`, so it covers its own file: the target is
  // blocked directly up-file from it and stays inside coverage while it is
  // shot. The bystander is far enough away that the round is STILL LIVE when
  // the assertion runs — without it the board would empty, the round would
  // complete, and round income would land in the same total, so the assertion
  // would no longer be about kills at all.
  const TOWER_SQUARE = { file: 3, rank: 4 }

  function towerAndTwoPawns(): GameState {
    return liveRound(withTower(4, TOWER_SQUARE), [
      pawnAt('target', { file: 3, rank: 5 }),
      pawnAt('bystander', { file: 7, rank: 7 }),
    ])
  }

  it('pays the kill reward when a Tower destroys a Piece', () => {
    const after = runFor(towerAndTwoPawns(), 1200)

    expect(after.pieces.map((piece) => piece.id)).toEqual(['bystander'])
    expect(after.phase).toBe('inProgress')
    expect(after.ink).toBe(PIECE_TYPES.pawn.inkReward)
  })

  it('pays nothing for a Piece that leaks, which the player did not kill', () => {
    const leaking = liveRound(createInitialState(), [
      pawnAt('leaker', { file: 3, rank: 1 }),
      pawnAt('bystander', { file: 7, rank: 7 }),
    ])
    const after = runFor(leaking, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.leaks).toBe(1)
    expect(after.ink).toBe(0)
  })

  it('pays nothing for a promoted Pawn, which was not destroyed but transformed', () => {
    // The Queen it becomes pays when the Queen dies. Paying here would pay
    // twice for one Piece.
    const promoting = liveRound(createInitialState(), [pawnAt('promoter', { file: 0, rank: 0 })])
    const after = runFor(promoting, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces.map((piece) => piece.typeId)).toEqual(['queen'])
    expect(after.ink).toBe(0)
  })
})

describe('Ink: the defeated branch still pays a kill from the same tick', () => {
  it('pays the kill reward for a Tower kill that lands on the tick the Core falls', () => {
    // The `defeated` branch pays `ink`, which already folds in kill rewards
    // accrued this tick — a deliberate decision, not an oversight, but the
    // only existing defeat test drives defeat with a leak and no Towers, so
    // `ink` is 0 there for the leak reason rather than the branch reason. A
    // single big `tick` call (a whole Pawn move interval, and comfortably
    // past any Tower's fire interval) forces the leaker's one hop and the
    // Tower's one shot to resolve inside the same call, so both events land
    // on the tick that zeroes the Core. The target is a Rook rather than a
    // Pawn purely so its slow move interval keeps it sitting still in the
    // Tower's coverage for the whole call.
    const TOWER_SQUARE = { file: 3, rank: 4 }
    const TARGET_SQUARE = { file: 3, rank: 6 }
    const LEAK_SQUARE = { file: 3, rank: 1 }

    const built = withTower(4, TOWER_SQUARE)
    const fragileCore: GameState = { ...built, core: { ...built.core, health: 1 } }
    const state = liveRound(fragileCore, [
      pawnAt('leaker', LEAK_SQUARE),
      pieceAt('target', 'rook', TARGET_SQUARE, { health: 1 }),
    ])

    const after = tick(state, PIECE_TYPES.pawn.moveIntervalMs)

    expect(after.phase).toBe('defeated')
    expect(after.leaks).toBe(1)
    expect(after.pieces).toHaveLength(0)
    expect(after.ink).toBe(PIECE_TYPES.rook.inkReward)
  })
})

describe('Ink: a kill and round income can land in the same tick', () => {
  it("pays the kill reward for the round's last Piece plus round income for the round it ends", () => {
    // The `gap` branch adds `roundIncome` on top of `ink`, which already
    // folds in this tick's kill rewards — but every existing completion test
    // ends the round with a leak, which pays nothing, so that composition was
    // never exercised. A round whose final Piece dies to Tower fire, rather
    // than leaking, is the ordinary way a round actually ends. Ticking by
    // exactly the Tower's own fire interval is enough on its own: the Rook
    // target's move interval is longer, so it never moves out of coverage.
    const TOWER_SQUARE = { file: 3, rank: 4 }
    const TARGET_SQUARE = { file: 3, rank: 6 }

    const state = liveRound(withTower(4, TOWER_SQUARE), [
      pieceAt('target', 'rook', TARGET_SQUARE, { health: 1 }),
    ])

    const after = tick(state, TOWER_RANKS[4].fireIntervalMs)

    expect(after.phase).toBe('gap')
    expect(after.pieces).toHaveLength(0)
    expect(after.ink).toBe(PIECE_TYPES.rook.inkReward + roundIncome(state.roundNumber))
  })
})

describe('Ink from round completion', () => {
  /** A lone Pawn one square up-file from the Core, so the round ends when it leaks. */
  function oneLeakAway(state: GameState = createInitialState()): GameState {
    return liveRound(state, [pawnAt('leaker', { file: 3, rank: 1 })])
  }

  it('pays a lump sum for the round just played, not the one about to start', () => {
    // The Pawn walks into the Core and nothing is left to act, so the round
    // completes. Leaks pay nothing, which makes every Ink here the lump sum.
    const after = runFor(oneLeakAway(), PIECE_TYPES.pawn.moveIntervalMs + DT * 2)

    expect(after.phase).toBe('gap')
    expect(after.roundNumber).toBe(2)
    expect(after.ink).toBe(roundIncome(1))
    // The off-by-one this guards: `tick` increments roundNumber in the same
    // branch that pays, so reading the incremented value pays for a round that
    // has not been played.
    expect(after.ink).not.toBe(roundIncome(2))
  })

  it('pays nothing when the Core falls, since the run is over', () => {
    const base = createInitialState()
    const doomed = oneLeakAway({ ...base, core: { ...base.core, health: 1 } })
    const after = runFor(doomed, PIECE_TYPES.pawn.moveIntervalMs + DT * 2)

    expect(after.phase).toBe('defeated')
    expect(after.ink).toBe(0)
  })
})

describe('tick: exit records', () => {
  /** A lone Pawn one square up-file from the Core, so its next hop leaks. */
  function oneLeakAway(state: GameState = createInitialState()): GameState {
    return liveRound(state, [pawnAt('leaker', { file: 3, rank: 1 })])
  }

  it('records a leak with the leaker id, type, and the square it left from', () => {
    const after = runFor(oneLeakAway(), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.recentExits).toEqual([
      { pieceId: 'leaker', typeId: 'pawn', reason: 'leak', from: { file: 3, rank: 1 } },
    ])
  })

  it("never records the Core's own square, which a leaking Piece never occupies", () => {
    // `nextMove` returns `reachCore` for the square it WOULD step to, and
    // `movePieces` drops the Piece without ever assigning it — so the renderer
    // has to lunge from the square recorded here to a Core square the engine
    // never wrote.
    const after = runFor(oneLeakAway(), PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.recentExits[0]?.from).not.toEqual(CORE_SQUARE)
  })

  it('records the square reached mid-tick, not the square the Piece began the tick on', () => {
    // One tick, two hops: the Pawn steps rank 2 -> 1 and then leaks, so `from`
    // must be rank 1. Reading `piece.square` instead of the hop loop's own
    // `square` would report rank 2, and the renderer would lunge from a square
    // the Piece had already left.
    const state = liveRound(createInitialState(), [pawnAt('leaker', { file: 3, rank: 2 })])
    const after = tick(state, PIECE_TYPES.pawn.moveIntervalMs * 2)

    expect(after.recentExits[0]?.from).toEqual({ file: 3, rank: 1 })
  })

  it('records nothing when a Tower kills a Piece, since a kill is the absence of a record', () => {
    // Rank 2 deals 3 to a Pawn's 3 health, so one shot at 400ms kills it well
    // inside the Pawn's 900ms hop — no movement, no leak, nothing recorded.
    // Rank 2 is 'adjacent' with range 1, and the victim sits at Chebyshev
    // distance 1 from the Tower, so it is covered from the first tick.
    const armed = withTower(2, { file: 0, rank: 4 })
    const state = liveRound(armed, [pawnAt('victim', { file: 0, rank: 5 })])
    const after = runFor(state, TOWER_RANKS[2].fireIntervalMs + DT)

    expect(after.pieces).toHaveLength(0)
    expect(after.recentExits).toEqual([])
  })

  it('drops the oldest record past the ring size and keeps the newest', () => {
    const filled = Array.from({ length: EXIT_RING_SIZE }, (_, index) => ({
      pieceId: `old-${index}`,
      typeId: 'pawn' as const,
      reason: 'leak' as const,
      from: { file: 0, rank: 0 },
    }))
    const state = oneLeakAway({ ...createInitialState(), recentExits: filled })
    const after = runFor(state, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.recentExits).toHaveLength(EXIT_RING_SIZE)
    expect(after.recentExits[0]?.pieceId).toBe('old-1')
    expect(after.recentExits.at(-1)?.pieceId).toBe('leaker')
  })

  it('keeps records across a round boundary, because auto-start can wipe them mid-frame', () => {
    // The load-bearing lifetime test. `tick` auto-starts by calling `step` from
    // inside itself, and `advance` runs up to five ticks per emit — so a leak,
    // the round ending, and the auto-start can all land inside one frame. If
    // `startRound` cleared the ring, the record would be gone before the
    // renderer's only publish, and the last leak of a round would burst in
    // place instead of lunging.
    const base = createInitialState()
    const after = runFor(
      oneLeakAway({ ...base, autoStart: true }),
      PIECE_TYPES.pawn.moveIntervalMs + DT * 4,
    )

    expect(after.phase).toBe('inProgress')
    expect(after.roundNumber).toBe(2)
    expect(after.recentExits.map((exit) => exit.pieceId)).toContain('leaker')
  })
})

describe('tick: yellow coverage avoidance', () => {
  it('a yellow Knight hops to an uncovered d−1 landing rather than a covered one', () => {
    // The rank-2 Tower at (2,1) covers (1,1) — the Knight's first d−1 landing —
    // but not (4,2), its second.
    const state = withTower(2, { file: 2, rank: 1 })
    const knight = pieceAt('hop', 'knight', { file: 2, rank: 3 }, { tier: 'yellow', hunting: true })

    const after = runFor(liveRound(state, [knight]), PIECE_TYPES.knight.moveIntervalMs + DT)

    expect(after.pieces[0]?.square).toEqual({ file: 4, rank: 2 })
  })

  it('a round whose every d−1 landing is covered still terminates', () => {
    // Both of the Knight's d−1 landings, (1,1) and (4,2), are covered. Avoidance
    // falls back to today's first candidate, which sits under the Tower at
    // (2,1): the Knight is shot down, and with nothing left to act the round
    // completes rather than stalling.
    const covered = withTower(2, { file: 2, rank: 1 })
    const state = withTower(2, { file: 4, rank: 3 }, covered)
    const knight = pieceAt('doomed', 'knight', { file: 2, rank: 3 }, { tier: 'yellow', hunting: true })

    const after = runFor(liveRound(state, [knight]), 60_000)

    expect(after.phase).toBe('gap')
    expect(after.pieces).toHaveLength(0)
  })
})
