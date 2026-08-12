import { describe, expect, it } from 'vitest'
import { GUARD_BANNER_MESSAGE, guardRoundBanner } from './guardRoundBanner'

describe('guardRoundBanner', () => {
  it('announces guard rounds 15, 23, 31 while in progress', () => {
    for (const n of [15, 23, 31]) {
      expect(guardRoundBanner('inProgress', n)).toBe(GUARD_BANNER_MESSAGE)
    }
  })

  it('stays silent for non-guard rounds in progress', () => {
    for (const n of [1, 14, 16, 22]) {
      expect(guardRoundBanner('inProgress', n)).toBeNull()
    }
  })

  it('stays silent in the gap, even at a guard round number', () => {
    expect(guardRoundBanner('gap', 15)).toBeNull()
    expect(guardRoundBanner('gap', 23)).toBeNull()
  })

  it('stays silent after defeat', () => {
    expect(guardRoundBanner('defeated', 15)).toBeNull()
  })
})
