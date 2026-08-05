import { BOARD, CORE_MAX_HEALTH, CORE_SQUARE } from '../data/board'
import type { GameState } from './types'

export function createInitialState(): GameState {
  return {
    board: BOARD,
    core: { square: CORE_SQUARE, health: CORE_MAX_HEALTH },
    phase: 'gap',
    roundNumber: 1,
    autoStart: false,
    roundElapsedMs: 0,
    pieces: [],
    towers: [],
    leaks: 0,
    pendingSpawns: [],
    nextEntityId: 1,
  }
}
