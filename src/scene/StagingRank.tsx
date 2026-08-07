import { stagingRank, type BoardSpec } from '../game'
import { SQUARE_SIZE, rankToWorldZ } from './coords'

/**
 * Deliberately neither `LIGHT_SQUARE` nor `DARK_SQUARE`, and deliberately not
 * checkered: this is not a board square, and it should not read as one.
 */
const LEDGE = '#1d232c'

/**
 * The ledge Pieces spawn onto, one rank past the board.
 *
 * Pieces enter the board from the Staging rank rather than appearing on the far
 * rank, so without this they would stand on nothing. Drawing it also does the
 * job the rank exists for: the player sees what is coming, and on which file,
 * for one of the Piece's move intervals before it sets foot on the board.
 *
 * **One `<mesh>`, not `Instances`.** A single mesh has no `limit`, so it cannot
 * acquire the `limit`/`key` defect that produced the Ace wedge — the same
 * reason `CoveragePreview` draws its illegal-square marker as a plain mesh. Do
 * not turn this into per-file instances.
 *
 * Its top face sits at y = 0, coplanar with the board squares (0.12 tall,
 * centred at y = -0.06), so a Piece standing here rests at the same height it
 * does anywhere else and `Pieces.tsx` needs no special case. It is drawn a
 * little shallower than a full square so a seam separates it from the far rank.
 */
export function StagingRank({ board }: { board: BoardSpec }) {
  return (
    <mesh position={[0, -0.06, rankToWorldZ(board, stagingRank(board))]} receiveShadow>
      <boxGeometry args={[board.files * SQUARE_SIZE, 0.12, SQUARE_SIZE * 0.86]} />
      <meshStandardMaterial color={LEDGE} flatShading />
    </mesh>
  )
}
