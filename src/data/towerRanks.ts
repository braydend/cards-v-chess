import type { BuildableRank, TowerGeometry } from '../game/types'

/**
 * What each Card rank builds.
 *
 * The geometry ladder is agreed design: 2 adjacent, 3 vertical, 4 cross,
 * 5 diagonal.
 *
 * Rank 2 was originally horizontal. It was changed to adjacent because Pieces
 * travel almost straight down a file, so a horizontal line caught each Piece
 * for a single move interval — one shot, and a Pawn survived it. Adjacent keeps
 * a Piece covered for three squares of its approach instead.
 *
 * Range, damage, and fire interval are PLACEHOLDER balance values. The agreed
 * principle is that they scale with rank, because shape alone gives no power
 * curve (diagonal is not inherently better than cross). The specific numbers
 * are tuning, not design.
 *
 * Note the fire intervals are all shorter than the placeholder Pawn's 900ms
 * move cadence, so a Tower gets at least one shot at a Piece passing through
 * its coverage.
 */
export interface TowerRankDef {
  readonly geometry: TowerGeometry
  /** Squares along the pattern, not straight-line distance. */
  readonly range: number
  readonly damage: number
  readonly fireIntervalMs: number
  readonly maxHealth: number
  /**
   * Pieces hit by a single shot. `Number.POSITIVE_INFINITY` means everything
   * the Tower covers.
   *
   * This is what carries the top of the ladder. After adjacent, vertical, cross
   * and diagonal, the supply of generic non-chess silhouettes is spent, and the
   * candidates left over fight the power curve — a ring that only fires at exact
   * range is weaker up close. Scaling on target count has no such problem, and
   * it answers the Pawn swarm the roster is built around.
   */
  readonly targetsPerShot: number
}

/**
 * Range is NOT comparable across geometries: it counts squares along the
 * pattern, so `adjacent` range 3 is a 7x7 disc of 49 squares while `vertical`
 * range 4 is 8 squares. Rank 7's range of 3 is not a downgrade from rank 5's 5.
 *
 * Every value here except the geometry is a PLACEHOLDER. The agreed principle is
 * only that power rises with rank.
 */
export const TOWER_RANKS: Record<BuildableRank, TowerRankDef> = {
  2: { geometry: 'adjacent', range: 1, damage: 1, fireIntervalMs: 600, maxHealth: 8, targetsPerShot: 1 },
  3: { geometry: 'vertical', range: 4, damage: 1, fireIntervalMs: 600, maxHealth: 12, targetsPerShot: 1 },
  4: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 16, targetsPerShot: 1 },
  5: { geometry: 'diagonal', range: 5, damage: 3, fireIntervalMs: 500, maxHealth: 20, targetsPerShot: 1 },
  6: { geometry: 'star', range: 5, damage: 3, fireIntervalMs: 480, maxHealth: 24, targetsPerShot: 1 },
  7: { geometry: 'adjacent', range: 3, damage: 4, fireIntervalMs: 450, maxHealth: 28, targetsPerShot: 1 },
  8: { geometry: 'star', range: 6, damage: 4, fireIntervalMs: 420, maxHealth: 32, targetsPerShot: 3 },
  9: { geometry: 'adjacent', range: 3, damage: 5, fireIntervalMs: 400, maxHealth: 36, targetsPerShot: 5 },
  10: { geometry: 'adjacent', range: 4, damage: 6, fireIntervalMs: 380, maxHealth: 40, targetsPerShot: Number.POSITIVE_INFINITY },
}

export function towerRank(rank: BuildableRank): TowerRankDef {
  return TOWER_RANKS[rank]
}

/** Every rank the game can build, low to high. */
export const BUILDABLE_RANKS: readonly BuildableRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10]
