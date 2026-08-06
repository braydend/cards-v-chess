import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import { RANK_COLOURS } from './rankColours'
import { towerColour } from './towerColour'

const scratch = new Color()

/** Total channel energy — a proxy for "brighter", enough to assert direction. */
function brightness(
  healthFraction: number,
  flashProgress = 0,
  criticalPhase = 0,
  dimmed = false,
): number {
  const colour = towerColour(scratch, 4, healthFraction, flashProgress, criticalPhase, dimmed)
  return colour.r + colour.g + colour.b
}

describe('towerColour', () => {
  it('is exactly the rank colour at full health', () => {
    const result = towerColour(scratch, 4, 1, 0, 0)

    expect(result.getHexString()).toBe(new Color(RANK_COLOURS[4]).getHexString())
  })

  it('darkens as health drops', () => {
    expect(brightness(0.5)).toBeLessThan(brightness(1))
    // Probed at the pulse trough (phase 0.75): below the critical threshold the
    // pulse brightens the Tower, so measuring the ramp at any other phase
    // conflates the two signals.
    expect(brightness(0, 0, 0.75)).toBeLessThan(brightness(0.5))
  })

  it('brightens for the duration of a hit flash', () => {
    expect(brightness(1, 1)).toBeGreaterThan(brightness(1, 0))
  })

  it('pulses once health is critical', () => {
    // Phase 0.25 is the sine peak, 0.75 the trough.
    expect(brightness(0.1, 0, 0.25)).not.toBeCloseTo(brightness(0.1, 0, 0.75))
  })

  it('ignores the pulse phase above the critical threshold', () => {
    expect(brightness(0.8, 0, 0.25)).toBeCloseTo(brightness(0.8, 0, 0.75))
  })

  it('clamps health outside 0..1 rather than producing nonsense', () => {
    expect(brightness(1.5)).toBeCloseTo(brightness(1))
    expect(brightness(-0.5)).toBeCloseTo(brightness(0))
  })

  it('mutates the colour it is given instead of allocating', () => {
    expect(towerColour(scratch, 2, 0.5, 0, 0)).toBe(scratch)
  })

  it('fades a Tower the picked support Card cannot reach', () => {
    expect(brightness(1, 0, 0, true)).toBeLessThan(brightness(1))
  })

  it('keeps the fade visible through a hit flash', () => {
    // The fade is applied last for exactly this reason: a Tower being hit while
    // out of reach must still read as out of reach, or the flash says "you can
    // play here" at the worst possible moment.
    expect(brightness(1, 1, 0, true)).toBeLessThan(brightness(1, 1))
  })

  it('is undimmed by default, so nothing changes when no support Card is picked', () => {
    const result = towerColour(scratch, 4, 1, 0, 0)

    expect(result.getHexString()).toBe(new Color(RANK_COLOURS[4]).getHexString())
  })
})
