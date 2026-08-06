import { isBuildableRank } from './cards'
import type { Card, Command, Square } from './types'

/** Which of a Card's two modes a play applies. Rank builds, suit supports. */
export type PlayMode = 'build' | 'support'

/**
 * What the player has targeted for this play, if anything.
 *
 * `echo` is its own variant because it is the only play needing two board
 * targets — a source Tower to copy, then a square to build the copy on.
 */
export type PlayTarget =
  | { readonly kind: 'none' }
  | { readonly kind: 'square'; readonly square: Square }
  | { readonly kind: 'tower'; readonly towerId: string }
  | { readonly kind: 'echo'; readonly sourceTowerId: string; readonly square: Square }

/**
 * The single answer to "which Command does this Card, in this mode, against
 * this target produce?" — or `null` when the combination is illegal.
 *
 * This decision used to be split across two renderer files that had to agree
 * by hand: `src/ui/Deck.tsx` for the untargeted face-card/Joker plays and
 * `src/scene/Board.tsx` for everything needing a board target. They had
 * already drifted — Board.tsx fell through to `buildTower` for a King, Ace or
 * Joker, which the engine then silently refused — and untested branching
 * logic in the renderer is exactly the kind of bug that only shows up in a
 * browser. Centralising it here as a pure function makes it unit-testable.
 *
 * This function only decides which Command a play *would* be; it does not
 * validate the play. `step` still refuses an illegal target (an occupied
 * square, an unknown Tower, ...) by returning state unchanged.
 */
export function commandFor(card: Card, mode: PlayMode, target: PlayTarget): Command | null {
  // Suit works at every rank, including face cards, so mode is checked before
  // rank. A Joker has no suit, so support is illegal for it.
  if (mode === 'support') {
    if (card.kind !== 'standard') return null
    if (target.kind !== 'tower') return null

    return { kind: 'supportTower', cardId: card.id, towerId: target.towerId }
  }

  // mode === 'build': a numbered Card builds a Tower; a face Card acts
  // instead; a Joker has one play and no rank at all.
  if (card.kind === 'joker') {
    return target.kind === 'none' ? { kind: 'clearPieces', cardId: card.id } : null
  }

  if (isBuildableRank(card.rank)) {
    return target.kind === 'square'
      ? { kind: 'buildTower', cardId: card.id, square: target.square }
      : null
  }

  switch (card.rank) {
    case 'J':
      return target.kind === 'tower'
        ? { kind: 'shieldTower', cardId: card.id, towerId: target.towerId }
        : null
    case 'Q':
      return target.kind === 'echo'
        ? { kind: 'echoTower', cardId: card.id, sourceTowerId: target.sourceTowerId, square: target.square }
        : null
    case 'K':
      return target.kind === 'none' ? { kind: 'reinforceCore', cardId: card.id } : null
    case 'A':
      return target.kind === 'none' ? { kind: 'expandBoard', cardId: card.id } : null
  }
}
