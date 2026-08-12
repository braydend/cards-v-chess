import { useState } from 'react'
import type { Card } from '../game'
import { VICTORY_ROUND } from '../data/rounds'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { resetRun } from './cardActions'
import { DeckOverlay } from './DeckOverlay'
import { CardFace } from './CardFace'
import { HandPanel } from './HandPanel'

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
  const setCreditsOpen = useUiStore((store) => store.setCreditsOpen)

  const [deckOpen, setDeckOpen] = useState(false)

  const selected = selectedCardIds
    .map((id) => deck.find((card) => card.id === id))
    .filter((card): card is Card => card !== undefined)

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
          disabled={phase !== 'gap'}
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
          onClick={() => setCreditsOpen(true)}
        >
          Credits
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

      {deckOpen ? <DeckOverlay onClose={() => setDeckOpen(false)} /> : null}
    </>
  )
}
