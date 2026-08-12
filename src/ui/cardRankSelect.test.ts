import { describe, expect, it } from 'vitest'
import { ALL_CARD_RANKS } from '../data/cards'
import { cardRankFromSelectValue } from './cardRankSelect'

describe('cardRankFromSelectValue', () => {
  it('parses every buildable rank back to its number', () => {
    expect(cardRankFromSelectValue('2')).toBe(2)
    expect(cardRankFromSelectValue('3')).toBe(3)
    expect(cardRankFromSelectValue('7')).toBe(7)
    expect(cardRankFromSelectValue('10')).toBe(10)
  })

  it('parses every face rank back to its string', () => {
    expect(cardRankFromSelectValue('J')).toBe('J')
    expect(cardRankFromSelectValue('Q')).toBe('Q')
    expect(cardRankFromSelectValue('K')).toBe('K')
    expect(cardRankFromSelectValue('A')).toBe('A')
  })

  it('round-trips every option the select renders', () => {
    for (const rank of ALL_CARD_RANKS) {
      expect(cardRankFromSelectValue(String(rank))).toBe(rank)
    }
  })

  it('returns undefined for a value no option produces', () => {
    expect(cardRankFromSelectValue('')).toBeUndefined()
    expect(cardRankFromSelectValue('1')).toBeUndefined()
    expect(cardRankFromSelectValue('jack')).toBeUndefined()
  })
})
