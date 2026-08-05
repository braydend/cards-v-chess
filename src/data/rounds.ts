import type { PieceTypeId, RoundSpec, Spawn } from '../game/types'
import { BOARD } from './board'

/**
 * Round composition.
 *
 * Deliberately deterministic — a given round number always produces the same
 * spawns. There is no randomness anywhere in the engine; if wave variety is
 * wanted later it must come from a seeded PRNG carried in state, never
 * `Math.random`, or the simulation stops being reproducible.
 *
 * Types unlock progressively so the player meets one threat at a time and
 * learns its counter before the next arrives.
 */
export const INTRODUCED_AT: Record<PieceTypeId, number> = {
  pawn: 1,
  knight: 3,
  bishop: 5,
  rook: 7,
  queen: 9,
  king: 11,
}

/**
 * Relative frequency once a type is available. Pawns are chaff and should
 * dominate; a Queen or King is an event.
 */
const WEIGHT: Record<PieceTypeId, number> = {
  pawn: 6,
  knight: 3,
  bishop: 2,
  rook: 2,
  queen: 1,
  king: 1,
}

const ORDER: readonly PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

/**
 * The weighted pool of types available at a given round, **interleaved** rather
 * than grouped.
 *
 * Interleaving is load-bearing, not tidiness. A round is shorter than the pool
 * — round 11 spawns 13 Pieces from a pool of 15 — so a grouped pool
 * (`pawn,pawn,…,queen,king`) would simply never reach the rare types at the
 * end. Taking one copy of each available type per pass means any prefix of the
 * pool is representative, and a newly introduced type always appears in the
 * very round it unlocks.
 */
function poolFor(roundNumber: number): PieceTypeId[] {
  const available = ORDER.filter((typeId) => roundNumber >= INTRODUCED_AT[typeId])
  const passes = Math.max(...available.map((typeId) => WEIGHT[typeId]))
  const pool: PieceTypeId[] = []

  for (let pass = 1; pass <= passes; pass += 1) {
    for (const typeId of available) {
      if (WEIGHT[typeId] >= pass) pool.push(typeId)
    }
  }

  return pool
}

export function roundSpec(roundNumber: number): RoundSpec {
  const pool = poolFor(roundNumber)
  const count = 2 + roundNumber
  const spawns: Spawn[] = []

  for (let i = 0; i < count; i += 1) {
    spawns.push({
      atMs: i * 1200,
      // `pool` is never empty — the Pawn is available from round 1.
      typeId: pool[i % pool.length] as PieceTypeId,
      file: (i * 3 + roundNumber) % BOARD.files,
    })
  }

  return { number: roundNumber, spawns }
}
