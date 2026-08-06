import { describe, expect, it } from 'vitest'
import { PROMOTION_POP_MS, promotionPopLift, promotionPopScale } from './promotionPop'

describe('promotionPopScale', () => {
  it('is neutral at the instant the Queen appears, so nothing snaps', () => {
    expect(promotionPopScale(0)).toBe(1)
  })

  it('swells partway through', () => {
    expect(promotionPopScale(PROMOTION_POP_MS * 0.35)).toBeGreaterThan(1.4)
  })

  it('returns to neutral, so it multiplies the health scale rather than replacing it', () => {
    // `Pieces.tsx` already scales a Piece by its health. A pop that did not
    // return to exactly 1 would leave every promoted Queen permanently the
    // wrong size.
    expect(promotionPopScale(PROMOTION_POP_MS)).toBe(1)
    expect(promotionPopScale(PROMOTION_POP_MS * 10)).toBe(1)
  })

  it('is neutral for a negative age, which a clock stamp can briefly produce', () => {
    expect(promotionPopScale(-5)).toBe(1)
  })
})

describe('promotionPopLift', () => {
  it('starts and ends on the board', () => {
    expect(promotionPopLift(0)).toBe(0)
    expect(promotionPopLift(PROMOTION_POP_MS)).toBe(0)
  })

  it('rises in between, so the pop reads as an upgrade rather than a wobble', () => {
    expect(promotionPopLift(PROMOTION_POP_MS / 2)).toBeGreaterThan(0)
  })

  it('is flat outside the pop', () => {
    expect(promotionPopLift(-5)).toBe(0)
    expect(promotionPopLift(PROMOTION_POP_MS * 10)).toBe(0)
  })
})
