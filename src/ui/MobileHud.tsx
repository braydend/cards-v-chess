import { useState } from 'react'
import { VICTORY_ROUND } from '../data/rounds'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { resetRun } from './cardActions'
import { DeckOverlay } from './DeckOverlay'
import { CardFace } from './CardFace'
import { HandPanel } from './HandPanel'
import { selectedCards } from './handSelection'

/**
 * The mobile HUD: a thin always-visible bar plus a deck overlay.
 *
 * The bar carries the three stats (Round, Ink, Core), the round controls, and —
 * once Cards are picked — a selected-hand strip with the summary and commit.
 * The deck itself opens as an overlay (a picker only), staying open while the
 * multi-card hand is assembled. See the mobile UI spec, section 3.
 */
export function MobileHud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const { phase, roundNumber, core, ink, won, pendingTower } = snapshot

  const deck = useGameStore((store) => store.snapshot.deck)
  const selectedCardIds = useUiStore((store) => store.selectedCardIds)
  const clearSelection = useUiStore((store) => store.clearSelection)
  const setPreviewedSquare = useUiStore((store) => store.setPreviewedSquare)
  const setPackShopOpen = useUiStore((store) => store.setPackShopOpen)
  const setAboutOpen = useUiStore((store) => store.setAboutOpen)

  const [deckOpen, setDeckOpen] = useState(false)

  const selected = selectedCards(deck, selectedCardIds)

  const first = selected[0]

  return (
    <>
      <dl className="mobileStats">
        <div>
          <dt>Round</dt>
          <dd>{roundNumber}</dd>
        </div>
        <div>
          <dt>Ink</dt>
          <dd>{ink}</dd>
        </div>
        <div>
          <dt>Core</dt>
          <dd>
            {core.health}
            <span className="hud__muted"> / {core.maxHealth}</span>
          </dd>
        </div>
      </dl>

      <div className="mobileActions">
        {phase === 'defeated' ? (
          <button type="button" className="hud__button" onClick={resetRun}>
            Play again
          </button>
        ) : (
          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap' || pendingTower !== null}
            onClick={() => dispatch({ kind: 'startRound' })}
          >
            {phase === 'gap' ? `Start round ${roundNumber}` : 'In progress'}
          </button>
        )}

        <button
          type="button"
          className="hud__button"
          disabled={phase !== 'gap' || pendingTower !== null}
          onClick={() => setPackShopOpen(true)}
        >
          Packs
        </button>

        <button
          type="button"
          className="hud__button hud__button--quiet"
          onClick={() => setDeckOpen(true)}
        >
          Deck
        </button>

        <button
          type="button"
          className="hud__button hud__button--quiet"
          onClick={() => setAboutOpen(true)}
        >
          About
        </button>
      </div>

      {phase === 'defeated' ? (
        <p className="hud__hint">
          The Core has fallen.
          {won
            ? ` You beat round ${VICTORY_ROUND}; free play ended on round ${roundNumber}.`
            : null}
        </p>
      ) : null}

      {selected.length > 0 ? (
        <div className="mobileStrip">
          <div className="mobileStrip__card">
            {first ? <CardFace card={first} /> : null}
            {selected.length > 1 ? (
              <span className="mobileStrip__count">×{selected.length}</span>
            ) : null}
            <button
              type="button"
              className="mobileStrip__cancel"
              aria-label="Clear selected Cards"
              onClick={() => {
                clearSelection()
                setPreviewedSquare(null)
              }}
            >
              ✕
            </button>
          </div>

          <div className="mobileStrip__modes">
            {/*
             * Keyed on the selection so a change in the picked cards remounts
             * the panel and resets its royal-flush Tower choice — see
             * HandPanel.
             */}
            <HandPanel
              key={selectedCardIds.join(',')}
              cards={selected}
              phase={phase}
              onCommitted={() => {
                clearSelection()
                setPreviewedSquare(null)
              }}
            />
          </div>
        </div>
      ) : null}

      {/*
       * A pending Tower stands between commit and placement: the hand is
       * consumed and the selection strip is gone (commit cleared it), so this
       * hint and Cancel are the touch player's only way out — the start button
       * is disabled while the Tower awaits. Mirrors the desktop Deck's pending
       * branch; the play is cancelled, not undone — the Cards are spent either
       * way.
       */}
      {pendingTower !== null ? (
        <div className="mobileStrip">
          <p className="hud__hint">Place this Tower on the board, or cancel.</p>
          <button
            type="button"
            className="deck__play"
            onClick={() => dispatch({ kind: 'cancelPlacement' })}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {deckOpen ? <DeckOverlay onClose={() => setDeckOpen(false)} /> : null}
    </>
  )
}
