import { OrbitControls } from '@react-three/drei'
import { useRef } from 'react'
import { useGameStore } from '../state/store'
import { Board } from './Board'
import { Core } from './Core'
import type { CoreFlash } from './coreFlash'
import { GameLoop } from './GameLoop'
import { PieceExits } from './PieceExits'
import { Pieces } from './Pieces'
import { Towers } from './Towers'

export function GameScene() {
  const board = useGameStore((store) => store.snapshot.board)
  const core = useGameStore((store) => store.snapshot.core)

  // Shared by reference between the leak impact that stamps it and the Core
  // that reads it. A ref, not state: this is per-frame data and routing it
  // through React would be the per-frame render CLAUDE.md forbids. -1 is idle.
  const coreFlash = useRef<CoreFlash>({ startedAt: -1 })

  return (
    <>
      <GameLoop />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.6} castShadow />

      <Board board={board} />
      <Core
        board={board}
        square={core.square}
        healthFraction={core.health / core.maxHealth}
        flash={coreFlash}
      />
      <Towers board={board} />
      <Pieces board={board} />
      <PieceExits board={board} flash={coreFlash} />

      <OrbitControls enablePan={false} minDistance={6} maxDistance={22} maxPolarAngle={1.4} />
    </>
  )
}
