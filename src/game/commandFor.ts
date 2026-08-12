import type { Card, Command } from './types'

/**
 * What the player has targeted for this play, if anything.
 *
 * Only two shapes survive the poker-hands rework: an untargeted play (King,
 * Ace, Joker) and a Tower-targeted play (Jack, Queen). The square and echo
 * targets are gone with the solo build and Echo.
 */
export type PlayTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'tower'; readonly towerId: string }

/**
 * The single answer to "which Command does this Card's action, against this
 * target, produce?" — or `null` when the combination is illegal.
 *
 * Only face Cards and the Joker have solo actions. A numbered Card (2–10) is
 * hand material — it is committed as part of a poker hand from the Deck, never
 * played alone — so this function returns `null` for one under every target.
 *
 * The build/support mode choice is gone: suits no longer support, and Towers
 * are purchased by hands rather than single Cards. This function only decides
 * which Command a play *would* be; it does not validate the play. `step` still
 * refuses an illegal target (an unknown Tower, ...) by returning state
 * unchanged.
 */
export function commandFor(card: Card, target: PlayTarget): Command | null {
  // A Joker's one play is untargeted Clear; it has no rank and no suit.
  if (card.kind === 'joker') {
    return target.kind === 'none' ? { kind: 'clearPieces', cardId: card.id } : null
  }

  switch (card.rank) {
    case 'J':
      return target.kind === 'tower'
        ? { kind: 'shieldTower', cardId: card.id, towerId: target.towerId }
        : null
    case 'Q':
      return target.kind === 'tower'
        ? { kind: 'rangeTower', cardId: card.id, towerId: target.towerId }
        : null
    case 'K':
      return target.kind === 'none' ? { kind: 'reinforceCore', cardId: card.id } : null
    case 'A':
      return target.kind === 'none' ? { kind: 'expandBoard', cardId: card.id } : null
  }

  // Numbered Card: hand material, no solo action.
  return null
}
