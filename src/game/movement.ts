import { tierDef } from '../data/tiers'
import { isInBounds, squareKey, squaresEqual } from './board'
import {
  DIAGONAL_OFFSETS,
  KNIGHT_OFFSETS,
  ORTHOGONAL_OFFSETS,
  ROYAL_OFFSETS,
  bishopDistanceField,
  kingDistanceField,
  knightDistanceField,
  queenDistanceField,
  rookDistanceField,
} from './distanceFields'
import type { BoardSpec, Handedness, Piece, PieceTier, PieceTypeId, Square, Tower } from './types'

/**
 * The avoid set every non-yellow hunt passes: no preference at all. Red's Tower
 * seek and a green late-hunt keep their exact current behaviour.
 */
const EMPTY_AVOID: ReadonlySet<string> = new Set()

/**
 * What a Piece does when its move interval elapses.
 *
 * `stuck` means the Piece has no legal move. That is a real chess outcome —
 * and it is why round completion cannot simply wait for the board to empty.
 * Every Piece type has a designed way off `stuck`: Pawns promote, and every
 * other type hunts the Core once its forward move would leave the board —
 * see `knightMove` and `huntByField`, below. `stuck` stays part of the type
 * for a board shape or Piece that genuinely has none.
 * `promote` means a Pawn has reached the back rank: chess promotes it there,
 * rather than stranding it the way `stuck` would.
 *
 * `hunting`, on both `move` and `attackTower`, rides on the shared outcome
 * shape: present exactly when a Piece has just started hunting or continues
 * to, so `tick.ts`'s `movePieces` can latch it onto the Piece permanently.
 * See `hunting` on `Piece` in types.ts for why the latch has to be permanent.
 * It rides on `attackTower` too, not just `move`, because a Piece's very
 * first hunting hop is exactly as likely to land on a Tower-blocked square as
 * any other — `Piece.hunting` is documented to go true the moment a Piece
 * starts hunting, full stop, not "the moment it starts hunting and also
 * happens to move that hop".
 */
export type MoveOutcome =
  | {
      readonly kind: 'move'
      readonly to: Square
      readonly handedness?: Handedness
      readonly hunting?: boolean
    }
  | { readonly kind: 'attackTower'; readonly towerId: string; readonly hunting?: boolean }
  | { readonly kind: 'reachCore' }
  | { readonly kind: 'stuck' }
  | { readonly kind: 'promote' }

/** Everything about a Piece that its movement rule depends on. */
export interface MoveRequest {
  readonly typeId: PieceTypeId
  readonly from: Square
  /** Hops completed. Drives the Knight's zig-zag and the Queen's alternation. */
  readonly moveCount: number
  readonly handedness: Handedness
  /** Extra squares per hop, from a King aura. Sliders only. */
  readonly slideBonus: number
  /**
   * Whether this Piece has already latched into hunting the Core. Pawns are
   * the only type that never reads it — they promote instead. See `huntByOffsets`
   * and `huntByField` for what hunting does per type.
   */
  readonly hunting: boolean
  /** The tier this Piece was born with. Read by the red seek in `nextMove`. */
  readonly tier: PieceTier
}

/**
 * Pieces advance from the Staging rank toward rank 0, so "forward" is one rank down.
 */
const FORWARD = -1

/** One square straight down the file, or no move at all. */
const forwardFileStep: Stepper = (from, handedness, board) => {
  const ahead: Square = { file: from.file, rank: from.rank + FORWARD }
  return isInBounds(board, ahead) ? { to: ahead, handedness } : undefined
}

/** Whether the Piece's forward square is off the board — the hunting trigger. */
function forwardLeavesBoard(from: Square, board: BoardSpec): boolean {
  return !isInBounds(board, { file: from.file, rank: from.rank + FORWARD })
}

/** One legal square, plus the handedness the Piece carries away from it. */
interface Step {
  readonly to: Square
  readonly handedness: Handedness
}

/** How a Piece type picks its next single square. `undefined` means no move. */
type Stepper = (from: Square, handedness: Handedness, board: BoardSpec) => Step | undefined

/**
 * Forward along a diagonal, reflecting off the side edges.
 *
 * Reflection preserves square colour — bouncing off a vertical edge changes
 * file and rank by one each, which keeps `(file + rank) % 2` constant. That is
 * the same property a chess bishop has, arrived at for the same reason.
 *
 * At the back rank there is no forward diagonal and no fallback either: the
 * Bishop's hunt takes over instead — see the bishop case in `nextMove`.
 */
const bishopStep: Stepper = (from, handedness, board) => {
  const forwardRank = from.rank + FORWARD
  if (forwardRank < 0) return undefined

  const diagonal: Square = { file: from.file + handedness, rank: forwardRank }
  if (isInBounds(board, diagonal)) return { to: diagonal, handedness }

  const reflected: Handedness = handedness === 1 ? -1 : 1
  const mirrored: Square = { file: from.file + reflected, rank: forwardRank }
  if (isInBounds(board, mirrored)) return { to: mirrored, handedness: reflected }

  return undefined
}

/**
 * Walks a Piece along its committed line, **one square at a time**.
 *
 * Stepping rather than jumping is what keeps Towers blocking: a slide can never
 * pass over one. A Piece that has already covered ground this hop keeps it and
 * attacks next hop; one blocked immediately attacks now.
 */
function travel(
  from: Square,
  handedness: Handedness,
  steps: number,
  stepper: Stepper,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  let square = from
  let side = handedness
  let advanced = false
  let committed: { readonly file: number; readonly rank: number } | undefined

  // A Piece with a legal move must never strand itself over an arithmetic
  // slip in the slide count — clamp rather than let `steps <= 0` fall through
  // to the loop never running, which would return `stuck`. tick.ts treats
  // `stuck` as permanent, so a bad count here would maroon the Piece for the
  // rest of the run instead of just under-sliding it by one hop.
  const hops = Math.max(1, steps)

  for (let remaining = hops; remaining > 0; remaining -= 1) {
    const step = stepper(square, side, board)
    if (!step) break

    const delta = { file: step.to.file - square.file, rank: step.to.rank - square.rank }

    // A slide holds ONE line. A stepper turns when it reflects off a board edge,
    // and a Rook that went forward then sideways in a single hop would have moved
    // in an L. The slide ends at the corner instead, and the turn happens on the
    // next hop — which is also why `side` is left alone here.
    if (committed && (delta.file !== committed.file || delta.rank !== committed.rank)) break
    committed = delta

    if (squaresEqual(step.to, coreSquare)) return { kind: 'reachCore' }

    const blocker = towerBySquare.get(squareKey(step.to))
    if (blocker) {
      return advanced
        ? { kind: 'move', to: square, handedness: side }
        : { kind: 'attackTower', towerId: blocker.id }
    }

    square = step.to
    side = step.handedness
    advanced = true
  }

  return advanced ? { kind: 'move', to: square, handedness: side } : { kind: 'stuck' }
}

/**
 * The Knight is a hopper, not a slider, so it ignores slide bonuses and never
 * uses `travel`.
 *
 * While it still has a forward hop, candidates are tried in order: the
 * zig-zag hop, its mirror (for file edges), then the two one-forward hops so
 * a Knight on rank 1 can still reach rank 0 rather than stranding a hop
 * early. The Knight commits to the first in-bounds candidate, never scanning
 * ahead for one that lands on the Core — that would be goal-seeking, the
 * same invariant that keeps a Pawn from angling toward the Core off its own
 * file. So whether a one-forward hop happens to capture the Core depends on
 * the Knight's file and handedness: from (1,1) the default handedness
 * reaches it, and from (5,1) the *other* handedness does, because file 3 is
 * not centred between files 0 and 7 and the wrong-side candidate is what
 * falls off the board first at one edge but not the other.
 *
 * A Tower on the chosen landing square is attacked rather than hopped over or
 * routed around — the no-pathfinding invariant applies to the Knight too.
 *
 * Once every forward candidate above would leave the board — always true at
 * rank 0 — or the Knight is already hunting, direction comes from
 * `huntByOffsets` instead: see `hunting` on `Piece` in types.ts for why that
 * switch is one-way, and `huntByOffsets`'s own comment for the field it follows.
 */
function knightMove(
  from: Square,
  moveCount: number,
  handedness: Handedness,
  hunting: boolean,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  if (!hunting) {
    const zig = moveCount % 2 === 0 ? handedness : -handedness

    const candidates: Square[] = [
      { file: from.file + zig, rank: from.rank - 2 },
      { file: from.file - zig, rank: from.rank - 2 },
      { file: from.file + handedness * 2, rank: from.rank - 1 },
      { file: from.file - handedness * 2, rank: from.rank - 1 },
    ]

    for (const to of candidates) {
      if (!isInBounds(board, to)) continue
      if (squaresEqual(to, coreSquare)) return { kind: 'reachCore' }

      const blocker = towerBySquare.get(squareKey(to))
      if (blocker) return { kind: 'attackTower', towerId: blocker.id }

      return { kind: 'move', to }
    }
  }

  return huntByOffsets(from, board, coreSquare, towerBySquare, knightDistanceField(board, coreSquare), KNIGHT_OFFSETS, true, avoid)
}

/**
 * One hop down a distance field, resolved the way the Knight hunts: the first
 * offset, in the fixed order, whose destination is exactly one move closer to
 * `targetSquare` than `from` is. That "exactly one closer" rule is the whole
 * convergence argument, not a style choice. A breadth-first field guarantees
 * every square at distance `d > 0` has a neighbour at `d − 1` — that is what
 * BFS layering means — so this loop can never fall through to the final
 * `stuck` on a board where every square is connected to the target, which an
 * 8x8 board is for the Knight (pinned exhaustively in movement.test.ts's
 * "strictly decreases" test). Because the distance strictly decreases on every
 * hop, a repeating cycle is impossible by construction.
 *
 * `stampHunting` controls whether the outcome carries `hunting: true`: true
 * for a real hunt, false for a red Piece's Tower seek, which must not latch
 * the hunt. The field never sees Towers — see `distanceFields.ts` — and this
 * function only ever consults `towerBySquare` for the ONE candidate it has
 * already committed to. The blocker check runs BEFORE the target check,
 * matching `huntByField`: a Tower on the destination is attacked, not leaked
 * through. For a core hunt this never fires (nothing can build on the Core);
 * for a red seek the target square IS the Tower, so the blocker check is
 * exactly how red grinds it. Either way it never falls through to try the
 * next-best offset, which is what keeps a hunting Piece walled rather than
 * herded.
 *
 * `avoid` is the one preference a yellow hunt brings: while it scans the
 * fixed order, a covered landing is remembered as a fallback and skipped, and
 * the first uncovered landing wins — the scan is single-pass on purpose, so a
 * blocker or the target still commits at its own position in the order.
 * When every landing is covered the fallback is today's first candidate, so
 * avoidance never strands a Piece. Every other tier passes an empty set.
 */
function huntByOffsets(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  offsets: readonly Square[],
  stampHunting: boolean,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  const ownDistance = field.get(squareKey(from))

  // Undefined only if `from` is not connected to the target at all — not
  // possible on the current 8x8 board, but a future board shape or Core
  // placement should fail safe as a genuinely immobile Piece rather than
  // throw.
  if (ownDistance === undefined) return { kind: 'stuck' }
  if (ownDistance === 0) return { kind: 'reachCore' }

  const destinations: Square[] = []
  for (const offset of offsets) {
    const to: Square = { file: from.file + offset.file, rank: from.rank + offset.rank }
    if (!isInBounds(board, to)) continue
    if (field.get(squareKey(to)) !== ownDistance - 1) continue
    destinations.push(to)
  }

  // One scan of the fixed order, not a separate preference pass, so a blocker
  // or the target still commits at its own position in the order — yellow
  // avoids FIRE, never obstacles. A covered landing is remembered as the
  // fallback and skipped; the first uncovered landing wins. When every landing
  // is covered the fallback is today's first candidate, so avoidance never
  // strands a Piece.
  let fallback: Square | undefined

  for (const to of destinations) {
    const blocker = towerBySquare.get(squareKey(to))
    if (blocker) {
      return stampHunting
        ? { kind: 'attackTower', towerId: blocker.id, hunting: true }
        : { kind: 'attackTower', towerId: blocker.id }
    }

    if (squaresEqual(to, targetSquare)) return { kind: 'reachCore' }

    if (avoid.has(squareKey(to))) {
      if (fallback === undefined) fallback = to
      continue
    }

    return stampHunting ? { kind: 'move', to, hunting: true } : { kind: 'move', to }
  }

  if (fallback) return stampHunting ? { kind: 'move', to: fallback, hunting: true } : { kind: 'move', to: fallback }

  // Unreachable given the BFS guarantee above, kept only so the function is
  // total rather than assuming its own invariant.
  return { kind: 'stuck' }
}

/**
 * How the King and the sliders hunt: direction from a distance field over
 * their own movement, exactly as the Knight's `huntByOffsets` does, adapted to
 * pieces that move along lines.
 *
 * Direction choice: the first direction, in the fixed order of `directions`,
 * whose ray from `from` passes through a square at field distance
 * `ownDistance − 1`. The slide then resolves along that ray with the usual
 * discipline — one square at a time, a Tower attacked rather than passed,
 * the target square leaked into — for at most `maxSteps` squares, and
 * **capped at the closer square**: `steps` never exceeds the ray distance to
 * it, so a long slide cannot pass straight through the phase target and land
 * beyond it, still at the same distance. That overshoot is exactly the
 * oscillation the hunting latch exists to prevent.
 *
 * Convergence is argued in two levels, because a slide shorter than the ray
 * does not drop field distance per hop: distance strictly decreases between
 * phases (2→1→0 for the sliders, one step per decrease for the King), and
 * within a phase every hop advances along a shortest-path line toward that
 * phase's target — arriving on it, exhausting the slide count en route, or
 * grinding the Tower blocking the line. The walk's arrival from every square
 * is pinned exhaustively in movement.test.ts.
 *
 * The Tower check runs BEFORE the target check on purpose: the target is the
 * Core for most hunts, which no Tower can occupy, but a colour-locked Bishop
 * hunts the square directly in front of the Core, and a Tower CAN stand
 * there — it must be ground down before the leak, not leaked through.
 *
 * The field never sees Towers — see distanceFields.ts — so this only ever
 * consults `towerBySquare` for squares it has already committed to. A Tower
 * there is attacked, exactly like every other blocked Piece; this never tries
 * the next direction, which is what keeps a hunting Piece walled rather than
 * herded.
 *
 * `avoid` narrows a yellow hunt's choice of landing square: it is the LANDING
 * square of a resolved direction that the avoidance checks — intermediate
 * squares are positions no shot can reach and stay legal to cross — and a
 * covered landing is skipped with today's first resolved direction kept as
 * the fallback, so avoidance never strands a Piece. Every other tier passes
 * an empty set.
 */
function huntByField(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  directions: readonly Square[],
  maxSteps: number,
  stampHunting: boolean,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  const stamp = stampHunting ? { hunting: true as const } : {}
  const ownDistance = field.get(squareKey(from))

  // Undefined only if `from` is not connected to the target at all under this
  // movement — not possible for the hunts wired today, but a future board
  // shape should fail safe as a genuinely immobile Piece rather than throw.
  if (ownDistance === undefined) return { kind: 'stuck' }

  // Standing ON the target is arrival. In real play a Piece never begins a
  // hop there — the target check fires the moment a slide steps onto it —
  // but the exhaustive walk tests finish a colour-locked Bishop's approach
  // from the square in front of the Core, and this keeps the function total.
  if (ownDistance === 0) return { kind: 'reachCore' }

  let fallback: Square | undefined

  for (const direction of directions) {
    const closerRange = rangeToCloserSquare(from, board, direction, field, ownDistance)
    if (closerRange === undefined) continue

    const steps = Math.min(Math.max(1, maxSteps), closerRange)
    let square = from

    for (let remaining = steps; remaining > 0; remaining -= 1) {
      const next: Square = { file: square.file + direction.file, rank: square.rank + direction.rank }

      const blocker = towerBySquare.get(squareKey(next))
      if (blocker) {
        return squaresEqual(square, from)
          ? { kind: 'attackTower', towerId: blocker.id, ...stamp }
          : { kind: 'move', to: square, ...stamp }
      }

      if (squaresEqual(next, targetSquare)) return { kind: 'reachCore' }

      square = next
    }

    // The slide resolved to a landing. A blocker or the target already
    // committed above; a covered LANDING square is skipped — intermediate
    // squares are positions no shot can reach and stay legal to cross — and
    // today's first resolved direction is kept as the fallback.
    if (avoid.has(squareKey(square))) {
      if (fallback === undefined) fallback = square
      continue
    }

    return { kind: 'move', to: square, ...stamp }
  }

  if (fallback) return { kind: 'move', to: fallback, ...stamp }

  // Unreachable on the current board: every hunt wired today is connected to
  // its target from every square it can start on. Kept so the function is
  // total rather than assuming its own invariant.
  return { kind: 'stuck' }
}

/**
 * Steps along `direction` from `from` and returns how many squares it is to
 * the first square at field distance `ownDistance − 1`, or `undefined` if the
 * ray leaves the board without finding one.
 */
function rangeToCloserSquare(
  from: Square,
  board: BoardSpec,
  direction: Square,
  field: ReadonlyMap<string, number>,
  ownDistance: number,
): number | undefined {
  let steps = 0
  let square = from

  for (;;) {
    const next: Square = { file: square.file + direction.file, rank: square.rank + direction.rank }
    if (!isInBounds(board, next)) return undefined

    steps += 1
    if (field.get(squareKey(next)) === ownDistance - 1) return steps
    square = next
  }
}

/** The distance field a red Piece uses to seek Towers — its own movement. */
function towerField(typeId: PieceTypeId, board: BoardSpec, seed: Square): ReadonlyMap<string, number> {
  switch (typeId) {
    case 'knight':
      return knightDistanceField(board, seed)
    case 'rook':
      return rookDistanceField(board, seed)
    case 'bishop':
      return bishopDistanceField(board, seed)
    case 'queen':
      return queenDistanceField(board, seed)
    case 'king':
      return kingDistanceField(board, seed)
    case 'pawn':
      throw new Error('pawns never seek Towers')
  }
}

/**
 * The Tower nearest to `from` under the Piece's own movement, within
 * `reachInMoves`, or undefined. Towers are the SEED of the field, never
 * obstacles in it — no pathfinding. Ties break on the smaller Tower id so the
 * seek is deterministic.
 */
function nearestTower(
  from: Square,
  typeId: PieceTypeId,
  board: BoardSpec,
  towerBySquare: ReadonlyMap<string, Tower>,
  reachInMoves: number,
): Tower | undefined {
  let best: Tower | undefined
  let bestDistance = Infinity

  for (const tower of towerBySquare.values()) {
    const distance = towerField(typeId, board, tower.square).get(squareKey(from))
    if (distance === undefined || distance > reachInMoves) continue
    if (distance < bestDistance || (distance === bestDistance && (best === undefined || tower.id < best.id))) {
      best = tower
      bestDistance = distance
    }
  }

  return best
}

/**
 * A red Piece's move decision: detour toward the nearest reachable Tower.
 * Pawns never seek — their movement has no way to detour — so they fall
 * through to green. When no Tower is in reach, returns undefined and the
 * Piece behaves exactly as green. Red seeks even while hunting: a hunting red
 * Piece detours to a Tower if one is near, and resumes the hunt once it is
 * gone, because these outcomes never stamp `hunting`.
 */
function seekTower(
  request: MoveRequest,
  board: BoardSpec,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome | undefined {
  if (request.typeId === 'pawn') return undefined

  const target = nearestTower(request.from, request.typeId, board, towerBySquare, tierDef('red').reachInMoves)
  if (!target) return undefined

  const field = towerField(request.typeId, board, target.square)
  const maxSteps = request.typeId === 'king' ? 1 : 1 + request.slideBonus

  if (request.typeId === 'knight') {
    return huntByOffsets(request.from, board, target.square, towerBySquare, field, KNIGHT_OFFSETS, false, EMPTY_AVOID)
  }

  const directions =
    request.typeId === 'rook'
      ? ORTHOGONAL_OFFSETS
      : request.typeId === 'bishop'
        ? DIAGONAL_OFFSETS
        : ROYAL_OFFSETS

  return huntByField(request.from, board, target.square, towerBySquare, field, directions, maxSteps, false, EMPTY_AVOID)
}

/**
 * Resolves one move for a Piece using **chess movement**, not a walk toward
 * the Core — while forward movement lasts. Once a Piece's forward move would
 * leave the board, it hunts the Core instead, guided by a distance field
 * over its own movement: see `huntByOffsets` and `huntByField`. Pawns are the one
 * type that never hunts — they promote.
 */
export function nextMove(
  request: MoveRequest,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  avoid: ReadonlySet<string>,
): MoveOutcome {
  // A Piece on the Staging rank is still entering the board. Hunting fields
  // have no entry off-board, so a yellow Piece born `hunting: true` must
  // march its first hop — hunting engages the moment it is on the board.
  // This is the one carve-out that lets yellow exist at all; see the
  // chess-tiers spec.
  const hunting = request.hunting && isInBounds(board, request.from)

  // Red overrides the march or the hunt: detour toward the nearest reachable
  // Tower, if any. This runs before the type switch so every red non-Pawn
  // seeks the same way; a Piece with no Tower in reach falls through to its
  // ordinary green behaviour.
  if (request.tier === 'red') {
    const detour = seekTower(request, board, towerBySquare)
    if (detour) return detour
  }

  // Yellow's one carve-out: while hunting, prefer a landing square no Tower
  // can hit. Every other tier hunts with no preference — an empty set.
  const huntAvoid = request.tier === 'yellow' ? avoid : EMPTY_AVOID

  switch (request.typeId) {
    case 'pawn':
      return pawnMove(request.from, board, coreSquare, towerBySquare)
    case 'rook':
      return hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            rookDistanceField(board, coreSquare),
            ORTHOGONAL_OFFSETS,
            1 + request.slideBonus,
            true,
            huntAvoid,
          )
        : travel(
            request.from,
            request.handedness,
            1 + request.slideBonus,
            forwardFileStep,
            board,
            coreSquare,
            towerBySquare,
          )
    case 'bishop': {
      if (hunting || forwardLeavesBoard(request.from, board)) {
        // A Bishop stays on its own colour, so a Core on the other colour is
        // a square it can never stand on — no leak from it is possible. Such
        // a Bishop hunts the square directly in front of the Core instead,
        // which is always the Bishop's own colour, and leaks from there:
        // every Piece meets the Core the same way. The field is seeded at
        // the target in BOTH cases, which is what makes the two branches one
        // code path. See the hunting-for-all spec.
        const locked =
          (request.from.file + request.from.rank) % 2 !== (coreSquare.file + coreSquare.rank) % 2
        const target: Square = locked
          ? { file: coreSquare.file, rank: coreSquare.rank + 1 }
          : coreSquare

        return huntByField(
          request.from,
          board,
          target,
          towerBySquare,
          bishopDistanceField(board, target),
          DIAGONAL_OFFSETS,
          1 + request.slideBonus,
          true,
          huntAvoid,
        )
      }

      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        bishopStep,
        board,
        coreSquare,
        towerBySquare,
      )
    }
    case 'knight':
      return knightMove(
        request.from,
        request.moveCount,
        request.handedness,
        hunting,
        board,
        coreSquare,
        towerBySquare,
        huntAvoid,
      )
    // The Queen alternates the Rook's line and the Bishop's line hop by hop —
    // the "flexible" in her roster entry — while she marches. Once forward
    // leaves the board she hunts with full queen movement instead; the
    // alternation is forward-march behaviour only.
    case 'queen':
      return hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            queenDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1 + request.slideBonus,
            true,
            huntAvoid,
          )
        : travel(
            request.from,
            request.handedness,
            1 + request.slideBonus,
            request.moveCount % 2 === 0 ? forwardFileStep : bishopStep,
            board,
            coreSquare,
            towerBySquare,
          )
    // One square, always. Not a slider, so no aura bonus applies — the King
    // grants slide distance, it does not receive it. Once forward leaves the
    // board the King hunts: one royal step at a time down the field.
    case 'king':
      return hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            kingDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1,
            true,
            huntAvoid,
          )
        : travel(request.from, request.handedness, 1, forwardFileStep, board, coreSquare, towerBySquare)
  }
}

/**
 * A pawn advances one square down its file, and captures diagonally forward.
 *
 * Only the Core is captured diagonally. A Tower off the diagonal is ignored
 * while the path ahead is clear, because the pawn's job is to advance — it has
 * no reason to detour.
 */
function pawnMove(
  from: Square,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  const forwardRank = from.rank + FORWARD

  // Diagonal capture of the Core, exactly as a pawn takes in chess.
  for (const fileOffset of [-1, 1]) {
    if (squaresEqual({ file: from.file + fileOffset, rank: forwardRank }, coreSquare)) {
      return { kind: 'reachCore' }
    }
  }

  const ahead: Square = { file: from.file, rank: forwardRank }

  if (squaresEqual(ahead, coreSquare)) return { kind: 'reachCore' }

  // Off the board forward can only mean rank 0 — the back rank. In chess a pawn
  // promotes there, and here it is exactly where Pawns would otherwise pile up
  // for the rest of the run.
  if (!isInBounds(board, ahead)) return { kind: 'promote' }

  // A Tower in the way stops the pawn, which attacks it instead of advancing.
  const blocker = towerBySquare.get(squareKey(ahead))
  if (blocker) return { kind: 'attackTower', towerId: blocker.id }

  return { kind: 'move', to: ahead }
}

/** Whether a Piece has no legal move and so can never act again. */
export function isStuck(
  piece: Piece,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): boolean {
  // Slide distance cannot change whether a Piece has *any* legal move, so the
  // bonus is irrelevant here.
  const request: MoveRequest = {
    typeId: piece.typeId,
    from: piece.square,
    moveCount: piece.moveCount,
    handedness: piece.handedness,
    slideBonus: 0,
    hunting: piece.hunting,
    tier: piece.tier,
  }
  return nextMove(request, board, coreSquare, towerBySquare, EMPTY_AVOID).kind === 'stuck'
}
