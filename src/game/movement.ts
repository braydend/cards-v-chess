import { isInBounds, squareKey, squaresEqual } from './board'
import { KNIGHT_OFFSETS, knightDistanceField } from './distanceFields'
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
   * Whether this Knight has already latched into hunting the Core. Every
   * other Piece type ignores this field — it exists on the shared request
   * only so `nextMove` stays one function per Piece type rather than
   * growing a Knight-only parameter list.
   */
  readonly hunting: boolean
}

/**
 * Pieces advance from the far rank toward rank 0, so "forward" is one rank down.
 */
const FORWARD = -1

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
      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        rookStep,
        board,
        coreSquare,
        towerBySquare,
      )
    case 'bishop':
      return travel(
        request.from,
        request.handedness,
        1 + request.slideBonus,
        bishopStep,
        board,
        coreSquare,
        towerBySquare,
      )
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
    // grants slide distance, it does not receive it.
    case 'king':
      return travel(request.from, request.handedness, 1, rookStep, board, coreSquare, towerBySquare)
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
