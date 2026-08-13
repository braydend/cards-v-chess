import { useRef, useState } from 'react'
import { newSeed } from '../state/simulation'
import { useUiStore } from '../state/uiStore'
import { startRun } from './cardActions'
import { normalizeSeed } from './seedUrl'
import { useDialogFocus } from './useDialogFocus'

/**
 * The start screen: the overlay every load lands on.
 *
 * The seed field is the whole form — empty means a random run. Start funnels
 * through `startRun`, which normalises, resets the simulation, pushes the seed
 * into the URL, and closes this screen. There is deliberately no close button
 * and Escape is inert: "New run" is a committed decision, like the DevPanel's
 * Reset, so Start is the only way out.
 *
 * Focus is still moved in and Tab trapped by `useDialogFocus` so the
 * `aria-modal` assertion holds and the board behind cannot be tabbed into —
 * but the `close` it is handed is a no-op, which is what makes Escape inert.
 */
export function StartScreen() {
  const open = useUiStore((store) => store.startScreenOpen)
  const panelRef = useRef<HTMLDivElement>(null)
  const [seed, setSeed] = useState('')

  // A fresh open is always clean. This component stays mounted and only hides
  // behind `!open`, so without this the field would keep whatever was typed
  // last time and a bare Start on "New run" would replay that stale seed
  // instead of starting a fresh random run. Adjusted during render, not in an
  // effect, for the reason `react-hooks/set-state-in-effect` exists and the
  // PackShop makes the same choice — the compare-during-render pattern from
  // the React docs, so React bails out before paint and no stale value shows.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSeed('')
  }

  // No-op close: the screen cannot be dismissed, only started past. Escape
  // must not close it.
  useDialogFocus(panelRef, () => {}, open)

  if (!open) return null

  const onStart = () => {
    startRun(normalizeSeed(seed) === '' ? null : seed)
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="New run">
      <div className="modal__scrim" />

      <div className="modal__panel" ref={panelRef} tabIndex={-1}>
        <div className="modal__head">
          <span className="hud__label">Cards V Chess</span>
        </div>

        <label className="start-screen__field">
          <span className="hud__label">Run seed</span>
          <input
            type="text"
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            placeholder="Empty starts a random run"
          />
        </label>

        <div className="modal__actions">
          <button type="button" className="modal__cancel" onClick={() => setSeed(newSeed())}>
            Random
          </button>
          <button type="button" className="hud__button" onClick={onStart}>
            Start
          </button>
        </div>
      </div>
    </div>
  )
}
