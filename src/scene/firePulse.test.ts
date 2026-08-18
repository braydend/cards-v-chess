import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { towerType } from '../data/towerTypes'
import { allSquares, tick, type BoardSpec, type PieceTier, type Tower, type TowerTypeId } from '../game'
import { liveRound, pawnAt, pieceAt, withTower } from '../game/fixtures'
import {
  accumulatePulses,
  detectShots,
  isPulseLive,
  PULSE_FADE_MS,
  PULSE_SQUARES_PER_SECOND,
  type FirePulse,
} from './firePulse'
import { TOWER_COLOURS } from './rankColours'

/** The fixed timestep `src/state/simulation.ts` drives the engine with. */
const FIXED_DT_MS = 1000 / 60

/**
 * Steps enough to clear a splash Tower's `fireIntervalMs` (600ms) once, with a
 * little headroom, but short of a second interval and short of the Pawn's
 * first hop (900ms). Derived from `towerType('splash')` rather than a bare
 * literal, because the engine-driven tests below need the budget to stay
 * strictly between "one interval's worth of ticks" and "two", and strictly
 * under the Pawn's first-hop tick count — retuning either PLACEHOLDER value in
 * `src/data/` must not silently change how many pulses these tests see.
 */
const STEPS_PAST_ONE_INTERVAL = Math.ceil(towerType('splash').fireIntervalMs / FIXED_DT_MS) + 4

/** A Tower with the fields `detectShots` reads, overridable one at a time. */
function tower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower-1',
    square: { file: 3, rank: 3 },
    type: 'vertical',
    range: towerType('vertical').range,
    fireCooldownMs: 0,
    health: 8,
    maxHealth: 8,
    damage: 1,
    fireIntervalMs: 600,
    shield: 0,
    damageTaken: 0,
    shotsFired: 0,
    kills: 0,
    upgradeCounts: { damage: 0, fireRate: 0, health: 0 },
    fireIntervalBaseMs: 600,
    ...overrides,
  }
}

describe('detectShots', () => {
  it('seeds a first-seen Tower without reporting a shot', () => {
    const last = new Map<string, number>()

    // No previous value means nothing to compare. A Tower built between frames
    // has no shot the renderer can honestly claim.
    expect(detectShots(last, [tower({ shotsFired: 3 })], 1)).toEqual([])
    expect(last.get('tower-1')).toBe(3)
  })

  it('stays silent while the shot counter does not move', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ shotsFired: 3 })], 1)

    expect(detectShots(last, [tower({ shotsFired: 3 })], 2)).toEqual([])
  })

  it('reports a shot when the shot counter advances', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ shotsFired: 2 })], 1)

    const pulses = detectShots(last, [tower({ shotsFired: 3 })], 2)

    expect(pulses).toEqual([
      { file: 3, boardRank: 3, type: 'vertical', range: 5, startedAt: 2 },
    ])
  })

  it('reports one pulse per shot when the counter advances by more than one', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower({ shotsFired: 0 })], 1)

    const pulses = detectShots(last, [tower({ shotsFired: 2 })], 2)

    expect(pulses).toEqual([
      { file: 3, boardRank: 3, type: 'vertical', range: 5, startedAt: 2 },
      { file: 3, boardRank: 3, type: 'vertical', range: 5, startedAt: 2 },
    ])
  })

  it('stays silent when a miss spends the interval without advancing the counter', () => {
    const last = new Map<string, number>()
    // The very signal the counter exists to provide: a shot event that
    // acquired no target. On the old cooldown-diff this read as a shot — a
    // miss spends the interval exactly like a real shot — so the firing pulse
    // played for a Tower that never fired. `shotsFired` not moving is the
    // engine saying "no shot happened", whatever the cooldown did.
    detectShots(last, [tower({ shotsFired: 0, fireCooldownMs: 583 })], 1)

    expect(detectShots(last, [tower({ shotsFired: 0, fireCooldownMs: 7 })], 2)).toEqual([])
  })

  it('carries the square and type, so a Tower destroyed mid-flight still draws', () => {
    const last = new Map<string, number>()
    const placed = {
      id: 'tower-9',
      type: 'diagonal' as const,
      range: towerType('diagonal').range,
      square: { file: 6, rank: 2 },
    }
    detectShots(last, [tower({ ...placed, shotsFired: 2 })], 1)

    const pulses = detectShots(last, [tower({ ...placed, shotsFired: 3 })], 2)

    // The Tower can now leave state entirely and the pulse still knows where it
    // was — the same reason `Ghost` carries its own square in towerDiff.ts.
    expect(detectShots(last, [], 3)).toEqual([])
    expect(pulses).toEqual([{ file: 6, boardRank: 2, type: 'diagonal', range: 5, startedAt: 2 }])
  })

  it('prunes a Tower that has left state', () => {
    const last = new Map<string, number>()
    detectShots(last, [tower()], 1)
    expect(last.has('tower-1')).toBe(true)

    detectShots(last, [], 2)

    // Without this, `reset()` reusing `tower-1` would be compared against a
    // stale counter from the previous run and report a shot that never happened.
    expect(last.has('tower-1')).toBe(false)
  })

  it('fires no pulse for a shot the Tower failed to detect', () => {
    // A black Rook under a vertical Tower — the same arrangement miss.test.ts
    // uses to pin the miss, so on the run's seed it is known to produce
    // misses. A miss spends the fire interval but fires nothing, so
    // `fireCooldownMs` drops exactly as a real shot would: the renderer cannot
    // tell the two apart from the cooldown alone. The signal has to come from
    // the engine — how many shot events actually acquired a target.
    //
    // The assertion is seed-independent: whatever the seed does, the black
    // twin fires one pulse per shot that acquired it, i.e. total shots minus
    // misses. The green twin is never missed, so its pulse count IS the total
    // shot count, and `recentMisses.length` is the miss count.
    function countPulses(tier: PieceTier): { pulses: number; misses: number } {
      const rook = pieceAt('rook', 'sneak', { file: 3, rank: 4 })
      let state = liveRound(withTower('vertical', { file: 3, rank: 2 }), [{ ...rook, tier }])
      const windowMs = towerType('vertical').fireIntervalMs * 6 + FIXED_DT_MS

      const last = new Map<string, number>()
      let pulses = 0
      for (let elapsed = 0; elapsed < windowMs; elapsed += FIXED_DT_MS) {
        state = tick(state, FIXED_DT_MS)
        pulses += detectShots(last, state.towers, elapsed / 1000).length
      }

      return { pulses, misses: state.recentMisses.length }
    }

    const green = countPulses('green')
    const black = countPulses('black')

    // The arrangement really misses on this seed; otherwise the comparison
    // below proves nothing about the miss path.
    expect(black.misses).toBeGreaterThan(0)
    // The black twin fires one pulse per acquired shot, never per miss.
    expect(black.pulses).toBe(green.pulses - black.misses)
  })

  it('reports a shot that a real tick produced', () => {
    // The load-bearing test. Everything rests on "a decrease means a shot",
    // which was established by reading `fireTowers` — hand-rolled Towers would
    // only re-assert that reading. This drives the real engine, so a change to
    // `fireTowers`'s cooldown bookkeeping fails here instead of silently
    // killing the animation.
    //
    // Splash is `adjacent` range 1, so a Pawn on the neighbouring square is
    // covered. The Tower is built through the command surface, per CLAUDE.md.
    let state = liveRound(withTower('splash', { file: 3, rank: 3 }), [
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
    expect(pulses[0]).toMatchObject({ file: 3, boardRank: 3, type: 'splash' })
  })

  it('reports nothing from a real tick while the Piece is out of range', () => {
    // Same Tower, Pawn far away — outside splash's range of 1. The Tower
    // reaches "ready" and holds there, so the cooldown never falls.
    let state = liveRound(withTower('splash', { file: 3, rank: 3 }), [
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

function pulseAt(type: TowerTypeId, file = 3, boardRank = 3): FirePulse {
  return { file, boardRank, type, range: towerType(type).range, startedAt: 0 }
}

describe('accumulatePulses', () => {
  it('lights nothing outside the footprint', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    // Cross. The square directly up-file is covered; its diagonal neighbour,
    // at the same Chebyshev distance, is not.
    accumulatePulses(out, board, [pulseAt('cross')], 1 / PULSE_SQUARES_PER_SECOND, [])

    expect(channel(out, 3, 4)).toBeGreaterThan(0)
    expect(channel(out, 4, 4)).toBe(0)
  })

  it('lights nothing the wave has not reached yet', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    // Cross reaches 4 squares. At 50ms the ring has passed d=1 (45ms) but is
    // nowhere near d=4 (182ms).
    accumulatePulses(out, board, [pulseAt('cross')], 0.05, [])

    expect(channel(out, 3, 4)).toBeGreaterThan(0)
    expect(channel(out, 3, 7)).toBe(0)
  })

  it('fades a square from full to nothing over PULSE_FADE_MS', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    const pulse = pulseAt('cross')
    const arrival = 1 / PULSE_SQUARES_PER_SECOND
    const fadeSec = PULSE_FADE_MS / 1000

    accumulatePulses(out, board, [pulse], arrival, [])
    const full = channel(out, 3, 4)

    accumulatePulses(out, board, [pulse], arrival + fadeSec / 2, [])
    const half = channel(out, 3, 4)

    // Sampled clearly past the fade, not exactly on it. `(arrival + fadeSec)`
    // minus `arrival` in doubles is 0.15999999999999998, a hair under the
    // threshold, which leaves an intensity of 2.2e-16 rather than 0 and would
    // fail the assertion below for no behavioural reason.
    accumulatePulses(out, board, [pulse], arrival + fadeSec + 0.01, [])

    // Compared against the type colour rather than a hard-coded float, so a
    // palette change does not break this. `new Color(hex)` converts sRGB into
    // the renderer's working space, which is what the implementation stores.
    expect(full).toBeCloseTo(new Color(TOWER_COLOURS.cross).r, 5)
    expect(half).toBeCloseTo(full / 2, 5)
    expect(channel(out, 3, 4)).toBe(0)
  })

  it('zeroes the buffer before summing, so a departed pulse leaves no residue', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(out, board, [pulseAt('cross')], 1 / PULSE_SQUARES_PER_SECOND, [])
    expect(channel(out, 3, 4)).toBeGreaterThan(0)

    accumulatePulses(out, board, [], 1 / PULSE_SQUARES_PER_SECOND, [])

    expect(channel(out, 3, 4)).toBe(0)
  })

  it('lights across the full board width for the tollgate band, not just file ± range', () => {
    // Finding 1 (whole-branch review): tollgate's range (1) bounds ranks only —
    // `coversSquare('band', ...)` covers every file. The old scan window
    // clipped to `file ± range` regardless of geometry, so a shot from file 3
    // lit only files 2-4 and never reached file 7. This pins file 7 — five
    // files past the old window's far edge — lighting once the wave carrying
    // Chebyshev distance 4 (3 to 7) has arrived.
    const out = new Float32Array(board.files * board.ranks * 3)
    const pulse = pulseAt('tollgate', 3, 3)
    const arrival = 4 / PULSE_SQUARES_PER_SECOND

    accumulatePulses(out, board, [pulse], arrival, [])

    expect(channel(out, 7, 3)).toBeGreaterThan(0)
    // File 0 is Chebyshev distance 3 from the origin — already arrived too.
    expect(channel(out, 0, 3)).toBeGreaterThan(0)
  })

  it('still bounds the band by rank even though its files are unbounded', () => {
    // `band` covers `rankDistance <= range`, never the whole board in ranks.
    // A very late sample would catch a scan window that forgot the rank bound
    // just as easily as an early one would miss a fix to the file bound.
    const out = new Float32Array(board.files * board.ranks * 3)
    const pulse = pulseAt('tollgate', 3, 3)

    accumulatePulses(out, board, [pulse], 10, [])

    // Rank distance 2 from the origin's rank 3, past tollgate's range of 1.
    expect(channel(out, 3, 5)).toBe(0)
  })

  it('sums two pulses covering the same square', () => {
    const out = new Float32Array(board.files * board.ranks * 3)
    const below = pulseAt('cross', 3, 3)
    const above = pulseAt('cross', 3, 5)
    const arrival = 1 / PULSE_SQUARES_PER_SECOND

    accumulatePulses(out, board, [below], arrival, [])
    const single = channel(out, 3, 4)

    // {3,4} sits one square from each origin along the file, so both rings
    // reach it at the same instant.
    accumulatePulses(out, board, [below, above], arrival, [])

    expect(channel(out, 3, 4)).toBeCloseTo(single * 2, 5)
  })

  it('never writes past the squares the board actually has', () => {
    const squareFloats = board.files * board.ranks * 3
    const out = new Float32Array(squareFloats + 12)
    out.fill(-1, squareFloats)

    // Ring at range 4, so from the corner its footprint still wants files and
    // ranks below 0 on both axes, which get clamped to the board's edges —
    // that clamping is what this test guards. The probed square sits at
    // Chebyshev distance 4 from the corner: inside the ring's outer edge, not
    // its distance 1-2 hollow core, which is blind and would read back 0
    // regardless of whether the bounds guard worked.
    accumulatePulses(out, board, [pulseAt('ring', 0, 0)], 0.2, [])

    expect(channel(out, 4, 4)).toBeGreaterThan(0)
    expect(out[squareFloats]).toBe(-1)
    expect(out[squareFloats + 11]).toBe(-1)
  })

  it('does not light a square another Tower occludes, but keeps the near side', () => {
    // A vertical Tower at {3,7} fires along the file. A Wall at {3,4} stands
    // between it and {3,2}: geometrically covered, actually blocked. The pulse
    // must not sweep past the Wall — the same `isOccluded` the engine consults
    // before a shot, so the animation cannot claim a shot the Tower is blocked
    // from making. {3,6}, between the shooter and the Wall, still lights.
    const shooter = { ...tower(), id: 'shooter', square: { file: 3, rank: 7 } }
    const wall = { ...tower(), id: 'wall', type: 'wall' as const, square: { file: 3, rank: 4 } }
    const pulse: FirePulse = {
      file: 3,
      boardRank: 7,
      type: 'vertical',
      range: towerType('vertical').range,
      startedAt: 0,
    }

    // {3,2} is 5 squares up the file: 5/22s for the ring to arrive, then this
    // sample lands halfway through that square's fade window. The same instant
    // with and without the Wall isolates occlusion from timing.
    const arrival = 5 / PULSE_SQUARES_PER_SECOND + PULSE_FADE_MS / 1000 / 2

    const unblocked = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(unblocked, board, [pulse], arrival, [shooter])
    expect(channel(unblocked, 3, 2)).toBeGreaterThan(0)

    const blocked = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(blocked, board, [pulse], arrival, [shooter, wall])
    expect(channel(blocked, 3, 2)).toBe(0)

    // The shooter's own square in the blocker list never occludes its own
    // shots (`isOccluded` excludes the origin), so {3,6} — between the shooter
    // and the Wall — still lights at its own arrival instant.
    const nearArrival = 1 / PULSE_SQUARES_PER_SECOND
    accumulatePulses(blocked, board, [pulse], nearArrival, [shooter, wall])
    expect(channel(blocked, 3, 6)).toBeGreaterThan(0)
  })

  it('does not light a band square on a walled rank, but keeps the near side', () => {
    // A tollgate band at {0,3} sweeps ranks 2-4 across the full width. A Wall
    // at {2,4} hides the band's rank-4 line. {3,4} is geometrically covered
    // but occluded — the center line at rank 3 already worked, so this pins
    // the off-rank line the wall now hides. {1,4}, between the shooter and the
    // Wall, still lights.
    const shooter = { ...tower(), id: 'shooter', type: 'tollgate' as const, square: { file: 0, rank: 3 } }
    const wall = { ...tower(), id: 'wall', type: 'wall' as const, square: { file: 2, rank: 4 } }
    const pulse: FirePulse = {
      file: 0,
      boardRank: 3,
      type: 'tollgate',
      range: towerType('tollgate').range,
      startedAt: 0,
    }

    // {3,4} is 3 squares away: 3/22s for the ring to arrive, then this sample
    // lands halfway through that square's fade window. The same instant with and
    // without the Wall isolates occlusion from timing.
    const arrival = 3 / PULSE_SQUARES_PER_SECOND + PULSE_FADE_MS / 1000 / 2

    const unblocked = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(unblocked, board, [pulse], arrival, [shooter])
    expect(channel(unblocked, 3, 4)).toBeGreaterThan(0)

    const blocked = new Float32Array(board.files * board.ranks * 3)
    accumulatePulses(blocked, board, [pulse], arrival, [shooter, wall])
    expect(channel(blocked, 3, 4)).toBe(0)

    // {1,4} — between the shooter and the Wall — still lights at its own
    // arrival instant.
    const nearArrival = 1 / PULSE_SQUARES_PER_SECOND
    accumulatePulses(blocked, board, [pulse], nearArrival, [shooter, wall])
    expect(channel(blocked, 1, 4)).toBeGreaterThan(0)
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
    // Cross, range 4: sweep 182ms, plus 160ms of fade, so 342ms of life.
    const pulse = pulseAt('cross')

    expect(isPulseLive(pulse, 0.1, board)).toBe(true)
    expect(isPulseLive(pulse, 0.3, board)).toBe(true)
    expect(isPulseLive(pulse, 0.35, board)).toBe(false)
  })

  it('gives a short-range Tower a shorter life than a long-range one', () => {
    // Splash reaches 1 square (205ms of life); ring reaches 4 (342ms).
    expect(isPulseLive(pulseAt('splash'), 0.25, board)).toBe(false)
    expect(isPulseLive(pulseAt('ring'), 0.25, board)).toBe(true)
  })

  it('outlives a bounded-by-range life for the tollgate band, which reaches the far edge', () => {
    // Finding 1 (whole-branch review): `band` covers the full board width, not
    // `range` squares either side. Tollgate is range 1: the old, wrong formula
    // (`range / PULSE_SQUARES_PER_SECOND + FADE_SECONDS`) declares this pulse
    // dead at 1/22 + 0.16 = 0.2045s. From file 3 on an 8-file board the
    // farthest covered file is 7, at Chebyshev distance 4 — the ring does not
    // even arrive there (4/22 = 0.1818s) until after that wrong deadline, let
    // alone finish fading (4/22 + 0.16 = 0.3418s). This pin fails against the
    // old range-only formula and passes once the file reach is measured from
    // the board's own width.
    const pulse = pulseAt('tollgate', 3, 3)

    expect(isPulseLive(pulse, 0.3, board)).toBe(true)
    expect(isPulseLive(pulse, 0.34, board)).toBe(true)
    expect(isPulseLive(pulse, 0.35, board)).toBe(false)
  })

  it('reaches farther the closer the origin sits to a board edge', () => {
    // From file 0, the farthest file is 7 — Chebyshev distance 7, not 4 as
    // from file 3 above. A fixed reach (whatever board.files - 1 happened to
    // be at the last board size) would get this wrong the moment the origin
    // moves; measuring per-origin does not.
    const centred = pulseAt('tollgate', 3, 3)
    const edged = pulseAt('tollgate', 0, 3)

    // Long past centred's life (distance 4: dead by 0.3418s) but still within
    // edged's (distance 7: 7/22 + 0.16 = 0.4818s).
    expect(isPulseLive(centred, 0.4, board)).toBe(false)
    expect(isPulseLive(edged, 0.4, board)).toBe(true)
  })
})
