import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { towerRank } from '../data/towerRanks'
import { allSquares, coversSquare, isInBounds, squareKey, type BoardSpec } from '../game'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const COVERED = '#4fd1c5'

/**
 * Highlights the squares the selected rank would cover from the hovered square.
 *
 * This exists to make the rank ladder judgeable. Whether a horizontal-only
 * Tower is useful or nearly useless on an 8x8 board with Pieces converging on
 * one Core square is a question you can only answer by seeing the footprint.
 */
export function CoveragePreview({ board }: { board: BoardSpec }) {
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const selectedRank = useUiStore((store) => store.selectedRank)

  const covered = useMemo(() => {
    if (!hoveredSquare || !isInBounds(board, hoveredSquare)) return []

    const { geometry, range } = towerRank(selectedRank)
    return allSquares(board).filter((square) =>
      coversSquare(geometry, range, hoveredSquare, square),
    )
  }, [board, hoveredSquare, selectedRank])

  if (covered.length === 0) return null

  return (
    <Instances limit={board.files * board.ranks}>
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
