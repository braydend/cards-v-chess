import { describe, expect, it } from 'vitest'
import { DECK_CAP } from './deck'

describe('DECK_CAP', () => {
  it('is thirty', () => {
    expect(DECK_CAP).toBe(30)
  })
})
