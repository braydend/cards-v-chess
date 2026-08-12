import { useRef } from 'react'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { toggleCardForHand } from './cardActions'
import { CardFace } from './CardFace'
import { useDialogFocus } from './useDialogFocus'

/**
 * The mobile deck picker: a full-screen sheet (the same scrim + panel pattern
 * as the modals, so dismissing is free) listing every Card with touch-sized
 * targets. Picking toggles a Card into the hand being assembled without
 * closing the overlay, so the strip can stay open while a multi-card hand is
 * picked; the summary and commit live in the thin bar's strip, so this is
 * purely a picker.
 */
export function DeckOverlay({ onClose }: { onClose: () => void }) {
  const deck = useGameStore((store) => store.snapshot.deck)
  const selectedCardIds = useUiStore((store) => store.selectedCardIds)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus is moved in, Tab trapped, and focus restored by `useDialogFocus` —
  // the `aria-modal` assertion depends on the trap. Mounted only while open.
  useDialogFocus(panelRef, onClose, true)

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
                modifier={selectedCardIds.includes(card.id) ? 'deck__card--active' : undefined}
                onClick={() => toggleCardForHand(card.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
