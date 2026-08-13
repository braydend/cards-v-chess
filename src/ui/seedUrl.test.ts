import { describe, expect, it } from 'vitest'
import { normalizeSeed, seedFromUrl } from './seedUrl'

describe('normalizeSeed', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeSeed('  abcd1234  ')).toBe('abcd1234')
  })

  it('lowercases', () => {
    expect(normalizeSeed('AbCd1234')).toBe('abcd1234')
  })

  it('trims and lowercases together', () => {
    expect(normalizeSeed('  MiXeD_SeEd  ')).toBe('mixed_seed')
  })

  it('passes an already-normal seed through unchanged', () => {
    expect(normalizeSeed('abcd1234')).toBe('abcd1234')
  })

  it('reduces whitespace-only input to empty', () => {
    expect(normalizeSeed('   ')).toBe('')
  })
})

describe('seedFromUrl', () => {
  it('returns null when there is no search string', () => {
    expect(seedFromUrl('')).toBeNull()
  })

  it('returns null when the seed param is absent', () => {
    expect(seedFromUrl('?foo=1&bar=2')).toBeNull()
  })

  it('returns null when the seed param is empty', () => {
    expect(seedFromUrl('?seed=')).toBeNull()
  })

  it('returns null when the seed param is whitespace-only', () => {
    expect(seedFromUrl('?seed=%20%20')).toBeNull()
  })

  it('returns the normalized seed', () => {
    expect(seedFromUrl('?seed=AbCd1234')).toBe('abcd1234')
  })

  it('trims and lowercases the value', () => {
    expect(seedFromUrl('?seed=%20MiXeD_SeEd%20')).toBe('mixed_seed')
  })

  it('ignores extra params around the seed', () => {
    expect(seedFromUrl('?foo=1&seed=abcd1234&bar=2')).toBe('abcd1234')
  })
})
