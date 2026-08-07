import { useState } from 'react'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { resetRun } from './cardActions'
import { rankModeLabel, targetHint, untargetedPlay } from './cardPlay'
import { DeckOverlay } from './DeckOverlay'
import { CardFace } from './CardFace'
import { supportModeLabel } from './supportLabel'

/**
 * The mobile HUD: a thin always-visible bar plus a deck overlay.
 *
 * The bar carries the three stats (Round, Ink, Core), the round controls, and —
 * once a Card is picked — a selected-card strip with the build/support mode
 * toggle, the untargeted Play, and a cancel. The deck itself opens as an
 * overlay (a picker only), closing on pick so the board is immediately
 * available. See the mobile UI spec, section 3.
 */
export function MobileHud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const { phase, roundNumber, core, ink } = snapshot

  const deck = useGameStore((store) => store.snapshot.deck)
  const towers = useGameStore((store) => store.snapshot.towers)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const setSelectedCardId = useUiStore((store) => store.setSelectedCardId)
  const setPreviewedSquare = useUiStore((store) => store.setPreviewedSquare)
  const playMode = useUiStore((store) => store.playMode)
  const setPlayMode = useUiStore((store) => store.setPlayMode)
  const echoSourceTowerId = useUiStore((store) => store.echoSourceTowerId)
  const setPackShopOpen = useUiStore((store) => store.setPackShopOpen)
  const setCreditsOpen = useUiStore((store) => store.setCreditsOpen)

  const [deckOpen, setDeckOpen] = useState(false)

  const selected = deck.find((card) => card.id === selectedCardId)
  const untargeted = selected ? untargetedPlay(selected, playMode) : null

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
            disabled={phase !== 'gap'}
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

      {selected ? (
        <div className="mobileStrip">
          <div className="mobileStrip__card">
            <CardFace card={selected} />
            <button
              type="button"
              className="mobileStrip__cancel"
              aria-label="Clear selected Card"
              onClick={() => {
                setSelectedCardId(null)
                setPreviewedSquare(null)
              }}
            >
              ✕
            </button>
          </div>

          <div className="mobileStrip__modes">
            <button
              type="button"
              className={`deck__mode${playMode === 'build' ? ' deck__mode--active' : ''}`}
              onClick={() => setPlayMode('build')}
            >
              {rankModeLabel(selected)}
            </button>

            {selected.kind === 'standard' ? (
              <button
                type="button"
                className={`deck__mode${playMode === 'support' ? ' deck__mode--active' : ''}`}
                onClick={() => setPlayMode('support')}
              >
                {supportModeLabel(selected.suit, selected.rank)}
              </button>
            ) : null}
          </div>

          {untargeted ? (
            <button
              type="button"
              className="deck__play"
              onClick={() => {
                if (dispatch(untargeted)) {
                  setSelectedCardId(null)
                  setPreviewedSquare(null)
                }
              }}
            >
              Play
            </button>
          ) : (
            <p className="hud__hint">
              {targetHint(selected, playMode, towers.length, echoSourceTowerId)}
            </p>
          )}
        </div>
      ) : null}

      {deckOpen ? <DeckOverlay onClose={() => setDeckOpen(false)} /> : null}
    </>
  )
}
