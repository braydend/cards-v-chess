import { create } from 'zustand'
import type { GameState } from '../game'
import * as simulation from './simulation'
import { structuralKey } from './structuralKey'

/**
 * The bridge between the simulation and React.
 *
 * Publishes a new snapshot only when the structural key changes, so components
 * re-render on hops and events rather than on every frame.
 */
interface GameStore {
  snapshot: GameState
}

export const useGameStore = create<GameStore>(() => ({
  snapshot: simulation.getState(),
}))

let lastKey = structuralKey(simulation.getState())

simulation.subscribe(() => {
  const next = simulation.getState()
  const key = structuralKey(next)
  if (key === lastKey) return

  lastKey = key
  useGameStore.setState({ snapshot: next })
})

export const dispatch = simulation.dispatch
