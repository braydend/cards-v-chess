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
 * A Piece's amplification is not multiplied by how many Amplifiers cover it —
 * two Amplifiers give exactly the same 2x as one, never 4x. But an Amplifier
 * is excluded only from its OWN aura, not from another Amplifier's: two
 * Amplifiers covering the same Piece each amplify the *other's* shot, so the
 * pair deals 2 each rather than 1. That is correct, not a stacking bug — it
 * mirrors `auras.ts`'s King, which buffs a different King standing beside it.
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

/**
 * Move-interval multiplier for a Piece inside a Freezer's coverage. Higher is
 * slower — the mirror image of `KING_SPEED_MULTIPLIER`, which is below 1.
 */
export const FREEZE_MULTIPLIER = 1.5

/**
 * Every Piece currently standing inside a Freezer's coverage.
 *
 * Membership, not a count: two Freezers slow exactly as much as one, matching
 * the King aura. Ids are not needed here the way they are for the Amplifier,
 * because a Freezer has nothing to exclude itself from — it slows Pieces, and
 * a Tower is not a Piece.
 *
 * NOTE THIS SLOWS GRINDING AS WELL AS WALKING. A blocked Piece attacks a Tower
 * on the same move cadence it would have walked on (see `movePieces`), so a
 * Freezer covering a Wall makes each ♥ buy more seconds of stall. That does
 * NOT loosen the round-termination bound — the ♥ supply is still fixed
 * mid-round, because `buyPack` is refused while a round is live — so rounds
 * get slower, never endless. Accepted deliberately; see "Repair versus the
 * wall" in the design doc.
 */
export function frozenPieceIds(
  towers: readonly Tower[],
  pieces: readonly Piece[],
): ReadonlySet<string> {
  const frozen = new Set<string>()

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    if (def.aura !== 'freeze') continue

    for (const piece of pieces) {
      if (coversSquare(def.geometry, def.range, tower.square, piece.square)) frozen.add(piece.id)
    }
  }

  return frozen
}
