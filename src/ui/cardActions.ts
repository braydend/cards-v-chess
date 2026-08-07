import { reset } from '../state/simulation'
import { useUiStore } from '../state/uiStore'

/**
 * Pick a Card from the Deck, or toggle it off. Shared by the desktop Deck and
 * the mobile deck overlay so the two cannot drift.
 *
 * Each Card is picked fresh in rank mode. Carrying the previous Card's mode
 * across would leave a Joker stuck in a suit mode it cannot offer, with no
 * button to switch back. A new selection also clears any half-finished Echo
 * (so it cannot leak into the next play) and any touch preview (so a stale
 * footprint does not point at a square from the previous Card).
 */
export function selectCard(cardId: string, selectedCardId: string | null): void {
  const ui = useUiStore.getState()
  ui.setEchoSourceTowerId(null)
  ui.setPlayMode('build')
  ui.setPreviewedSquare(null)
  ui.setSelectedCardId(cardId === selectedCardId ? null : cardId)
}

/**
 * Start a fresh run: reset the simulation and clear every piece of view state,
 * including the touch preview. `simulation.reset` only owns GameState, not view
 * state, and it must stay that way — it lives outside React on purpose. The
 * leftover-selection clearing happens here, from the caller, so the renderer
 * never resets a run without also clearing its own state.
 *
 * `selectedTowerId` matters most of the three: `reset()` rewinds the entity
 * counter, so a stale id would open the Tower panel on a brand-new Tower that
 * happens to reuse it.
 */
export function resetRun(): void {
  reset()
  const ui = useUiStore.getState()
  ui.setSelectedCardId(null)
  ui.setEchoSourceTowerId(null)
  ui.setSelectedTowerId(null)
  ui.setPackShopOpen(false)
  ui.clearMarkedForCull()
  ui.setPreviewedSquare(null)
}
