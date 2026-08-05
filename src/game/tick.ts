import { SPAWN_RANK } from '../data/board'
import { BLOCKED_ATTACK_MULTIPLIER, pieceType } from '../data/pieceTypes'
import { towerRank, type TowerRankDef } from '../data/towerRanks'
import { squareKey } from './board'
import { coversSquare } from './coverage'
import { isStuck, nextMove } from './movement'
import { step } from './step'
import type { BoardSpec, GameState, Piece, Square, Tower } from './types'

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

  // Every Piece this tick sees the same Tower layout, so the outcome does not
  // depend on the order Pieces are processed in.
  const towerBySquare = new Map(state.towers.map((tower) => [squareKey(tower.square), tower]))

  const moved = movePieces(
    [...state.pieces, ...spawned],
    state.board,
    state.core.square,
    towerBySquare,
    dtMs,
  )

  // Damage from blocked Pieces lands before Towers shoot, so a Tower destroyed
  // this tick does not get a parting shot.
  const standingTowers = applyTowerDamage(state.towers, moved.towerDamage)

  // Fire after movement, so Towers shoot at where Pieces actually are now.
  const fired = fireTowers(standingTowers, moved.pieces, state.core.square, dtMs)

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

  // A round ends when nothing on the board can still act — not when the board is
  // empty. Chess movement leaves Pieces genuinely stranded: a pawn that reaches
  // the back rank off the Core's file has no legal move for the rest of the run.
  // Waiting for an empty board would hang the round forever.
  //
  // Stranded Pieces are deliberately left standing rather than quietly deleted,
  // so the gap is visible. The designed answer is Pawn promotion, which is not
  // implemented. See the design doc's open questions.
  const standingBySquare = new Map(
    fired.towers.map((tower) => [squareKey(tower.square), tower]),
  )
  const stillActive = fired.pieces.some(
    (piece) => !isStuck(piece, state.board, state.core.square, standingBySquare),
  )

  if (!stillActive && pendingSpawns.length === 0) {
    return {
      ...state,
      phase: 'gap',
      roundNumber: state.roundNumber + 1,
      roundElapsedMs: 0,
      core,
      leaks,
      pieces: fired.pieces,
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

/**
 * Moves every Piece, and resolves what happens when a Tower is in the way.
 *
 * **Towers block movement.** A Piece whose next square holds a Tower does not
 * advance; it attacks instead, at `BLOCKED_ATTACK_MULTIPLIER` of its attack
 * damage. Pieces are poor demolitionists, so a Tower is a genuine obstacle
 * rather than a speed bump — but it is not a permanent wall either, since it
 * takes damage every time it stops something.
 *
 * There is no pathfinding: a blocked Piece waits and grinds rather than routing
 * around. That is deliberate — routing around would let the player steer Pieces
 * with Tower placement, which is the mazing the design rejects.
 */
function movePieces(
  pieces: readonly Piece[],
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  dtMs: number,
): { pieces: Piece[]; leaked: number; towerDamage: Map<string, number> } {
  const survivors: Piece[] = []
  const towerDamage = new Map<string, number>()
  let leaked = 0

  for (const piece of pieces) {
    const { moveIntervalMs, attackDamage } = pieceType(piece.typeId)

    let cooldown = piece.moveCooldownMs + dtMs
    let square = piece.square
    let prevSquare = piece.prevSquare
    let reachedCore = false

    // A loop rather than a single hop so that a slow frame or a fast piece can
    // resolve more than one move in a step without silently dropping movement.
    while (cooldown >= moveIntervalMs) {
      cooldown -= moveIntervalMs

      const outcome = nextMove(piece.typeId, square, board, coreSquare, towerBySquare)

      if (outcome.kind === 'reachCore') {
        reachedCore = true
        break
      }

      if (outcome.kind === 'attackTower') {
        towerDamage.set(
          outcome.towerId,
          (towerDamage.get(outcome.towerId) ?? 0) + attackDamage * BLOCKED_ATTACK_MULTIPLIER,
        )
        // Stay put, and leave nothing for the renderer to interpolate.
        prevSquare = square
        continue
      }

      if (outcome.kind === 'stuck') {
        // No legal move now and none later. Drop the cooldown so the Piece is
        // not burning simulation work every tick for the rest of the run.
        prevSquare = square
        cooldown = 0
        break
      }

      prevSquare = square
      square = outcome.to
    }

    if (reachedCore) {
      leaked += 1
      continue
    }

    survivors.push({ ...piece, square, prevSquare, moveCooldownMs: cooldown })
  }

  return { pieces: survivors, leaked, towerDamage }
}

/** Applies damage dealt by blocked Pieces and drops Towers that fall. */
function applyTowerDamage(towers: readonly Tower[], damage: Map<string, number>): Tower[] {
  if (damage.size === 0) return [...towers]

  return towers
    .map((tower) => {
      const dealt = damage.get(tower.id)
      return dealt === undefined
        ? tower
        : { ...tower, health: tower.health - dealt, damageTaken: tower.damageTaken + dealt }
    })
    .filter((tower) => tower.health > 0)
}
