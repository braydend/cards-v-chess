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
  }
}
