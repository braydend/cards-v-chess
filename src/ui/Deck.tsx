import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { toggleCardForHand } from './cardActions'
import { CardFace } from './CardFace'
import { HandPanel } from './HandPanel'
import { selectedCards } from './handSelection'
import { sortDeck } from './deckSort'

/**
 * The Deck: every Card held this run, always visible and always playable.
 *
 * Cards are picked into a HAND — a multi-select that purchases a Tower when
 * committed (gap only), or, for a single face Card, plays its action. There is
 * no hand and no draw pile, so nothing here is hidden. Duplicates are
 * individually selectable — three 5♦ are three distinct Cards, and committing
 * one hand leaves the rest.
 */
export function Deck() {
  const deck = useGameStore((store) => store.snapshot.deck)
  const phase = useGameStore((store) => store.snapshot.phase)
  const pendingTower = useGameStore((store) => store.snapshot.pendingTower)
  const selectedCardIds = useUiStore((store) => store.selectedCardIds)
  const clearSelection = useUiStore((store) => store.clearSelection)
  const setPreviewedSquare = useUiStore((store) => store.setPreviewedSquare)
  const deckSort = useUiStore((store) => store.deckSort)
  const setDeckSort = useUiStore((store) => store.setDeckSort)

  const selected = selectedCards(deck, selectedCardIds)

  return (
    <div className="deck">
      <div className="deck__header">
        <span className="hud__label">Deck</span>
        <span className="hud__muted">{deck.length} cards</span>
        <div className="deck__sort">
          {(
            [
              ['suit', 'Suit'],
              ['value', 'Value'],
            ] as const
          ).map(([sort, label]) => (
            <button
              key={sort}
              type="button"
              className={`deck__sortBtn${deckSort === sort ? ' deck__sortBtn--active' : ''}`}
              onClick={() => setDeckSort(deckSort === sort ? 'none' : sort)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="deck__cards">
        {sortDeck(deck, deckSort).map((card) => (
          <li key={card.id}>
            <CardFace
              card={card}
              modifier={selectedCardIds.includes(card.id) ? 'deck__card--active' : undefined}
              onClick={() => toggleCardForHand(card.id)}
            />
          </li>
        ))}
      </ul>

      {/*
       * A pending Tower stands between commit and placement: the hand is
       * consumed and no more hand may be played, so the hand panel gives way
       * to a placement hint and a Cancel. Cancelling is a full undo — the
       * committed Cards return to the Deck — so the play costs nothing until
       * a square is actually chosen.
       */}
      {pendingTower !== null ? (
        <div className="deck__detail">
          <p className="hud__hint">Place this Tower on the board, or cancel.</p>
          <button
            type="button"
            className="deck__play"
            onClick={() => dispatch({ kind: 'cancelPlacement' })}
          >
            Cancel
          </button>
        </div>
      ) : (
        /*
         * Keyed on the selection so a change in the picked cards remounts the
         * panel and resets its royal-flush Tower choice — see HandPanel.
         */
        <HandPanel
          key={selectedCardIds.join(',')}
          cards={selected}
          phase={phase}
          onCommitted={() => {
            clearSelection()
            setPreviewedSquare(null)
          }}
        />
      )}
    </div>
  )
}
