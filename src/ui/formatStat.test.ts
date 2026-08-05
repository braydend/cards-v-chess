import { describe, expect, it } from 'vitest'
import { formatStat } from './formatStat'

describe('formatStat', () => {
  it('leaves whole numbers alone', () => {
    expect(formatStat(8)).toBe('8')
    expect(formatStat(0)).toBe('0')
  })

  it('keeps a genuine half', () => {
    expect(formatStat(1.5)).toBe('1.5')
  })

  it('cleans up floating-point drift', () => {
    expect(formatStat(8.999999999999998)).toBe('9')
  })

  it('rounds to a single decimal', () => {
    expect(formatStat(1.24)).toBe('1.2')
    expect(formatStat(1.26)).toBe('1.3')
  })
})
