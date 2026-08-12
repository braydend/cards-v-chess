import type { GameState } from './types'

/**
 * Developer-mode commands: the engine half of issue #60's testing panel.
 *
 * Deliberately NOT part of the game rules — a dev panel is the only caller.
 * Each command refuses an invalid input by returning the same state object,
 * exactly like every other command, so `simulation.dispatch` tells a refusal
 * from a success by identity. None of them draws from `state.rng`, so using
 * dev mode never shifts later seeded outcomes. The panel UI is compiled out
 * of production builds (`import.meta.env.DEV`), which is the only gate.
 */

export function devAddInk(state: GameState, amount: number): GameState {
  if (amount < 1) return state

  return { ...state, ink: state.ink + amount }
}

export function devSetCoreHealth(
  state: GameState,
  health: number,
  maxHealth: number,
): GameState {
  // Refused once defeated: phase 'defeated' plus a full Core would contradict
  // each other. Every other dev command is deliberately phase-agnostic.
  if (state.phase === 'defeated') return state
  if (health < 1 || maxHealth < health) return state

  return { ...state, core: { ...state.core, health, maxHealth } }
}
