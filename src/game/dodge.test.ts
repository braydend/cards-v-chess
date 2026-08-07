import { describe, expect, it } from 'vitest'
import { TOWER_RANKS } from '../data/towerRanks'
import { liveRound, pieceAt, withTower } from './fixtures'
import { step, tick } from './index'
import type { GameState, PieceTier } from './types'

const DT = 1000 / 60

function runFor(state: GameState, durationMs: number): GameState {
  let current = state
  for (let elapsed = 0; elapsed < durationMs; elapsed += DT) {
    current = tick(current, DT)
  }
  return current
}

/** A rank-3 vertical Tower, one Rook on its file under fire. */
function underFire(tier: PieceTier): GameState {
  const rook = pieceAt('rook', 'dodger', { file: 3, rank: 4 })
  return liveRound(withTower(3, { file: 3, rank: 2 }), [{ ...rook, tier }])
}

// 6 shots at 2 damage = 12, under the Rook's 14 health even for green. The
// Rook marches once, at 1600ms, from (3,4) to (3,3) — still on the tower's
// file, so every shot in the window still lands.
const WINDOW_MS = TOWER_RANKS[3].fireIntervalMs * 6 + DT

describe('the black dodge', () => {
  it('negates shots from a seeded stream, so a black Piece takes less damage than a green twin', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0

    expect(black.recentDodges.length).toBeGreaterThan(0)
    expect(blackHealth).toBeGreaterThan(greenHealth)
  })

  it('records exactly one entry per negated shot, carrying piece id, round, and elapsed time', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'dodger')?.health ?? 0
    const dodged = black.recentDodges.length

    // Each negated shot is one 2-damage hit the green twin still took, so the
    // black Piece's health exceeds the green twin's by damage × dodges.
    expect(blackHealth).toBe(greenHealth + dodged * TOWER_RANKS[3].damage)

    for (const record of black.recentDodges) {
      expect(record.pieceId).toBe('dodger')
      expect(record.roundNumber).toBe(1)
      expect(record.roundElapsedMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('never dodges a non-Black Piece, and records nothing', () => {
    const green = runFor(underFire('green'), WINDOW_MS)

    expect(green.recentDodges).toEqual([])
  })

  it("a Joker's Clear still destroys a Black Piece, and rolls nothing", () => {
    const state = { ...underFire('black'), deck: [{ id: 'joker', kind: 'joker' as const }] }
    const cleared = step(state, { kind: 'clearPieces', cardId: 'joker' })

    expect(cleared.pieces).toHaveLength(0)
    expect(cleared.recentDodges).toEqual([])
  })

  it('is deterministic — same seed, same dodges', () => {
    expect(runFor(underFire('black'), WINDOW_MS).recentDodges).toEqual(
      runFor(underFire('black'), WINDOW_MS).recentDodges,
    )
  })
})
