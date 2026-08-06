import type { Square, TowerGeometry } from './types'

/**
 * Whether a Tower at `from` with this geometry and range can hit `target`.
 *
 * Range is measured in squares along the pattern, so a diagonal range of 3
 * reaches 3 squares diagonally rather than 3 squares of straight-line distance.
 *
 * Nothing blocks line of fire — a Tower hits any covered square regardless of
 * what sits between. Piercing and blocking are not part of the design.
 */
export function coversSquare(
  geometry: TowerGeometry,
  range: number,
  from: Square,
  target: Square,
): boolean {
  const fileDistance = Math.abs(target.file - from.file)
  const rankDistance = Math.abs(target.rank - from.rank)
  const distance = Math.max(fileDistance, rankDistance)

  // A Tower never covers its own square. Nothing can stand there anyway: a
  // Piece that would land on a Tower attacks it instead of moving.
  if (distance === 0) return false

  // Handled before the shared range guard below, because neither one is a
  // function of Chebyshev distance in the way the rest of the ladder is.
  switch (geometry) {
    // Rank 7, the Wall. It blocks and soaks and never shoots, so there is no
    // square it covers — including at a generous range.
    case 'none':
      return false
    // Rank 10, the toll gate. The FULL file width, bounded only in board
    // ranks, so nothing can flank it. Files never grow (only board ranks do),
    // so a band spans the whole board for an entire run.
    case 'band':
      return rankDistance <= range
    default:
      break
  }

  if (distance > range) return false

  switch (geometry) {
    // Every direction. The distance guards above have already excluded the
    // Tower's own square and anything out of range, so at range 1 this is
    // exactly the eight neighbours.
    case 'adjacent':
      return true
    case 'horizontal':
      return rankDistance === 0
    case 'vertical':
      return fileDistance === 0
    case 'cross':
      return rankDistance === 0 || fileDistance === 0
    case 'diagonal':
      return fileDistance === rankDistance
    // Rank 6: cross and diagonal combined. Rank 4 taught the player that 4 is
    // 2 and 3 together; 6 being 4 and 5 together reads the same way.
    case 'star':
      return rankDistance === 0 || fileDistance === 0 || fileDistance === rankDistance
    // Rank 8, the Amplifier. The outer two squares of its reach only — it is
    // blind at its own feet, which is what makes its hollow core a socket for
    // a short-range Tower rather than a flaw.
    case 'ring':
      return distance >= range - 1
    // 'none' and 'band' are not cases here — they are returned above, before
    // the range guard, and TypeScript's control-flow analysis has already
    // narrowed them out of `geometry`'s type by this point. Listing them
    // would be a "not comparable" type error, not a no-op: the narrowed type
    // is exactly this switch's case list, so the switch stays exhaustive —
    // and adding a geometry without a case here still fails to typecheck —
    // without them.
  }
}
