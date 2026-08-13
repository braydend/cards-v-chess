import { reset, newSeed } from '../state/simulation'
import { useUiStore } from '../state/uiStore'
import { normalizeSeed, urlForSeed } from './seedUrl'

/**
 * Toggle a Card into or out of the hand being assembled. Shared by the desktop
 * Deck and the mobile deck overlay so the two cannot drift.
 *
 * Cards are picked into a hand as a multi-select. A new pick also clears any
 * touch preview (so a stale footprint does not point at a square from a
 * previous selection).
 */
export function toggleCardForHand(cardId: string): void {
  const ui = useUiStore.getState()
  ui.setPreviewedSquare(null)
  ui.toggleCard(cardId)
}

/**
 * Start a run with a specific seed.
 *
 * The one funnel every run start flows through — the start screen, "Play
 * again", and the URL seed at boot. `null` means a fresh random seed. The
 * seed is normalised here, so whatever shape the caller had (typed text,
 * a URL param) becomes the canonical one, and the same seed is pushed into
 * the URL so the current run is always the link. `replaceState`, not
 * `pushState`, so Back does not step through runs. The seed is written
 * percent-encoded (`urlForSeed`), so a seed that carries `&` or `#` still
 * reads back the same run on reload.
 *
 * View state is cleared here, the same list `resetRun` used to own:
 * `simulation.reset` only owns GameState, and it must stay that way — it lives
 * outside React on purpose. `selectedTowerId` matters most of the list:
 * `reset()` rewinds the entity counter, so a stale id would open the Tower
 * panel on a brand-new Tower that happens to reuse it.
 */
export function startRun(seed: string | null): void {
  const runSeed = seed !== null ? normalizeSeed(seed) : newSeed()
  reset(runSeed)
  history.replaceState(null, '', urlForSeed(runSeed))
  const ui = useUiStore.getState()
  ui.clearSelection()
  ui.setSelectedTowerId(null)
  ui.setPackShopOpen(false)
  ui.clearMarkedForCull()
  ui.setPreviewedSquare(null)
  ui.setStartScreenOpen(false)
}

/**
 * Start a fresh run with a random seed.
 *
 * Kept as its own name because it is the "Play again" and DevPanel action:
 * same funnel as `startRun`, just no seed.
 */
export function resetRun(): void {
  startRun(null)
}