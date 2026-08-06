import { isInBounds, squareKey } from './board'
import type { BoardSpec, Square } from './types'

/**
 * The eight knight-move offsets, in one fixed order.
 *
 * Both the BFS below and `huntCore` in movement.ts iterate this same array —
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
 * Knight-move distance to the Core, for every square, cached per board and
 * Core square.
 *
 * The cache is a memoisation of a pure function — the board and Core square
 * are fixed for the lifetime of a run, so the same key always maps to the
 * same field — not mutable game state. It makes `knightDistanceField` build
 * the BFS once rather than once per hop, but it cannot make the simulation
 * depend on call order, wall-clock time, or anything else that would break
 * determinism.
 */
const fieldCache = new Map<string, ReadonlyMap<string, number>>()

function cacheKey(board: BoardSpec, core: Square): string {
  return `${board.files}x${board.ranks}@${core.file},${core.rank}`
}

/**
 * Breadth-first search over knight moves, seeded at the Core.
 *
 * Starting from the Core rather than from each Piece's square is what makes
 * one search cover the whole board: a knight move is its own inverse — if A
 * can hop to B, B can hop back to A — so "distance from the Core" and
 * "distance to the Core" are the same number for every square. One BFS from
 * a single origin is therefore enough.
 *
 * Deliberately built with no knowledge of Towers — `board` and `core` are
 * the entire input. See `knightMove` in movement.ts for why: a field that
 * routed around Towers would let Tower placement steer a hunting Knight,
 * exactly the mazing the "no pathfinding" invariant forbids.
 */
function buildDistanceField(board: BoardSpec, core: Square): ReadonlyMap<string, number> {
  const distances = new Map<string, number>()
  distances.set(squareKey(core), 0)

  let frontier: readonly Square[] = [core]
  while (frontier.length > 0) {
    const next: Square[] = []
    for (const square of frontier) {
      // Every square reachable from `frontier` was recorded when it was
      // itself discovered, so this lookup is only ever undefined for a
      // square that was never added to `frontier` in the first place.
      const distance = distances.get(squareKey(square))
      if (distance === undefined) continue

      for (const offset of KNIGHT_OFFSETS) {
        const neighbour: Square = {
          file: square.file + offset.file,
          rank: square.rank + offset.rank,
        }
        if (!isInBounds(board, neighbour)) continue

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

/**
 * Knight-move distance to the Core for every square on an empty board,
 * built once per board and Core square and cached thereafter.
 */
export function knightDistanceField(board: BoardSpec, core: Square): ReadonlyMap<string, number> {
  const key = cacheKey(board, core)
  const cached = fieldCache.get(key)
  if (cached) return cached

  const field = buildDistanceField(board, core)
  fieldCache.set(key, field)
  return field
}
