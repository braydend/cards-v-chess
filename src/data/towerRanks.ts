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
   * A Tower-side aura, applied to every Piece this Tower covers.
   *
   * Optional because most ranks have none. Derived per tick from position and
   * stored nowhere — see `src/game/towerAuras.ts`. Deliberately NOT inferred
   * from geometry: a ring is a shape, `amplify` is a job, and a future rank
   * could want either without the other.
   */
  readonly aura?: 'amplify' | 'freeze'
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
 * The rank ladder, rebalanced for issue #19.
 *
 * TWO AXES MOVE IN OPPOSITE DIRECTIONS, AND THAT IS THE DESIGN. Coverage rises
 * with rank; single-target DPS falls. A rank 2 out-damages a rank 10 against a
 * single Piece by six times, permanently, so low ranks can never become
 * landfill. A rank 10 wins only when there is a crowd.
 *
 * Raising damage or shortening an interval at the top of the ladder without
 * cutting coverage to match rebuilds exactly the problem #19 reported: a
 * single rank-6 Tower placed centrally used to carry auto-rounds for 45+
 * rounds unattended. `towerRanks.test.ts` pins both axes.
 *
 * Range is NOT comparable across geometries: it counts squares along the
 * pattern, so `adjacent` range 3 is a 7x7 disc of 48 squares while `vertical`
 * range 4 is 8 squares. See the design spec for measured coverage per rank.
 *
 * Every number here is a PLACEHOLDER; the relationships are the design.
 */
export const TOWER_RANKS: Record<BuildableRank, TowerRankDef> = {
  2: { geometry: 'adjacent', range: 1, damage: 3, fireIntervalMs: 400, maxHealth: 10, targetsPerShot: 1 },
  3: { geometry: 'vertical', range: 5, damage: 2, fireIntervalMs: 500, maxHealth: 14, targetsPerShot: 1 },
  4: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 18, targetsPerShot: 1 },
  5: { geometry: 'diagonal', range: 5, damage: 2, fireIntervalMs: 550, maxHealth: 22, targetsPerShot: 1 },
  6: { geometry: 'star', range: 3, damage: 2, fireIntervalMs: 600, maxHealth: 26, targetsPerShot: 1 },
  // The Wall. No gun, and health well above every firing rank — its whole
  // value is the seconds it buys. `fireIntervalMs` is inert but deliberately
  // POSITIVE, never 0, so no future change to `fireTowers`'s
  // `while (cooldown >= tower.fireIntervalMs)` guard can spin on it.
  7: { geometry: 'none', range: 0, damage: 0, fireIntervalMs: 1000, maxHealth: 45, targetsPerShot: 0 },
  // The Amplifier. Barely shoots; doubles what every OTHER Tower deals to
  // anything inside its ring. Its hollow core is a socket for a rank 2.
  8: { geometry: 'ring', range: 4, damage: 1, fireIntervalMs: 700, maxHealth: 30, targetsPerShot: 3, aura: 'amplify' },
  // The Freezer. 750ms rather than 650ms on purpose: at 650 it would
  // out-damage rank 8, inverting the ladder one rank before the top.
  9: { geometry: 'adjacent', range: 2, damage: 1, fireIntervalMs: 750, maxHealth: 34, targetsPerShot: 3, aura: 'freeze' },
  // The toll gate. Full board width, chip damage, unlimited targets: one toll
  // on every Piece, and nothing can go around it.
  10: { geometry: 'band', range: 1, damage: 1, fireIntervalMs: 800, maxHealth: 38, targetsPerShot: Number.POSITIVE_INFINITY },
}

export function towerRank(rank: BuildableRank): TowerRankDef {
  return TOWER_RANKS[rank]
}

/** Every rank the game can build, low to high. */
export const BUILDABLE_RANKS: readonly BuildableRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10]
