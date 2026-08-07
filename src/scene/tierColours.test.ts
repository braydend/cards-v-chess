import { describe, expect, it } from 'vitest'
import { BUFF_RING_COLOUR } from './pieceColours'
import { RANK_COLOURS } from './rankColours'
import { TIER_COLOURS } from './tierColours'

describe('tier colours', () => {
  it('covers all four tiers, all distinct', () => {
    expect(Object.keys(TIER_COLOURS).sort()).toEqual(['black', 'green', 'red', 'yellow'])
    expect(new Set(Object.values(TIER_COLOURS)).size).toBe(4)
  })

  it('never collide with a Tower rank colour, so the factions stay readable apart', () => {
    const rankValues = Object.values(RANK_COLOURS)
    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      expect(rankValues, `${tier}'s colour ${colour} collides with a rank colour`).not.toContain(colour)
    }
  })

  it('never collide with the King-buff ring, which sits on the same pieces', () => {
    for (const colour of Object.values(TIER_COLOURS)) expect(colour).not.toBe(BUFF_RING_COLOUR)
  })
})
