import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { BISHOP_HEAL_INTERVAL_MS, KING_SPEED_MULTIPLIER } from './auras'
import { liveRound, pawnAt, withTower } from './fixtures'
import { createInitialState, step, tick } from './index'
import { roundIncome } from './ink'
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
 * Pawns exclusively, so this is the only way to get a sliding, reflecting
 * Piece under test — a Pawn's `move` outcome never carries a `handedness`,
 * so it cannot exercise the handedness-threading fix on its own.
 */
function rookOnBackRank(file: number, handedness: Handedness): GameState {
  return {
    ...createInitialState(),
    phase: 'inProgress',
    pieces: [
      {
        id: 'test-rook',
        typeId: 'rook',
        square: { file, rank: 0 },
        prevSquare: { file, rank: 0 },
        health: PIECE_TYPES.rook.maxHealth,
        moveCooldownMs: 0,
        moveCount: 0,
        handedness,
        auraCooldownMs: 0,
        buffed: false,
        hunting: false,
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
    square,
    prevSquare: square,
    health: PIECE_TYPES[typeId].maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    handedness: 1,
    auraCooldownMs: 0,
    buffed: false,
    hunting: false,
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
})

describe('tick: spawning', () => {
  it('spawns the pieces that are due and holds back the rest', () => {
    const state = tick(startedRound(), DT)

    // The placeholder round schedules spawns 1200ms apart, so only the first is due.
    expect(state.pieces).toHaveLength(1)
    expect(state.pendingSpawns.length).toBeGreaterThan(0)
  })

  it('spawns pieces on the far rank', () => {
    const state = tick(startedRound(), DT)

    expect(state.pieces[0]?.square.rank).toBe(state.board.ranks - 1)
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
})

describe('tick: hunting Knight latch', () => {
  it('latches hunting even when the very first hunt hop lands on a Tower', () => {
    // (5,0) has no legal forward hop, so it hunts immediately, and (4,2) is
    // its one distance-1 neighbour (see knightDistance.ts). A Tower there
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
  // fix. A Rook does: it reflects off a file edge, which is the one place a
  // move outcome returns a handedness that differs from the one it was given.
  it('carries the handedness a slide reflection returns, not just the spawned value', () => {
    const rook = rookOnBackRank(6, 1)
    const state = runFor(rook, PIECE_TYPES.rook.moveIntervalMs * 2 + DT)

    // Hop 1: (6,0) -> (7,0), sideways move stays in bounds, handedness stays +1.
    // Hop 2: (7,0) has nowhere further sideways to go at +1, so it reflects
    // back to (6,0) and the returned handedness flips to -1. Discarding that
    // return (the bug this task fixes) would leave handedness at +1 forever.
    expect(state.pieces[0]?.square).toEqual({ file: 6, rank: 0 })
    expect(state.pieces[0]?.handedness).toBe(-1)
  })

  // Task 11 adds a dedicated termination.test.ts covering every Piece type.
  // This test narrows that down to the one case this task's fix addresses —
  // deliberately redundant with that future coverage, not duplication to
  // prune, because a permanent round hang is severe enough to guard twice.
  it('lets a sweeping Rook cross the Core file and leak instead of oscillating forever', () => {
    const rook = rookOnBackRank(6, 1)
    // Five hops: (6,0) -> (7,0) -> (6,0) -> (5,0) -> (4,0) -> Core. Without
    // the fix the Rook oscillates 6<->7 forever and the round never ends.
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
