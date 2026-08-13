import { createInitialState, step, tick, type Command, type GameState } from '../game'

/**
 * Owns the live game state and drives it with a fixed timestep.
 *
 * Lives outside React on purpose. React subscribes to it; it never depends on
 * React. This is what keeps the "simulation is not render-driven" property that
 * makes R3F a safe choice for this project — see the design doc.
 */

const FIXED_DT_MS = 1000 / 60

/**
 * Cap on catch-up steps per frame. Without this, a long stall (tab backgrounded,
 * breakpoint hit) would hand the accumulator a huge delta and the sim would try
 * to simulate it all at once, freezing the page. Slowing down beats hanging.
 */
const MAX_CATCHUP_STEPS = 5

/**
 * A fresh run seed.
 *
 * `Math.random` is legal here and banned in `src/game/` — that boundary is the
 * whole reason the engine takes a seed rather than minting one. Base 36 keeps it
 * short enough to read aloud, for when a seed becomes shareable.
 */
export function newSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

let current = createInitialState(newSeed())
let accumulatorMs = 0
const listeners = new Set<() => void>()

export function getState(): GameState {
  return current
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * Applies a command to the live state.
 *
 * Returns whether the state actually changed. `step` returns the exact same
 * object on a refusal, so identity comparison is an exact test — callers use
 * this to tell a successful play apart from a refused one, since neither
 * throws.
 */
export function dispatch(command: Command): boolean {
  const next = step(current, command)
  if (next === current) return false

  current = next
  emit()
  return true
}

/** Feed this the raw frame delta. The accumulator converts it to fixed steps. */
export function advance(frameMs: number): void {
  accumulatorMs = Math.min(accumulatorMs + frameMs, FIXED_DT_MS * MAX_CATCHUP_STEPS)

  let stepped = false
  while (accumulatorMs >= FIXED_DT_MS) {
    accumulatorMs -= FIXED_DT_MS
    current = tick(current, FIXED_DT_MS)
    stepped = true
  }

  if (stepped) emit()
}

/**
 * Starts a fresh run.
 *
 * Takes an optional seed so tests can pin the run they are exercising — without
 * one, a fresh seed means a fresh pack, and a test asserting anything about the
 * opening Deck would be flaky.
 */
export function reset(seed: string = newSeed()): void {
  current = createInitialState(seed)
  accumulatorMs = 0
  emit()
}
