import type { CardRank, TowerGeometry } from '../game/types'

/**
 * What each Card rank builds.
 *
 * The geometry ladder is agreed design: 2 horizontal, 3 vertical, 4 cross,
 * 5 diagonal. Ranks 6–10 and the face cards are undesigned — do not add them.
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
}

export const TOWER_RANKS: Record<CardRank, TowerRankDef> = {
  2: { geometry: 'horizontal', range: 3, damage: 1, fireIntervalMs: 600 },
  3: { geometry: 'vertical', range: 4, damage: 1, fireIntervalMs: 600 },
  4: { geometry: 'cross', range: 4, damage: 2, fireIntervalMs: 550 },
  5: { geometry: 'diagonal', range: 5, damage: 3, fireIntervalMs: 500 },
}

export function towerRank(rank: CardRank): TowerRankDef {
  return TOWER_RANKS[rank]
}

/** Every rank the game currently knows how to build, low to high. */
export const BUILDABLE_RANKS: readonly CardRank[] = [2, 3, 4, 5]
