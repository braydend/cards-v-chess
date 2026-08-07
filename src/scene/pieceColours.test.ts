import { describe, expect, it } from 'vitest'
import { BUFF_RING_COLOUR } from './pieceColours'
import { RANK_COLOURS } from './rankColours'
import { TIER_COLOURS } from './tierColours'

// Both modules are plain data — no React, no three.js — so this runs in the
// suite's default `node` environment with no DOM, same as the rules-engine
// tests.
describe('buff ring colour', () => {
  it('never collides with a Tower rank colour, so an aura never reads as a Tower', () => {
    const rankValues = Object.values(RANK_COLOURS)
    expect(rankValues).not.toContain(BUFF_RING_COLOUR)
  })

  it('never collides with a tier colour, so the aura stays visible on the Piece body it sits on', () => {
    const tierValues = Object.values(TIER_COLOURS)
    expect(tierValues).not.toContain(BUFF_RING_COLOUR)
  })
})
