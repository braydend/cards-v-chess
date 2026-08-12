import { BLOCKED_ATTACK_MULTIPLIER, pieceType } from '../data/pieceTypes'
import { VICTORY_ROUND } from '../data/rounds'
import { tierDef } from '../data/tiers'
import { towerType, type TowerTypeDef } from '../data/towerTypes'
import { KING_SPEED_MULTIPLIER, applyHealing, buffedPieceIds, slideBonusFor } from './auras'
import { isInBounds, squareKey, stagingRank } from './board'
import { coversSquare, hittableSquares, isOccluded } from './coverage'
import { roundIncome, totalKillReward } from './ink'
import { isStuck, nextMove } from './movement'
import { isTerminal } from './phase'
import { spawnHealth } from './spawnScaling'
import { next, type Rng } from './rng'
import { step } from './step'
import type {
  BoardSpec,
  ExitRecord,
  GameState,
  MissRecord,
  Piece,
  PieceTier,
  Square,
  Tower,
} from './types'

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
 * How many miss records `GameState.recentMisses` keeps. Sized like the exit
 * ring: the renderer reads it live each frame, so it only needs to outlast a
 * publish cycle.
 */
export const MISS_RING_SIZE = 32

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
 * Appends to the miss ring, dropping the oldest past `MISS_RING_SIZE`.
 *
 * Returns the SAME array when there is nothing to append, so the overwhelming
 * majority of ticks allocate nothing here.
 */
function appendMisses(
  current: readonly MissRecord[],
  added: readonly MissRecord[],
): readonly MissRecord[] {
  if (added.length === 0) return current

  const next = [...current, ...added]

  return next.length > MISS_RING_SIZE ? next.slice(next.length - MISS_RING_SIZE) : next
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
  if (isTerminal(state.phase)) return state

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

  const moved = movePieces(
    allPieces,
    state.board,
    state.core.square,
    towerBySquare,
    dtMs,
    buffed,
  )

  // Minted after movePieces has decided which Pawns reached the back rank, and
  // numbered starting after drainDueSpawns's own ids, so a Pawn and a spawn in
  // the same tick can never collide over the same id.
  const promotedQueens: Piece[] = moved.promotedFrom.map((entry, index) => {
    const health = spawnHealth(pieceType('queen').maxHealth, state.roundNumber)
    return {
      id: `piece-${nextEntityId + index}`,
      typeId: 'queen',
      tier: entry.tier,
      square: entry.square,
      prevSquare: entry.square,
      health,
      maxHealth: health,
      moveCooldownMs: 0,
      moveCount: 0,
      // Entity-id parity, same rule as drainDueSpawns, so promoted Queens weave
      // opposite ways from one another too.
      handedness: (nextEntityId + index) % 2 === 0 ? 1 : -1,
      auraCooldownMs: 0,
      buffed: false,
      // A promoted Queen hunts from spawn when her tier says so — a yellow Pawn
      // becomes a yellow Queen that hunts from the moment she appears. She spawns
      // on the board, so the staging-rank carve-out never applies to her.
      hunting: tierDef(entry.tier).huntsFromSpawn,
      // Renderer-facing only. This is the one place it is ever true.
      promoted: true,
    }
  })
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
    state.board,
    state.core.square,
    dtMs,
    state.rng.combat,
  )

  const missRecords: MissRecord[] = fired.missed.map((pieceId) => ({
    pieceId,
    roundNumber: state.roundNumber,
    roundElapsedMs,
  }))
  const recentMisses = appendMisses(state.recentMisses, missRecords)

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
      recentMisses,
      rng: { ...state.rng, combat: fired.rng },
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
  // a designed way off `stuck`: a Pawn promotes into a Queen, and every other
  // type hunts the Core once its forward move would leave the board — see
  // `knightMove` and `huntByField` in movement.ts. `stillActive` still checks
  // every Piece for `stuck` rather than assuming that, though: a designed
  // answer is not a proof, and the check is what actually guards the
  // invariant.
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
    // Beating round 100 is the goal of a run. The completion that lands here
    // at `VICTORY_ROUND` records the win: the phase becomes `victory` — a
    // frozen interstitial, like `defeated`, whose only way out is the
    // `continueToFreePlay` command — and `roundNumber` stays at 100, the round
    // just beaten. A `'victory'` phase rather than a gap: auto-start fires
    // from the gap, so a victory gap would chain round 101 under the victory
    // screen before the player chooses to continue.
    if (state.roundNumber === VICTORY_ROUND) {
      return {
        ...state,
        phase: 'victory',
        won: true,
        roundElapsedMs: 0,
        core,
        leaks,
        recentExits,
        recentMisses,
        rng: { ...state.rng, combat: fired.rng },
        // `state.roundNumber` is VICTORY_ROUND here — the round just played.
        ink: ink + roundIncome(state.roundNumber),
        pieces: healed,
        towers: fired.towers,
        pendingSpawns: [],
        nextEntityId: entityIdAfterPromotion,
      }
    }

    return {
      ...state,
      phase: 'gap',
      roundNumber: state.roundNumber + 1,
      roundElapsedMs: 0,
      core,
      leaks,
      recentExits,
      recentMisses,
      rng: { ...state.rng, combat: fired.rng },
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
    recentMisses,
    rng: { ...state.rng, combat: fired.rng },
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
 * `targetsPerShot` Pieces. Towers block each other's fire: a shot whose line to
 * the target passes through another Tower is occluded, and `selectTargets`
 * skips the occluded candidate rather than wasting the shot.
 *
 * Damage cannot reach the Staging rank. It is off `board` entirely, and a
 * Piece standing there is still assembling — chess movement is what admits it
 * to the fight, not a Tower's shot reaching backward to meet it first.
 * `selectTargets` enforces this by skipping any Piece outside the board's
 * bounds before it ever asks whether a Tower's geometry covers the square —
 * so a Tower whose range would otherwise reach the Staging rank (a vertical
 * Tower on the far rank, say) still cannot touch a Piece waiting there. This
 * is the ONE place in the engine that threads `board` into targeting for
 * exactly this reason; nowhere else needs it, because nothing else deals
 * damage to a Piece (a blocked Piece damages the Tower it grinds, not the
 * other way round). A Joker's Clear (`clearPieces` in cardPlays.ts) is
 * deliberately NOT subject to this check — Clear is a board wipe, not damage,
 * and it is the designed safety valve for the repair-versus-the-wall stall
 * (see `roundTermination.test.ts`), which has to reach every Piece, staged or
 * not, to keep doing its job.
 */
function fireTowers(
  towers: readonly Tower[],
  pieces: readonly Piece[],
  board: BoardSpec,
  coreSquare: Square,
  dtMs: number,
  combat: Rng,
): {
  towers: Tower[]
  pieces: Piece[]
  destroyed: Piece[]
  rng: Rng
  missed: string[]
} {
  if (towers.length === 0) {
    return { towers: [...towers], pieces: [...pieces], destroyed: [], rng: combat, missed: [] }
  }

  // Damage accumulates here so that several Towers can share a target within a
  // single tick without one of them shooting a Piece that is already dead.
  const remainingHealth = new Map(pieces.map((piece) => [piece.id, piece.health]))
  // Which Tower dealt the finishing blow to which Piece. A Piece dies at most
  // once per tick — `selectTargets` skips anything already at <= 0 health — so
  // each entry is a distinct kill, and iteration order makes the owner exact.
  const killers = new Map<string, string>()
  const nextTowers: Tower[] = []
  let combatRng = combat
  const missed: string[] = []

  // Every standing Tower occludes, including the shooter itself (which can
  // never be strictly between itself and anything) and the Wall (which never
  // shoots but blocks for everyone else). Computed once so no Tower's outcome
  // depends on which Tower fires first.
  const blockers = towers.map((tower) => tower.square)

  for (const tower of towers) {
    const def = towerType(tower.type)

    // The Wall never fires. Skipping before the cooldown loop rather than
    // relying on `selectTargets` returning nothing keeps a gunless Tower out
    // of the firing path entirely — and means its inert `fireIntervalMs` is
    // never read, so it can never gate a loop.
    if (def.geometry === 'none') {
      nextTowers.push(tower)
      continue
    }

    let cooldown = tower.fireCooldownMs + dtMs
    let shotsFired = tower.shotsFired

    while (cooldown >= tower.fireIntervalMs) {
      const targets = selectTargets(tower, def, pieces, remainingHealth, board, coreSquare, blockers)

      if (targets.length === 0) {
        // Hold at "ready" rather than banking shots. Without this, a Tower idle
        // for ten seconds would unload every stored shot the instant a Piece
        // walked into range.
        cooldown = tower.fireIntervalMs
        break
      }

      cooldown -= tower.fireIntervalMs

      // Detection runs before damage: each Black target rolls the seeded
      // stream once, and an undetected target is filtered out — its slot stays
      // empty, no backfill with the next-nearest Piece. A miss still spends
      // the interval (cooldown was just decremented), so the Tower rolls again
      // at its next normal fire time — never every tick. Roll order stays
      // deterministic: towers iterate in array order and targets in
      // selectTargets's sorted order. Clear is a board wipe, not damage, so it
      // never reaches this loop and can never be missed.
      const acquired: Piece[] = []
      for (const target of targets) {
        const missChance = tierDef(target.tier).missChance
        if (missChance > 0) {
          const [roll, advanced] = next(combatRng)
          combatRng = advanced
          if (roll < missChance) {
            missed.push(target.id)
            continue
          }
        }
        acquired.push(target)
      }

      // A shot event counts only if it acquired a target: a miss acquires
      // nothing, so `shotsFired` is the renderer's ground truth for "the Tower
      // really fired" — the cooldown alone cannot say that, since a miss spends
      // the interval just like a shot does.
      if (acquired.length > 0) shotsFired += 1

      for (const target of acquired) {
        const before = remainingHealth.get(target.id) ?? target.health
        const after = before - tower.damage
        remainingHealth.set(target.id, after)
        if (before > 0 && after <= 0) killers.set(target.id, tower.id)
      }
    }

    const kills = tower.kills + [...killers.values()].filter((id) => id === tower.id).length
    nextTowers.push({ ...tower, fireCooldownMs: cooldown, shotsFired, kills })
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

  return { towers: nextTowers, pieces: survivors, destroyed, rng: combatRng, missed }
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
  def: TowerTypeDef,
  pieces: readonly Piece[],
  remainingHealth: Map<string, number>,
  board: BoardSpec,
  coreSquare: Square,
  blockers: readonly Square[],
): Piece[] {
  const candidates: { piece: Piece; distance: number }[] = []

  for (const piece of pieces) {
    if ((remainingHealth.get(piece.id) ?? piece.health) <= 0) continue
    // Off `board` entirely means the Staging rank — see fireTowers's doc
    // comment for why damage cannot reach a Piece waiting there.
    if (!isInBounds(board, piece.square)) continue
    if (!coversSquare(def.geometry, tower.range, tower.square, piece.square)) continue
    // A Tower can see a square and still not hit it: another Tower strictly
    // between blocks the shot. The Staging-rank bounds check above this is
    // untouched — damage still cannot reach a Piece assembling off-board.
    if (isOccluded(tower.square, piece.square, blockers, def.geometry)) continue

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

    // The Staging rank, NOT the far rank. It is out of bounds, so no Tower can
    // ever stand there — which is what stops a Piece being placed on top of
    // one. The Piece steps onto the board on its own move interval, and a
    // Tower in the way is then handled by the ordinary blocking rule rather
    // than by a spawn-time special case. Read from state, not a constant: an
    // Ace grows the board and the Staging rank moves up with it.
    const square: Square = { file: spawn.file, rank: stagingRank(state.board) }
    const health = spawnHealth(pieceType(spawn.typeId).maxHealth, state.roundNumber)
    spawned.push({
      id: `piece-${nextEntityId}`,
      typeId: spawn.typeId,
      tier: spawn.tier,
      square,
      prevSquare: square,
      health,
      maxHealth: health,
      moveCooldownMs: 0,
      moveCount: 0,
      // Entity-id parity, so consecutively spawned Pieces weave opposite ways.
      handedness: nextEntityId % 2 === 0 ? 1 : -1,
      auraCooldownMs: 0,
      buffed: false,
      // A yellow Piece is born hunting the Core — but never a Pawn, which
      // promotes instead. See `Piece.hunting` in types.ts.
      hunting: tierDef(spawn.tier).huntsFromSpawn && spawn.typeId !== 'pawn',
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
): {
  pieces: Piece[]
  leaked: number
  towerDamage: Map<string, number>
  promotedFrom: { square: Square; tier: PieceTier }[]
  exits: ExitRecord[]
} {
  const survivors: Piece[] = []
  const towerDamage = new Map<string, number>()
  const promotedFrom: { square: Square; tier: PieceTier }[] = []
  const exits: ExitRecord[] = []
  let leaked = 0

  // The squares no Piece should choose to land on, derived once for the whole
  // tick so every yellow hunt sees the same Tower layout regardless of the
  // order Pieces are processed in. A soft preference, never a wall: a Piece
  // with every d−1 landing covered falls back to its ordinary first candidate.
  const avoid = hittableSquares(board, [...towerBySquare.values()])

  for (const piece of pieces) {
    const { moveIntervalMs: baseInterval, attackDamage } = pieceType(piece.typeId)
    const isBuffed = buffed.has(piece.id)
    const buffedInterval = isBuffed ? baseInterval * KING_SPEED_MULTIPLIER : baseInterval
    const moveIntervalMs = buffedInterval
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
        {
          typeId: piece.typeId,
          from: square,
          moveCount,
          handedness,
          slideBonus,
          hunting,
          tier: piece.tier,
        },
        board,
        coreSquare,
        towerBySquare,
        avoid,
      )

      if (outcome.kind === 'reachCore') {
        reachedCore = true
        break
      }

      if (outcome.kind === 'attackTower') {
        // Universal combat rule: any Piece deals FULL damage to a Tower that
        // stands on one of its attack tiles — the squares it could capture
        // onto. A Pawn's attack tiles are its forward diagonals, so a Pawn
        // blocked STRAIGHT ahead is the one case where the blocker is not on
        // an attack tile — genuinely stuck territory — and the only one that
        // still pays BLOCKED_ATTACK_MULTIPLIER. See the chess-tiers spec.
        const multiplier = piece.typeId === 'pawn' ? BLOCKED_ATTACK_MULTIPLIER : 1
        towerDamage.set(
          outcome.towerId,
          (towerDamage.get(outcome.towerId) ?? 0) + attackDamage * multiplier,
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
        promotedFrom.push({ square, tier: piece.tier })
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
        // this is also permanent — Pawns promote and everything else hunts
        // the Core once its forward move would leave the board — so drop the
        // cooldown rather than let a genuinely immobile Piece burn simulation
        // work every tick for nothing.
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
