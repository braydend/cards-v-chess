/**
 * The round-end rule depends on an invariant that nothing else states:
 * **Towers only ever lose health**, so a grind is always a countdown and a
 * blocked Piece always unblocks eventually.
 *
 * The sharpest case is the Wall: geometry 'none' means it can never shorten
 * its own grind by shooting something, so it is a pure countdown. These tests
 * pin that a blocked Piece counts as acting (so the round cannot end early
 * while it grinds) and that the Wall's finite health eventually ends the
 * grind (so the round cannot hang forever behind one).
 */
import { describe, expect, it } from 'vitest'
import { liveRound, pawnAt, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState } from './types'

const DT = 1000 / 60
const TOWER_SQUARE = { file: 3, rank: 4 }
const GRINDER_SQUARE = { file: 3, rank: 5 }

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A Wall at TOWER_SQUARE, with a Pawn grinding it from directly up-file. */
function wallGrind(): GameState {
  return liveRound(withTower('wall', TOWER_SQUARE), [pawnAt('grinder', GRINDER_SQUARE)])
}

describe('a blocked Piece counts as acting', () => {
  it('does not let the round end while it grinds the Wall', () => {
    // The Wall's 45 health at 1 damage per 900ms hop takes 40.5s of grinding
    // to fell, so a 30s window keeps the Wall standing and the Pawn actively
    // grinding. If `stillActive` misread `attackTower` as stuck, the round
    // would have ended the moment the board settled.
    const state = wallGrind()
    const after = runFor(state, 30_000)

    expect(after.phase).toBe('inProgress')
    expect(after.towers).toHaveLength(1)
    expect(after.pieces.map((piece) => piece.id)).toEqual(['grinder'])
  })
})

describe('the Wall falls', () => {
  it('ends the round once the grind wears it down, reaching the gap', () => {
    // The countdown this file exists to pin: the Wall cannot shoot back, so
    // the only way off this stall is the grind itself. Generous window: 45
    // health at 1 damage per 900ms hop, then the Pawn walks the board to the
    // Core once the wall falls.
    const after = runFor(wallGrind(), 60_000)

    expect(after.phase).toBe('gap')
    expect(after.towers).toEqual([])
    expect(after.pieces).toEqual([])
  })
})

describe('packs cannot lengthen the wall', () => {
  /**
   * The bound this file pins is "the Wall's health runs out". Packs are the
   * thing that could remove it — a player with Ink could buy repair forever
   * and hold a blocked Piece against an unkillable Tower with no round end in
   * sight.
   *
   * Gap-only purchasing is what prevents it. This test is the invariant; without
   * it, the rule is only a comment.
   */
  it('refuses a purchase while a round is live, so the supply is fixed for its duration', () => {
    const grinding: GameState = { ...wallGrind(), ink: 10_000 }

    expect(grinding.phase).toBe('inProgress')
    expect(step(grinding, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).toBe(grinding)
  })

  it('allows the same purchase in the gap', () => {
    const between: GameState = { ...wallGrind(), phase: 'gap', ink: 10_000 }

    expect(step(between, { kind: 'buyPack', pack: 'base', cullCardIds: [] })).not.toBe(between)
  })
})
