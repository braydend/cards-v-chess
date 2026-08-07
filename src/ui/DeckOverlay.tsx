import { useRef } from 'react'
import type { Card } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { selectCard } from './cardActions'
import { CardFace } from './CardFace'
import { useDialogFocus } from './useDialogFocus'

/**
 * The mobile deck picker: a full-screen sheet (the same scrim + panel pattern
 * as the modals, so dismissing is free) listing every Card with touch-sized
 * targets. Picking a Card closes the overlay and selects it; the mode toggle,
 * hint and Play live in the thin bar's selected-card strip, so this is purely
 * a picker.
 */
export function DeckOverlay({ onClose }: { onClose: () => void }) {
  const deck = useGameStore((store) => store.snapshot.deck)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus is moved in, Tab trapped, and focus restored by `useDialogFocus` —
  // the `aria-modal` assertion depends on the trap. Mounted only while open.
  useDialogFocus(panelRef, onClose, true)

  function pick(card: Card) {
    selectCard(card.id, selectedCardId)
    onClose()
  }

  return (
    <div className="modal deckOverlay" role="dialog" aria-modal="true" aria-label="Deck">
      <button type="button" className="modal__scrim" aria-label="Close" onClick={onClose} />
      <div className="modal__panel deckOverlay__panel" ref={panelRef} tabIndex={-1}>
        <div className="modal__head">
          <span className="hud__label">Deck</span>
          <span className="hud__muted">{deck.length} cards</span>
        </div>
        <ul className="deck__cards deck__cards--touch">
          {deck.map((card) => (
            <li key={card.id}>
              <CardFace
                card={card}
                modifier={card.id === selectedCardId ? 'deck__card--active' : undefined}
                onClick={() => pick(card)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
