import { OrbitControls } from '@react-three/drei'
import { useGameStore } from '../state/store'
import { Board } from './Board'
import { Core } from './Core'
import { GameLoop } from './GameLoop'
import { Pieces } from './Pieces'
import { Towers } from './Towers'

export function GameScene() {
  const board = useGameStore((store) => store.snapshot.board)
  const core = useGameStore((store) => store.snapshot.core)

  return (
    <>
      <GameLoop />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} castShadow />

      <Board board={board} />
      <Core board={board} square={core.square} healthFraction={core.health / core.maxHealth} />
      <Towers board={board} />
      <Pieces board={board} />

      <OrbitControls enablePan={false} minDistance={6} maxDistance={22} maxPolarAngle={1.4} />
    </>
  )
}
