import { reset } from '../state/simulation'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { Deck } from './Deck'
import { PackShop } from './PackShop'
import { TowerPanel } from './TowerPanel'

/**
 * The HUD: the run's state, the Deck, the round controls, and the Tower panel.
 *
 * Reading top to bottom follows the order the player works in — see where the
 * run stands, play Cards, then start the round. The Deck owns all card copy, so
 * nothing here repeats it, and `TowerPanel` owns everything about the selected
 * Tower — it mounts itself only when one is selected.
 */
export function Hud() {
  const snapshot = useGameStore((store) => store.snapshot)
  const { phase, roundNumber, core, leaks, autoStart, pieces, towers, ink } = snapshot

  // `simulation.reset` only owns GameState, not view state, and it must stay
  // that way — it lives outside React on purpose and never depends on other
  // state. So a fresh run's leftover selection (in particular a half-picked
  // Echo source Tower, which would otherwise survive into the new game) is
  // cleared here, from the caller, rather than inside `reset` itself.
  //
  // `selectedTowerId` matters most of the three: `reset()` rewinds the entity
  // counter, so a stale id would open the panel on a brand-new Tower that
  // happens to reuse it.
  function handleReset() {
    reset()
    useUiStore.getState().setSelectedCardId(null)
    useUiStore.getState().setEchoSourceTowerId(null)
    useUiStore.getState().setSelectedTowerId(null)
    useUiStore.getState().setPackShopOpen(false)
    useUiStore.getState().clearMarkedForCull()
  }

  return (
    <div className="hud">
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

        <Deck />

        <div className="hud__actions">
          {phase === 'defeated' ? (
            <button type="button" className="hud__button" onClick={handleReset}>
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

          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap'}
            onClick={() => useUiStore.getState().setPackShopOpen(true)}
          >
            Buy a pack
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

        {phase === 'defeated' ? <p className="hud__hint">The Core has fallen.</p> : null}
      </div>

      <TowerPanel />
      <PackShop />
    </div>
  )
}
