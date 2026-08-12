import { describe, expect, it } from 'vitest'
import { towerType } from '../data/towerTypes'
import { firstTower, liveRound, pieceAt, withTower } from './fixtures'
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

/** A vertical Tower, one Rook on its file under fire. */
function underFire(tier: PieceTier): GameState {
  const rook = pieceAt('rook', 'sneak', { file: 3, rank: 4 })
  return liveRound(withTower('vertical', { file: 3, rank: 2 }), [{ ...rook, tier }])
}

// 6 shots at 2 damage = 12, under the Rook's 14 health even for green. The
// Rook marches once, at 1600ms, from (3,4) to (3,3) — still on the tower's
// file, so every shot in the window still lands.
const WINDOW_MS = towerType('vertical').fireIntervalMs * 6 + DT

describe('the black miss', () => {
  it('is missed on a seeded roll, so a black Piece takes less damage than a green twin', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0

    expect(black.recentMisses.length).toBeGreaterThan(0)
    expect(blackHealth).toBeGreaterThan(greenHealth)
  })

  it('records exactly one entry per undetected shot, carrying piece id, round, and elapsed time', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    const blackHealth = black.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0
    const greenHealth = green.pieces.find((piece) => piece.id === 'sneak')?.health ?? 0
    const missed = black.recentMisses.length

    // Each undetected shot is one 2-damage hit the green twin still took, so
    // the black Piece's health exceeds the green twin's by damage × misses.
    expect(blackHealth).toBe(greenHealth + missed * towerType('vertical').damage)

    for (const record of black.recentMisses) {
      expect(record.pieceId).toBe('sneak')
      expect(record.roundNumber).toBe(1)
      expect(record.roundElapsedMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('spends the fire interval on a miss, so the Tower keeps its cadence against a Black Piece', () => {
    const black = runFor(underFire('black'), WINDOW_MS)
    const green = runFor(underFire('green'), WINDOW_MS)

    expect(black.recentMisses.length).toBeGreaterThan(0)
    // A miss is a shot that fires nothing but still spends the interval, so
    // the Tower's cooldown lands exactly where the green twin's does. If a
    // miss held at "ready" instead, the Tower would roll again nearly every
    // tick against a lone Black Piece and the 50% would collapse to ~3%.
    expect(firstTower(black).fireCooldownMs).toBe(firstTower(green).fireCooldownMs)
  })

  it('never misses a non-Black Piece, and records nothing', () => {
    const green = runFor(underFire('green'), WINDOW_MS)

    expect(green.recentMisses).toEqual([])
  })

  it("a Joker's Clear still destroys a Black Piece, and rolls nothing", () => {
    const state = { ...underFire('black'), deck: [{ id: 'joker', kind: 'joker' as const }] }
    const cleared = step(state, { kind: 'clearPieces', cardId: 'joker' })

    expect(cleared.pieces).toHaveLength(0)
    expect(cleared.recentMisses).toEqual([])
  })

  it('is deterministic — same seed, same misses', () => {
    expect(runFor(underFire('black'), WINDOW_MS).recentMisses).toEqual(
      runFor(underFire('black'), WINDOW_MS).recentMisses,
    )
  })

  it('a miss acquires nothing, so it never credits a kill', () => {
    // The window never lets the Rook die — 6 shots at 2 damage = 12, under its
    // 14 health even if every shot landed — so kills must stay 0 throughout.
    const black = runFor(underFire('black'), WINDOW_MS)

    expect(black.recentMisses.length).toBeGreaterThan(0)
    expect(firstTower(black).kills).toBe(0)
  })
})
