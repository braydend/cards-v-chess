import { CORE_MAX_HEALTH } from '../data/board'
import { BUILDABLE_RANKS, towerRank } from '../data/towerRanks'
import { reset } from '../state/simulation'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { GEOMETRY_LABELS } from './geometryLabels'

/**
 * Minimal HUD: enough to drive the round loop and read the game's state.
 *
 * Deliberately plain. There is no Deck, no Ink display and no card display —
 * none of the card system is implemented yet, even though it is now designed.
 * The real card UI, showing the visible Deck with each card's modal rank/suit
 * choice, is where the visual design effort belongs. See CLAUDE.md.
 */
export function Hud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const selectedRank = useUiStore((store) => store.selectedRank)
  const setSelectedRank = useUiStore((store) => store.setSelectedRank)
  const { phase, roundNumber, core, leaks, autoStart, pieces, towers } = snapshot
  const selected = towerRank(selectedRank)

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
          <div>
            <dt>Towers</dt>
            <dd>{towers.length}</dd>
          </div>
        </dl>

        <div className="hud__ranks">
          <span className="hud__label">Build rank</span>
          <div className="hud__rankRow">
            {BUILDABLE_RANKS.map((rank) => (
              <button
                key={rank}
                type="button"
                className={`hud__rank hud__rank--${rank}${
                  rank === selectedRank ? ' hud__rank--active' : ''
                }`}
                onClick={() => setSelectedRank(rank)}
              >
                {rank}
              </button>
            ))}
          </div>
          <p className="hud__rankDetail">
            {GEOMETRY_LABELS[selected.geometry]}
            <br />
            <span className="hud__muted">
              range {selected.range} · {selected.damage} dmg · {selected.fireIntervalMs}ms ·{' '}
              {selected.maxHealth} hp
            </span>
          </p>
        </div>

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
            : 'Hover the board to preview coverage, click to build — during a round or between them.'}
        </p>
      </div>
    </div>
  )
}
