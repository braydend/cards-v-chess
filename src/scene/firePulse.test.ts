import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { towerRank } from '../data/towerRanks'
import { allSquares, step, tick, type BoardSpec, type BuildableRank, type Tower } from '../game'
import {
  firstTowerId,
  liveRound,
  pawnAt,
  standardCard,
  withDeck,
  withTower,
} from '../game/fixtures'
import {
  accumulatePulses,
  detectShots,
  isPulseLive,
  PULSE_FADE_MS,
  PULSE_SQUARES_PER_SECOND,
  type FirePulse,
} from './firePulse'
import { RANK_COLOURS } from './rankColours'

/** The fixed timestep `src/state/simulation.ts` drives the engine with. */
const FIXED_DT_MS = 1000 / 60

/**
 * Steps enough to clear rank 2's `fireIntervalMs` (600ms placeholder) once,
 * with a little headroom, but short of a second interval and short of the
 * Pawn's first hop (900ms placeholder). Derived from `towerRank(2)` rather
 * than a bare literal, because the engine-driven tests below need the budget
 * to stay strictly between "one interval's worth of ticks" and "two", and
 * strictly under the Pawn's first-hop tick count — retuning either
 * PLACEHOLDER value in `src/data/` must not silently change how many pulses
 * these tests see.
 */
const STEPS_PAST_ONE_INTERVAL = Math.ceil(towerRank(2).fireIntervalMs / FIXED_DT_MS) + 4

/** A Tower with the fields `detectShots` reads, overridable one at a time. */
function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower-1',
    square: { file: 3, rank: 3 },
    cardRank: 2,
    fireCooldownMs: 0,
    health: 8,
    maxHealth: 8,
    damage: 1,
    fireIntervalMs: 600,
    shield: 0,
    damageTaken: 0,
    ...overrides,
  }
}

describe('detectShots', () => {
  it('seeds a first-seen Tower without reporting a shot', () => {
    const last = new Map<string, number>()

    // No previous value means nothing to compare. A Tower built between frames
    // has no shot the renderer can honestly claim.
    expect(detectShots(last, [tower({ fireCooldownMs: 120 })], 1)).toEqual([])
    expect(last.get('tower-1')).toBe(120)
  })

  it('stays silent while the cooldown accumulates', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ fireCooldownMs: 120 })], 1)

    expect(detectShots(last, [tower({ fireCooldownMs: 137 })], 2)).toEqual([])
  })

  it('reports a shot when the cooldown decreases', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ fireCooldownMs: 590 })], 1)

    const pulses = detectShots(last, [tower({ fireCooldownMs: 7 })], 2)

    expect(pulses).toEqual([{ file: 3, boardRank: 3, cardRank: 2, startedAt: 2 }])
  })

  it('stays silent when a target-less Tower clamps up to its interval', () => {
    const last = new Map<string, number>()
    // `fireTowers` holds a Tower with nothing in range at exactly
    // fireIntervalMs rather than banking shots, so the value rises to the
    // interval and then stops. It never drops, so it must never read as a shot.
    detectShots(last, [tower({ fireCooldownMs: 583 })], 1)

    expect(detectShots(last, [tower({ fireCooldownMs: 600 })], 2)).toEqual([])
    expect(detectShots(last, [tower({ fireCooldownMs: 600 })], 3)).toEqual([])
  })

  it('carries the square and card rank, so a Tower destroyed mid-flight still draws', () => {
    const last = new Map<string, number>()
    const placed = { id: 'tower-9', cardRank: 5 as const, square: { file: 6, rank: 2 } }
    detectShots(last, [tower({ ...placed, fireCooldownMs: 480 })], 1)

    const pulses = detectShots(last, [tower({ ...placed, fireCooldownMs: 12 })], 2)

    // The Tower can now leave state entirely and the pulse still knows where it
    // was — the same reason `Ghost` carries its own square in towerDiff.ts.
    expect(detectShots(last, [], 3)).toEqual([])
    expect(pulses).toEqual([{ file: 6, boardRank: 2, cardRank: 5, startedAt: 2 }])
  })

  it('prunes a Tower that has left state', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower()], 1)
    expect(last.has('tower-1')).toBe(true)

    detectShots(last, [], 2)

    // Without this, `reset()` reusing `tower-1` would be compared against a
    // stale cooldown from the previous run and report a shot that never happened.
    expect(last.has('tower-1')).toBe(false)
  })

  it('reports a shot that a real tick produced', () => {
    // The load-bearing test. Everything rests on "a decrease means a shot",
    // which was established by reading `fireTowers` — hand-rolled Towers would
    // only re-assert that reading. This drives the real engine, so a change to
    // `fireTowers`'s cooldown bookkeeping fails here instead of silently
    // killing the animation.
    //
    // Rank 2 is `adjacent` range 1, so a Pawn on the neighbouring square is
    // covered. The Tower is built through the command surface, per CLAUDE.md.
    let state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pawnAt('piece-1', { file: 3, rank: 4 }),
    ])

    const last = new Map<string, number>()
    const pulses: FirePulse[] = []

    // `STEPS_PAST_ONE_INTERVAL` clears one interval with headroom.
    // `cardPlays.ts` builds a Tower at `fireCooldownMs: 0`, so the first shot
    // lands partway through and a second cannot arrive before a full second
    // interval elapses — hence exactly one. It is also short of the Pawn's
    // first 900ms hop, so the Pawn stays covered throughout. `detectShots`
    // runs every step because that is what the frame loop does; sampling
    // once at the end would read a cooldown that has already wrapped.
    for (let i = 0; i < STEPS_PAST_ONE_INTERVAL; i += 1) {
      state = tick(state, FIXED_DT_MS)
      pulses.push(...detectShots(last, state.towers, i / 60))
    }

    expect(pulses).toHaveLength(1)
    expect(pulses[0]).toMatchObject({ file: 3, boardRank: 3, cardRank: 2 })
  })

  it('reports nothing from a real tick while the Piece is out of range', () => {
    // Same Tower, Pawn four squares away — outside rank 2's range of 1. The
    // Tower reaches "ready" and holds there, so the cooldown never falls.
    let state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pawnAt('piece-1', { file: 7, rank: 7 }),
    ])

    const last = new Map<string, number>()
    const pulses: FirePulse[] = []

    for (let i = 0; i < STEPS_PAST_ONE_INTERVAL; i += 1) {
      state = tick(state, FIXED_DT_MS)
      pulses.push(...detectShots(last, state.towers, i / 60))
    }

    expect(pulses).toEqual([])
  })

  it('reports nothing when ♦ Speed lowers the interval while a Tower idles at the clamp', () => {
    // Reproduces the Finding 1 bug from the whole-branch review: a Tower
    // idling at "ready" holds `fireCooldownMs` at its OLD `fireIntervalMs`.
    // `applySupport` in `src/game/support.ts` spreads the Tower when ♦ lowers
    // `fireIntervalMs`, so it never touches `fireCooldownMs` — the very next
    // tick then clamps DOWN to the new interval, a decrease with no shot
    // behind it. Same Tower/Pawn arrangement as the "out of range" test
    // above, so the Pawn never becomes a real target at any point.
    let state = liveRound(withTower(2, { file: 3, rank: 3 }), [
      pawnAt('piece-1', { file: 7, rank: 7 }),
    ])

    const last = new Map<string, number>()

    // Run the Tower up to its idle clamp first, exactly as the "out of
    // range" test does, discarding what `detectShots` reports here — the
    // clamp itself is not a shot and is already covered by that test.
    for (let i = 0; i < STEPS_PAST_ONE_INTERVAL; i += 1) {
      state = tick(state, FIXED_DT_MS)
      detectShots(last, state.towers, i / 60)
    }

    // A 10♦, played through the engine's command surface per CLAUDE.md, not
    // by mutating a Tower by hand.
    const towerId = firstTowerId(state)
    state = withDeck([standardCard('speed-10d', 10, 'diamonds')], state)
    state = step(state, { kind: 'supportTower', cardId: 'speed-10d', towerId })

    const pulses: FirePulse[] = []
    for (let i = 0; i < STEPS_PAST_ONE_INTERVAL; i += 1) {
      state = tick(state, FIXED_DT_MS)
      pulses.push(...detectShots(last, state.towers, i / 60))
    }

    expect(pulses).toEqual([])
  })
})

/** Local, not `BOARD` from data/ — a balance tweak must not break these. */
const board: BoardSpec = { files: 8, ranks: 8 }

/**
 * The red channel written for a square — a proxy for "lit", enough to assert
 * direction and ratios on. `?? 0` because `noUncheckedIndexedAccess` makes a
 * Float32Array read `number | undefined`, and this codebase has no `!`.
 */
function channel(out: Float32Array, file: number, boardRank: number): number {
  return out[(boardRank * board.files + file) * 3] ?? 0
}

function pulseAt(cardRank: BuildableRank, file = 3, boardRank = 3): FirePulse {
  return { file, boardRank, cardRank, startedAt: 0 }
}

describe('accumulatePulses', () => {
  it('lights nothing outside the footprint', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    // Rank 4 is `cross`. The square directly up-file is covered; its diagonal
    // neighbour, at the same Chebyshev distance, is not.
    accumulatePulses(out, board, [pulseAt(4)], 1 / PULSE_SQUARES_PER_SECOND)

    expect(channel(out, 3, 4)).toBeGreaterThan(0)
    expect(channel(out, 4, 4)).toBe(0)
  })

  it('lights nothing the wave has not reached yet', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    // Rank 4 reaches 4 squares. At 50ms the ring has passed d=1 (45ms) but is
    // nowhere near d=4 (182ms).
    accumulatePulses(out, board, [pulseAt(4)], 0.05)

    expect(channel(out, 3, 4)).toBeGreaterThan(0)
    expect(channel(out, 3, 7)).toBe(0)
  })

  it('fades a square from full to nothing over PULSE_FADE_MS', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    const pulse = pulseAt(4)
    const arrival = 1 / PULSE_SQUARES_PER_SECOND
    const fadeSec = PULSE_FADE_MS / 1000

    accumulatePulses(out, board, [pulse], arrival)
    const full = channel(out, 3, 4)

    accumulatePulses(out, board, [pulse], arrival + fadeSec / 2)
    const half = channel(out, 3, 4)

    // Sampled clearly past the fade, not exactly on it. `(arrival + fadeSec)`
    // minus `arrival` in doubles is 0.15999999999999998, a hair under the
    // threshold, which leaves an intensity of 2.2e-16 rather than 0 and would
    // fail the assertion below for no behavioural reason.
    accumulatePulses(out, board, [pulse], arrival + fadeSec + 0.01)

    // Compared against the rank colour rather than a hard-coded float, so a
    // palette change does not break this. `new Color(hex)` converts sRGB into
    // the renderer's working space, which is what the implementation stores.
    expect(full).toBeCloseTo(new Color(RANK_COLOURS[4]).r, 5)
    expect(half).toBeCloseTo(full / 2, 5)
    expect(channel(out, 3, 4)).toBe(0)
  })

  it('zeroes the buffer before summing, so a departed pulse leaves no residue', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(out, board, [pulseAt(4)], 1 / PULSE_SQUARES_PER_SECOND)
    expect(channel(out, 3, 4)).toBeGreaterThan(0)

    accumulatePulses(out, board, [], 1 / PULSE_SQUARES_PER_SECOND)

    expect(channel(out, 3, 4)).toBe(0)
  })

  it('sums two pulses covering the same square', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    const below = pulseAt(4, 3, 3)
    const above = pulseAt(4, 3, 5)
    const arrival = 1 / PULSE_SQUARES_PER_SECOND

    accumulatePulses(out, board, [below], arrival)
    const single = channel(out, 3, 4)

    // {3,4} sits one square from each origin along the file, so both rings
    // reach it at the same instant.
    accumulatePulses(out, board, [below, above], arrival)

    expect(channel(out, 3, 4)).toBeCloseTo(single * 2, 5)
  })

  it('never writes past the squares the board actually has', () => {
    const squareFloats = board.files * board.ranks * 3
    const out = new Float32Array(squareFloats + 12)
    out.fill(-1, squareFloats)

    // Rank 8 is `star` at range 6, so from the corner its footprint runs well
    // past two edges of an 8x8 board.
    accumulatePulses(out, board, [pulseAt(8, 0, 0)], 0.2)

    expect(channel(out, 1, 1)).toBeGreaterThan(0)
    expect(out[squareFloats]).toBe(-1)
    expect(out[squareFloats + 11]).toBe(-1)
  })

  it('indexes the buffer the way allSquares orders squares', () => {
    // Pins the ordering `channel()` above and `accumulatePulses` both assume
    // — rank-major, rank outer, file inner — independently of the index
    // formula under test. Without this, the formula in `channel()` and the
    // one in `accumulatePulses` could agree with each other while both
    // disagreeing with `allSquares`, and every test here would still pass
    // while the renderer drew every pulse transposed.
    allSquares(board).forEach((square, index) => {
      expect(index).toBe(square.rank * board.files + square.file)
    })
  })
})

describe('isPulseLive', () => {
  it('stays live while the ring travels and through the outermost fade', () => {
    // Rank 4, range 4: sweep 182ms, plus 160ms of fade, so 342ms of life.
    const pulse = pulseAt(4)

    expect(isPulseLive(pulse, 0.1)).toBe(true)
    expect(isPulseLive(pulse, 0.3)).toBe(true)
    expect(isPulseLive(pulse, 0.35)).toBe(false)
  })

  it('gives a short-range Tower a shorter life than a long-range one', () => {
    // Rank 2 reaches 1 square (205ms of life); rank 8 reaches 6 (433ms).
    expect(isPulseLive(pulseAt(2), 0.25)).toBe(false)
    expect(isPulseLive(pulseAt(8), 0.25)).toBe(true)
  })
})
