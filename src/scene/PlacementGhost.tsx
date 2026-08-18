import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { canBuildOn, isInBounds, type BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { COARSE_POINTER_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { fileToWorldX, rankToWorldZ } from './coords'
import { ease, ghostFor, tiltX, tiltZ } from './placementGhost'
import { ILLEGAL } from './previewColours'
import { TOWER_COLOURS } from './rankColours'
import { TOWER_RADIUS_BOTTOM, TOWER_RADIUS_TOP, TOWER_SEGMENTS, towerHeight } from './towerGeometry'

/** How far the ghost's base floats above the board surface (square tops sit at y = 0). */
const HOVER_CLEARANCE = 0.15
/** Per-second approach rate for the trail — subtle drift, tuned by feel. */
const EASE_RATE = 12
/**
 * One rung above `FirePulses` (5) in the flat-overlay ladder. The ghost is a
 * translucent solid, not a flat overlay, but the ladder still applies:
 * transparent objects sort by camera z unless they carry an explicit
 * `renderOrder`, and a tie drops back to that sort. The object under the
 * pointer is the thing being read, so it draws on top.
 */
const GHOST_RENDER_ORDER = 6

/** Identity-stable so R3F never re-applies it — the ghost's position is owned by useFrame. */
const ORIGIN: [number, number, number] = [0, 0, 0]

/**
 * The pending Tower riding the pointer.
 *
 * While a hand is committed (`pendingTower` set) and a square is active, shows
 * a translucent model of the Tower about to be placed, easing between square
 * centres so it trails behind the pointer like something being carried. All
 * decisions live in `placementGhost.ts`; this is plumbing plus the frame loop.
 */
export function PlacementGhost({ board }: { board: BoardSpec }) {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)
  const hoveredSquare = useUiStore((store) => store.hoveredSquare)
  const previewedSquare = useUiStore((store) => store.previewedSquare)
  // Touch has no hover: the first tap commits a square to `previewedSquare`,
  // and the ghost rides that, exactly as `CoveragePreview`'s `activeSquare` does.
  const activeSquare = coarse ? previewedSquare : hoveredSquare
  // Mirror `CoveragePreview`'s bounds guard: a square outside the board draws
  // nothing there, so the ghost must not float in the void beside it.
  const inBoundsSquare = activeSquare === null || isInBounds(board, activeSquare) ? activeSquare : null
  const pendingType = useGameStore((store) => store.snapshot.pendingTower)
  // The engine's own predicate, selected as a bare boolean so zustand's
  // `Object.is` — not the snapshot object — decides re-render. A Piece hop that
  // does not flip legality on the hovered square costs nothing here.
  const legal = useGameStore((store) => !inBoundsSquare || canBuildOn(store.snapshot, inBoundsSquare))
  const ghostRef = useRef<Mesh>(null)
  const lastMeshRef = useRef<Mesh | null>(null)

  const ghost = useMemo(
    () => ghostFor(pendingType, inBoundsSquare, legal),
    [pendingType, inBoundsSquare, legal],
  )

  // Keyed on the height (a number derived from the type), not on `ghost` (a
  // fresh object every render), so square hops re-render without rebuilding the
  // geometry — the R3F discipline's "share geometries" applied to the one mesh
  // that can hold only one.
  const height = ghost === null ? 0 : towerHeight(ghost.type)
  const args = useMemo(
    (): [number, number, number, number] => [
      TOWER_RADIUS_TOP,
      TOWER_RADIUS_BOTTOM,
      height,
      TOWER_SEGMENTS,
    ],
    [height],
  )

  useFrame((_, delta) => {
    const mesh = ghostRef.current
    if (!ghost || !inBoundsSquare || !mesh) return

    const targetX = fileToWorldX(board, inBoundsSquare.file)
    const targetZ = rankToWorldZ(board, inBoundsSquare.rank)
    const targetY = HOVER_CLEARANCE + towerHeight(ghost.type) / 2

    // The mesh mounts fresh at the active square (each mount is a new mesh
    // object), so the frame it mounts snaps to the target — no glide in from a
    // stale position, no cross-board drift when the pointer re-enters. Only the
    // frames after that ease between square hops.
    if (lastMeshRef.current !== mesh) {
      lastMeshRef.current = mesh
      mesh.position.set(targetX, targetY, targetZ)
      mesh.rotation.set(0, 0, 0)
      return
    }

    mesh.position.x = ease(mesh.position.x, targetX, delta, EASE_RATE)
    mesh.position.y = ease(mesh.position.y, targetY, delta, EASE_RATE)
    mesh.position.z = ease(mesh.position.z, targetZ, delta, EASE_RATE)
    // Lean into the motion from the current displacement, settling upright as
    // the ghost arrives. `tiltX`/`tiltZ` are scalars, so the frame loop
    // allocates nothing.
    mesh.rotation.x = tiltX(targetZ - mesh.position.z)
    mesh.rotation.z = tiltZ(targetX - mesh.position.x)
  })

  if (!ghost) return null

  return (
    <mesh
      ref={ghostRef}
      position={ORIGIN}
      renderOrder={GHOST_RENDER_ORDER}
      // `PlacementSurface` is the single raycast target that turns a click into
      // a square; a mesh floating above it would swallow pointer events. This is
      // one of the few places the scene needs the explicit opt-out.
      raycast={() => null}
    >
      <cylinderGeometry args={args} />
      <meshStandardMaterial
        color={ghost.illegal ? ILLEGAL : TOWER_COLOURS[ghost.type]}
        transparent
        opacity={0.35}
        depthWrite={false}
        flatShading
      />
    </mesh>
  )
}
