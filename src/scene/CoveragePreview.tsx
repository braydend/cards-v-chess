import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { towerType } from '../data/towerTypes'
import { canBuildOn, isInBounds, squareKey, type BoardSpec } from '../game'
import { blockerSquares, overlaySquares, squaresListsEqual } from './towerFootprint'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { COARSE_POINTER_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const COVERED = '#4fd1c5'
const ILLEGAL = '#f56565'

/**
 * Position in the flat-overlay stack, lowest first: the King's radius ring
 * (0), `TowerCoverage`'s amber footprint (1), this teal box (2), this illegal
 * marker (3), `SelectionMarker`'s ring (4), `FirePulses` (5).
 *
 * Explicit because heights cannot order these. three.js sorts transparent
 * objects on the projected z of each object's **world origin**, and drei's
 * `Instances` leaves the `InstancedMesh` at the origin with every instance
 * position in `instanceMatrix` — measured in the running scene, this overlay and
 * `TowerCoverage`'s both report exactly `(0, 0, 0)`. `TowerCoverage.tsx` carries
 * the full reasoning and the ladder.
 *
 * Teal above amber is the design decision: the Tower about to be placed draws
 * over one already standing. The marker is above both because it is a refusal,
 * and a warning that something else can paint over is not a warning.
 */
const COVERED_RENDER_ORDER = 2
const ILLEGAL_RENDER_ORDER = 3

/**
 * Highlights the squares the pending hand tower would cover from the hovered
 * square.
 *
 * A played hand hands the board a `pendingTower` — the tower about to be
 * placed by the next click — and this previews its footprint before that click
 * lands, so the hand ladder is judgeable. Whether a horizontal-only tower is
 * useful or nearly useless on the board with Pieces converging on the Core is
 * a question you can only answer by seeing the footprint.
 *
 * It also marks the hovered square itself red when a build there would be
 * refused — a Piece's square, the Core's square, or a square already holding
 * a Tower — so the player sees why a click there is a no-op before they make it.
 */
export function CoveragePreview({ board }: { board: BoardSpec }) {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const previewedSquare = useUiStore((store) => store.previewedSquare)
  // On touch there is no continuous pointer position — the first tap commits a
  // square to `previewedSquare`, and the preview renders against that. On a
  // fine pointer the live hover drives it as before.
  const activeSquare = coarse ? previewedSquare : hoveredSquare
  // Board.tsx mounts this unconditionally, so this subscription is live
  // whenever the board is — not only while a hand is pending. What *is* bounded
  // to that window is the drawing below (a handful of planes), and the cost
  // this selector avoids: reading only the pending type rather than the whole
  // snapshot means a Piece hop, which changes the snapshot on every hop, does
  // not touch this value and so cannot force a recompute of the footprint.
  const pendingType = useGameStore((store) => store.snapshot.pendingTower)
  // Identity-stable blocker squares, for the same reason as TowerCoverage:
  // this reference changes only on build/destroy, so a Piece hop or a hit
  // cannot recompute the footprint below.
  const blockers = useGameStore(
    (store) => blockerSquares(store.snapshot.towers),
    squaresListsEqual,
  )
  // The engine's own predicate, deliberately: a narrower copy here would
  // disagree with the refusal in `cardPlays.ts`. It reads false for a Piece,
  // the Core square and an existing Tower alike. Selected on its own, not
  // folded into the memo below, so zustand's `Object.is` on this boolean — not
  // on the snapshot object — decides whether this component re-renders; a
  // Piece hop that does not flip legality now costs nothing here.
  const legal = useGameStore((store) => !activeSquare || canBuildOn(store.snapshot, activeSquare))

  const footprint = useMemo(() => {
    if (!activeSquare || !isInBounds(board, activeSquare)) return null
    if (pendingType === null) return null

    return {
      // The engine's own footprint, shared with the selected-Tower overlay so
      // the two cannot clip differently. It excludes the origin, because
      // `coversSquare` never covers its own square — so `activeSquare` is
      // never in here, and the red marker below cannot land on a teal one.
      // Decided by `overlaySquares`, the one place that picks what an overlay
      // draws: every type lights `reachableSquares` — the same rule the amber
      // footprint follows, so the teal promise and the amber fact always agree.
      covered: overlaySquares(board, pendingType, towerType(pendingType).range, activeSquare, blockers),
      origin: activeSquare,
    }
  }, [activeSquare, blockers, board, pendingType])

  if (!footprint) return null

  return (
    <>
      {/* `key` is keyed on the slot count for the same reason as the board's
          `Instances` — see the comment in Board.tsx. Unreachable today (this
          unmounts whenever nothing is hovered or no tower is pending, so it
          always remounts at the new size anyway) but it is the identical
          defect, and relying on that unmount is relying on a hover/pending
          interaction detail rather than on anything this component controls. */}
      <Instances
        key={board.files * board.ranks}
        limit={board.files * board.ranks}
        renderOrder={COVERED_RENDER_ORDER}
      >
        <boxGeometry args={[SQUARE_SIZE * 0.9, 0.02, SQUARE_SIZE * 0.9]} />
        <meshBasicMaterial color={COVERED} transparent opacity={0.42} depthWrite={false} />
        {footprint.covered.map((square) => (
          <Instance
            key={squareKey(square)}
            position={[fileToWorldX(board, square.file), 0.04, rankToWorldZ(board, square.rank)]}
          />
        ))}
      </Instances>

      {/* One square, so a plain mesh. A second `Instances` would need a
          `limit` and a matching `key`, which is the exact hazard that produced
          the Ace wedge; a single mesh cannot have it. */}
      {!legal && (
        <mesh
          renderOrder={ILLEGAL_RENDER_ORDER}
          position={[
            fileToWorldX(board, footprint.origin.file),
            0.04,
            rankToWorldZ(board, footprint.origin.rank),
          ]}
        >
          <boxGeometry args={[SQUARE_SIZE * 0.9, 0.02, SQUARE_SIZE * 0.9]} />
          <meshBasicMaterial color={ILLEGAL} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}
