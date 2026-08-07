import { describe, expect, it } from 'vitest'
import type { Card, CardRank, Suit } from '../game'
import { rankModeLabel, targetHint, untargetedPlay } from './cardPlay'

function card(rank: CardRank | 'joker', suit?: Suit): Card {
  if (rank === 'joker') return { id: 'card-1', kind: 'joker' }
  if (!suit) throw new Error('standard card requires a suit')
  return { id: 'card-1', kind: 'standard', rank, suit }
}

describe('rankModeLabel', () => {
  it('describes a buildable rank', () => {
    expect(rankModeLabel(card(5, 'diamonds'))).toMatch(/^Build — /)
  })

  it('describes a Jack, Queen, King and Ace by their action', () => {
    expect(rankModeLabel(card('J', 'hearts'))).toBe('Shield a Tower')
    expect(rankModeLabel(card('Q', 'hearts'))).toBe('Echo a Tower')
    expect(rankModeLabel(card('K', 'hearts'))).toBe('Reinforce the Core')
    expect(rankModeLabel(card('A', 'hearts'))).toBe('Expand the board')
  })

  it('describes the Joker', () => {
    expect(rankModeLabel(card('joker'))).toBe('Clear every Piece')
  })
})

describe('targetHint', () => {
  it('tells a numbered support Card which rank it reaches', () => {
    expect(targetHint(card(5, 'hearts'), 'support', 0, null)).toBe(
      'Click a rank-5 Tower to support — you have none yet',
    )
  })

  it('tells a face support Card it reaches any Tower', () => {
    expect(targetHint(card('K', 'spades'), 'support', 3, null)).toBe(
      'Click any Tower to support',
    )
  })

  it('drops the "none yet" aside when Towers exist', () => {
    expect(targetHint(card(5, 'hearts'), 'support', 2, null)).toBe(
      'Click a rank-5 Tower to support',
    )
  })

  it('tells a Jack where to shield', () => {
    expect(targetHint(card('J', 'hearts'), 'build', 1, null)).toBe('Click a Tower to shield')
  })

  it('walks a Queen through its two clicks', () => {
    expect(targetHint(card('Q', 'hearts'), 'build', 1, null)).toBe(
      'Click the Tower to echo',
    )
    expect(targetHint(card('Q', 'hearts'), 'build', 1, 'tower-1')).toBe(
      'Now click an empty square for the echo',
    )
  })

  it('defaults to pointing at the board', () => {
    expect(targetHint(card(5, 'diamonds'), 'build', 0, null)).toBe(
      'Click a square on the board',
    )
  })
})

describe('untargetedPlay', () => {
  it('produces a command for the King, Ace and Joker in build mode', () => {
    expect(untargetedPlay(card('K', 'hearts'), 'build')).toEqual({
      kind: 'reinforceCore',
      cardId: 'card-1',
    })
    expect(untargetedPlay(card('A', 'hearts'), 'build')).toEqual({
      kind: 'expandBoard',
      cardId: 'card-1',
    })
    expect(untargetedPlay(card('joker'), 'build')).toEqual({
      kind: 'clearPieces',
      cardId: 'card-1',
    })
  })

  it('returns null for plays that need a board target', () => {
    expect(untargetedPlay(card(5, 'diamonds'), 'build')).toBeNull()
    expect(untargetedPlay(card('J', 'hearts'), 'build')).toBeNull()
    expect(untargetedPlay(card('Q', 'hearts'), 'build')).toBeNull()
  })

  it('returns null in support mode — support always needs a Tower', () => {
    expect(untargetedPlay(card('K', 'hearts'), 'support')).toBeNull()
  })
})
