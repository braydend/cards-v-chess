import { pieceType } from '../data/pieceTypes'
import type { Piece, PieceTypeId, Square } from './types'

/**
 * Aura effects. The Bishop's healing is still derived per pulse from
 * positions; the King's is **latched** — a King-touch permanently grants a
 * stack, and the stack is what movement reads, never the current position.
 *
 * The episode bookkeeping lives on the Piece (`kingAuraStacks`,
 * `kingAuraKings`) rather than in a separate module map, so it survives in the
 * engine state and the renderer can read the permanent stacks without
 * re-deriving anything.
 */

/** Move interval multiplier per King-aura stack. Lower is faster. Compounding: 0.7^stacks. */
export const KING_SPEED_MULTIPLIER = 0.7

/** Extra squares per hop per King-aura stack, granted to sliders. */
export const KING_SLIDE_BONUS = 1

/** Max and current health gained per King-aura stack, the moment the stack lands. */
export const KING_HEALTH_BONUS = 1

/** Milliseconds between a Bishop's healing pulses. */
export const BISHOP_HEAL_INTERVAL_MS = 1500

/** Health restored to each Piece in range on a Bishop's pulse. */
export const BISHOP_HEAL_AMOUNT = 2

/** Chebyshev distance a Bishop's healing reaches, in squares. */
export const BISHOP_HEAL_RADIUS = 2

const EMPTY_ADJACENCY: ReadonlyMap<string, readonly string[]> = new Map()

/** Squares of king-move distance between two squares. */
export function chebyshev(a: Square, b: Square): number {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank))
}

/**
 * The King ids adjacent to each Piece, read from the positions in `pieces`.
 *
 * Exclusion is per-Piece, not per-type: a King never buffers itself, but a
 * King standing beside a *different* King is a target like any other Piece.
 */
export function kingAdjacentKings(
  pieces: readonly Piece[],
): ReadonlyMap<string, readonly string[]> {
  const kings = pieces.filter((piece) => piece.typeId === 'king')
  if (kings.length === 0) return EMPTY_ADJACENCY

  const byPiece = new Map<string, string[]>()
  for (const king of kings) {
    for (const other of pieces) {
      if (other.id === king.id) continue
      if (chebyshev(king.square, other.square) === 1) {
        const list = byPiece.get(other.id)
        if (list) list.push(king.id)
        else byPiece.set(other.id, [king.id])
      }
    }
  }
  return byPiece
}

/**
 * Latches new King-aura episodes and applies the defense grant.
 *
 * For each Piece: every King in today's adjacency that was NOT adjacent on
 * the last computation is a new episode, worth one stack and one +1 to both
 * max and current health. The stored adjacency (`kingAuraKings`) is refreshed
 * to today's, so a King leaving clears it and re-entering counts fresh.
 *
 * Call once per tick, BEFORE movement, on tick-start positions (the freshly
 * spawned Pieces included, so a guard squad earns its first stack on entry).
 * Reads `pieces` as a frozen array and never its own output, so the result
 * cannot depend on processing order. Returns the input array unchanged when
 * no Piece gains or loses adjacency, so a steady state costs nothing.
 */
export function applyKingAura(
  pieces: readonly Piece[],
  adjacentKings: ReadonlyMap<string, readonly string[]>,
): readonly Piece[] {
  let changed = false

  const updated = pieces.map((piece) => {
    const kings = adjacentKings.get(piece.id)
    if (kings === undefined) {
      if (piece.kingAuraKings.length === 0) return piece
      changed = true
      return { ...piece, kingAuraKings: [] }
    }

    const fresh = kings.filter((kingId) => !piece.kingAuraKings.includes(kingId))
    if (fresh.length === 0 && kings.length === piece.kingAuraKings.length) return piece

    changed = true
    return {
      ...piece,
      kingAuraStacks: piece.kingAuraStacks + fresh.length,
      kingAuraKings: kings,
      maxHealth: piece.maxHealth + fresh.length * KING_HEALTH_BONUS,
      health: piece.health + fresh.length * KING_HEALTH_BONUS,
    }
  })

  return changed ? updated : pieces
}

/** The move interval for a Piece with `stacks` King-aura stacks. 0.7^stacks compounding. */
export function kingMoveInterval(baseIntervalMs: number, stacks: number): number {
  return baseIntervalMs * KING_SPEED_MULTIPLIER ** stacks
}

/** Extra squares per hop from `stacks` King-aura stacks. Sliders only. */
export function kingSlideBonus(typeId: PieceTypeId, stacks: number): number {
  return pieceType(typeId).slides ? KING_SLIDE_BONUS * stacks : 0
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
      // The cap is the Piece's own maxHealth — what it spawned with — so a
      // heal restores to what the Piece actually had, rather than re-reading
      // the authored stat, which every Piece spawns at.
      health: Math.min(piece.maxHealth, piece.health + amount),
    }
  })
}
