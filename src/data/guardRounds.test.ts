import { describe, expect, it } from 'vitest'
import { GUARD_ROUND_EVERY, GUARD_ROUND_FIRST, guardRoundSpec, isGuardRound } from './guardRounds'
import { tierPoolFor } from './rounds'
import type { PieceTypeId, RoundSpec, Spawn } from '../game/types'

describe('isGuardRound', () => {
  it('flags rounds 15, 23, 31 and no others in that range', () => {
    for (let n = 1; n <= 40; n += 1) {
      const expected = n >= GUARD_ROUND_FIRST && (n - GUARD_ROUND_FIRST) % GUARD_ROUND_EVERY === 0
      expect(isGuardRound(n)).toBe(expected)
    }
  })

  it('never flags a round before the first Guard round', () => {
    for (let n = 1; n < GUARD_ROUND_FIRST; n += 1) {
      expect(isGuardRound(n)).toBe(false)
    }
  })
})

/**
 * The slider pool the spec builder receives: the normal tier pool for the
 * round, and a slider-only type pool built from the same WEIGHT interleave.
 * This mirrors exactly what Task 3's dispatcher will pass.
 */
function guardSpec(roundNumber: number): RoundSpec {
  const tierPool = tierPoolFor(roundNumber)
  // Sliders are the slides: true types. Bishops, Rooks and Queens only.
  const sliderPool: PieceTypeId[] = ['bishop', 'rook', 'queen', 'bishop', 'rook']
  return guardRoundSpec(roundNumber, tierPool, sliderPool)
}

/** Groups spawns into squads by shared `atMs`. */
function squadsOf(spec: RoundSpec): Spawn[][] {
  const byAt = new Map<number, Spawn[]>()
  for (const spawn of spec.spawns) {
    const group = byAt.get(spawn.atMs) ?? []
    group.push(spawn)
    byAt.set(spawn.atMs, group)
  }
  return [...byAt.values()]
}

const SLIDERS: readonly PieceTypeId[] = ['bishop', 'rook', 'queen']

describe('guardRoundSpec', () => {
  it('is deterministic — the same round composes the same way', () => {
    expect(guardSpec(15)).toEqual(guardSpec(15))
    expect(guardSpec(31)).toEqual(guardSpec(31))
  })

  it('builds one squad of King + 2 sliders at round 15', () => {
    const squads = squadsOf(guardSpec(15))
    expect(squads).toHaveLength(1)
    const [squad] = squads as [Spawn[]]
    const kings = squad.filter((s) => s.typeId === 'king')
    expect(kings).toHaveLength(1)
    expect(squad).toHaveLength(3)
  })

  it('scales squad count and squad size with the round number', () => {
    expect(squadsOf(guardSpec(15))).toHaveLength(1)
    expect(squadsOf(guardSpec(23))).toHaveLength(2)
    expect(squadsOf(guardSpec(31))).toHaveLength(3)
    // Round 31 squads are King + 3 sliders (4 members each).
    for (const squad of squadsOf(guardSpec(31))) {
      expect(squad).toHaveLength(4)
    }
  })

  it('has exactly one King and no pawns or knights in any squad', () => {
    for (const roundNumber of [15, 23, 31, 39]) {
      for (const squad of squadsOf(guardSpec(roundNumber))) {
        const kings = squad.filter((s) => s.typeId === 'king')
        expect(kings).toHaveLength(1)
        for (const spawn of squad) {
          expect(['king', ...SLIDERS]).toContain(spawn.typeId)
        }
      }
    }
  })

  it('sits every squad member on a contiguous band of files', () => {
    for (const roundNumber of [15, 23, 31, 39]) {
      for (const squad of squadsOf(guardSpec(roundNumber))) {
        const files = squad.map((s) => s.file).sort((a, b) => a - b)
        // Contiguous band: each pair of neighbours differs by 1. Checked
        // circularly so a wrap (if the clamp ever lets one through) is caught
        // as a single >1 gap rather than a break.
        const gaps = []
        for (let i = 0; i < files.length; i += 1) {
          const next = files[(i + 1) % files.length] as number
          const gap = (next - (files[i] as number) + 8) % 8
          if (gap !== 1) gaps.push(gap)
        }
        expect(gaps).toHaveLength(1)
      }
    }
  })

  it('keeps both flanking sliders adjacent to their King on the Staging rank', () => {
    for (const roundNumber of [15, 23, 31]) {
      for (const squad of squadsOf(guardSpec(roundNumber))) {
        const king = squad.find((s) => s.typeId === 'king') as Spawn
        expect(king).toBeDefined()
        // A King on the Staging rank has exactly two squares within Chebyshev
        // distance 1: the files immediately beside it. The band is contiguous
        // (asserted above), so the flanking sliders are the squad members at
        // king.file - 1 and king.file + 1 — where a band edge clips one, the
        // single flanking slider is beside the King instead.
        const adjacent = squad.filter(
          (s) => s.typeId !== 'king' && Math.abs(s.file - king.file) <= 1,
        )
        expect(adjacent.length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('assigns tiers from the normal tier pool in spawn order', () => {
    const round = guardSpec(31)
    const tierPool = tierPoolFor(31)
    round.spawns.forEach((spawn, i) => {
      expect(spawn.tier).toBe(tierPool[i % tierPool.length])
    })
  })
})
