import { reset } from '../state/simulation'
import { useUiStore } from '../state/uiStore'

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
 * Start a fresh run: reset the simulation and clear every piece of view state,
 * including the touch preview. `simulation.reset` only owns GameState, not view
 * state, and it must stay that way — it lives outside React on purpose. The
 * leftover-selection clearing happens here, from the caller, so the renderer
 * never resets a run without also clearing its own state.
 *
 * `selectedTowerId` matters most of the list: `reset()` rewinds the entity
 * counter, so a stale id would open the Tower panel on a brand-new Tower that
 * happens to reuse it.
 */
export function resetRun(): void {
  reset()
  const ui = useUiStore.getState()
  ui.clearSelection()
  ui.setSelectedTowerId(null)
  ui.setPackShopOpen(false)
  ui.clearMarkedForCull()
  ui.setPreviewedSquare(null)
}
