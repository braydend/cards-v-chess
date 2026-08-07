/**
 * Per-Piece distance fields for hunting.
 *
 * A hunting Piece's direction comes from a breadth-first search over its own
 * movement, seeded at the square it hunts — the Core, except for a
 * colour-locked Bishop, which hunts the square directly in front of the Core
 * (see the bishop case in movement.ts). Distances count *moves*, not squares:
 * a slide of any length is one move.
 *
 * Every move set here is symmetric — each move is its own inverse — so "distance
 * from the seed" and "distance to the seed" are the same number, and one BFS
 * from the seed covers every square that can reach it. Sliders expand whole
 * rays per move (a rook slide of any length is one move); the Knight and the
 * King expand single steps.
 *
 * Deliberately built with no knowledge of Towers — the board and the seed are
 * the entire input. A field that routed around Towers would let Tower placement
 * steer a hunting Piece, exactly the mazing the "no pathfinding" invariant
 * forbids. See huntByField in movement.ts for how a blocked hunt resolves.
 */
import { isInBounds, squareKey } from './board'
import type { BoardSpec, Square } from './types'

/**
 * The eight knight-move offsets, in one fixed order.
 *
 * Both the BFS below and `huntByOffsets` in movement.ts iterate this same array —
 * a hunting Knight scans it in this order and commits to the first offset
 * whose destination is a hop closer to the Core, so this order is what makes
 * that choice deterministic rather than "some in-bounds candidate at d − 1,
 * unspecified which one".
 */
export const KNIGHT_OFFSETS: readonly Square[] = [
  { file: 1, rank: 2 },
  { file: -1, rank: 2 },
  { file: 1, rank: -2 },
  { file: -1, rank: -2 },
  { file: 2, rank: 1 },
  { file: -2, rank: 1 },
  { file: 2, rank: -1 },
  { file: -2, rank: -1 },
]

/**
 * The four orthogonal directions, in one fixed order. The Rook hunts along
 * these; they are also the first half of the King's and Queen's directions,
 * so an orthogonal line wins any tie they are part of.
 */
export const ORTHOGONAL_OFFSETS: readonly Square[] = [
  { file: 1, rank: 0 },
  { file: -1, rank: 0 },
  { file: 0, rank: 1 },
  { file: 0, rank: -1 },
]

/** The four diagonal directions, in one fixed order. The Bishop hunts along these. */
export const DIAGONAL_OFFSETS: readonly Square[] = [
  { file: 1, rank: 1 },
  { file: -1, rank: 1 },
  { file: 1, rank: -1 },
  { file: -1, rank: -1 },
]

/** All eight King directions — orthogonal first, then diagonal. */
export const ROYAL_OFFSETS: readonly Square[] = [...ORTHOGONAL_OFFSETS, ...DIAGONAL_OFFSETS]

/** The squares one move away. Sliders expand whole rays; steppers expand single steps. */
type Neighbours = (board: BoardSpec, from: Square) => Square[]

function stepNeighbours(offsets: readonly Square[]): Neighbours {
  return (board, from) => {
    const neighbours: Square[] = []
    for (const offset of offsets) {
      const square: Square = { file: from.file + offset.file, rank: from.rank + offset.rank }
      if (isInBounds(board, square)) neighbours.push(square)
    }
    return neighbours
  }
}

function rayNeighbours(directions: readonly Square[]): Neighbours {
  return (board, from) => {
    const neighbours: Square[] = []
    for (const direction of directions) {
      let square: Square = { file: from.file + direction.file, rank: from.rank + direction.rank }
      while (isInBounds(board, square)) {
        neighbours.push(square)
        square = { file: square.file + direction.file, rank: square.rank + direction.rank }
      }
    }
    return neighbours
  }
}

/**
 * The cache is a memoisation of a pure function — the board and the seed are
 * fixed for the lifetime of a run, so the same key always maps to the same
 * field — not mutable game state. It cannot make the simulation depend on
 * call order, wall-clock time, or anything else that would break determinism.
 */
const fieldCache = new Map<string, ReadonlyMap<string, number>>()

function cacheKey(board: BoardSpec, seed: Square, tag: string): string {
  return `${tag}:${board.files}x${board.ranks}@${seed.file},${seed.rank}`
}

function buildDistanceField(board: BoardSpec, seed: Square, neighbours: Neighbours): ReadonlyMap<string, number> {
  const distances = new Map<string, number>()
  distances.set(squareKey(seed), 0)

  let frontier: readonly Square[] = [seed]
  while (frontier.length > 0) {
    const next: Square[] = []
    for (const square of frontier) {
      const distance = distances.get(squareKey(square))
      if (distance === undefined) continue

      for (const neighbour of neighbours(board, square)) {
        const key = squareKey(neighbour)
        if (distances.has(key)) continue

        distances.set(key, distance + 1)
        next.push(neighbour)
      }
    }
    frontier = next
  }

  return distances
}

function distanceField(
  board: BoardSpec,
  seed: Square,
  tag: string,
  neighbours: Neighbours,
): ReadonlyMap<string, number> {
  const key = cacheKey(board, seed, tag)
  const cached = fieldCache.get(key)
  if (cached) return cached

  const field = buildDistanceField(board, seed, neighbours)
  fieldCache.set(key, field)
  return field
}

/** Knight-move distance to the Core for every square, as the Knight hunts it. */
export function knightDistanceField(board: BoardSpec, core: Square): ReadonlyMap<string, number> {
  return distanceField(board, core, 'knight', stepNeighbours(KNIGHT_OFFSETS))
}

/** Rook-move distance in moves: 0 at the seed, 1 on its rank or file, 2 elsewhere. */
export function rookDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'rook', rayNeighbours(ORTHOGONAL_OFFSETS))
}

/**
 * Bishop-move distance in moves. Covers exactly the seed's square colour;
 * opposite-colour squares have no entry at all.
 */
export function bishopDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'bishop', rayNeighbours(DIAGONAL_OFFSETS))
}

/** Queen-move distance in moves: 0 at the seed, 1 on any shared line, 2 elsewhere. */
export function queenDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'queen', rayNeighbours(ROYAL_OFFSETS))
}

/** King-move distance: Chebyshev distance to the seed. */
export function kingDistanceField(board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  return distanceField(board, seed, 'king', stepNeighbours(ROYAL_OFFSETS))
}
