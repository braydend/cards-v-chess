import type { PieceTier, TierDef } from '../game/types'

/**
 * The four piece tiers. A tier is a small set of behaviour flags; it never
 * touches a Piece's type, stats, or Ink reward. Green is exactly today's
 * logic. The reach radius and the 50% dodge are PLACEHOLDER tuning, not design.
 */
export const TIERS: Record<PieceTier, TierDef> = {
  green: { id: 'green', label: 'Green', huntsFromSpawn: false, seeksTowers: false, dodgeChance: 0, reachInMoves: 0 },
  yellow: { id: 'yellow', label: 'Yellow', huntsFromSpawn: true, seeksTowers: false, dodgeChance: 0, reachInMoves: 0 },
  red: { id: 'red', label: 'Red', huntsFromSpawn: false, seeksTowers: true, dodgeChance: 0, reachInMoves: 6 },
  black: { id: 'black', label: 'Black', huntsFromSpawn: false, seeksTowers: false, dodgeChance: 0.5, reachInMoves: 0 },
}

export function tierDef(id: PieceTier): TierDef {
  return TIERS[id]
}
