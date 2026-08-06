import { BLOCKED_ATTACK_MULTIPLIER, pieceType } from '../data/pieceTypes'
import { towerRank, type TowerRankDef } from '../data/towerRanks'
import { KING_SPEED_MULTIPLIER, applyHealing, buffedPieceIds, slideBonusFor } from './auras'
import { squareKey } from './board'
import { coversSquare } from './coverage'
import { roundIncome, totalKillReward } from './ink'
import { isStuck, nextMove } from './movement'
import { step } from './step'
import {
  FREEZE_MULTIPLIER,
  amplificationFor,
  amplifierIdsByPiece,
  frozenPieceIds,
} from './towerAuras'
import type { BoardSpec, ExitRecord, GameState, Piece, Square, Tower } from './types'

/**
 * How many exit records `GameState.recentExits` keeps.
 *
 * Sized against the observation window, not by feel. A publish observes at most
 * one frame of simulation, so overflowing before the renderer reads the ring
 * would take 32 exits inside one frame — which needs 32 Pieces simultaneously
 * one hop from the Core, a board state that would have ended the run several
 * times over.
 */
export const EXIT_RING_SIZE = 32

/**
 * Appends to the exit ring, dropping the oldest past `EXIT_RING_SIZE`.
 *
 * Returns the SAME array when there is nothing to append, so the overwhelming
 * majority of ticks allocate nothing here.
 */
function appendExits(
  current: readonly ExitRecord[],
  added: readonly ExitRecord[],
): readonly ExitRecord[] {
  if (added.length === 0) return current

  const next = [...current, ...added]

  return next.length > EXIT_RING_SIZE ? next.slice(next.length - EXIT_RING_SIZE) : next
}

/**
 * Advances the simulation by one fixed timestep.
 *
 * `dtMs` must be a fixed value supplied by an accumulator — never a raw frame
 * delta. That is what makes the simulation deterministic and refresh-rate
 * independent, and it is why tests can drive time by calling this directly.
 *
 * Towers fire, take damage from the Pieces they block — a Piece whose next
 * square holds a Tower attacks it instead of advancing — and are destroyed when
 * their health runs out; see `applyTowerDamage` below. Shields absorb before
 * health. See `roundTermination.test.ts` for the invariant that makes round
 * completion safe.
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

  // Auras are derived once, from tick-start positions, for the same reason the
  // Tower map is: so no Piece's outcome depends on processing order.
  const allPieces = [...state.pieces, ...spawned]
  const buffed = buffedPieceIds(allPieces)
  // Derived from tick-start Tower and Piece positions for the same reason
  // `buffed` and `towerBySquare` are: so no Piece's outcome depends on the
  // order Pieces are processed in.
  const frozen = frozenPieceIds(state.towers, allPieces)

  const moved = movePieces(
    allPieces,
    state.board,
    state.core.square,
    towerBySquare,
    dtMs,
    buffed,
    frozen,
  )

  // Minted after movePieces has decided which Pawns reached the back rank, and
  // numbered starting after drainDueSpawns's own ids, so a Pawn and a spawn in
  // the same tick can never collide over the same id.
  const promotedQueens: Piece[] = moved.promotedFrom.map((square, index) => ({
    id: `piece-${nextEntityId + index}`,
    typeId: 'queen',
    square,
    prevSquare: square,
    health: pieceType('queen').maxHealth,
    moveCooldownMs: 0,
    moveCount: 0,
    // Entity-id parity, same rule as drainDueSpawns, so promoted Queens weave
    // opposite ways from one another too.
    handedness: (nextEntityId + index) % 2 === 0 ? 1 : -1,
    auraCooldownMs: 0,
    buffed: false,
    // A promoted Queen never hunts — that field only ever means anything for
    // a Knight, and this Piece is not one any more.
    hunting: false,
    // Renderer-facing only. This is the one place it is ever true.
    promoted: true,
  }))
  const entityIdAfterPromotion = nextEntityId + moved.promotedFrom.length

  // Damage from blocked Pieces lands before Towers shoot, so a Tower destroyed
  // this tick does not get a parting shot.
  const standingTowers = applyTowerDamage(state.towers, moved.towerDamage)

  // Fire after movement, so Towers shoot at where Pieces actually are now. The
  // freshly promoted Queens are included so a Tower can hit one the instant it
  // appears, rather than getting a free tick of immunity the Pawn never had.
  const fired = fireTowers(
    standingTowers,
    [...moved.pieces, ...promotedQueens],
    state.core.square,
    dtMs,
  )

  // After firing, so a Bishop can top up survivors but never resurrect the dead.
  const healed = applyHealing(fired.pieces, dtMs)

  const coreHealth = Math.max(0, state.core.health - moved.leaked)
  const core = { ...state.core, health: coreHealth }
  const leaks = state.leaks + moved.leaked
  const recentExits = appendExits(state.recentExits, moved.exits)

  // Within this function, Tower fire is the ONLY thing that pays a kill
  // reward — a Joker's Clear pays its own quarter share in cardPlays.ts. A
  // leak and a promotion each remove a Piece without passing through
  // fireTowers, so neither can pay by accident here: the player did not kill
  // a leaker, and a promoted Pawn was not destroyed — it became a Queen,
  // which pays when the Queen dies.
  const ink = state.ink + totalKillReward(fired.destroyed)

  if (coreHealth === 0) {
    return {
      ...state,
      phase: 'defeated',
      core,
      leaks,
      recentExits,
      ink,
      roundElapsedMs,
      pieces: healed,
      towers: fired.towers,
      pendingSpawns,
      nextEntityId: entityIdAfterPromotion,
    }
  }

  // A round ends when nothing on the board can still act — not when the board
  // is empty. That distinction still matters even though no Piece type
  // deliberately strands any more: a Piece blocked by a Tower it cannot break
  // grinds there forever rather than vanishing, so `stillActive` has to ask
  // "can anything still act", never "is the board empty" — waiting for an
  // empty board would hang the round in that case regardless.
  //
  // Every Piece type that could once run out of legal moves for good now has
  // a designed way off `stuck`: a Pawn promotes into a Queen, sliders and the
  // King sweep sideways, and a Knight that exhausts its forward hops hunts
  // the Core with knight moves instead of stranding on the back rank — see
  // `knightMove` in movement.ts. `stillActive` still checks every Piece for
  // `stuck` rather than assuming that, though: a designed answer is not a
  // proof, and the check is what actually guards the invariant.
  //
  // LOAD-BEARING INVARIANT: a Piece blocked by a Tower returns `attackTower`,
  // not `stuck`, so it counts as active and this round cannot end while it
  // grinds. That terminates only because Towers can be healed no more than the
  // Deck allows — cards are consumed and nothing replenishes them, so repair is
  // finite and the Tower always eventually falls.
  //
  // ADDING PACKS REMOVES THAT BOUND. Unlimited ♥ means an unbreakable Tower and
  // a round that never ends — worst against a diagonal Tower, which cannot even
  // shoot a Piece attacking from directly up-file. `roundTermination.test.ts`
  // pins the bound; see "Repair versus the wall" in the design docs before
  // changing anything here.
  const standingBySquare = new Map(
    fired.towers.map((tower) => [squareKey(tower.square), tower]),
  )
  const stillActive = healed.some(
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
      recentExits,
      // `state.roundNumber`, NOT the incremented value on the next line: this
      // pays for the round just played, not the one about to start.
      ink: ink + roundIncome(state.roundNumber),
      pieces: healed,
      towers: fired.towers,
      pendingSpawns: [],
      nextEntityId: entityIdAfterPromotion,
    }
  }

  return {
    ...state,
    core,
    leaks,
    recentExits,
    ink,
    roundElapsedMs,
    pieces: healed,
    towers: fired.towers,
    pendingSpawns,
    nextEntityId: entityIdAfterPromotion,
  }
}

/**
 * Advances every Tower's cooldown and resolves the shots that come due.
 *
 * A Tower fires at most one shot per elapsed interval, hitting up to its rank's
 * `targetsPerShot` Pieces. Nothing blocks line of fire and nothing pierces.
 */
function fireTowers(
  towers: readonly Tower[],
  pieces: readonly Piece[],
  coreSquare: Square,
  dtMs: number,
): { towers: Tower[]; pieces: Piece[]; destroyed: Piece[] } {
  if (towers.length === 0) return { towers: [...towers], pieces: [...pieces], destroyed: [] }

  // Damage accumulates here so that several Towers can share a target within a
  // single tick without one of them shooting a Piece that is already dead.
  const remainingHealth = new Map(pieces.map((piece) => [piece.id, piece.health]))
  const nextTowers: Tower[] = []

  // Derived once, from the Piece and Tower lists as passed in, so no Piece's
  // damage depends on which Tower fired first.
  const amplifiers = amplifierIdsByPiece(towers, pieces)

  for (const tower of towers) {
    const def = towerRank(tower.cardRank)

    // The Wall never fires. Skipping before the cooldown loop rather than
    // relying on `selectTargets` returning nothing keeps a gunless Tower out
    // of the firing path entirely — and means its inert `fireIntervalMs` is
    // never read, so it can never gate a loop.
    if (def.geometry === 'none') {
      nextTowers.push(tower)
      continue
    }

    let cooldown = tower.fireCooldownMs + dtMs

    while (cooldown >= tower.fireIntervalMs) {
      const targets = selectTargets(tower, def, pieces, remainingHealth, coreSquare)

      if (targets.length === 0) {
        // Hold at "ready" rather than banking shots. Without this, a Tower idle
        // for ten seconds would unload every stored shot the instant a Piece
        // walked into range.
        cooldown = tower.fireIntervalMs
        break
      }

      cooldown -= tower.fireIntervalMs

      for (const target of targets) {
        const multiplier = amplificationFor(tower.id, target.id, amplifiers)
        remainingHealth.set(
          target.id,
          (remainingHealth.get(target.id) ?? 0) - tower.damage * multiplier,
        )
      }
    }

    nextTowers.push({ ...tower, fireCooldownMs: cooldown })
  }

  // Partitioned in a single pass rather than filtered twice. The dead are the
  // Ink payout, and deriving them with a second, opposite filter would let the
  // two lists disagree the moment either predicate changed.
  const survivors: Piece[] = []
  const destroyed: Piece[] = []

  for (const piece of pieces) {
    const health = remainingHealth.get(piece.id) ?? piece.health

    if (health > 0) survivors.push({ ...piece, health })
    else destroyed.push(piece)
  }

  return { towers: nextTowers, pieces: survivors, destroyed }
}

/**
 * The covered, still-living Pieces nearest the Core — the most urgent threats,
 * capped at the Tower's `targetsPerShot`.
 *
 * Distance is measured in hops rather than straight-line, because Pieces move
 * one square along one axis at a time. Ties break on id so the simulation stays
 * deterministic and seed-reproducible.
 */
function selectTargets(
  tower: Tower,
  def: TowerRankDef,
  pieces: readonly Piece[],
  remainingHealth: Map<string, number>,
  coreSquare: Square,
): Piece[] {
  const candidates: { piece: Piece; distance: number }[] = []

  for (const piece of pieces) {
    if ((remainingHealth.get(piece.id) ?? piece.health) <= 0) continue
    if (!coversSquare(def.geometry, def.range, tower.square, piece.square)) continue

    candidates.push({
      piece,
      distance:
        Math.abs(piece.square.file - coreSquare.file) +
        Math.abs(piece.square.rank - coreSquare.rank),
    })
  }

  candidates.sort((a, b) =>
    a.distance === b.distance
      ? a.piece.id < b.piece.id
        ? -1
        : 1
      : a.distance - b.distance,
  )

  // `slice` handles POSITIVE_INFINITY correctly: it returns every candidate.
  return candidates.slice(0, def.targetsPerShot).map((candidate) => candidate.piece)
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

    // Read from state, not a constant: an Ace grows the board and Pieces must
    // then enter from the new far rank.
    const square: Square = { file: spawn.file, rank: state.board.ranks - 1 }
    spawned.push({
      id: `piece-${nextEntityId}`,
      typeId: spawn.typeId,
      square,
      prevSquare: square,
      health: pieceType(spawn.typeId).maxHealth,
      moveCooldownMs: 0,
      moveCount: 0,
      // Entity-id parity, so consecutively spawned Pieces weave opposite ways.
      handedness: nextEntityId % 2 === 0 ? 1 : -1,
      auraCooldownMs: 0,
      buffed: false,
      hunting: false,
      promoted: false,
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
  buffed: ReadonlySet<string>,
  frozen: ReadonlySet<string>,
): {
  pieces: Piece[]
  leaked: number
  towerDamage: Map<string, number>
  promotedFrom: Square[]
  exits: ExitRecord[]
} {
  const survivors: Piece[] = []
  const towerDamage = new Map<string, number>()
  const promotedFrom: Square[] = []
  const exits: ExitRecord[] = []
  let leaked = 0

  for (const piece of pieces) {
    const { moveIntervalMs: baseInterval, attackDamage } = pieceType(piece.typeId)
    const isBuffed = buffed.has(piece.id)
    const buffedInterval = isBuffed ? baseInterval * KING_SPEED_MULTIPLIER : baseInterval
    // A King's buff and a Freezer's slow COMPOSE rather than override: 0.7 x
    // 1.5 = 1.05, so a King almost exactly cancels a freeze. That is the
    // intended reading — the King is the Chess faction's answer to the
    // Freezer, not immune to it.
    const moveIntervalMs = frozen.has(piece.id) ? buffedInterval * FREEZE_MULTIPLIER : buffedInterval
    const slideBonus = slideBonusFor(piece, buffed)

    let cooldown = piece.moveCooldownMs + dtMs
    let square = piece.square
    let prevSquare = piece.prevSquare
    let moveCount = piece.moveCount
    let handedness = piece.handedness
    let hunting = piece.hunting
    let reachedCore = false
    let isPromoted = false

    // A loop rather than a single hop so that a slow frame or a fast piece can
    // resolve more than one move in a step without silently dropping movement.
    while (cooldown >= moveIntervalMs) {
      cooldown -= moveIntervalMs

      // moveCount, handedness, and hunting carry the Piece's own motion state
      // forward hop by hop, which is what makes the Knight's zig-zag, the
      // Queen's rook/bishop alternation, and a hunting Knight's permanent
      // switch away from zig-zagging actually stick rather than repeating or
      // reverting.
      const outcome = nextMove(
        { typeId: piece.typeId, from: square, moveCount, handedness, slideBonus, hunting },
        board,
        coreSquare,
        towerBySquare,
      )

      if (outcome.kind === 'reachCore') {
        reachedCore = true
        break
      }

      if (outcome.kind === 'attackTower') {
        towerDamage.set(
          outcome.towerId,
          (towerDamage.get(outcome.towerId) ?? 0) + attackDamage * BLOCKED_ATTACK_MULTIPLIER,
        )
        // Stay put, and leave nothing for the renderer to interpolate. The
        // latch still has to persist here exactly as it does on a real move
        // below: a Knight's first hunting hop can land on a Tower just as
        // easily as an open square, and `hunting` is documented to go true
        // the moment a Knight starts hunting, not only the moment it moves.
        prevSquare = square
        hunting = outcome.hunting ?? hunting
        continue
      }

      if (outcome.kind === 'promote') {
        promotedFrom.push(square)
        isPromoted = true
        exits.push({
          pieceId: piece.id,
          typeId: piece.typeId,
          reason: 'promotion',
          from: square,
        })
        break
      }

      if (outcome.kind === 'stuck') {
        // No legal move this hop. For every Piece type on the current board
        // this is also permanent — Pawns promote, sliders and the King sweep
        // sideways, and a Knight that runs out of forward hops hunts instead
        // of stranding — so drop the cooldown rather than let a genuinely
        // immobile Piece burn simulation work every tick for nothing.
        prevSquare = square
        cooldown = 0
        break
      }

      prevSquare = square
      square = outcome.to
      // Only a real move advances the count. A blocked Piece must grind the
      // same Tower rather than weave to a different square next interval —
      // that would be routing around, which the design forbids.
      moveCount += 1
      handedness = outcome.handedness ?? handedness
      hunting = outcome.hunting ?? hunting
    }

    if (reachedCore) {
      leaked += 1
      // `square`, not `piece.square`: the hop loop above can have advanced the
      // Piece more than once within this tick, and the renderer must lunge from
      // where it actually was, not where it started the tick.
      exits.push({ pieceId: piece.id, typeId: piece.typeId, reason: 'leak', from: square })
      continue
    }
    if (isPromoted) continue

    survivors.push({
      ...piece,
      square,
      prevSquare,
      moveCooldownMs: cooldown,
      moveCount,
      handedness,
      hunting,
      buffed: isBuffed,
    })
  }

  return { pieces: survivors, leaked, towerDamage, promotedFrom, exits }
}

/**
 * Applies damage dealt by blocked Pieces and drops Towers that fall.
 *
 * A shield absorbs first, and overflow carries into health — a shield of 2
 * taking a 5-damage hit leaves 0 shield and costs 3 health. No hit is wasted,
 * and a shield never blocks more than it is worth.
 *
 * `damageTaken` accrues the FULL incoming amount, including the part a shield
 * soaked. It records what the Tower has weathered, not what reached its health,
 * and a shield absorbing a hit is still weathering it.
 */
function applyTowerDamage(towers: readonly Tower[], damage: Map<string, number>): Tower[] {
  if (damage.size === 0) return [...towers]

  return towers
    .map((tower) => {
      const dealt = damage.get(tower.id)
      if (dealt === undefined) return tower

      const absorbed = Math.min(tower.shield, dealt)

      return {
        ...tower,
        shield: tower.shield - absorbed,
        health: tower.health - (dealt - absorbed),
        damageTaken: tower.damageTaken + dealt,
      }
    })
    .filter((tower) => tower.health > 0)
}
