import { describe, expect, it } from 'vitest'
import type { Square, Tower } from '../game'
import { resolveBoardClick } from './boardClick'

function towerAt(id: string, square: Square): Tower {
  return {
    id,
    square,
    cardRank: 3,
    fireCooldownMs: 0,
    health: 12,
    maxHealth: 12,
    damageTaken: 0,
  }
}

const A = towerAt('tower-1', { file: 2, rank: 2 })
const B = towerAt('tower-2', { file: 5, rank: 6 })

describe('resolveBoardClick', () => {
  it('builds on an empty square', () => {
    expect(resolveBoardClick({ file: 0, rank: 0 }, [A, B], null)).toEqual({ kind: 'build' })
  })

  it('builds on an empty square even while a Tower is selected', () => {
    expect(resolveBoardClick({ file: 0, rank: 0 }, [A, B], A.id)).toEqual({ kind: 'build' })
  })

  it('selects the Tower on a square that holds one', () => {
    expect(resolveBoardClick(A.square, [A, B], null)).toEqual({
      kind: 'select',
      towerId: 'tower-1',
    })
  })

  it('deselects when the already-selected Tower is clicked again', () => {
    expect(resolveBoardClick(A.square, [A, B], A.id)).toEqual({ kind: 'deselect' })
  })

  it('switches selection when a different Tower is clicked', () => {
    expect(resolveBoardClick(B.square, [A, B], A.id)).toEqual({
      kind: 'select',
      towerId: 'tower-2',
    })
  })

  it('builds when there are no Towers at all', () => {
    expect(resolveBoardClick({ file: 2, rank: 2 }, [], null)).toEqual({ kind: 'build' })
  })
})
