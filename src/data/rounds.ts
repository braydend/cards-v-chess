import type { RoundSpec, Spawn } from '../game/types'
import { BOARD } from './board'

/**
 * PLACEHOLDER round generator.
 *
 * Deliberately deterministic — a given round number always produces the same
 * spawns. The engine contains no randomness at all; if wave variety is wanted
 * later it must come from a seeded PRNG carried in state, never `Math.random`,
 * or the simulation stops being reproducible in tests.
 *
 * Real round composition depends on the piece roster, which is now designed but
 * not yet implemented — only the placeholder Pawn exists to spawn. See CLAUDE.md.
 */
export function roundSpec(roundNumber: number): RoundSpec {
  const count = 2 + roundNumber
  const spawns: Spawn[] = []

  for (let i = 0; i < count; i += 1) {
    spawns.push({
      atMs: i * 1200,
      typeId: 'pawn',
      file: (i * 3 + roundNumber) % BOARD.files,
    })
  }

  return { number: roundNumber, spawns }
}
