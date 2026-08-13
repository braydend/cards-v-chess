import { create } from 'zustand'
import type { Square } from '../game'
import type { DeckSort } from '../ui/deckSort'

/**
 * View-only state: what the player has selected and is pointing at.
 *
 * Kept separate from `store.ts` so the game snapshot stays a faithful mirror of
 * the simulation, with no UI concerns mixed in.
 */
interface UiStore {
  /** The Card ids the player has picked to assemble a hand, in pick order. */
  selectedCardIds: readonly string[]
  toggleCard: (cardId: string) => void
  clearSelection: () => void

  /**
   * How the Deck view orders its cards. `'none'` is raw deal order — the
   * default. Pure view state, shared by the desktop Deck and the mobile
   * picker; sorting is a rendering concern and never reaches GameState.
   */
  deckSort: DeckSort
  setDeckSort: (sort: DeckSort) => void

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
   * The Tower whose inspect panel is open. Null when nothing is selected.
   *
   * Independent of the hand: inspecting is what a board click does when no Card
   * is selected, and a play whose targets include a Tower takes precedence over
   * it. See `resolveBoardAction` in `src/scene/boardClick.ts`.
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
   * Whether the About modal is open.
   *
   * Purely view state: the attribution is static text, so nothing about it
   * lives in `GameState`.
   */
  aboutOpen: boolean
  setAboutOpen: (open: boolean) => void

  /**
   * Whether the start screen is showing.
   *
   * Defaults to `true` so every load lands on the start screen; `main.tsx`
   * closes it before first paint when the URL carries a seed. Purely view
   * state — "no run has been chosen yet" is a UI concern, not an engine one,
   * and the simulation always boots a throwaway random run behind it.
   */
  startScreenOpen: boolean
  setStartScreenOpen: (open: boolean) => void

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
  selectedCardIds: [],
  toggleCard: (cardId) =>
    set((store) => ({
      selectedCardIds: store.selectedCardIds.includes(cardId)
        ? store.selectedCardIds.filter((id) => id !== cardId)
        : [...store.selectedCardIds, cardId],
    })),
  clearSelection: () => set({ selectedCardIds: [] }),
  deckSort: 'none',
  setDeckSort: (deckSort) => set({ deckSort }),
  hoveredSquare: null,
  setHoveredSquare: (hoveredSquare) => set({ hoveredSquare }),
  previewedSquare: null,
  setPreviewedSquare: (previewedSquare) => set({ previewedSquare }),
  selectedTowerId: null,
  setSelectedTowerId: (selectedTowerId) => set({ selectedTowerId }),
  packShopOpen: false,
  setPackShopOpen: (packShopOpen) => set({ packShopOpen }),
  aboutOpen: false,
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  startScreenOpen: true,
  setStartScreenOpen: (startScreenOpen) => set({ startScreenOpen }),
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
