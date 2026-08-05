import { create } from 'zustand'
import type { Square } from '../game'

/**
 * View-only state: what the player has selected and is pointing at.
 *
 * Kept separate from `store.ts` so the game snapshot stays a faithful mirror of
 * the simulation, with no UI concerns mixed in.
 */
interface UiStore {
  /** The Card the player has picked from the Deck, or null for none. */
  selectedCardId: string | null
  setSelectedCardId: (cardId: string | null) => void

  /** The square under the pointer, for previewing coverage. */
  hoveredSquare: Square | null
  setHoveredSquare: (square: Square | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  selectedCardId: null,
  setSelectedCardId: (selectedCardId) => set({ selectedCardId }),
  hoveredSquare: null,
  setHoveredSquare: (hoveredSquare) => set({ hoveredSquare }),
}))
