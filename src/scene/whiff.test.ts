import { describe, expect, it } from 'vitest'
import type { DodgeRecord } from '../game'
import { WHIFF_FLASH_MS, createWhiffTracker, whiffAgeMs, whiffScale } from './whiff'

const DODGES: readonly DodgeRecord[] = [
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 500 },
  { pieceId: 'b', roundNumber: 1, roundElapsedMs: 600 },
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1200 },
]

describe('whiffAgeMs', () => {
  it('flashes when a new dodge for this Piece appears, and ignores other Pieces', () => {
    const tracker = createWhiffTracker()

    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)).toBe(0)
    // No new dodge for 'a' — the age keeps growing.
    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_400)).toBe(400)
  })

  it('re-arms when a later dodge for this Piece arrives', () => {
    const tracker = createWhiffTracker()

    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)).toBe(0)
    expect(whiffAgeMs(tracker, DODGES, 'a', 1, 10_500)).toBe(500)
    // A later dodge — a newer record in the ring — re-arms the flash.
    const later: readonly DodgeRecord[] = [
      ...DODGES,
      { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1600 },
    ]
    expect(whiffAgeMs(tracker, later, 'a', 1, 10_800)).toBe(0)
  })

  it("a new round must not re-flash a previous round's dodge at the same elapsed time", () => {
    const tracker = createWhiffTracker()

    whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)
    // Round 2 starts at elapsed 0; 'a' has no dodge there yet.
    expect(whiffAgeMs(tracker, DODGES, 'a', 2, 10_000)).toBe(0)
  })

  it('a dodge in a fresh round flashes', () => {
    const tracker = createWhiffTracker()
    const round2 = [{ pieceId: 'a', roundNumber: 2, roundElapsedMs: 400 }]

    whiffAgeMs(tracker, DODGES, 'a', 1, 10_000)
    expect(whiffAgeMs(tracker, round2, 'a', 2, 11_000)).toBe(0)
  })
})

describe('whiffScale', () => {
  it('starts at a swell and returns to 1 by the end of the window', () => {
    expect(whiffScale(0)).toBeGreaterThan(1)
    expect(whiffScale(WHIFF_FLASH_MS)).toBe(1)
    expect(whiffScale(WHIFF_FLASH_MS + 1)).toBe(1)
  })

  it('returns 1 when nothing has flashed', () => {
    expect(whiffScale(-1)).toBe(1)
  })
})
