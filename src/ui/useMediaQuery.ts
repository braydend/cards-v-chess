import { useMemo, useSyncExternalStore } from 'react'

/**
 * The mobile layout query. Mirrored verbatim in the `@media` rule in
 * `src/index.css` — keep the two strings identical.
 *
 * Viewport-shaped, not pointer-shaped: a phone in landscape hits `max-height`,
 * a phone in portrait hits `max-width`, an iPad is wide and tall and gets the
 * desktop panel. See the mobile UI spec, section 1.
 */
export const MOBILE_LAYOUT_QUERY = '(max-width: 28rem), (max-height: 30rem)'

/**
 * Whether the pointer is a touch pointer. Decides tap-to-preview vs.
 * click-to-play in `boardClick.ts` — independent of the layout query on
 * purpose. See the mobile UI spec, section 1.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/**
 * Subscribes to a media query and returns whether it currently matches.
 * Client-only — the app is a Vite SPA with no SSR, so `window` exists by the
 * time any component calls this.
 */
export function useMediaQuery(query: string): boolean {
  const mql = useMemo(() => window.matchMedia(query), [query])
  return useSyncExternalStore(
    (onChange) => {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => mql.matches,
  )
}
