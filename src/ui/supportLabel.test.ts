import { describe, expect, it } from 'vitest'
import { supportModeLabel } from './supportLabel'

describe('supportModeLabel', () => {
  it('names the flat value and the only rank it can reach', () => {
    expect(supportModeLabel('spades', 7)).toBe('Health +6 — rank-7 Towers only')
    expect(supportModeLabel('clubs', 2)).toBe('Damage +2 — rank-2 Towers only')
    expect(supportModeLabel('diamonds', 10)).toBe('Speed 60ms faster — rank-10 Towers only')
  })

  it('shows the premium and the reach of a face card', () => {
    expect(supportModeLabel('spades', 'K')).toBe('Health +9 — any Tower')
    expect(supportModeLabel('clubs', 'J')).toBe('Damage +3 — any Tower')
    expect(supportModeLabel('diamonds', 'A')).toBe('Speed 90ms faster — any Tower')
  })

  it('shows no number for ♥, which restores to full whatever the rank', () => {
    // A number here would promise a scaled repair, which is not what ♥ does.
    // Both ranks must read identically apart from their reach.
    expect(supportModeLabel('hearts', 5)).toBe('Repair to full — rank-5 Towers only')
    expect(supportModeLabel('hearts', 'K')).toBe('Repair to full — any Tower')
  })

  it('reads the same value for every face rank, since the premium is flat', () => {
    expect(supportModeLabel('spades', 'J')).toBe(supportModeLabel('spades', 'A'))
  })
})
