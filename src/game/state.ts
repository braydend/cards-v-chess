import { BOARD, CORE_MAX_HEALTH, CORE_SQUARE } from '../data/board'
import { STARTING_DECK } from '../data/deck'
import { streamFor } from './rng'
import type { GameState } from './types'

/**
 * The seed used when a caller does not supply one.
 *
 * Tests get determinism for free from this — `createInitialState()` with no
 * argument is the same run every time. Production must NOT rely on it:
 * `src/state/simulation.ts` mints a real seed per run, because a fixed default
 * there would deal every player the same cards forever.
 */
export const DEV_SEED = 'cards-v-chess'

export function createInitialState(seed: string = DEV_SEED): GameState {
  return {
    board: BOARD,
    core: { square: CORE_SQUARE, health: CORE_MAX_HEALTH, maxHealth: CORE_MAX_HEALTH },
    phase: 'gap',
    roundNumber: 1,
    autoStart: false,
    roundElapsedMs: 0,
    pieces: [],
    towers: [],
    leaks: 0,
    ink: 0,
    pendingSpawns: [],
    nextEntityId: 1,
    seed,
    rng: { packs: streamFor(seed, 'packs') },
    nextCardId: 1,
    deck: STARTING_DECK,
  }
}
