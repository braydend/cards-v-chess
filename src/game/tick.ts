import { SPAWN_RANK } from '../data/board'
import { pieceType } from '../data/pieceTypes'
import { squaresEqual, stepToward } from './board'
import { step } from './step'
import type { GameState, Piece, Square } from './types'

/**
 * Advances the simulation by one fixed timestep.
 *
 * `dtMs` must be a fixed value supplied by an accumulator — never a raw frame
 * delta. That is what makes the simulation deterministic and refresh-rate
 * independent, and it is why tests can drive time by calling this directly.
 *
 * Note that Towers currently have no combat behaviour: they are placed and
 * rendered but do not fire, have no health, and cannot be damaged or repaired.
 * A Tower's firing geometry comes from the Card rank that built it; the rank
 * ladder is only partly designed. See CLAUDE.md.
 */
export function tick(state: GameState, dtMs: number): GameState {
  if (state.phase === 'defeated') return state

  // Auto-start lives here rather than in the caller so that every rule stays
  // inside the engine. It is a setting, not a game mode: it simply issues the
  // start command the player would otherwise issue by hand.
  if (state.phase === 'gap') {
    return state.autoStart ? step(state, { kind: 'startRound' }) : state
  }

  const roundElapsedMs = state.roundElapsedMs + dtMs

  const { spawned, pendingSpawns, nextEntityId } = drainDueSpawns(state, roundElapsedMs)
  const moved = movePieces([...state.pieces, ...spawned], state.core.square, dtMs)

  const coreHealth = Math.max(0, state.core.health - moved.leaked)
  const core = { ...state.core, health: coreHealth }
  const leaks = state.leaks + moved.leaked

  if (coreHealth === 0) {
    return {
      ...state,
      phase: 'defeated',
      core,
      leaks,
      roundElapsedMs,
      pieces: moved.pieces,
      pendingSpawns,
      nextEntityId,
    }
  }

  const roundCleared = moved.pieces.length === 0 && pendingSpawns.length === 0
  if (roundCleared) {
    return {
      ...state,
      phase: 'gap',
      roundNumber: state.roundNumber + 1,
      roundElapsedMs: 0,
      core,
      leaks,
      pieces: [],
      pendingSpawns: [],
      nextEntityId,
    }
  }

  return {
    ...state,
    core,
    leaks,
    roundElapsedMs,
    pieces: moved.pieces,
    pendingSpawns,
    nextEntityId,
  }
}

function drainDueSpawns(
  state: GameState,
  roundElapsedMs: number,
): { spawned: Piece[]; pendingSpawns: GameState['pendingSpawns']; nextEntityId: number } {
  const spawned: Piece[] = []
  const pendingSpawns = state.pendingSpawns.filter((spawn) => spawn.atMs > roundElapsedMs)
  let nextEntityId = state.nextEntityId

  for (const spawn of state.pendingSpawns) {
    if (spawn.atMs > roundElapsedMs) continue

    const square: Square = { file: spawn.file, rank: SPAWN_RANK }
    spawned.push({
      id: `piece-${nextEntityId}`,
      typeId: spawn.typeId,
      square,
      prevSquare: square,
      health: pieceType(spawn.typeId).maxHealth,
      moveCooldownMs: 0,
    })
    nextEntityId += 1
  }

  return { spawned, pendingSpawns, nextEntityId }
}

function movePieces(
  pieces: readonly Piece[],
  coreSquare: Square,
  dtMs: number,
): { pieces: Piece[]; leaked: number } {
  const survivors: Piece[] = []
  let leaked = 0

  for (const piece of pieces) {
    const { moveIntervalMs } = pieceType(piece.typeId)

    let cooldown = piece.moveCooldownMs + dtMs
    let square = piece.square
    let prevSquare = piece.prevSquare
    let reachedCore = false

    // A loop rather than a single hop so that a slow frame or a fast piece can
    // resolve more than one hop in a step without silently dropping movement.
    while (cooldown >= moveIntervalMs) {
      cooldown -= moveIntervalMs
      prevSquare = square
      square = stepToward(square, coreSquare)

      if (squaresEqual(square, coreSquare)) {
        reachedCore = true
        break
      }
    }

    if (reachedCore) {
      leaked += 1
      continue
    }

    survivors.push({ ...piece, square, prevSquare, moveCooldownMs: cooldown })
  }

  return { pieces: survivors, leaked }
}
