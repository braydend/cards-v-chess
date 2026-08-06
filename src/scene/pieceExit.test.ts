import { describe, expect, it } from 'vitest'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TOWER_RANKS } from '../data/towerRanks'
import { createInitialState, step, tick, type GameState } from '../game'
import { jokerCard, liveRound, pawnAt, withDeck, withTower } from '../game/fixtures'
import {
  KILL_BURST_MS,
  LEAK_BURST_MS,
  LEAK_LUNGE_MS,
  createExitTracker,
  diffPieceExits,
  ghostScale,
  hasLanded,
  lungeProgress,
} from './pieceExit'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A tracker already seeded on `snapshot`, as the component seeds it on mount. */
function seededOn(snapshot: GameState) {
  const tracker = createExitTracker()
  diffPieceExits(tracker, snapshot)
  return tracker
}

function oneLeakAway(state: GameState = createInitialState()): GameState {
  return liveRound(state, [pawnAt('leaker', { file: 3, rank: 1 })])
}

describe('diffPieceExits', () => {
  it('reports nothing on the first call, seeding instead', () => {
    const diff = diffPieceExits(createExitTracker(), oneLeakAway())

    expect(diff.ghosts).toEqual([])
    expect(diff.runReset).toBe(false)
  })

  it('reports a leak at the square the engine recorded', () => {
    const before = oneLeakAway()
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const diff = diffPieceExits(seededOn(before), after)

    expect(diff.ghosts).toEqual([
      {
        id: 'leaker',
        meshKey: 'ghost:leaker',
        typeId: 'pawn',
        reason: 'leak',
        file: 3,
        boardRank: 1,
      },
    ])
  })

  it('reports a Tower kill in place, at the Piece last published square', () => {
    // Rank 7 deals 4 to a Pawn's 3 health, so the shot at 450ms kills it inside
    // the Pawn's 900ms hop — the Piece never moves, so "last published" and
    // "where the player last saw it" are the same square here.
    const before = liveRound(withTower(7, { file: 0, rank: 4 }), [
      pawnAt('victim', { file: 0, rank: 5 }),
    ])
    const after = runFor(before, TOWER_RANKS[7].fireIntervalMs + DT)
    const diff = diffPieceExits(seededOn(before), after)

    expect(diff.ghosts).toEqual([
      {
        id: 'victim',
        meshKey: 'ghost:victim',
        typeId: 'pawn',
        reason: 'kill',
        file: 0,
        boardRank: 5,
      },
    ])
  })

  it('reports nothing for a promoted Pawn, which was transformed rather than killed', () => {
    const before = liveRound(createInitialState(), [pawnAt('promoter', { file: 0, rank: 0 })])
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)

    expect(after.pieces.map((piece) => piece.typeId)).toEqual(['queen'])
    expect(diffPieceExits(seededOn(before), after).ghosts).toEqual([])
  })

  it('suppresses every burst when a Joker Clear empties the board', () => {
    const before = withDeck(
      [jokerCard('joker-1')],
      liveRound(createInitialState(), [
        pawnAt('a', { file: 0, rank: 5 }),
        pawnAt('b', { file: 1, rank: 5 }),
      ]),
    )
    const after = step(before, { kind: 'clearPieces', cardId: 'joker-1' })
    const diff = diffPieceExits(seededOn(before), after)

    expect(after.pieces).toEqual([])
    expect(diff.ghosts).toEqual([])
  })

  it('reports a run reset and suppresses everything when nextEntityId rewinds', () => {
    // `reset()` rewinds the counter to 1 — the only way it goes backwards
    // within a run. Chosen over gating on `phase === 'inProgress'` the way
    // `diffTowers` does; see the fatal-leak test below for why that matters.
    const before = { ...oneLeakAway(), nextEntityId: 9 }
    const diff = diffPieceExits(seededOn(before), createInitialState())

    expect(diff.runReset).toBe(true)
    expect(diff.ghosts).toEqual([])
  })

  it('still reports the leak that fells the Core, on the tick the phase turns defeated', () => {
    // The load-bearing case for not gating on phase. `diffTowers` suppresses
    // fallen Towers outside `inProgress`; copying that here would drop the
    // single most important impact in a run.
    const base = createInitialState()
    const before = oneLeakAway({ ...base, core: { ...base.core, health: 1 } })
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const diff = diffPieceExits(seededOn(before), after)

    expect(after.phase).toBe('defeated')
    expect(diff.ghosts.map((ghost) => ghost.reason)).toEqual(['leak'])
  })

  it('forgets a Piece once its ghost is emitted, so it is never reported twice', () => {
    const before = oneLeakAway()
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const tracker = seededOn(before)

    expect(diffPieceExits(tracker, after).ghosts).toHaveLength(1)
    expect(diffPieceExits(tracker, after).ghosts).toEqual([])
  })

  it('namespaces the mesh key, because reset() reuses Piece ids', () => {
    const before = oneLeakAway()
    const after = runFor(before, PIECE_TYPES.pawn.moveIntervalMs + DT)
    const [ghost] = diffPieceExits(seededOn(before), after).ghosts

    expect(ghost?.meshKey).not.toBe(ghost?.id)
    expect(ghost?.meshKey).toBe('ghost:leaker')
  })
})

describe('ghost timing', () => {
  it('holds a leak at full size through the lunge, so the strike lands with weight', () => {
    expect(ghostScale('leak', 0)).toBe(1)
    expect(ghostScale('leak', LEAK_LUNGE_MS)).toBe(1)
  })

  it('collapses a leak to nothing over the burst that follows the lunge', () => {
    expect(ghostScale('leak', LEAK_LUNGE_MS + LEAK_BURST_MS / 2)).toBeCloseTo(0.5)
    expect(ghostScale('leak', LEAK_LUNGE_MS + LEAK_BURST_MS)).toBe(0)
  })

  it('swells a kill before collapsing it', () => {
    expect(ghostScale('kill', 0)).toBe(1)
    expect(ghostScale('kill', KILL_BURST_MS * 0.4)).toBeGreaterThan(1.3)
    expect(ghostScale('kill', KILL_BURST_MS)).toBe(0)
  })

  it('accelerates the lunge rather than easing it, because a leak is a strike', () => {
    // Eased in: at the halfway point in time it has covered less than half the
    // distance. A linear lunge would read as another hop.
    expect(lungeProgress(LEAK_LUNGE_MS / 2)).toBeLessThan(0.5)
    expect(lungeProgress(LEAK_LUNGE_MS)).toBe(1)
    expect(lungeProgress(LEAK_LUNGE_MS * 2)).toBe(1)
  })

  it('lands exactly at the end of the lunge, so the Core flash is not early', () => {
    expect(hasLanded(LEAK_LUNGE_MS - 1)).toBe(false)
    expect(hasLanded(LEAK_LUNGE_MS)).toBe(true)
  })
})
