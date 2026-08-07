import { useEffect, useRef } from 'react'
import { useUiStore } from '../state/uiStore'

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
 * The credits modal: a static attribution panel, opened from the HUD.
 *
 * A modal for consistency with the pack shop's interaction (scrim + Escape to
 * close), not because it needs modal semantics — it holds no form and no
 * state. Like PackShop, Tab is confined to the dialog so the `aria-modal`
 * assertion holds, and focus is moved in on open and handed back on close.
 */
export function Credits() {
  const open = useUiStore((store) => store.creditsOpen)
  const setOpen = useUiStore((store) => store.setCreditsOpen)
  const panelRef = useRef<HTMLDivElement>(null)

  // Remember where focus came from, move it into the dialog, and hand it back
  // on the way out — the `PackShop` precedent.
  useEffect(() => {
    if (!open) return

    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    return () => returnFocus?.focus()
  }, [open])

  // Escape closes, like any modal. Bound only while open.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        return
      }

      if (event.key !== 'Tab') return

      // `aria-modal` asserts focus is confined to this dialog, so confine it —
      // otherwise Tab walks into the HUD behind. The scrim sits outside the
      // panel, exactly as in `PackShop`, so it is not part of the trap.
      const panel = panelRef.current
      if (!panel) return

      const focusable = panel.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Credits">
      <button type="button" className="modal__scrim" aria-label="Close" onClick={() => setOpen(false)} />

      <div className="modal__panel" ref={panelRef} tabIndex={-1}>
        <div className="modal__head">
          <span className="hud__label">Credits</span>
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
