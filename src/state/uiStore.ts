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

  /**
   * Which of a Card's two modes the next click applies. Rank builds, suit
   * supports — the choice happens at play time, not at selection time.
   */
  playMode: 'build' | 'support'
  setPlayMode: (mode: 'build' | 'support') => void

  /**
   * The Tower a Queen will copy, picked on the first of its two clicks. Null
   * until then, and cleared once the Echo resolves.
   *
   * Echo is the only play needing two board targets — a source to copy and a
   * destination to build on.
   */
  echoSourceTowerId: string | null
  setEchoSourceTowerId: (towerId: string | null) => void

  /**
   * The Tower whose inspect panel is open. Null when nothing is selected.
   *
   * Independent of `selectedCardId`: inspecting is what a board click does when
   * no Card is selected, and a Card whose play targets a Tower takes precedence
   * over it. See `resolveTowerClick` in `src/scene/boardClick.ts`.
   */
  selectedTowerId: string | null
  setSelectedTowerId: (towerId: string | null) => void
}

export const useUiStore = create<UiStore>((set) => ({
  selectedCardId: null,
  setSelectedCardId: (selectedCardId) => set({ selectedCardId }),
  hoveredSquare: null,
  setHoveredSquare: (hoveredSquare) => set({ hoveredSquare }),
  playMode: 'build',
  setPlayMode: (playMode) => set({ playMode }),
  echoSourceTowerId: null,
  setEchoSourceTowerId: (echoSourceTowerId) => set({ echoSourceTowerId }),
  selectedTowerId: null,
  setSelectedTowerId: (selectedTowerId) => set({ selectedTowerId }),
}))
