import { describe, expect, it } from 'vitest'
import { DECK_CAP } from './deck'
import { CLUB_DAMAGE, DIAMOND_SPEED_MS, FACE_SUPPORT_PREMIUM, SPADE_HEALTH } from './cards'

describe('DECK_CAP', () => {
  it('is thirty', () => {
    expect(DECK_CAP).toBe(30)
  })
})

describe('the face-support premium lands on whole numbers', () => {
  // applySupport (src/game/support.ts) never rounds and never floors the ♠/♦/♣
  // result — it trusts that a flat value times FACE_SUPPORT_PREMIUM is already
  // an integer. That is only true because SPADE_HEALTH, DIAMOND_SPEED_MS and
  // CLUB_DAMAGE all happen to be even, which is a fact about the current
  // numbers, not something the type system or the engine enforces. Every other
  // test computes its expected value from these same constants, so retuning
  // one to an odd number (SPADE_HEALTH = 7, say) would produce a Tower with
  // maxHealth 10.5 and a "Health +10.5" UI label with the whole suite green.
  // This test is the only thing that would catch that: it pins the integer
  // property itself, independent of any behaviour built on top of it.
  it.each([
    ['SPADE_HEALTH', SPADE_HEALTH],
    ['DIAMOND_SPEED_MS', DIAMOND_SPEED_MS],
    ['CLUB_DAMAGE', CLUB_DAMAGE],
  ])('%s * FACE_SUPPORT_PREMIUM is an integer', (_name, value) => {
    expect(Number.isInteger(value * FACE_SUPPORT_PREMIUM)).toBe(true)
  })
})
