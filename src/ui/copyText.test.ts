import { describe, expect, it } from 'vitest'
import { copyText } from './copyText'

describe('copyText', () => {
  it('reports success when the writer resolves', async () => {
    const written: string[] = []
    const ok = await copyText('run-seed', async (text) => {
      written.push(text)
    })
    expect(ok).toBe(true)
    expect(written).toEqual(['run-seed'])
  })

  it('reports failure when the writer rejects', async () => {
    const ok = await copyText('run-seed', async () => {
      throw new Error('clipboard denied')
    })
    expect(ok).toBe(false)
  })

  it('reports failure when the writer throws synchronously (unavailable clipboard)', async () => {
    const ok = await copyText('run-seed', () => {
      throw new TypeError('navigator.clipboard is undefined')
    })
    expect(ok).toBe(false)
  })
})
