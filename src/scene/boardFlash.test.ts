import { describe, expect, it } from 'vitest'
import type { BoardSpec } from '../game'
import { CLEAR_FLASH_MS, accumulateBoardFlash, isFlashLive } from './boardFlash'

const BOARD: BoardSpec = { files: 8, ranks: 8 }
const FLASH_SECONDS = CLEAR_FLASH_MS / 1000

function buffer(board: BoardSpec, extra = 0): Float32Array {
  return new Float32Array(board.files * board.ranks * 3 + extra)
}

describe('accumulateBoardFlash', () => {
  it('lights every square equally, since a Clear is one board-wide event', () => {
    const out = buffer(BOARD)
    accumulateBoardFlash(out, BOARD, { startedAt: 0 }, 0)

    expect(out.every((channel) => channel === out[0])).toBe(true)
    expect(out[0]).toBeGreaterThan(0)
  })

  it('decays to nothing across CLEAR_FLASH_MS', () => {
    const half = buffer(BOARD)
    accumulateBoardFlash(half, BOARD, { startedAt: 0 }, FLASH_SECONDS / 2)

    const spent = buffer(BOARD)
    accumulateBoardFlash(spent, BOARD, { startedAt: 0 }, FLASH_SECONDS)

    expect(half[0]).toBeCloseTo(0.5)
    expect(spent[0]).toBe(0)
  })

  it('adds to the buffer rather than zeroing it, so fire pulses survive', () => {
    // `accumulatePulses` owns zeroing and runs first. Zeroing here would erase
    // every pulse in flight the moment a Joker was played.
    const out = buffer(BOARD)
    out[0] = 0.25
    accumulateBoardFlash(out, BOARD, { startedAt: 0 }, 0)

    expect(out[0]).toBeCloseTo(1.25)
    expect(out[1]).toBeCloseTo(1)
  })

  it('does nothing with no flash', () => {
    const out = buffer(BOARD)
    accumulateBoardFlash(out, BOARD, null, 4)

    expect(out.every((channel) => channel === 0)).toBe(true)
  })

  it('writes nothing outside the board region, at any board size', () => {
    // An Ace grows the board, so the buffer is reallocated and this must never
    // reach past what the current board owns.
    const grown: BoardSpec = { files: 8, ranks: 9 }
    const out = buffer(grown, 6)
    accumulateBoardFlash(out, grown, { startedAt: 0 }, 0)

    const guard = out.subarray(grown.files * grown.ranks * 3)

    expect(guard.every((channel) => channel === 0)).toBe(true)
  })
})

describe('isFlashLive', () => {
  it('is live from the instant it starts until CLEAR_FLASH_MS has passed', () => {
    expect(isFlashLive({ startedAt: 0 }, 0)).toBe(true)
    expect(isFlashLive({ startedAt: 0 }, FLASH_SECONDS / 2)).toBe(true)
    expect(isFlashLive({ startedAt: 0 }, FLASH_SECONDS)).toBe(false)
  })
})
