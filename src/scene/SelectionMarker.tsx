import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const SELECTED = '#f4f7fb'

/**
 * A ring on the selected Tower's square.
 *
 * Drawn flat in the board plane in the same style as CoveragePreview, and only
 * ever one object — it is mounted only while a Tower is selected.
 *
 * It subscribes to the Tower list so that it disappears by itself when the
 * selected Tower is destroyed. That means a re-render per Tower hit, which is
 * one small mesh and cheap; the alternative is a ring left hanging over an
 * empty square.
 */
export function SelectionMarker({ board }: { board: BoardSpec }) {
  const selectedTowerId = useUiStore((store) => store.selectedTowerId)
  const towers = useGameStore((store) => store.snapshot.towers)
  const selected = towers.find((tower) => tower.id === selectedTowerId)

  if (!selected) return null

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        fileToWorldX(board, selected.square.file),
        0.05,
        rankToWorldZ(board, selected.square.rank),
      ]}
    >
      <ringGeometry args={[SQUARE_SIZE * 0.42, SQUARE_SIZE * 0.5, 24]} />
      <meshBasicMaterial color={SELECTED} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}
