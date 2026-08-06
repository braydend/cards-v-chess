import type { Card } from '../game'

const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' } as const

/** A Card's corner index: its rank and suit, or `Joker`. */
export function cardLabel(card: Card): string {
  if (card.kind === 'joker') return 'Joker'

  return `${card.rank}${SUIT_GLYPH[card.suit]}`
}

/**
 * One miniature card face — the corner index, with the suit pip bled off the
 * bottom edge by CSS.
 *
 * Shared by the Deck and the pack shop so the game has exactly one card
 * renderer. `modifier` adds a BEM modifier for state the caller owns: which card
 * is selected in the Deck, which is marked for culling in the shop.
 */
export function CardFace({
  card,
  modifier,
  onClick,
  title,
}: {
  card: Card
  modifier?: string
  onClick?: () => void
  title?: string
}) {
  const suitClass = card.kind === 'standard' ? `deck__card--${card.suit}` : 'deck__card--joker'

  return (
    <button
      type="button"
      className={`deck__card ${suitClass}${modifier ? ` ${modifier}` : ''}`}
      onClick={onClick}
      title={title}
    >
      {cardLabel(card)}
    </button>
  )
}
