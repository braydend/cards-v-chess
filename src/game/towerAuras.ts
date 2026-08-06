import { towerRank } from '../data/towerRanks'
import { coversSquare } from './coverage'
import type { Piece, Tower } from './types'

/**
 * Tower-side auras — the Cards faction's answer to `auras.ts`, which owns the
 * Chess faction's King and Bishop auras.
 *
 * Both auras here are DERIVED PER TICK FROM POSITION and stored nowhere. A
 * Piece is amplified while it stands inside a ring, not for N seconds after
 * being hit. That is a deliberate design choice, not an implementation detail:
 *
 * - No per-Piece duration state, so nothing new changes every tick, so nothing
 *   here can end up in `structuralKey` and push a React render per frame.
 * - Non-stacking falls out for free, matching the King aura's documented
 *   choice rather than inventing a second rule for the same question.
 * - Placement matters. A timed debuff travels with the Piece and stops caring
 *   where the Tower was; an aura is bounded by coverage.
 *
 * Both functions read their Piece and Tower lists as frozen arrays and never
 * re-read what they are building, so no Piece's outcome can depend on which
 * Tower the caller happened to process first — the same discipline `auras.ts`
 * and `tick.ts`'s Tower map already apply.
 */

/** Damage multiplier a Piece inside an Amplifier's ring takes from other Towers. */
export const AMPLIFIER_MULTIPLIER = 2

/**
 * Piece id to the ids of every Amplifier covering it.
 *
 * Ids rather than a boolean because the Amplifier must not amplify its own
 * fire — see `amplificationFor`. A plain set of "amplified pieces" could not
 * express that.
 */
export function amplifierIdsByPiece(
  towers: readonly Tower[],
  pieces: readonly Piece[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const byPiece = new Map<string, Set<string>>()

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    if (def.aura !== 'amplify') continue

    for (const piece of pieces) {
      if (!coversSquare(def.geometry, def.range, tower.square, piece.square)) continue

      const existing = byPiece.get(piece.id)
      if (existing) existing.add(tower.id)
      else byPiece.set(piece.id, new Set([tower.id]))
    }
  }

  return byPiece
}

/**
 * The damage multiplier `towerId`'s shot gets against `pieceId`.
 *
 * AN AMPLIFIER NEVER AMPLIFIES ITSELF. Without that exclusion a lone rank 8 is
 * self-sufficient, which rebuilds the dominance problem issue #19 reported one
 * rank further along — the Amplifier's whole identity is being worthless alone
 * and excellent beside a short-range Tower. This mirrors the King never
 * buffing itself and `applyHealing`'s `other.id === piece.id` check, so all
 * three auras in the codebase agree on what "other" means.
 *
 * Auras do not stack: two Amplifiers are one Amplifier.
 */
export function amplificationFor(
  towerId: string,
  pieceId: string,
  amplifiers: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const sources = amplifiers.get(pieceId)
  if (!sources) return 1

  for (const sourceId of sources) {
    if (sourceId !== towerId) return AMPLIFIER_MULTIPLIER
  }

  return 1
}
