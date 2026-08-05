import type { CardRank, TowerGeometry } from '../game/types'

/**
 * What each Card rank builds.
 *
 * The geometry ladder is agreed design: 2 adjacent, 3 vertical, 4 cross,
 * 5 diagonal. Ranks 6–10 and the face cards are undesigned — do not add them.
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
}

export const TOWER_RANKS: Record<CardRank, TowerRankDef> = {
  2: { geometry: 'adjacent', range: 1, damage: 1, fireIntervalMs: 600, maxHealth: 8 },
  3: { geometry: 'vertical', range: 4, damage: 1, fireIntervalMs: 600, maxHealth: 12 },
  4: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550, maxHealth: 16 },
  5: { geometry: 'diagonal', range: 5, damage: 3, fireIntervalMs: 500, maxHealth: 20 },
}

export function towerRank(rank: CardRank): TowerRankDef {
  return TOWER_RANKS[rank]
}

/** Every rank the game currently knows how to build, low to high. */
export const BUILDABLE_RANKS: readonly CardRank[] = [2, 3, 4, 5]
