import { describe, expect, it } from 'vitest'
import { easeOutCubic, panOffsetForStrip } from './stripOffset'

describe('panOffsetForStrip', () => {
  it('returns the world-unit overlap between the board and the strip', () => {
    // Board projected to px 283..561 (8 files): 34.75 px per world unit. The
    // strip's left edge at px 449 cuts 112 px into the board — 3.22 world
    // units. Mirrors an 8x8 board at 844px landscape.
    const offset = panOffsetForStrip({
      stripLeftPx: 449,
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBeCloseTo((561 - 449) / 34.75, 5)
  })

  it('returns 0 when the strip does not overlap the board', () => {
    const offset = panOffsetForStrip({
      stripLeftPx: 600, // right of the board's right edge at 561
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBe(0)
  })

  it('returns 0 when the strip is exactly flush with the board edge', () => {
    const offset = panOffsetForStrip({
      stripLeftPx: 561,
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBe(0)
  })

  it('clamps to maxPan so the Core stays reachable', () => {
    // A strip at the very left of the screen wants far more than maxPan.
    const offset = panOffsetForStrip({
      stripLeftPx: 0,
      boardLeftPx: 283,
      boardRightPx: 561,
      boardFiles: 8,
      maxPan: 7.7,
    })

    expect(offset).toBe(7.7)
  })

  it('returns 0 for a degenerate projection', () => {
    // Zero-width board (pxPerWorld = 0) and a NaN board edge both must not
    // produce an offset — the caller guards on a real measurement.
    expect(
      panOffsetForStrip({ stripLeftPx: 449, boardLeftPx: 283, boardRightPx: 283, boardFiles: 8, maxPan: 7.7 }),
    ).toBe(0)
    expect(
      panOffsetForStrip({ stripLeftPx: 449, boardLeftPx: Number.NaN, boardRightPx: 561, boardFiles: 8, maxPan: 7.7 }),
    ).toBe(0)
  })
})

describe('easeOutCubic', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('eases out: more progress early, less late', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 5)
  })
})
