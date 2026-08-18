import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, MeshBasicMaterial, SphereGeometry, type Mesh } from 'three'
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { towerHeight } from './towerGeometry'
import { isUpgradeReady } from './upgradeReady'

/** Presentation constants, tunable by feel. */
const HALO_RADIUS = 0.55
const HALO_BASE_OPACITY = 0.35
const HALO_PULSE_OPACITY = 0.25

/**
 * The halo material, built once at module load and shared by every halo.
 *
 * Module-level on purpose, like `firePulse.ts`'s shared colours: the pulse
 * mutates `opacity` every frame, and the `react-hooks/immutability` rule
 * refuses to mutate a value that came out of `useMemo`. A module-scope
 * material is exactly the same shared-instance story, minus the hook.
 */
const HALO_MATERIAL = new MeshBasicMaterial({
  color: '#ffd700',
  transparent: true,
  opacity: HALO_BASE_OPACITY,
  blending: AdditiveBlending,
  depthWrite: false,
})

/**
 * A soft pulsing golden halo around every Tower with banked, unspent upgrades.
 *
 * The halo is a translucent additive-blended sphere centred on the Tower's
 * body and stretched to the Tower's height, so it reads as the Tower glowing
 * rather than a marker floating above it. The set of ready Towers is small and
 * changes only on a kill or a spend — both rare publishes — so one mesh per
 * ready Tower is fine, and a Tower becoming ready mounts nothing expensive
 * because the geometry is shared and the material is module-level.
 */
export function UpgradeReady({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)
  const halos = useRef(new Map<string, Mesh>())

  const geometry = useMemo(() => new SphereGeometry(HALO_RADIUS, 16, 12), [])

  // The pulse is per-frame but ref-only: mutating the shared material's
  // opacity directly, never through React state. The clock is the elapsed
  // scene time, so the pulse is refresh-rate independent, and because every
  // halo shares one material a single write animates every ready Tower in
  // step.
  useFrame(({ clock }) => {
    const pulse = (Math.sin(clock.getElapsedTime() * Math.PI * 4) + 1) / 2
    HALO_MATERIAL.opacity = HALO_BASE_OPACITY + pulse * HALO_PULSE_OPACITY
  })

  return (
    <>
      {towers.filter(isUpgradeReady).map((tower) => {
        const height = towerHeight(tower.type)
        return (
          <mesh
            key={tower.id}
            ref={(node) => {
              if (node) halos.current.set(tower.id, node)
              else halos.current.delete(tower.id)
            }}
            geometry={geometry}
            material={HALO_MATERIAL}
            scale={[1, height / HALO_RADIUS, 1]}
            position={[
              fileToWorldX(board, tower.square.file),
              height / 2,
              rankToWorldZ(board, tower.square.rank),
            ]}
          />
        )
      })}
    </>
  )
}
