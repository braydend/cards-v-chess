import {
  evaluateHand,
  HAND_TOWER,
  type Card,
  type Command,
  type FaceRank,
  type HandType,
  type TowerTypeId,
} from '../game'

export type SelectionSummary =
  | { readonly kind: 'empty' }
  | { readonly kind: 'hand'; readonly hand: HandType; readonly tower: TowerTypeId; readonly towerLabel: string }
  | { readonly kind: 'singleFace'; readonly rank: FaceRank }
  | { readonly kind: 'singleJoker' }
  | { readonly kind: 'invalid' }

export const FACE_ACTION: Record<FaceRank, string> = {
  J: 'Shield a Tower',
  Q: 'Add +1 range to a Tower',
  K: 'Reinforce the Core',
  A: 'Expand the board',
}

/**
 * Player-facing name of each Tower the hand ladder can purchase.
 *
 * The brief's template put `towerType(tower).geometry` here, but that names a
 * firing SHAPE — the Wall's is `none` — where the panel means to name the
 * TOWER ("Pair — builds the Wall"). Keyed by `TowerTypeId` so a new type is a
 * compile error here rather than a missing label at runtime.
 */
const TOWER_LABELS: Record<TowerTypeId, string> = {
  vertical: 'Vertical',
  wall: 'Wall',
  sniper: 'Sniper',
  diagonal: 'Diagonal',
  cross: 'Cross',
  star: 'Star',
  splash: 'Splash',
  ring: 'Ring',
  tollgate: 'Toll gate',
}

/**
 * What the current Deck selection means, in one pure answer the desktop Deck
 * and the mobile strip both render.
 *
 * A single face Card is `singleFace`, NOT a hand: its action plays at any time
 * (J/Q need a Tower click, K/A play from the Deck) and it may ALSO be committed
 * as a high-card hand in the gap — the Deck offers both. A lone numbered Card
 * is a high-card hand. A lone Joker is `singleJoker`, its Clear playable at any
 * time — it is never hand material, so it never reaches `evaluateHand`.
 */
export function selectionSummary(cards: readonly Card[]): SelectionSummary {
  if (cards.length === 0) return { kind: 'empty' }

  if (cards.length === 1) {
    const card = cards[0]
    if (card?.kind === 'standard' && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A')) {
      return { kind: 'singleFace', rank: card.rank }
    }
    if (card?.kind === 'joker') return { kind: 'singleJoker' }
  }

  const hand = evaluateHand(cards)
  if (!hand) return { kind: 'invalid' }
  if (hand === 'royalFlush') {
    return { kind: 'hand', hand, tower: 'vertical', towerLabel: 'Tower of your choice' }
  }
  const tower = HAND_TOWER[hand]
  return { kind: 'hand', hand, tower, towerLabel: TOWER_LABELS[tower] }
}

/**
 * The command committing this selection, or null when it cannot be committed.
 *
 * A valid hand commits as `playHand` — the two-step purchase that leaves a
 * pending Tower. A lone face Card commits as a high-card hand (the "Commit as
 * high card" button the Deck offers in the gap). A royal flush is refused
 * until `chosenType` names the Tower — it is "Tower of choice".
 */
export function commitCommand(cards: readonly Card[], chosenType?: TowerTypeId): Command | null {
  const summary = selectionSummary(cards)
  if (summary.kind === 'singleFace') {
    return { kind: 'playHand' as const, cardIds: cards.map((card) => card.id) }
  }
  if (summary.kind !== 'hand') return null
  if (summary.hand === 'royalFlush' && chosenType === undefined) return null
  return { kind: 'playHand' as const, cardIds: cards.map((card) => card.id), chosenType }
}
