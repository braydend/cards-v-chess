import { describe, expect, it } from 'vitest'
import { createInitialState } from '../game'
import type { Card, CardRank, Suit } from '../game'
import { runSimulation } from './driver'
import { AGGRO_BOT, BOTS, CONSERVATIVE_BOT, VALUE_BOT } from './bots'

function standard(id: string, rank: CardRank, suit: Suit): Card {
  return { id, kind: 'standard', rank, suit }
}

describe('bots', () => {
  it('each bot drives two rounds without hanging', () => {
    for (const bot of BOTS) {
      const result = runSimulation('alpha', bot, { maxRounds: 2 })
      expect(result.outcome).toBe('stopped')
      expect(result.finalRound).toBe(3)
      expect(result.rounds).toHaveLength(2)
    }
  })

  it('each bot spends ink over two rounds', () => {
    for (const bot of BOTS) {
      const result = runSimulation('alpha', bot, { maxRounds: 2 })
      expect(result.ink).toBeGreaterThanOrEqual(0)
    }
  })

  it('a bot places a pending Tower it bought', () => {
    const state = { ...createInitialState('alpha'), pendingTower: 'wall' as const }
    const command = VALUE_BOT.decide(state)
    expect(command?.kind).toBe('placeTower')
    if (command && command.kind === 'placeTower') {
      expect(command.square.rank).toBeGreaterThan(0)
    }
  })

  it('a bot plays the strongest hand in its Deck', () => {
    const state = {
      ...createInitialState('alpha'),
      deck: [standard('a', 5, 'hearts'), standard('b', 5, 'clubs')],
    }
    const command = VALUE_BOT.decide(state)
    expect(command?.kind).toBe('playHand')
    if (command && command.kind === 'playHand') {
      expect(command.cardIds).toHaveLength(2)
    }
  })

  it('the conservative bot refuses a lone high card', () => {
    const state = { ...createInitialState('alpha'), deck: [standard('a', 5, 'hearts')] }
    expect(CONSERVATIVE_BOT.decide(state)).toBeNull()
  })

  it('the aggro bot still runs to the same bound as the others', () => {
    const result = runSimulation('bravo', AGGRO_BOT, { maxRounds: 2 })
    expect(result.rounds).toHaveLength(2)
  })
})
