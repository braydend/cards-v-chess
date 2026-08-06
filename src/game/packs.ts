import { ALL_CARD_RANKS, SUITS } from '../data/cards'
import { DECK_CAP } from '../data/deck'
import { PACKS, TIER_WEIGHTS, tierOf, type PackType, type RarityTier } from '../data/packs'
import { nextWeighted, type Rng } from './rng'
import type { Card, CardRank, Suit } from './types'

/**
 * Dealing packs, and the rules that decide whether one can be bought.
 *
 * Pure and seeded: every card comes from a generator carried in `GameState`, so
 * the same seed deals the same run. No `Math.random` — see `src/game/rng.ts`.
 */

/**
 * What a draw can produce, before it is given an id.
 *
 * `null` is the Joker — it carries neither rank nor suit, so there is nothing to
 * describe. Deliberately not a `Card`: a Card needs an id, and inventing a
 * placeholder one here would put an invalid Card in a table.
 */
type Template = readonly [{ readonly rank: CardRank; readonly suit: Suit } | null, number]

/**
 * The weighted table a pack draws from, built once per deal.
 *
 * Every rank crossed with every suit the pack allows, plus a Joker.
 *
 * Copies are unlimited by design, so draws are with replacement: the table is
 * not consumed and a pack can legitimately deal three identical 5♦.
 */
function templatesFor(pack: PackType, suit: Suit | undefined): Template[] {
  const def = PACKS[pack]
  const suits: readonly Suit[] = def.suited && suit ? [suit] : SUITS
  const templates: Template[] = []

  for (const rank of ALL_CARD_RANKS) {
    for (const cardSuit of suits) {
      templates.push([{ rank, suit: cardSuit }, weightFor(tierOf(rank), def.tierBoost)])
    }
  }

  // A Joker has no suit, so it cannot appear in "10 cards all of one suit".
  if (!def.suited) {
    templates.push([null, weightFor(tierOf('joker'), def.tierBoost)])
  }

  return templates
}

function weightFor(tier: RarityTier, boost: Record<RarityTier, number>): number {
  return TIER_WEIGHTS[tier] * boost[tier]
}

function cardFrom(template: Template[0], id: string): Card {
  if (!template) return { id, kind: 'joker' }

  return { id, kind: 'standard', rank: template.rank, suit: template.suit }
}

export interface PackDeal {
  readonly cards: readonly Card[]
  /** The generator, advanced past every draw this deal made. */
  readonly rng: Rng
  /** The card counter, advanced past every id this deal issued. */
  readonly nextCardId: number
}

/**
 * The cards a pack deals.
 *
 * `suit` is required for a Suited pack and ignored by every other type. Card ids
 * come from `nextCardId` — never from `nextEntityId`, whose parity `tick.ts`
 * reads for Piece handedness.
 */
export function dealPack(
  pack: PackType,
  suit: Suit | undefined,
  rng: Rng,
  nextCardId: number,
): PackDeal {
  const templates = templatesFor(pack, suit)
  const cards: Card[] = []
  let current = rng
  let id = nextCardId

  for (let i = 0; i < PACKS[pack].size; i += 1) {
    const [template, advanced] = nextWeighted(current, templates)
    cards.push(cardFrom(template, `card-${id}`))
    current = advanced
    id += 1
  }

  return { cards, rng: current, nextCardId: id }
}

/**
 * How many cards must be destroyed for this pack to fit.
 *
 * The single source of this rule: `step` validates against it and the UI renders
 * from it, so neither re-derives it.
 *
 * Never exceeds the Deck's size, because no pack is larger than the cap.
 */
export function cullCountFor(deckSize: number, pack: PackType): number {
  return Math.max(0, deckSize + PACKS[pack].size - DECK_CAP)
}

export function canAfford(ink: number, pack: PackType): boolean {
  return ink >= PACKS[pack].price
}
