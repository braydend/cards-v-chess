import { OrbitControls } from '@react-three/drei'
import { Suspense, useRef } from 'react'
import { useGameStore } from '../state/store'
import { COARSE_POINTER_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { Board } from './Board'
import { Core } from './Core'
import type { CoreFlash } from './coreFlash'
import { GameLoop } from './GameLoop'
import { PieceExits } from './PieceExits'
import { Pieces } from './Pieces'
import { Towers } from './Towers'

// The drei OrbitControls ref type: the three-stdlib OrbitControlsImpl, whose
// `.target` (a Vector3) and `.update()` the pan clamp below reads and writes.
type OrbitControlsRef = React.ElementRef<typeof OrbitControls>

export function GameScene() {
  const board = useGameStore((store) => store.snapshot.board)
  const core = useGameStore((store) => store.snapshot.core)

  // Whether the pointer is a touch pointer. Pan is mobile-only: on a coarse
  // pointer a two-finger drag shifts the board out from under the HUD chrome;
  // a fine pointer keeps pan disabled exactly as it always was.
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)

  // The pan clamp needs the live controls instance. A ref, not state: the
  // `onChange` handler reads it per gesture, and routing it through React
  // would be pointless churn.
  const controlsRef = useRef<OrbitControlsRef>(null)

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
      <Suspense fallback={null}>
        <Pieces board={board} />
        <PieceExits board={board} flash={coreFlash} />
      </Suspense>

      <OrbitControls
        ref={controlsRef}
        enablePan={coarse}
        minDistance={6}
        maxDistance={22}
        maxPolarAngle={1.4}
        onChange={(event) => {
          // Clamp the pan so the board can never be pushed off-screen. A
          // two-finger drag moves `controls.target`; the target stays within a
          // radius of the board's centre that grows with the board (an Ace
          // adds a rank), so the Core is always reachable. Rotate and zoom do
          // not move the target, so this is a no-op during those gestures.
          const controls = event?.target
          if (!controls) return

          const maxPan = 0.5 * Math.hypot(board.files, board.ranks) + 2
          const distance = controls.target.length()
          if (distance > maxPan) {
            controls.target.setLength(maxPan)
            controls.update()
          }
        }}
      />
    </>
  )
}
