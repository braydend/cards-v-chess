import { describe, expect, it } from 'vitest'
import { isGuardRound } from './guardRounds'
import { INTRODUCED_AT, TIER_INTRODUCED_AT, roundSpec } from './rounds'
import type { PieceTier, PieceTypeId } from '../game/types'

function typesIn(roundNumber: number): Set<PieceTypeId> {
  return new Set(roundSpec(roundNumber).spawns.map((spawn) => spawn.typeId))
}

describe('round composition', () => {
  it('sends only Pawns in the opening rounds', () => {
    expect(typesIn(1)).toEqual(new Set(['pawn']))
  })

  it('never sends a type before the round it is introduced', () => {
    for (let roundNumber = 1; roundNumber <= 12; roundNumber += 1) {
      for (const typeId of typesIn(roundNumber)) {
        expect(roundNumber).toBeGreaterThanOrEqual(INTRODUCED_AT[typeId])
      }
    }
  })

  it('has introduced the whole roster by round 11', () => {
    expect(typesIn(11).size).toBe(Object.keys(INTRODUCED_AT).length)
  })

  it('actually sends a new type in the round it unlocks', () => {
    for (const [typeId, roundNumber] of Object.entries(INTRODUCED_AT)) {
      expect(typesIn(roundNumber)).toContain(typeId as PieceTypeId)
    }
  })

  it('is deterministic — the same round always composes the same way', () => {
    expect(roundSpec(7)).toEqual(roundSpec(7))
  })

  it('keeps Pawns the most common Piece once the roster opens up', () => {
    const counts = new Map<PieceTypeId, number>()
    for (const spawn of roundSpec(11).spawns) {
      counts.set(spawn.typeId, (counts.get(spawn.typeId) ?? 0) + 1)
    }

    const pawns = counts.get('pawn') ?? 0
    for (const [typeId, count] of counts) {
      if (typeId !== 'pawn') expect(pawns).toBeGreaterThanOrEqual(count)
    }
  })
})

function tiersIn(roundNumber: number): Set<PieceTier> {
  return new Set(roundSpec(roundNumber).spawns.map((spawn) => spawn.tier))
}

describe('tier composition', () => {
  it('sends only green in the opening rounds', () => {
    expect(tiersIn(1)).toEqual(new Set(['green']))
  })

  it('never sends a tier before the round it is introduced', () => {
    for (let roundNumber = 1; roundNumber <= 14; roundNumber += 1) {
      for (const tier of tiersIn(roundNumber)) {
        expect(roundNumber).toBeGreaterThanOrEqual(TIER_INTRODUCED_AT[tier])
      }
    }
  })

  it('actually sends a newly unlocked tier in its unlock round', () => {
    for (const [tier, roundNumber] of Object.entries(TIER_INTRODUCED_AT)) {
      expect(tiersIn(Number(roundNumber))).toContain(tier as PieceTier)
    }
  })

  it('stays deterministic — same round, same tiers', () => {
    expect(roundSpec(9).spawns.map((spawn) => spawn.tier)).toEqual(
      roundSpec(9).spawns.map((spawn) => spawn.tier),
    )
  })
})

describe('round dispatch', () => {
  it('returns Guard composition for Guard round numbers', () => {
    const spec = roundSpec(15)
    expect(isGuardRound(15)).toBe(true)
    // Guard rounds are King + sliders only — no pawns, no knights.
    for (const spawn of spec.spawns) {
      expect(['king', 'bishop', 'rook', 'queen']).toContain(spawn.typeId)
    }
  })

  it('keeps the normal composition for non-Guard rounds', () => {
    const spec = roundSpec(14)
    expect(isGuardRound(14)).toBe(false)
    // The normal pool still sends pawns.
    expect(spec.spawns.some((spawn) => spawn.typeId === 'pawn')).toBe(true)
  })

  it('is still deterministic at a Guard round number', () => {
    expect(roundSpec(23)).toEqual(roundSpec(23))
  })
})
