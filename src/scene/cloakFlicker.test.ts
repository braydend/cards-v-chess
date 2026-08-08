import { describe, expect, it } from 'vitest'
import type { MissRecord } from '../game'
import { CLOAK_FLASH_MS, createCloakTracker, cloakAgeMs, cloakOpacity } from './cloakFlicker'

const MISSES: readonly MissRecord[] = [
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 500 },
  { pieceId: 'b', roundNumber: 1, roundElapsedMs: 600 },
  { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1200 },
]

describe('cloakAgeMs', () => {
  it('flashes when a new miss for this Piece appears, and ignores other Pieces', () => {
    const tracker = createCloakTracker()

    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)).toBe(0)
    // No new miss for 'a' — the age keeps growing.
    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_400)).toBe(400)
  })

  it('re-arms when a later miss for this Piece arrives', () => {
    const tracker = createCloakTracker()

    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)).toBe(0)
    expect(cloakAgeMs(tracker, MISSES, 'a', 1, 10_500)).toBe(500)
    // A later miss — a newer record in the ring — re-arms the flash.
    const later: readonly MissRecord[] = [
      ...MISSES,
      { pieceId: 'a', roundNumber: 1, roundElapsedMs: 1600 },
    ]
    expect(cloakAgeMs(tracker, later, 'a', 1, 10_800)).toBe(0)
  })

  it("a new round must not re-flash a previous round's miss at the same elapsed time", () => {
    const tracker = createCloakTracker()

    cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)
    // Round 2 starts at elapsed 0; 'a' has no miss there yet.
    expect(cloakAgeMs(tracker, MISSES, 'a', 2, 10_000)).toBe(0)
  })

  it('a miss in a fresh round flashes', () => {
    const tracker = createCloakTracker()
    const round2 = [{ pieceId: 'a', roundNumber: 2, roundElapsedMs: 400 }]

    cloakAgeMs(tracker, MISSES, 'a', 1, 10_000)
    expect(cloakAgeMs(tracker, round2, 'a', 2, 11_000)).toBe(0)
  })
})

describe('cloakOpacity', () => {
  it('dips to ~35% opacity at the midpoint and returns to 1 by the end of the window', () => {
    expect(cloakOpacity(0)).toBe(1)
    expect(cloakOpacity(CLOAK_FLASH_MS / 2)).toBeCloseTo(0.35)
    expect(cloakOpacity(CLOAK_FLASH_MS)).toBe(1)
    expect(cloakOpacity(CLOAK_FLASH_MS + 1)).toBe(1)
  })

  it('returns 1 when nothing has flashed', () => {
    expect(cloakOpacity(-1)).toBe(1)
  })
})
