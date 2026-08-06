import { describe, expect, it } from 'vitest'
import { INTRODUCED_AT, roundSpec } from './rounds'
import type { PieceTypeId } from '../game/types'

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
