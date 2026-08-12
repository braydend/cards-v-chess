import { VICTORY_ROUND } from '../data/rounds'
import { dispatch, useGameStore } from '../state/store'

/**
 * The full-screen victory overlay, shown when round `VICTORY_ROUND` completes.
 *
 * Not a closable modal — there is nothing to dismiss. Its single action,
 * Continue to free play, issues the engine's `continueToFreePlay` command,
 * which moves the run into the round-101 gap. There is deliberately no
 * end-run option: the win is the goal, and stopping there just starts a fresh
 * run, which "Play again" already does.
 */
export function VictoryScreen() {
  const phase = useGameStore((store) => store.snapshot.phase)

  if (phase !== 'victory') return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Victory">
      <div className="modal__scrim" />
      <div className="modal__panel">
        <div className="modal__head">
          <span className="hud__label">Victory</span>
        </div>
        <p className="victory__title">Round {VICTORY_ROUND} complete — you beat the game.</p>
        <p className="victory__subtitle">
          The goal is reached. Continue to free play: the same game, no further goal, until the Core falls.
        </p>
        <div className="modal__actions">
          <button
            type="button"
            className="hud__button"
            autoFocus
            onClick={() => dispatch({ kind: 'continueToFreePlay' })}
          >
            Continue to free play
          </button>
        </div>
      </div>
    </div>
  )
}
