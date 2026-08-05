import { isInBounds, squareKey, squaresEqual } from './board'
import type { BoardSpec, Handedness, Piece, PieceTypeId, Square, Tower } from './types'

/**
 * What a Piece does when its move interval elapses.
 *
 * `stuck` means the Piece has no legal move. That is a real chess outcome — a
 * pawn that reaches the far rank has nowhere left to go — and it is why round
 * completion cannot simply wait for the board to empty.
 */
export type MoveOutcome =
  | { readonly kind: 'move'; readonly to: Square; readonly handedness?: Handedness }
  | { readonly kind: 'attackTower'; readonly towerId: string }
  | { readonly kind: 'reachCore' }
  | { readonly kind: 'stuck' }

/** Everything about a Piece that its movement rule depends on. */
export interface MoveRequest {
  readonly typeId: PieceTypeId
  readonly from: Square
  /** Hops completed. Drives the Knight's zig-zag and the Queen's alternation. */
  readonly moveCount: number
  readonly handedness: Handedness
  /** Extra squares per hop, from a King aura. Sliders only. */
  readonly slideBonus: number
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

  for (let remaining = steps; remaining > 0; remaining -= 1) {
    const step = stepper(square, side, board)
    if (!step) break

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
    // Resolvers arrive in later tasks. Returning `stuck` is safe because
    // rounds.ts cannot spawn these types yet.
    case 'knight':
    case 'bishop':
    case 'queen':
    case 'king':
      return { kind: 'stuck' }
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
  if (!isInBounds(board, ahead)) return { kind: 'stuck' }

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
  }
  return nextMove(request, board, coreSquare, towerBySquare).kind === 'stuck'
}
