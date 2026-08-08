import type { PieceTier, PieceTypeId, RoundSpec, Spawn } from '../game/types'
import { spawnGapMs } from '../game/spawnScaling'
import { BOARD } from './board'

/**
 * Round composition.
 *
 * Deliberately deterministic — a given round number always produces the same
 * spawns. There is no randomness anywhere in the engine; if Round variety is
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
 * The round a tier starts appearing. The spread is a deliberate delay: the
 * player meets one behaviour change at a time, on top of the steadily growing
 * roster. PLACEHOLDER tuning.
 */
export const TIER_INTRODUCED_AT: Record<PieceTier, number> = {
  green: 1,
  yellow: 4, // PLACEHOLDER
  red: 8, // PLACEHOLDER
  black: 12, // PLACEHOLDER
}

const TIER_ORDER: readonly PieceTier[] = ['green', 'yellow', 'red', 'black']

const TIER_BASE_WEIGHT: Record<PieceTier, number> = {
  green: 4,
  yellow: 3,
  red: 2,
  black: 1,
}

/**
 * A tier's weight in a round. The mix shifts as the run progresses: green
 * recedes from its starting 4 (floored at 1) and every unlocked tier grows
 * from its base. All PLACEHOLDER tuning; the shape — never before the unlock
 * round, always present in it, shifting toward the higher tiers — is design.
 */
function tierWeight(tier: PieceTier, roundNumber: number): number {
  const since = roundNumber - TIER_INTRODUCED_AT[tier]
  if (since < 0) return 0
  if (tier === 'green') return Math.max(1, TIER_BASE_WEIGHT.green - since)
  return TIER_BASE_WEIGHT[tier] + since
}

/**
 * The weighted tier pool for a round, interleaved exactly like `poolFor` so a
 * newly unlocked tier appears in the very round it unlocks.
 */
function tierPoolFor(roundNumber: number): PieceTier[] {
  const passes = Math.max(...TIER_ORDER.map((tier) => tierWeight(tier, roundNumber)))
  const pool: PieceTier[] = []

  for (let pass = 1; pass <= passes; pass += 1) {
    for (const tier of TIER_ORDER) {
      if (tierWeight(tier, roundNumber) >= pass) pool.push(tier)
    }
  }

  return pool
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
  const tierPool = tierPoolFor(roundNumber)
  const count = 2 + roundNumber
  const spawns: Spawn[] = []

  for (let i = 0; i < count; i += 1) {
    spawns.push({
      // The gap shrinks with the round number — `spawnGapMs` — so the same
      // round presses harder without adding Pieces. Round 1 keeps the flat
      // 1200ms, so the opening rounds play exactly as before.
      atMs: i * spawnGapMs(roundNumber),
      // `pool` is never empty — the Pawn is available from round 1.
      typeId: pool[i % pool.length] as PieceTypeId,
      // `tierPool` is never empty — Green is available from round 1.
      tier: tierPool[i % tierPool.length] as PieceTier,
      file: (i * 3 + roundNumber) % BOARD.files,
    })
  }

  return { number: roundNumber, spawns }
}
