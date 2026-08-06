import { PACKS, type PackType } from '../data/packs'
import { canAfford, cullCountFor, type Card, type RoundPhase, type Suit } from '../game'

/**
 * What the pack shop's commit button says and whether it can be pressed.
 *
 * Pure, and here rather than inside `PackShop.tsx`, because there is no jsdom in
 * this project and a decision left in a `.tsx` file cannot be tested at all.
 *
 * The **rules** are not duplicated here: how many cards a pack forces you to
 * destroy comes from `cullCountFor` in the engine, which `step` validates
 * against too. This module decides only how to say it.
 */
export interface CommitState {
  readonly enabled: boolean
  /** The button's text. Meaningful even when disabled. */
  readonly label: string
  /** Why it is disabled, or null when it is not. */
  readonly reason: string | null
}

export function commitState(args: {
  readonly deckSize: number
  readonly ink: number
  readonly phase: RoundPhase
  readonly pack: PackType | null
  readonly suit: Suit | null
  readonly markedIds: readonly string[]
}): CommitState {
  const { deckSize, ink, phase, pack, suit, markedIds } = args

  // Phase first, ahead of even the no-pack check. Auto-start can begin a round
  // while the shop is open, and `buyPack` refuses off-gap — so without this the
  // button stays enabled and clicking it does nothing, silently. Mirrors the
  // engine's own ordering, where the phase check comes before everything else.
  if (phase !== 'gap') {
    return {
      enabled: false,
      label: 'Open pack',
      reason: 'A round is in progress — packs are bought between rounds.',
    }
  }

  if (!pack) return { enabled: false, label: 'Open pack', reason: 'Pick a pack.' }

  const def = PACKS[pack]
  const price = def.price
  const needed = cullCountFor(deckSize, pack)
  const label = needed > 0
    ? `Destroy ${needed} & open ${def.label} — ${price} Ink`
    : `Open ${def.label} — ${price} Ink`

  // Affordability is reported before the cull, so the player is never asked to
  // choose cards to destroy for a pack they cannot buy.
  if (!canAfford(ink, pack)) {
    return { enabled: false, label, reason: `${def.label} costs ${price} Ink — you have ${ink}.` }
  }

  if (def.suited && !suit) {
    return { enabled: false, label, reason: 'Pick a suit.' }
  }

  const short = needed - markedIds.length
  if (short > 0) {
    return {
      enabled: false,
      label,
      reason: `Mark ${short} more ${short === 1 ? 'card' : 'cards'} in the Deck to destroy.`,
    }
  }

  // Over-culling is refused by the engine too — a Cull exists to make room and
  // for nothing else, so the UI explains rather than silently trimming.
  if (short < 0) {
    const excess = -short
    return {
      enabled: false,
      label,
      reason: `Unmark ${excess} ${excess === 1 ? 'card' : 'cards'} — a Cull only makes room, it never thins the Deck.`,
    }
  }

  return { enabled: true, label, reason: null }
}

/**
 * The Cards a purchase added.
 *
 * Found by diffing ids against a snapshot taken before the purchase, which is
 * why `GameState` needs no `lastPackCardIds` field. Card ids come from a
 * monotonic counter, so a dealt card can never carry an id that was just
 * culled.
 */
export function newCards(
  beforeIds: ReadonlySet<string>,
  afterDeck: readonly Card[],
): readonly Card[] {
  return afterDeck.filter((card) => !beforeIds.has(card.id))
}
