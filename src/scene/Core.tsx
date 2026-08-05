import type { BoardSpec, Square } from '../game'
import { fileToWorldX, rankToWorldZ } from './coords'

const HEALTHY = '#f4d03f'
const CRITICAL = '#7b241c'

export function Core({
  board,
  square,
  healthFraction,
}: {
  board: BoardSpec
  square: Square
  healthFraction: number
}) {
  return (
    <mesh
      position={[fileToWorldX(board, square.file), 0.4, rankToWorldZ(board, square.rank)]}
      castShadow
    >
      <octahedronGeometry args={[0.45]} />
      <meshStandardMaterial
        color={healthFraction > 0.3 ? HEALTHY : CRITICAL}
        emissive={healthFraction > 0.3 ? HEALTHY : CRITICAL}
        emissiveIntensity={0.25 + healthFraction * 0.5}
        flatShading
      />
    </mesh>
  )
}
