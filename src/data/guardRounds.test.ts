import { describe, expect, it } from 'vitest'
import { GUARD_ROUND_EVERY, GUARD_ROUND_FIRST, isGuardRound } from './guardRounds'

describe('isGuardRound', () => {
  it('flags rounds 15, 23, 31 and no others in that range', () => {
    for (let n = 1; n <= 40; n += 1) {
      const expected = n >= GUARD_ROUND_FIRST && (n - GUARD_ROUND_FIRST) % GUARD_ROUND_EVERY === 0
      expect(isGuardRound(n)).toBe(expected)
    }
  })

  it('never flags a round before the first Guard round', () => {
    for (let n = 1; n < GUARD_ROUND_FIRST; n += 1) {
      expect(isGuardRound(n)).toBe(false)
    }
  })
})
