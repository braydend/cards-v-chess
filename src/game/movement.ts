import { isInBounds, squareKey, squaresEqual } from './board'
import {
  DIAGONAL_OFFSETS,
  KNIGHT_OFFSETS,
  ORTHOGONAL_OFFSETS,
  ROYAL_OFFSETS,
  bishopDistanceField,
  kingDistanceField,
  knightDistanceField,
  rookDistanceField,
} from './distanceFields'
import type { BoardSpec, Handedness, Piece, PieceTypeId, Square, Tower } from './types'

/**
 * What a Piece does when its move interval elapses.
 *
 * `stuck` means the Piece has no legal move. That is a real chess outcome —
 * and it is why round completion cannot simply wait for the board to empty.
 * Every Piece type now has a designed way off `stuck`, though: Pawns
 * promote, sliders and the King sweep sideways, and a Knight that runs out
 * of forward hops hunts the Core instead — see `knightMove`, below. `stuck`
 * stays part of the type for a board shape or Piece that genuinely has none.
 * `promote` means a Pawn has reached the back rank: chess promotes it there,
 * rather than stranding it the way `stuck` would.
 *
 * `hunting`, on both `move` and `attackTower`, is a Knight-only detail riding
 * on the shared outcome shape: present exactly when a Knight has just started
 * hunting or continues to, so `tick.ts`'s `movePieces` can latch it onto the
 * Piece permanently. See `hunting` on `Piece` in types.ts for why the latch
 * has to be permanent. It rides on `attackTower` too, not just `move`,
 * because a Knight's very first hunting hop is exactly as likely to land on
 * a Tower-blocked square as any other — `Piece.hunting` is documented to go
 * true the moment a Knight starts hunting, full stop, not "the moment it
 * starts hunting and also happens to move that hop".
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
   * the only type that never reads it — they promote instead. See `huntCore`
   * and `huntByField` for what hunting does per type.
   */
  readonly hunting: boolean
}

/**
 * Pieces advance from the far rank toward rank 0, so "forward" is one rank down.
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
 * Sideways along the rank, reflecting off the file edges.
 *
 * Reflection **flips handedness** rather than retrying the same side. Without
 * that, a Piece on file 0 preferring file −1 would bounce 0→1→0→1 forever and
 * the round would never end. Flipping makes it traverse the rank, so it crosses
 * the Core's file and leaks. Round termination depends on this.
 *
 * The direction is fixed by handedness, never chosen by where the Core is —
 * that would be goal-seeking.
 */
function lateralStep(from: Square, handedness: Handedness, board: BoardSpec): Step | undefined {
  const sideways: Square = { file: from.file + handedness, rank: from.rank }
  if (isInBounds(board, sideways)) return { to: sideways, handedness }

  const reflected: Handedness = handedness === 1 ? -1 : 1
  const back: Square = { file: from.file + reflected, rank: from.rank }
  if (isInBounds(board, back)) return { to: back, handedness: reflected }

  return undefined
}

/** Straight down the file, sweeping sideways once the back rank is reached. */
const rookStep: Stepper = (from, handedness, board) => {
  const ahead: Square = { file: from.file, rank: from.rank + FORWARD }
  if (isInBounds(board, ahead)) return { to: ahead, handedness }
  return lateralStep(from, handedness, board)
}

/**
 * Forward along a diagonal, reflecting off the side edges.
 *
 * Reflection preserves square colour — bouncing off a vertical edge changes
 * file and rank by one each, which keeps `(file + rank) % 2` constant. That is
 * the same property a chess bishop has, arrived at for the same reason.
 */
const bishopStep: Stepper = (from, handedness, board) => {
  const forwardRank = from.rank + FORWARD
  if (forwardRank < 0) return lateralStep(from, handedness, board)

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
 * `huntCore` instead: see `hunting` on `Piece` in types.ts for why that
 * switch is one-way, and `huntCore`'s own comment for the field it follows.
 */
function knightMove(
  from: Square,
  moveCount: number,
  handedness: Handedness,
  hunting: boolean,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
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

  return huntCore(from, board, coreSquare, towerBySquare)
}

/**
 * Once a Knight is hunting, direction comes from a knight-move distance
 * field rather than the zig-zag order above: the first offset, in
 * `KNIGHT_OFFSETS`'s fixed order, whose destination is exactly one hop
 * closer to the Core than `from` is.
 *
 * That "exactly one closer" rule is the whole convergence argument, not a
 * style choice. A breadth-first field guarantees every square at distance
 * `d > 0` has a neighbour at `d − 1` — that is what BFS layering means — so
 * this loop can never fall through to the final `stuck` on a board where
 * every square is knight-connected to the Core, which an 8x8 board is (pinned
 * exhaustively in movement.test.ts's "strictly decreases" test). Because the
 * distance strictly decreases on every hop, a repeating cycle is impossible
 * by construction — the Knight arrives within its own starting distance, in
 * hops, at most six here.
 *
 * The field itself never sees Towers — see `knightDistance.ts` — and this
 * function only ever consults `towerBySquare` for the ONE candidate it has
 * already committed to. A Tower there is attacked, exactly like every other
 * blocked Piece; this never falls through to try the next-best offset, which
 * is what keeps a hunting Knight walled rather than herded.
 */
function huntCore(
  from: Square,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  const field = knightDistanceField(board, coreSquare)
  const ownDistance = field.get(squareKey(from))

  // Undefined only if `from` is not knight-connected to the Core at all — not
  // possible on the current 8x8 board, but a future board shape or Core
  // placement should fail safe as a genuinely immobile Piece rather than
  // throw.
  if (ownDistance === undefined) return { kind: 'stuck' }

  for (const offset of KNIGHT_OFFSETS) {
    const to: Square = { file: from.file + offset.file, rank: from.rank + offset.rank }
    if (!isInBounds(board, to)) continue
    if (field.get(squareKey(to)) !== ownDistance - 1) continue

    if (squaresEqual(to, coreSquare)) return { kind: 'reachCore' }

    const blocker = towerBySquare.get(squareKey(to))
    if (blocker) return { kind: 'attackTower', towerId: blocker.id, hunting: true }

    return { kind: 'move', to, hunting: true }
  }

  // Unreachable given the BFS guarantee above, kept only so the function is
  // total rather than assuming its own invariant.
  return { kind: 'stuck' }
}

/**
 * How the King and the sliders hunt: direction from a distance field over
 * their own movement, exactly as the Knight's `huntCore` does, adapted to
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
 */
function huntByField(
  from: Square,
  board: BoardSpec,
  targetSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
  field: ReadonlyMap<string, number>,
  directions: readonly Square[],
  maxSteps: number,
): MoveOutcome {
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
          ? { kind: 'attackTower', towerId: blocker.id, hunting: true }
          : { kind: 'move', to: square, hunting: true }
      }

      if (squaresEqual(next, targetSquare)) return { kind: 'reachCore' }

      square = next
    }

    return { kind: 'move', to: square, hunting: true }
  }

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

/**
 * Resolves one move for a Piece using **chess movement**, not a walk toward the
 * Core.
 *
 * The consequence is deliberate and significant: a Piece can only threaten the
 * Core if chess movement can actually bring it there. A pawn is confined to its
 * file, so only the Core's own file and the two diagonally adjacent to it are
 * dangerous. Every other pawn marches to the back rank and stops.
 */
export function nextMove(
  request: MoveRequest,
  board: BoardSpec,
  coreSquare: Square,
  towerBySquare: ReadonlyMap<string, Tower>,
): MoveOutcome {
  switch (request.typeId) {
    case 'pawn':
      return pawnMove(request.from, board, coreSquare, towerBySquare)
    case 'rook':
      return request.hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            rookDistanceField(board, coreSquare),
            ORTHOGONAL_OFFSETS,
            1 + request.slideBonus,
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
      if (request.hunting || forwardLeavesBoard(request.from, board)) {
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
        request.hunting,
        board,
        coreSquare,
        towerBySquare,
      )
    // The Queen alternates the Rook's line and the Bishop's line hop by hop —
    // the "flexible" in her roster entry. The line is picked once per hop and
    // held for the whole slide, so she travels along one line rather than
    // wandering mid-slide.
    case 'queen':
      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        request.moveCount % 2 === 0 ? rookStep : bishopStep,
        board,
        coreSquare,
        towerBySquare,
      )
    // One square, always. Not a slider, so no aura bonus applies — the King
    // grants slide distance, it does not receive it. Once forward leaves the
    // board the King hunts: one royal step at a time down the field.
    case 'king':
      return request.hunting || forwardLeavesBoard(request.from, board)
        ? huntByField(
            request.from,
            board,
            coreSquare,
            towerBySquare,
            kingDistanceField(board, coreSquare),
            ROYAL_OFFSETS,
            1,
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
  }
  return nextMove(request, board, coreSquare, towerBySquare).kind === 'stuck'
}
