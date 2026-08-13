import { VICTORY_ROUND } from '../data/rounds'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { resetRun } from './cardActions'
import { Deck } from './Deck'

/**
 * The desktop HUD branch: the run's state, the Deck, and the round controls.
 *
 * The previous HUD panel, moved verbatim — reading top to bottom follows the
 * order the player works in — see where the run stands, play Cards, then start
 * the round. The Deck owns all card copy, so nothing here repeats it. The
 * shared modals (`TowerPanel`, `PackShop`, `About`) mount in `Hud.tsx`, which
 * branches between this and `MobileHud` by viewport shape.
 */
export function DesktopHud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const { phase, roundNumber, core, autoStart, ink, won, pendingTower } = snapshot

  return (
    <div className="hud__panel">
      <dl className="hud__stats">
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

      <Deck />

      <div className="hud__actions">
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
            {phase === 'gap' ? `Start round ${roundNumber}` : 'Round in progress'}
          </button>
        )}

        <button
          type="button"
          className="hud__button"
          disabled={phase !== 'gap' || pendingTower !== null}
          onClick={() => useUiStore.getState().setPackShopOpen(true)}
        >
          Buy a pack
        </button>

        <button
          type="button"
          className="hud__button"
          onClick={() => useUiStore.getState().setAboutOpen(true)}
        >
          About
        </button>

        <button
          type="button"
          className="hud__button"
          onClick={() => useUiStore.getState().setStartScreenOpen(true)}
        >
          New run
        </button>

        <label className="hud__toggle">
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(event) =>
              dispatch({ kind: 'setAutoStart', enabled: event.target.checked })
            }
          />
          Auto-start rounds
        </label>
      </div>

      {phase === 'defeated' ? (
        <p className="hud__hint">
          The Core has fallen.
          {won
            ? ` You beat round ${VICTORY_ROUND}; free play ended on round ${roundNumber}.`
            : null}
        </p>
      ) : null}
    </div>
  )
}
