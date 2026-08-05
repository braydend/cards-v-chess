import { reset } from '../state/simulation'
import { dispatch, useGameStore } from '../state/store'

/**
 * Minimal HUD: enough to drive the round loop and read the game's state.
 *
 * Deliberately plain. There is no Deck display yet, so nothing here can pick a
 * Card — and building now costs one, which leaves the board unbuildable until
 * the Deck UI lands. The real card UI, showing the visible Deck with each card's
 * modal rank/suit choice, is where the visual design effort belongs. See
 * CLAUDE.md.
 */
export function Hud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const { phase, roundNumber, core, leaks, autoStart, pieces, towers } = snapshot

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
              <span className="hud__muted"> / {core.maxHealth}</span>
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
          <div>
            <dt>Towers</dt>
            <dd>{towers.length}</dd>
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
          {phase === 'defeated' ? 'The Core has fallen.' : 'Pick a Card, then click the board to build.'}
        </p>
      </div>
    </div>
  )
}
