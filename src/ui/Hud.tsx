import { CORE_MAX_HEALTH } from '../data/board'
import { reset } from '../state/simulation'
import { dispatch, useGameStore } from '../state/store'

/**
 * Minimal HUD: enough to drive the round loop and read the game's state.
 *
 * Deliberately plain. There is no hand, no deck, no Ink display and no card
 * display — none of the card system is implemented yet, even though it is now
 * designed. The real card UI, showing a hand of playing cards with their modal
 * rank/suit choice, is where the visual design effort belongs. See CLAUDE.md.
 */
export function Hud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const { phase, roundNumber, core, leaks, autoStart, pieces } = snapshot

  return (
    <div className="hud">
      <div className="hud__panel">
        <dl className="hud__stats">
          <div>
            <dt>Round</dt>
            <dd>{roundNumber}</dd>
          </div>
          <div>
            <dt>Core</dt>
            <dd>
              {core.health}
              <span className="hud__muted"> / {CORE_MAX_HEALTH}</span>
            </dd>
          </div>
          <div>
            <dt>Leaks</dt>
            <dd>{leaks}</dd>
          </div>
          <div>
            <dt>Pieces</dt>
            <dd>{pieces.length}</dd>
          </div>
        </dl>

        <div className="hud__actions">
          {phase === 'defeated' ? (
            <button type="button" className="hud__button" onClick={reset}>
              Play again
            </button>
          ) : (
            <button
              type="button"
              className="hud__button"
              disabled={phase !== 'gap'}
              onClick={() => dispatch({ kind: 'startRound' })}
            >
              {phase === 'gap' ? `Start round ${roundNumber}` : 'Round in progress'}
            </button>
          )}

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

        <p className="hud__hint">
          {phase === 'defeated'
            ? 'The Core has fallen.'
            : 'Click the board to place a Tower — during a round or between them.'}
        </p>
      </div>
    </div>
  )
}
