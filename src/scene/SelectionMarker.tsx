import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'

const SELECTED = '#f4f7fb'

/**
 * Position in the flat-overlay stack, lowest first: `TowerCoverage`'s amber
 * footprint (1), `CoveragePreview`'s teal box (2) and illegal marker (3), this
 * ring (4), `FirePulses` (5). `TowerCoverage.tsx` carries the reasoning.
 *
 * The height below is not enough on its own. This mesh does sit at a real board
 * position, so unlike the instanced overlays its sort z is meaningful — but z
 * ordering between separate transparent objects still shifts with the camera,
 * which is precisely what `FirePulses` set its own `renderOrder` to escape.
 */
const RENDER_ORDER = 4

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
      renderOrder={RENDER_ORDER}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[
        fileToWorldX(board, selected.square.file),
        // CoveragePreview's box is 0.02 tall centred at y=0.04, so its top face
        // sits at exactly y=0.05. Matching that here would make the two
        // coplanar — both use depthWrite: false, so which draws on top would
        // flip with camera orbit whenever the selected Tower's square falls
        // inside the hovered coverage footprint. Raised clear of it; do not
        // lower this back to 0.05.
        0.06,
        rankToWorldZ(board, selected.square.rank),
      ]}
    >
      <ringGeometry args={[SQUARE_SIZE * 0.42, SQUARE_SIZE * 0.5, 24]} />
      <meshBasicMaterial color={SELECTED} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}
