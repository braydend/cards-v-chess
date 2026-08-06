import { describe, expect, it } from 'vitest'
import { tick, type Tower } from '../game'
import { liveRound, pawnAt, withTower } from '../game/fixtures'
import { detectShots, type FirePulse } from './firePulse'

/** The fixed timestep `src/state/simulation.ts` drives the engine with. */
const FIXED_DT_MS = 1000 / 60

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

    // 40 steps is 667ms. `cardPlays.ts` builds a Tower at `fireCooldownMs: 0`,
    // so the first shot lands around step 36 and a second could not arrive
    // before step 72 — hence exactly one. It is also short of the Pawn's first
    // 900ms hop, so the Pawn stays covered throughout. `detectShots` runs every
    // step because that is what the frame loop does; sampling once at the end
    // would read a cooldown that has already wrapped.
    for (let i = 0; i < 40; i += 1) {
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

    for (let i = 0; i < 40; i += 1) {
      state = tick(state, FIXED_DT_MS)
      pulses.push(...detectShots(last, state.towers, i / 60))
    }

    expect(pulses).toEqual([])
  })
})
