/**
 * Presentation constants, tunable by feel. PLACEHOLDERS, and nothing in the
 * engine reads them.
 */
export const PROMOTION_POP_MS = 300

const PEAK = 1.5
const PEAK_AT = 0.35
const LIFT = 0.35

/**
 * A multiplier on a freshly promoted Queen's scale, 1 once the pop is spent.
 *
 * A MULTIPLIER, not a replacement: `Pieces.tsx` already scales a Piece by its
 * health, and a promoted Queen that is shot immediately must still shrink. It
 * therefore has to return to exactly 1, or every promoted Queen ends the pop
 * permanently the wrong size.
 *
 * Applied to the live Queen's own mesh rather than to a ghost. A promoted Queen
 * gets a fresh entity id, and `Pieces` keys each mesh on `piece.id`, so the
 * first frame a mesh sees IS the promotion — no diff is needed to detect it.
 */
export function promotionPopScale(ageMs: number): number {
  if (ageMs < 0 || ageMs >= PROMOTION_POP_MS) return 1

  const progress = ageMs / PROMOTION_POP_MS

  if (progress < PEAK_AT) {
    return 1 + (PEAK - 1) * (progress / PEAK_AT)
  }

  return PEAK - (PEAK - 1) * ((progress - PEAK_AT) / (1 - PEAK_AT))
}

/**
 * A brief lift above the board, so the pop reads as an upgrade rising rather
 * than a wobble in place. Sine, so it eases at both ends and lands flat.
 */
export function promotionPopLift(ageMs: number): number {
  if (ageMs < 0 || ageMs >= PROMOTION_POP_MS) return 0

  return Math.sin((ageMs / PROMOTION_POP_MS) * Math.PI) * LIFT
}
