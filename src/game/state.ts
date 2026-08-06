import { BOARD, CORE_MAX_HEALTH, CORE_SQUARE } from '../data/board'
import { dealPack } from './packs'
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

/**
 * The pack a run opens with.
 *
 * There is no authored starting Deck: the opening position is whatever this
 * deals, and reading it is the first real decision of the run. It is free — Ink
 * starts at zero — and an empty Deck plus ten cards cannot breach the cap, so
 * the opening deal has no cull step.
 */
const OPENING_PACK = 'base'

export function createInitialState(seed: string = DEV_SEED): GameState {
  const opening = dealPack(OPENING_PACK, undefined, streamFor(seed, 'packs'), 1)

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
    recentExits: [],
    ink: 0,
    pendingSpawns: [],
    nextEntityId: 1,
    seed,
    rng: { packs: opening.rng },
    nextCardId: opening.nextCardId,
    deck: opening.cards,
  }
}
