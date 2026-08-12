import { describe, expect, it } from 'vitest'
import { isTerminal } from './phase'
import type { RoundPhase } from './types'

describe('isTerminal', () => {
  it('is true for defeated', () => {
    expect(isTerminal('defeated')).toBe(true)
  })

  it('is true for victory', () => {
    expect(isTerminal('victory')).toBe(true)
  })

  it.each<RoundPhase>(['gap', 'inProgress'])('is false for %s', (phase) => {
    expect(isTerminal(phase)).toBe(false)
  })
})
