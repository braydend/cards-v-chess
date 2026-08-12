import { useRef } from 'react'
import { useUiStore } from '../state/uiStore'
import { useDialogFocus } from './useDialogFocus'

/**
 * The CC-BY 4.0 attribution for the chess piece models.
 *
 * This work is based on "Chess Pieces" by Aitordsgn. The same credit lives in
 * `src/scene/pieceModels.ts` (where the models load), in
 * `public/models/chess_pieces/license.txt`, and in `README.md`.
 */
const MODEL_TITLE = 'Chess Pieces'
const MODEL_URL = 'https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38'
const MODEL_AUTHOR = 'aitordsgn'
const MODEL_AUTHOR_URL = 'https://sketchfab.com/aitordsgn'
const MODEL_LICENSE = 'CC-BY-4.0'
const MODEL_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'

/**
 * The About modal: the run seed and the model attribution, opened from the HUD.
 *
 * A modal for consistency with the pack shop's interaction (scrim + Escape to
 * close), not because it needs modal semantics — it holds no form and no
 * state. Like PackShop, Tab is confined to the dialog so the `aria-modal`
 * assertion holds, and focus is moved in on open and handed back on close.
 */
export function About() {
  const open = useUiStore((store) => store.aboutOpen)
  const setOpen = useUiStore((store) => store.setAboutOpen)
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus is moved in, Tab trapped, and focus restored by `useDialogFocus` —
  // the `aria-modal` assertion depends on the trap. `setOpen` is stable, but
  // the hook is written for unstable `close` closures all the same.
  useDialogFocus(panelRef, () => setOpen(false), open)

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="About">
      <button type="button" className="modal__scrim" aria-label="Close" onClick={() => setOpen(false)} />

      <div className="modal__panel" ref={panelRef} tabIndex={-1}>
        <div className="modal__head">
          <span className="hud__label">About</span>
        </div>

        <p className="credits__line">
          This work is based on{' '}
          <a href={MODEL_URL} target="_blank" rel="noreferrer">
            {MODEL_TITLE}
          </a>{' '}
          by{' '}
          <a href={MODEL_AUTHOR_URL} target="_blank" rel="noreferrer">
            {MODEL_AUTHOR}
          </a>{' '}
          licensed under{' '}
          <a href={MODEL_LICENSE_URL} target="_blank" rel="noreferrer">
            {MODEL_LICENSE}
          </a>
          .
        </p>
      </div>
    </div>
  )
}
