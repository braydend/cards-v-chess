import { Color } from 'three'
import { describe, expect, it } from 'vitest'
import {
  CORE_CRITICAL_FRACTION,
  CORE_FLASH_MS,
  coreColour,
  coreEmissiveIntensity,
  flashProgressAt,
} from './coreFlash'

/** The declarative values `Core.tsx` used before this module existed. */
const HEALTHY = '#f4d03f'
const CRITICAL = '#7b241c'

describe('coreColour', () => {
  it('returns the healthy colour untouched when nothing is flashing', () => {
    const colour = coreColour(new Color(), 1, 0)

    expect(colour.getHexString()).toBe(new Color(HEALTHY).getHexString())
  })

  it('returns the critical colour below the threshold, preserving the old behaviour', () => {
    const colour = coreColour(new Color(), CORE_CRITICAL_FRACTION - 0.01, 0)

    expect(colour.getHexString()).toBe(new Color(CRITICAL).getHexString())
  })

  it('keeps the threshold exclusive, exactly as the declarative version did', () => {
    // `Core.tsx` used `healthFraction > 0.3`, so 0.3 itself was already critical.
    const atThreshold = coreColour(new Color(), CORE_CRITICAL_FRACTION, 0)

    expect(atThreshold.getHexString()).toBe(new Color(CRITICAL).getHexString())
  })

  it('brightens toward the flash colour at full flash progress', () => {
    const flashed = coreColour(new Color(), 1, 1)
    const resting = coreColour(new Color(), 1, 0)

    expect(flashed.b).toBeGreaterThan(resting.b)
  })

  it('mutates and returns the target rather than allocating', () => {
    const target = new Color()

    expect(coreColour(target, 1, 0)).toBe(target)
  })

  it('clamps a nonsense health fraction rather than producing nonsense', () => {
    expect(coreColour(new Color(), 5, 0).getHexString()).toBe(
      new Color(HEALTHY).getHexString(),
    )
    expect(coreColour(new Color(), -1, 0).getHexString()).toBe(
      new Color(CRITICAL).getHexString(),
    )
  })
})

describe('coreEmissiveIntensity', () => {
  it('matches the declarative formula when nothing is flashing', () => {
    // Core.tsx used `0.25 + healthFraction * 0.5`.
    expect(coreEmissiveIntensity(1, 0)).toBeCloseTo(0.75)
    expect(coreEmissiveIntensity(0, 0)).toBeCloseTo(0.25)
  })

  it('rises with the flash', () => {
    expect(coreEmissiveIntensity(1, 1)).toBeGreaterThan(coreEmissiveIntensity(1, 0))
  })
})

describe('flashProgressAt', () => {
  it('reports nothing while idle', () => {
    expect(flashProgressAt(-1, 12)).toBe(0)
  })

  it('is full at the instant of impact', () => {
    expect(flashProgressAt(4, 4)).toBe(1)
  })

  it('decays to nothing across CORE_FLASH_MS', () => {
    const halfway = CORE_FLASH_MS / 2000

    expect(flashProgressAt(0, halfway)).toBeCloseTo(0.5)
    expect(flashProgressAt(0, CORE_FLASH_MS / 1000)).toBe(0)
  })

  it('never goes negative once the flash is spent', () => {
    expect(flashProgressAt(0, 10)).toBe(0)
  })
})
