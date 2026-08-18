import { towerType } from '../data/towerTypes'
import { allSquares, squareKey, squaresEqual } from './board'
import type { BoardSpec, Square, Tower, TowerGeometry } from './types'

/**
 * Whether a Tower at `from` with this geometry and range can hit `target`.
 *
 * Range is measured in squares along the pattern, so a diagonal range of 3
 * reaches 3 squares diagonally rather than 3 squares of straight-line distance.
 *
 * Geometry answers "does this Tower see this square at all?" Occlusion is a
 * separate question answered by `isOccluded`: a Tower can see a square and
 * still not hit it, because another Tower stands between. `coversSquare` is
 * deliberately occlusion-blind — `firePulse` reads it and it is not a shot.
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
    // The Wall. It blocks and soaks and never shoots, so there is no
    // square it covers — including at a generous range.
    case 'none':
      return false
    // The toll gate. The FULL file width, bounded only in board
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
    // Cross and diagonal combined.
    case 'star':
      return rankDistance === 0 || fileDistance === 0 || fileDistance === rankDistance
    // The outer two squares of its reach only — it is blind at its own feet,
    // which is what makes its hollow core a socket for a short-range Tower
    // rather than a flaw.
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

/**
 * Every square on the board this Tower covers, origin excluded and clipped to
 * the board's extent.
 *
 * The list form of `coversSquare`, for callers that want to draw a footprint
 * rather than ask about one square. Kept here, beside the predicate, so the
 * overlay the player reads and the shot the engine takes cannot disagree.
 *
 * Reads the extent from `board` — never a module constant. An Ace grows the
 * board, so a footprint derived from a constant would stop at the old edge.
 *
 * Allocates: not for a frame loop. `src/scene/firePulse.ts` deliberately walks
 * the same geometry with scratch objects because it runs in `useFrame`.
 */
export function coveredSquares(
  board: BoardSpec,
  geometry: TowerGeometry,
  range: number,
  from: Square,
): Square[] {
  return allSquares(board).filter((square) => coversSquare(geometry, range, from, square))
}

/**
 * Whether a Tower at `from` can actually hit `target` given the Towers that
 * stand between — the occlusion half of "preview cannot lie about a shot".
 *
 * `target` is occluded when some blocker stands STRICTLY between `from` and
 * `target` on one of the 8 compass rays: the same file, the same rank, or the
 * same diagonal. "Strictly" is load-bearing twice over — a blocker on the
 * shooter's own square and one beyond the target are both not between. A
 * target not on any compass ray (a ring or band square off the eight
 * directions) can never be occluded at all: there is no line to sit between
 * on. See the design spec for how this reads per geometry. When passed a
 * `geometry` of `'band'`, a target is occluded instead by any Tower on the
 * target's own rank, file strictly between `from` and `target` — the toll gate
 * fires a beam along each covered rank.
 *
 * `ignoresOcclusion` is the Sniper's exemption: when true, nothing occludes —
 * a shot passes through friendly Towers. Keyed on the type, never on the
 * geometry, because `adjacent` is shared with the splash Tower. The Staging
 * rank's damage immunity is a separate, bounds-level rule in `selectTargets`
 * and is NOT exempted here.
 *
 * Reads only the positions of the blocker set, so the answer cannot depend on
 * which Tower a caller happened to process first.
 */
export function isOccluded(
  from: Square,
  target: Square,
  blockers: readonly Square[],
  geometry?: TowerGeometry,
  ignoresOcclusion = false,
): boolean {
  if (ignoresOcclusion) return false

  const between = (a: number, b: number, c: number): boolean =>
    (a < b && b < c) || (c < b && b < a)

  // Rank 10's toll gate fires a horizontal beam along every covered rank, so
  // a band target on rank `r` is blocked by a Tower on that same rank `r`,
  // file strictly between the gate and the target. At the band's range of 1
  // this subsumes the compass-ray test on every band square: same-rank
  // targets are caught by both, and the file and diagonal squares the ray
  // test could see have no square strictly between. If the band's range is
  // ever raised, the two tests stop agreeing at diagonal distance 2 and need
  // merging again.
  if (geometry === 'band') {
    if (target.file === from.file) return false
    for (const blocker of blockers) {
      if (blocker.rank === target.rank && between(from.file, blocker.file, target.file)) {
        return true
      }
    }
    return false
  }

  const fileDelta = target.file - from.file
  const rankDelta = target.rank - from.rank
  const onFile = fileDelta === 0 && rankDelta !== 0
  const onRank = rankDelta === 0 && fileDelta !== 0
  const onDiagonal = Math.abs(fileDelta) === Math.abs(rankDelta) && fileDelta !== 0

  // A target on no compass ray cannot be occluded by anything. That is the
  // ring and band off-ray squares, and it is a property, not a gap.
  if (!onFile && !onRank && !onDiagonal) return false

  for (const blocker of blockers) {
    if (squaresEqual(blocker, from)) continue

    if (onFile && blocker.file === from.file && between(from.rank, blocker.rank, target.rank)) {
      return true
    }
    if (onRank && blocker.rank === from.rank && between(from.file, blocker.file, target.file)) {
      return true
    }
    if (onDiagonal) {
      const blockerFileDelta = blocker.file - from.file
      const blockerRankDelta = blocker.rank - from.rank
      if (
        // On the same diagonal line as `from`...
        Math.abs(blockerFileDelta) === Math.abs(blockerRankDelta) &&
        // ...headed the same way as the target (blocks the anti-diagonal),
        // ...and strictly between rather than at or beyond the target.
        blockerFileDelta !== 0 &&
        Math.sign(blockerFileDelta) === Math.sign(fileDelta) &&
        Math.sign(blockerRankDelta) === Math.sign(rankDelta) &&
        Math.abs(blockerFileDelta) < Math.abs(fileDelta)
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Every square this Tower can actually hit, given the Towers standing between.
 *
 * The list form of `coversSquare` + `isOccluded`, for the callers that want a
 * footprint rather than one square — the two coverage overlays in `src/scene`.
 * An empty blocker list is exactly `coveredSquares`: a Tower alone never
 * occludes itself, because a Tower is never strictly between itself and a
 * target. `ignoresOcclusion` passes straight through to `isOccluded` — the
 * Sniper's footprint is its full geometric disc, because its shots pass
 * through friendly Towers.
 */
export function reachableSquares(
  board: BoardSpec,
  geometry: TowerGeometry,
  range: number,
  from: Square,
  blockers: readonly Square[],
  ignoresOcclusion = false,
): Square[] {
  return coveredSquares(board, geometry, range, from).filter(
    (square) => !isOccluded(from, square, blockers, geometry, ignoresOcclusion),
  )
}

/**
 * Every square on the board that at least one Tower can actually hit, keyed by
 * `squareKey`.
 *
 * The union of `reachableSquares` across the Tower list — occlusion-aware, so
 * a square a Tower can see but another Tower hides is not in the set. This is
 * the footprint the firing overlays draw, which is what makes it the right
 * thing for yellow's hunt to dodge: the squares a shot would actually land on
 * and the squares yellow avoids are the same set by construction. The Wall's
 * `geometry: 'none'` contributes nothing.
 *
 * A pure function of the board and the Tower list, so the avoidance it feeds
 * stays deterministic within a seeded run. Allocates: `movePieces` in tick.ts
 * calls it once per tick, never from a frame loop.
 */
export function hittableSquares(board: BoardSpec, towers: readonly Tower[]): ReadonlySet<string> {
  const blockers = towers.map((tower) => tower.square)
  const covered = new Set<string>()

  for (const tower of towers) {
    const def = towerType(tower.type)
    for (const square of reachableSquares(
      board,
      def.geometry,
      tower.range,
      tower.square,
      blockers,
      def.ignoresOcclusion,
    )) {
      covered.add(squareKey(square))
    }
  }

  return covered
}
