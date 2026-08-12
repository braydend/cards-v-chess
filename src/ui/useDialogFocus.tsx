import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Focus management for a modal dialog, the `PackShop` precedent made shared.
 *
 * While `open`, this moves focus onto the panel, remembers where it came from,
 * traps Tab inside the panel so the `aria-modal` assertion holds, closes on
 * Escape, and hands focus back on the way out.
 *
 * The keydown listener is bound once per open, not once per render: callers
 * like the mobile HUD pass a fresh `() => setDeckOpen(false)` closure every
 * render, so an effect depending on `close` would detach and reattach on every
 * snapshot publish. The latest `close` lives in a ref instead, and the listener
 * reads through it.
 *
 * The focusable selector is buttons plus links, matching `About`, which traps
 * links because its panel holds only the attribution links. `PackShop` and the
 * deck overlay have no links, so for them the `a[href]` clause matches nothing
 * and the trap is effectively buttons-only.
 */
export function useDialogFocus(
  panelRef: RefObject<HTMLElement | null>,
  close: () => void,
  open: boolean,
): void {
  // The `close` callback is captured fresh per render by callers like the
  // mobile HUD (`() => setDeckOpen(false)`), so the keydown listener cannot
  // depend on it without detaching and reattaching on every snapshot publish.
  // Keep the latest one in a ref — updated after each render — and bind the
  // listener once per open, reading through the ref.
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  // Remember where focus came from, move it into the dialog, and hand it back
  // on the way out.
  useEffect(() => {
    if (!open) return

    const returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()

    return () => returnFocus?.focus()
  }, [open, panelRef])

  // Escape closes, like any modal. Bound only while open, so the handler is not
  // live for the whole session.
  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeRef.current()
        return
      }

      if (event.key !== 'Tab') return

      // `aria-modal` asserts focus is confined to this dialog, so confine it —
      // otherwise Tab walks into the UI behind. The scrim sits outside the
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
  }, [open, panelRef])
}
