import type { Card, CardRank } from './types'

/**
 * Poker hands, the new way Towers are purchased. A committed set of Cards must
 * be EXACTLY one valid hand of its size — no kickers, no downgrades. The hand
 * type decides the Tower; the ranks inside it never modulate the result.
 *
 * Face cards are hand material (a pair of Kings, the royal flush). The Joker
 * is never hand material — it has no rank or suit, so it cannot participate
 * in any hand.
 */
export type HandType =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush'
  | 'royalFlush'

/** Exactly how many Cards each hand commits. */
export const HAND_SIZES: Record<HandType, number> = {
  highCard: 1,
  pair: 2,
  twoPair: 4,
  threeOfAKind: 3,
  straight: 5,
  flush: 5,
  fullHouse: 5,
  fourOfAKind: 4,
  straightFlush: 5,
  royalFlush: 5,
}

/**
 * Which Tower each hand purchases. Royal flush is deliberately absent: it is
 * "tower of choice", so the choice is made at play time, not in a table.
 */
export const HAND_TOWER: Record<Exclude<HandType, 'royalFlush'>, import('../data/towerTypes').TowerTypeId> = {
  highCard: 'vertical',
  pair: 'wall',
  twoPair: 'sniper',
  threeOfAKind: 'diagonal',
  straight: 'cross',
  flush: 'star',
  fullHouse: 'splash',
  fourOfAKind: 'ring',
  straightFlush: 'tollgate',
}

/** Numeric value of a rank for ordering. A is 14 (also treated as 1 for wheels). */
function rankValue(rank: CardRank): number {
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') return 13
  if (rank === 'A') return 14
  return rank
}

/** A straight's ranks sorted ascending; A may be low (wheel) or high. */
function straightValues(values: number[]): number[] | null {
  const sorted = [...values].sort((a, b) => a - b)
  const unique = new Set(sorted)
  if (unique.size !== sorted.length) return null

  const isRun = (start: number): boolean =>
    sorted.every((value, index) => value === start + index)

  if (isRun(sorted[0] ?? 0)) return sorted

  // Wheel: A-2-3-4-5, where A reads as 1.
  const first = sorted[0]
  const last = sorted[4]
  if (first === 2 && last === 14 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5) return [1, 2, 3, 4, 5]

  return null
}

/**
 * The strongest hand the committed set forms — or null when the set is not
 * exactly one valid hand of its size. Pure, deterministic, and the single
 * answer the engine and the Deck UI both call.
 */
export function evaluateHand(cards: readonly Card[]): HandType | null {
  const standard = cards.filter(
    (card): card is Extract<Card, { kind: 'standard' }> => card.kind === 'standard',
  )
  if (standard.length !== cards.length) return null

  const size = standard.length

  if (size === 1) return 'highCard'
  if (size === 2) {
    const [a, b] = standard
    return a !== undefined && b !== undefined && a.rank === b.rank ? 'pair' : null
  }
  if (size === 3) {
    const ranks = new Set(standard.map((card) => card.rank))
    return ranks.size === 1 ? 'threeOfAKind' : null
  }
  if (size === 4) {
    const counts = rankCounts(standard)
    const values = Object.values(counts)
    if (values.some((count) => count === 4)) return 'fourOfAKind'
    if (values.length === 2 && values.every((count) => count === 2)) return 'twoPair'
    return null
  }
  if (size === 5) {
    return evaluateFive(standard)
  }

  return null
}

function rankCounts(cards: readonly Card[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const card of cards) {
    if (card.kind === 'standard') counts[card.rank] = (counts[card.rank] ?? 0) + 1
  }
  return counts
}

function evaluateFive(cards: readonly Card[]): HandType | null {
  const standard = cards.filter((card): card is Extract<Card, { kind: 'standard' }> => card.kind === 'standard')
  if (standard.length !== 5) return null

  const suits = new Set(standard.map((card) => card.suit))
  const isFlush = suits.size === 1

  const values = standard.map((card) => rankValue(card.rank))
  const straight = straightValues(values)

  const counts = Object.values(rankCounts(standard))
  const isFullHouse = counts.includes(3) && counts.includes(2)

  if (straight) {
    const isRoyal = (straight[0] ?? 0) === 10 && isFlush
    if (isRoyal) return 'royalFlush'
    if (isFlush) return 'straightFlush'
    return 'straight'
  }
  if (isFlush) return 'flush'
  if (isFullHouse) return 'fullHouse'

  return null
}
