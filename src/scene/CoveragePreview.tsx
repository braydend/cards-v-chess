import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { towerRank } from '../data/towerRanks'
import {
  allSquares,
  canBuildOn,
  coversSquare,
  findCard,
  isBuildableRank,
  isInBounds,
  squareKey,
  type BoardSpec,
} from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const COVERED = '#4fd1c5'
const ILLEGAL = '#f56565'

/**
 * Highlights the squares the selected Card would cover from the hovered square.
 *
 * This exists to make the rank ladder judgeable. Whether a horizontal-only
 * Tower is useful or nearly useless on the board with Pieces converging on
 * the Core is a question you can only answer by seeing the footprint.
 *
 * Only the build mode previews. Played for its suit the same Card supports an
 * existing Tower and builds nothing, so a footprint would promise a Tower the
 * click will not place.
 *
 * It also marks the hovered square itself red when a build there would be
 * refused — a Piece's square, the Core's square, or a square already holding
 * a Tower — so the player sees why a click there is a no-op before they make it.
 */
export function CoveragePreview({ board }: { board: BoardSpec }) {
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const playMode = useUiStore((store) => store.playMode)
  // Board.tsx mounts this unconditionally, so this subscription is live
  // whenever the board is — not only while a build Card is picked. What *is*
  // bounded to that window is the drawing below (a handful of planes), and the
  // cost this selector avoids: reading only the Deck rather than the whole
  // snapshot means a Piece hop, which changes the snapshot on every hop, does
  // not touch this value and so cannot force a recompute of the footprint.
  const deck = useGameStore((store) => store.snapshot.deck)
  // The engine's own predicate, deliberately: a narrower copy here would
  // disagree with the refusal in `cardPlays.ts`. It reads false for a Piece,
  // the Core square and an existing Tower alike. Selected on its own, not
  // folded into the memo below, so zustand's `Object.is` on this boolean — not
  // on the snapshot object — decides whether this component re-renders; a
  // Piece hop that does not flip legality now costs nothing here.
  const legal = useGameStore((store) => !hoveredSquare || canBuildOn(store.snapshot, hoveredSquare))

  const footprint = useMemo(() => {
    if (!hoveredSquare || !isInBounds(board, hoveredSquare)) return null
    if (!selectedCardId || playMode !== 'build') return null

    const card = findCard(deck, selectedCardId)
    if (!card || card.kind !== 'standard' || !isBuildableRank(card.rank)) return null

    const { geometry, range } = towerRank(card.rank)

    return {
      // `coversSquare` never covers its own square, so `hoveredSquare` is
      // never in here — the red marker below cannot land on a teal one.
      covered: allSquares(board).filter((square) => coversSquare(geometry, range, hoveredSquare, square)),
      origin: hoveredSquare,
    }
  }, [board, deck, hoveredSquare, playMode, selectedCardId])

  if (!footprint) return null

  return (
    <>
      {/* `key` is keyed on the slot count for the same reason as the board's
          `Instances` — see the comment in Board.tsx. Unreachable today (this
          unmounts whenever nothing is hovered, and selecting the Ace in the
          Deck empties the preview, so it always remounts at the new size
          anyway) but it is the identical defect, and relying on that unmount
          is relying on a Deck-interaction detail rather than on anything this
          component controls. */}
      <Instances key={board.files * board.ranks} limit={board.files * board.ranks}>
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
