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
   * The square whose coverage is being previewed on a touch device.
   *
   * Desktop previews coverage under a pointer (`hoveredSquare`); touch has no
   * pointer position, so the first tap on a square commits it here and the
   * teal/red `CoveragePreview` renders against it. Purely view state — the
   * engine never reads it. Cleared when the Card selection changes, a play
   * lands, or the run resets.
   */
  previewedSquare: Square | null
  setPreviewedSquare: (square: Square | null) => void

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
   * over it. See `resolveBoardAction` in `src/scene/boardClick.ts`.
   */
  selectedTowerId: string | null
  setSelectedTowerId: (towerId: string | null) => void

  /**
   * Whether the pack shop is open.
   *
   * Purely view state: the purchase is a single atomic command, so nothing
   * half-finished lives in `GameState` and closing the shop needs no rollback.
   */
  packShopOpen: boolean
  setPackShopOpen: (open: boolean) => void

  /**
   * Whether the credits modal is open.
   *
   * Purely view state: the attribution is static text, so nothing about it
   * lives in `GameState`.
   */
  creditsOpen: boolean
  setCreditsOpen: (open: boolean) => void

  /**
   * Whether the developer panel is open.
   *
   * Purely view state. The panel itself is compiled out of production builds
   * (`import.meta.env.DEV` in `src/ui/DevPanel.tsx`), so this flag only ever
   * exists in development.
   */
  devPanelOpen: boolean
  setDevPanelOpen: (open: boolean) => void

  /**
   * Cards marked for destruction in the pack shop, by id.
   *
   * The cull is chosen before the pack opens, and no card is destroyed until the
   * `buyPack` command commits — so this is a pending intention, not state the
   * simulation knows about.
   */
  markedForCullIds: readonly string[]
  toggleMarkedForCull: (cardId: string) => void
  clearMarkedForCull: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  selectedCardId: null,
  setSelectedCardId: (selectedCardId) => set({ selectedCardId }),
  hoveredSquare: null,
  setHoveredSquare: (hoveredSquare) => set({ hoveredSquare }),
  previewedSquare: null,
  setPreviewedSquare: (previewedSquare) => set({ previewedSquare }),
  playMode: 'build',
  setPlayMode: (playMode) => set({ playMode }),
  echoSourceTowerId: null,
  setEchoSourceTowerId: (echoSourceTowerId) => set({ echoSourceTowerId }),
  selectedTowerId: null,
  setSelectedTowerId: (selectedTowerId) => set({ selectedTowerId }),
  packShopOpen: false,
  setPackShopOpen: (packShopOpen) => set({ packShopOpen }),
  creditsOpen: false,
  setCreditsOpen: (creditsOpen) => set({ creditsOpen }),
  devPanelOpen: false,
  setDevPanelOpen: (devPanelOpen) => set({ devPanelOpen }),
  markedForCullIds: [],
  toggleMarkedForCull: (cardId) =>
    set((store) => ({
      markedForCullIds: store.markedForCullIds.includes(cardId)
        ? store.markedForCullIds.filter((id) => id !== cardId)
        : [...store.markedForCullIds, cardId],
    })),
  clearMarkedForCull: () => set({ markedForCullIds: [] }),
}))
