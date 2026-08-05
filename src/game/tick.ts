import { SPAWN_RANK } from '../data/board'
import { pieceType } from '../data/pieceTypes'
import { towerRank, type TowerRankDef } from '../data/towerRanks'
import { squaresEqual, stepToward } from './board'
import { coversSquare } from './coverage'
import { step } from './step'
import type { GameState, Piece, Square, Tower } from './types'

/**
 * Advances the simulation by one fixed timestep.
 *
 * `dtMs` must be a fixed value supplied by an accumulator — never a raw frame
 * delta. That is what makes the simulation deterministic and refresh-rate
 * independent, and it is why tests can drive time by calling this directly.
 *
 * Towers fire, but do not yet have health and cannot be damaged or repaired,
 * and a Piece that lands on a Tower does not yet attack it. Those are the next
 * part of this slice. See CLAUDE.md.
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

  // Fire after movement, so Towers shoot at where Pieces actually are now.
  const fired = fireTowers(state.towers, moved.pieces, state.core.square, dtMs)

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
      pieces: fired.pieces,
      towers: fired.towers,
      pendingSpawns,
      nextEntityId,
    }
  }

  const roundCleared = fired.pieces.length === 0 && pendingSpawns.length === 0
  if (roundCleared) {
    return {
      ...state,
      phase: 'gap',
      roundNumber: state.roundNumber + 1,
      roundElapsedMs: 0,
      core,
      leaks,
      pieces: [],
      towers: fired.towers,
      pendingSpawns: [],
      nextEntityId,
    }
  }

  return {
    ...state,
    core,
    leaks,
    roundElapsedMs,
    pieces: fired.pieces,
    towers: fired.towers,
    pendingSpawns,
    nextEntityId,
  }
}

/**
 * Advances every Tower's cooldown and resolves the shots that come due.
 *
 * A Tower fires at most one shot per elapsed interval, at a single target —
 * nothing blocks line of fire and nothing pierces.
 */
function fireTowers(
  towers: readonly Tower[],
  pieces: readonly Piece[],
  coreSquare: Square,
  dtMs: number,
): { towers: Tower[]; pieces: Piece[] } {
  if (towers.length === 0) return { towers: [...towers], pieces: [...pieces] }

  // Damage accumulates here so that several Towers can share a target within a
  // single tick without one of them shooting a Piece that is already dead.
  const remainingHealth = new Map(pieces.map((piece) => [piece.id, piece.health]))
  const nextTowers: Tower[] = []

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)
    let cooldown = tower.fireCooldownMs + dtMs

    while (cooldown >= def.fireIntervalMs) {
      const target = selectTarget(tower, def, pieces, remainingHealth, coreSquare)

      if (!target) {
        // Hold at "ready" rather than banking shots. Without this, a Tower idle
        // for ten seconds would unload every stored shot the instant a Piece
        // walked into range.
        cooldown = def.fireIntervalMs
        break
      }

      cooldown -= def.fireIntervalMs
      remainingHealth.set(target.id, (remainingHealth.get(target.id) ?? 0) - def.damage)
    }

    nextTowers.push({ ...tower, fireCooldownMs: cooldown })
  }

  const survivors = pieces
    .map((piece) => ({ ...piece, health: remainingHealth.get(piece.id) ?? piece.health }))
    .filter((piece) => piece.health > 0)

  return { towers: nextTowers, pieces: survivors }
}

/**
 * The covered, still-living Piece nearest the Core — the most urgent threat.
 *
 * Distance is measured in hops rather than straight-line, because Pieces move
 * one square along one axis at a time. Ties break on id so the simulation stays
 * deterministic and seed-reproducible.
 */
function selectTarget(
  tower: Tower,
  def: TowerRankDef,
  pieces: readonly Piece[],
  remainingHealth: Map<string, number>,
  coreSquare: Square,
): Piece | undefined {
  let best: Piece | undefined
  let bestDistance = Number.POSITIVE_INFINITY

  for (const piece of pieces) {
    if ((remainingHealth.get(piece.id) ?? piece.health) <= 0) continue
    if (!coversSquare(def.geometry, def.range, tower.square, piece.square)) continue

    const distance =
      Math.abs(piece.square.file - coreSquare.file) + Math.abs(piece.square.rank - coreSquare.rank)

    if (distance < bestDistance || (distance === bestDistance && best && piece.id < best.id)) {
      best = piece
      bestDistance = distance
    }
  }

  return best
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
