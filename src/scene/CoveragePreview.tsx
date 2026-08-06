import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { towerRank } from '../data/towerRanks'
import { allSquares, coversSquare, findCard, isBuildableRank, isInBounds, squareKey, type BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const COVERED = '#4fd1c5'

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
 */
export function CoveragePreview({ board }: { board: BoardSpec }) {
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const playMode = useUiStore((store) => store.playMode)
  const deck = useGameStore((store) => store.snapshot.deck)

  const covered = useMemo(() => {
    if (!hoveredSquare || !isInBounds(board, hoveredSquare)) return []
    if (!selectedCardId || playMode !== 'build') return []

    const card = findCard(deck, selectedCardId)
    if (!card || card.kind !== 'standard' || !isBuildableRank(card.rank)) return []

    const { geometry, range } = towerRank(card.rank)
    return allSquares(board).filter((square) =>
      coversSquare(geometry, range, hoveredSquare, square),
    )
  }, [board, deck, hoveredSquare, playMode, selectedCardId])

  if (covered.length === 0) return null

  // `key` is keyed on the slot count for the same reason as the board's
  // `Instances` — see the comment in Board.tsx. Unreachable today (this unmounts
  // whenever nothing is covered, and selecting the Ace in the Deck empties
  // `covered`, so it always remounts at the new size anyway) but it is the
  // identical defect, and relying on that unmount is relying on a
  // Deck-interaction detail rather than on anything this component controls.
  return (
    <Instances key={board.files * board.ranks} limit={board.files * board.ranks}>
      <boxGeometry args={[SQUARE_SIZE * 0.9, 0.02, SQUARE_SIZE * 0.9]} />
      <meshBasicMaterial color={COVERED} transparent opacity={0.42} depthWrite={false} />
      {covered.map((square) => (
        <Instance
          key={squareKey(square)}
          position={[fileToWorldX(board, square.file), 0.04, rankToWorldZ(board, square.rank)]}
        />
      ))}
    </Instances>
  )
}
