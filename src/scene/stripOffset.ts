/**
 * How far the board must pan to clear the selected-card strip, in world units.
 *
 * The caller pushes `controls.target.x` by the result — positive x moves the
 * board left on screen, clearing a menu that docks right. Pixels are converted
 * through the board's own projected width, so no camera math lives here: the
 * caller projects the board's left/right edges and passes pixels.
 *
 * A negative overlap (the strip is already clear) and a degenerate input (a
 * zero-width or non-finite board, or a non-finite strip edge) all return 0:
 * there is nothing to pan.
 * The result is clamped to `maxPan` so the Core stays reachable.
 */
export function panOffsetForStrip(input: {
  stripLeftPx: number
  boardLeftPx: number
  boardRightPx: number
  boardFiles: number
  maxPan: number
}): number {
  if (!Number.isFinite(input.stripLeftPx)) return 0
  const pxPerWorld = (input.boardRightPx - input.boardLeftPx) / input.boardFiles
  if (!Number.isFinite(pxPerWorld) || pxPerWorld <= 0) return 0

  const overlapWorld = (input.boardRightPx - input.stripLeftPx) / pxPerWorld
  return Math.max(0, Math.min(overlapWorld, input.maxPan))
}

/**
 * Cubic ease-out for the ~200ms board glide: fast start, slow arrival.
 * `t` is a 0..1 progress fraction.
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
