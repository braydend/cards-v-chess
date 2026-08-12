import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef } from 'react'
import { Vector3, type Camera } from 'three'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { COARSE_POINTER_QUERY, LANDSCAPE_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { Board } from './Board'
import { Core } from './Core'
import type { CoreFlash } from './coreFlash'
import { GameLoop } from './GameLoop'
import { PieceExits } from './PieceExits'
import { Pieces } from './Pieces'
import { easeOutCubic, panOffsetForStrip } from './stripOffset'
import { Towers } from './Towers'

// The drei OrbitControls ref type: the three-stdlib OrbitControlsImpl, whose
// `.target` (a Vector3) and `.update()` the pan clamp and the strip shift
// below read and write.
type OrbitControlsRef = React.ElementRef<typeof OrbitControls>

/** How long the board takes to glide clear of the strip (or back to centre). */
const STRIP_SHIFT_MS = 200

export function GameScene() {
  const board = useGameStore((store) => store.snapshot.board)
  const core = useGameStore((store) => store.snapshot.core)

  // Whether the pointer is a touch pointer. Pan is mobile-only: on a coarse
  // pointer a two-finger drag shifts the board out from under the HUD chrome;
  // a fine pointer keeps pan disabled exactly as it always was.
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)

  // Whether the viewport is landscape — the only orientation that auto-shifts
  // the board, because the selected-card strip floats over the board's right
  // side there.
  const landscape = useMediaQuery(LANDSCAPE_QUERY)

  // The Card selection that raises the strip. The strip's width is fixed by
  // CSS, so a bigger or smaller selection is a defensive re-measure rather
  // than a size change. View state in `uiStore`, read without touching the
  // simulation snapshot.
  const selectedCardIds = useUiStore((store) => store.selectedCardIds)

  // Selectors, not a whole-store `useThree()`: the camera reference is stable
  // and only the viewport width is reactive here (canvas resize). Subscribing
  // to the whole store would re-render this scene on unrelated store updates.
  const camera = useThree((state) => state.camera)
  const sizeWidth = useThree((state) => state.size.width)

  // The pan clamp needs the live controls instance. A ref, not state: the
  // `onChange` handler reads it per gesture, and routing it through React
  // would be pointless churn.
  const controlsRef = useRef<OrbitControlsRef>(null)

  // The strip shift: the target x the frame loop glides `controls.target.x`
  // toward, then idles so a deliberate manual pan is never fought. Ref state,
  // not React state — this changes every frame while animating.
  const stripShift = useRef({ active: false, from: 0, to: 0, elapsedMs: 0 })

  // Shared by reference between the leak impact that stamps it and the Core
  // that reads it. A ref, not state: this is per-frame data and routing it
  // through React would be the per-frame render CLAUDE.md forbids. -1 is idle.
  const coreFlash = useRef<CoreFlash>({ startedAt: -1 })

  // Measure the strip and set the pan goal. Runs on every trigger that can
  // change the strip's size or the need for it: the selection, the board
  // growing, and any resize (via `sizeWidth` and the landscape query).
  useEffect(() => {
    const anim = stripShift.current
    const controls = controlsRef.current

    // The goal: the world offset that moves the board's right edge onto the
    // strip's left edge — or 0 when the strip is not up (no Cards selected),
    // not landscape, or not found (desktop). The live rect means a narrower
    // or wider strip needs exactly the pan it really covers, and none when
    // it does not overlap at all.
    let goal = 0
    if (landscape && selectedCardIds.length > 0 && controls) {
      const strip = document.querySelector<HTMLElement>('.mobileStrip')
      if (strip) {
        const rect = strip.getBoundingClientRect()

        // The same bound the pan clamp enforces below, so the shift can never
        // make the Core unreachable.
        const maxPan = 0.5 * Math.hypot(board.files, board.ranks) + 2

        // `OrbitControls` moves the camera on its own schedule, so refresh the
        // matrices before projecting the board's edges into screen pixels.
        camera.updateMatrixWorld(true)
        const overlap = panOffsetForStrip({
          stripLeftPx: rect.left,
          boardLeftPx: screenXOf(camera, sizeWidth, -board.files / 2),
          boardRightPx: screenXOf(camera, sizeWidth, board.files / 2),
          boardFiles: board.files,
          maxPan,
        })

        // The goal is relative, not absolute: the board pans by `overlap`
        // from where it currently sits (a manual two-finger pan or an earlier
        // re-measure already moved `target`), never to an x measured from
        // centre. The lateral budget keeps the resulting target inside the
        // pan radius even when a prior pan spent part of it on y/z, so the
        // length clamp below cannot fight the glide.
        const yz =
          controls.target.y * controls.target.y + controls.target.z * controls.target.z
        const lateralBudget = Math.sqrt(Math.max(maxPan * maxPan - yz, 0))
        goal = Math.min(controls.target.x + overlap, lateralBudget)
      }
    }

    const from = controls ? controls.target.x : 0
    if (Math.abs(from - goal) < 0.001) {
      anim.active = false
      return
    }

    anim.from = from
    anim.to = goal
    anim.elapsedMs = 0
    anim.active = true
  }, [landscape, selectedCardIds, board, camera, sizeWidth])

  useFrame((_, delta) => {
    const anim = stripShift.current
    if (!anim.active) return
    const controls = controlsRef.current
    if (!controls) return

    anim.elapsedMs += delta * 1000
    const t = Math.min(anim.elapsedMs / STRIP_SHIFT_MS, 1)
    controls.target.x = anim.from + (anim.to - anim.from) * easeOutCubic(t)
    controls.update()
    if (t >= 1) anim.active = false
  })

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

/**
 * The screen x of a board-plane world x, in CSS pixels. Allocates a scratch
 * vector per call — the measurement this serves runs on selection changes,
 * never per frame, so the allocation is fine.
 */
function screenXOf(camera: Camera, width: number, worldX: number): number {
  const v = new Vector3(worldX, 0, 0)
  v.project(camera)
  return ((v.x + 1) / 2) * width
}
