import { describe, expect, it } from 'vitest'
import { supportModeLabel } from './supportLabel'

describe('supportModeLabel', () => {
  it('shows the magnitude for the rank-scaled suits', () => {
    expect(supportModeLabel('spades', 7)).toBe('Health 7')
    expect(supportModeLabel('diamonds', 'A')).toBe('Speed 14')
    expect(supportModeLabel('clubs', 2)).toBe('Damage 2')
  })

  it('shows no magnitude for ♥, which restores to full whatever the rank', () => {
    // A number here would promise rank-scaled repair, which is exactly the
    // thing that stopped being true. Both ranks must read identically.
    expect(supportModeLabel('hearts', 2)).toBe('Repair to full')
    expect(supportModeLabel('hearts', 'K')).toBe('Repair to full')
  })
})
