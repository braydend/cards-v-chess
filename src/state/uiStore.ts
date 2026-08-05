import { create } from 'zustand'
import type { BuildableRank, Square } from '../game'

/**
 * View-only state: what the player has selected and is pointing at.
 *
 * Kept separate from `store.ts` so the game snapshot stays a faithful mirror of
 * the simulation, with no UI concerns mixed in.
 */
interface UiStore {
  /**
   * The rank that clicking the board will build. A stand-in for choosing a Card
   * from the Deck, which does not exist yet.
   */
  selectedRank: BuildableRank
  setSelectedRank: (rank: BuildableRank) => void

  /** The square under the pointer, for previewing coverage. */
  hoveredSquare: Square | null
  setHoveredSquare: (square: Square | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  selectedRank: 2,
  setSelectedRank: (selectedRank) => set({ selectedRank }),
  hoveredSquare: null,
  setHoveredSquare: (hoveredSquare) => set({ hoveredSquare }),
}))
