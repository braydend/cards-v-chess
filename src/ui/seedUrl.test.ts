import { describe, expect, it } from 'vitest'
import { normalizeSeed, seedFromUrl, urlForSeed } from './seedUrl'

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

describe('urlForSeed', () => {
  it('writes an unclean seed that clean seeds read back as the same seed', () => {
    expect(urlForSeed('AbCd1234')).toBe('?seed=AbCd1234')
  })

  it('percent-encodes a seed containing an ampersand so it round-trips', () => {
    expect(urlForSeed('a&b')).toBe('?seed=a%26b')
    expect(seedFromUrl(urlForSeed('a&b'))).toBe('a&b')
  })

  it('percent-encodes a seed containing a hash so it round-trips', () => {
    expect(urlForSeed('ab#frag')).toBe('?seed=ab%23frag')
    expect(seedFromUrl(urlForSeed('ab#frag'))).toBe('ab#frag')
  })

  it('round-trips a seed with spaces', () => {
    expect(seedFromUrl(urlForSeed('my seed'))).toBe('my seed')
  })

  it('round-trips a seed that is not normalized shape', () => {
    expect(seedFromUrl(urlForSeed('  MiXeD_SeEd  & more#! '))).toBe(
      'mixed_seed  & more#!'
    )
  })
})
