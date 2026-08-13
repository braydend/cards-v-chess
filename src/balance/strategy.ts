import type { PackType } from '../data/packs'
import { towerType } from '../data/towerTypes'
import { allSquares, canBuildOn, coveredSquares, cullCountFor, packPrice } from '../game'
import type { Card, CardRank, GameState, HandType, Square, Suit, TowerTypeId } from '../game'
import type { PlacementStrategy } from './types'

type StandardCard = Extract<Card, { kind: 'standard' }>

export interface HandPick {
  readonly hand: HandType
  readonly cardIds: readonly string[]
}

/** Rarity order — highCard weakest, royalFlush strongest. */
export const HAND_STRENGTH: Record<HandType, number> = {
  highCard: 1,
  pair: 2,
  twoPair: 3,
  threeOfAKind: 4,
  straight: 5,
  flush: 6,
  fullHouse: 7,
  fourOfAKind: 8,
  straightFlush: 9,
  royalFlush: 10,
}

function rankValue(rank: CardRank): number {
  if (rank === 'J') return 11
  if (rank === 'Q') return 12
  if (rank === 'K') return 13
  if (rank === 'A') return 14
  return rank
}

function group(standard: readonly StandardCard[]): {
  byRank: Map<number, StandardCard[]>
  bySuit: Map<Suit, StandardCard[]>
} {
  const byRank = new Map<number, StandardCard[]>()
  const bySuit = new Map<Suit, StandardCard[]>()
  for (const card of standard) {
    const value = rankValue(card.rank)
    byRank.set(value, [...(byRank.get(value) ?? []), card])
    bySuit.set(card.suit, [...(bySuit.get(card.suit) ?? []), card])
  }
  return { byRank, bySuit }
}

/** One card of each value, or null when any is missing. 1 means Ace-low. */
function idsForValues(cards: readonly StandardCard[], values: readonly number[]): string[] | null {
  const ids: string[] = []
  for (const value of values) {
    const target = value === 1 ? 14 : value
    const card = cards.find((candidate) => rankValue(candidate.rank) === target)
    if (!card) return null
    ids.push(card.id)
  }
  return ids
}

/** The first 5-consecutive window these values contain, wheel-aware, or null. */
function straightValues(values: readonly number[]): number[] | null {
  const present = new Set(values)
  if (present.has(14)) present.add(1)
  for (let low = 1; low <= 10; low += 1) {
    const window = [low, low + 1, low + 2, low + 3, low + 4]
    if (window.every((value) => present.has(value))) return window
  }
  return null
}

/**
 * The strongest hand the Deck can commit as exactly one hand, or null when it
 * holds no standard card. Scans strongest to weakest and returns the first
 * pattern found, so a Deck holding both a pair and a flush commits the flush.
 */
export function bestHandInDeck(deck: readonly Card[]): HandPick | null {
  const standard = deck.filter((card): card is StandardCard => card.kind === 'standard')
  if (standard.length === 0) return null
  const { byRank, bySuit } = group(standard)

  for (const suit of bySuit.keys()) {
    const cards = bySuit.get(suit) ?? []
    const ids = idsForValues(cards, [10, 11, 12, 13, 14])
    if (ids) return { hand: 'royalFlush', cardIds: ids }
  }

  for (const suit of bySuit.keys()) {
    const cards = bySuit.get(suit) ?? []
    const window = straightValues(cards.map((card) => rankValue(card.rank)))
    if (window) {
      const ids = idsForValues(cards, window)
      if (ids) return { hand: 'straightFlush', cardIds: ids }
    }
  }

  for (const cards of byRank.values()) {
    if (cards.length >= 4) {
      return { hand: 'fourOfAKind', cardIds: cards.slice(0, 4).map((card) => card.id) }
    }
  }

  const triples = [...byRank.entries()].filter(([, cards]) => cards.length >= 3)
  for (const [tripleValue, triple] of triples) {
    const pair = [...byRank.entries()].find(
      ([value, cards]) => value !== tripleValue && cards.length >= 2,
    )
    if (pair) {
      return {
        hand: 'fullHouse',
        cardIds: [...triple.slice(0, 3), ...pair[1].slice(0, 2)].map((card) => card.id),
      }
    }
  }

  for (const cards of bySuit.values()) {
    if (cards.length >= 5) {
      return { hand: 'flush', cardIds: cards.slice(0, 5).map((card) => card.id) }
    }
  }

  const window = straightValues([...byRank.keys()])
  if (window) {
    const ids = idsForValues(standard, window)
    if (ids) return { hand: 'straight', cardIds: ids }
  }

  for (const cards of byRank.values()) {
    if (cards.length >= 3) {
      return { hand: 'threeOfAKind', cardIds: cards.slice(0, 3).map((card) => card.id) }
    }
  }

  const pairs = [...byRank.entries()].filter(([, cards]) => cards.length >= 2)
  if (pairs.length >= 2) {
    return {
      hand: 'twoPair',
      cardIds: pairs
        .slice(0, 2)
        .flatMap(([, cards]) => cards.slice(0, 2).map((card) => card.id)),
    }
  }

  for (const cards of byRank.values()) {
    if (cards.length >= 2) {
      return { hand: 'pair', cardIds: cards.slice(0, 2).map((card) => card.id) }
    }
  }

  const best = standard.reduce((a, b) => (rankValue(b.rank) > rankValue(a.rank) ? b : a))
  return { hand: 'highCard', cardIds: [best.id] }
}

/**
 * The buildable square a Tower of this type prefers under this strategy.
 *
 * `maxCoverage` maximises covered squares; `spawnSide` maximises rank (blocks
 * incoming Pieces early); `coreSide` minimises rank (defends the Core). The
 * Wall — geometry 'none', zero coverage — always takes the spawnSide treatment,
 * since it blocks rather than shoots. Ties break on `allSquares` order, so the
 * choice is deterministic.
 */
export function bestBuildSquare(
  state: GameState,
  pendingType: TowerTypeId,
  strategy: PlacementStrategy,
): Square | null {
  const def = towerType(pendingType)
  const squares = allSquares(state.board).filter((square) => canBuildOn(state, square))
  let best: Square | null = null
  let bestScore = -1

  for (const square of squares) {
    const coverage =
      def.geometry === 'none'
        ? 0
        : coveredSquares(state.board, def.geometry, def.range, square).length
    const score =
      strategy === 'spawnSide' || def.geometry === 'none'
        ? square.rank * 1000 + coverage
        : strategy === 'coreSide'
          ? (state.board.ranks - square.rank) * 1000 + coverage
          : coverage
    if (score > bestScore) {
      best = square
      bestScore = score
    }
  }

  return best
}

/** The first pack in `preference` the player can afford after holding `reserve`. */
export function preferredPack(
  state: GameState,
  preference: readonly PackType[],
  reserve: number,
): PackType | null {
  for (const pack of preference) {
    if (state.ink - reserve >= packPrice(pack, state.packPurchases[pack])) return pack
  }
  return null
}

/** The lowest-value card ids to destroy so a pack of this type fits the cap. */
export function cullIdsFor(deck: readonly Card[], pack: PackType): string[] {
  const count = cullCountFor(deck.length, pack)
  if (count === 0) return []

  const value = (card: Card): number => (card.kind === 'joker' ? 15 : rankValue(card.rank))
  const sorted = [...deck].sort((a, b) => value(b) - value(a))
  return sorted.slice(-count).map((card) => card.id)
}
