import { pieceType } from '../data/pieceTypes'
import type { Piece, Square } from './types'

/**
 * Aura effects, derived from Piece positions.
 *
 * `chebyshev` and `slideBonusFor` are plain geometry helpers with no opinion
 * about when they are called. `buffedPieceIds` and `applyHealing` read a
 * Piece list too, but the property that matters is not *when in the tick*
 * that list was taken — the two are fed at different points (`tick.ts` calls
 * `buffedPieceIds` before movement, `applyHealing` after Tower fire) — it is
 * that each reads its input as a frozen array and never the result it is
 * building. Neither one mutates or re-reads its own output mid-pass, so the
 * outcome for any one Piece cannot depend on which other Piece the caller
 * happened to process first — the same discipline `tick.ts` applies to its
 * Tower map.
 */

/** Move interval multiplier for a Piece standing beside a King. Lower is faster. */
export const KING_SPEED_MULTIPLIER = 0.7

/** Extra squares per hop a King grants an adjacent slider. */
export const KING_SLIDE_BONUS = 1

/** Milliseconds between a Bishop's healing pulses. */
export const BISHOP_HEAL_INTERVAL_MS = 1500

/** Health restored to each Piece in range on a Bishop's pulse. */
export const BISHOP_HEAL_AMOUNT = 2

/** Chebyshev distance a Bishop's healing reaches, in squares. */
export const BISHOP_HEAL_RADIUS = 2

const NONE: ReadonlySet<string> = new Set()

/** Squares of king-move distance between two squares. */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank))
}

/**
 * Every Piece currently standing beside a King.
 *
 * Membership, not a count: the aura deliberately does **not** stack, so two
 * Kings buff exactly as much as one. Exclusion is per-Piece, not per-type —
 * a King never buffs itself, but a King standing beside a *different* King
 * is buffed like any other adjacent Piece. Mirrors `applyHealing`'s
 * `other.id === piece.id` self-check below, so the two auras in this file
 * agree on what "other" means.
 */
export function buffedPieceIds(pieces: readonly Piece[]): ReadonlySet<string> {
  const kings = pieces.filter((piece) => piece.typeId === 'king')
  if (kings.length === 0) return NONE

  const buffed = new Set<string>()

  for (const king of kings) {
    for (const other of pieces) {
      if (other.id === king.id) continue
      if (chebyshev(king.square, other.square) === 1) buffed.add(other.id)
    }
  }

  return buffed
}

/** Whether a Piece type gains slide distance from a King. */
export function slideBonusFor(piece: Piece, buffed: ReadonlySet<string>): number {
  if (!buffed.has(piece.id)) return 0
  return pieceType(piece.typeId).slides ? KING_SLIDE_BONUS : 0
}

/**
 * Advances every Bishop's aura cooldown and applies the pulses that come due.
 *
 * Adjacency is measured against the Piece list as passed in, so two Bishops
 * heal the same targets regardless of order. They **do** stack: they are two
 * separate sources, not one effect applied twice. Unlike the King aura, a
 * Piece sharing a Bishop's own square counts as in range — "within two
 * squares" naturally includes distance zero, since only Towers block a
 * square, not other Pieces.
 *
 * Call this after Tower fire has already removed dead Pieces, so a Bishop can
 * never resurrect one.
 */
export function applyHealing(pieces: readonly Piece[], dtMs: number): Piece[] {
  const healing = new Map<string, number>()

  const cooled = pieces.map((piece) => {
    if (piece.typeId !== 'bishop') return piece

    let cooldown = piece.auraCooldownMs + dtMs

    while (cooldown >= BISHOP_HEAL_INTERVAL_MS) {
      cooldown -= BISHOP_HEAL_INTERVAL_MS

      for (const other of pieces) {
        if (other.id === piece.id) continue
        if (chebyshev(piece.square, other.square) > BISHOP_HEAL_RADIUS) continue
        healing.set(other.id, (healing.get(other.id) ?? 0) + BISHOP_HEAL_AMOUNT)
      }
    }

    return { ...piece, auraCooldownMs: cooldown }
  })

  if (healing.size === 0) return cooled

  return cooled.map((piece) => {
    const amount = healing.get(piece.id)
    if (amount === undefined) return piece

    return {
      ...piece,
      health: Math.min(pieceType(piece.typeId).maxHealth, piece.health + amount),
    }
  })
}
