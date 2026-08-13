import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MeshStandardMaterial, TorusGeometry, type Mesh } from 'three'
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { isUpgradeReady } from './upgradeReady'

/**
 * A small pulsing golden ring above every Tower with banked, unspent upgrades.
 *
 * The set of ready Towers is small and changes only on a kill or a spend —
 * both rare publishes — so one mesh per ready Tower is fine, and a Tower
 * becoming ready mounts nothing expensive because the geometry and material
 * are shared above the map. The ring is oriented flat (`rotation-x`), its
 * position is the Tower's square, and it sits just clear of the tallest
 * Tower body.
 */
const RING_Y = 1.35
const RING_RADIUS = 0.4

export function UpgradeReady({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)
  const rings = useRef(new Map<string, Mesh>())

  const geometry = useMemo(() => new TorusGeometry(RING_RADIUS, 0.035, 8, 24), [])
  const material = useMemo(
    () => new MeshStandardMaterial({ color: '#ffd700', emissive: '#ffd700', emissiveIntensity: 1.4 }),
    [],
  )

  // The pulse is per-frame but ref-only: mutating each ring's scale and
  // rotation directly, never through React state. The clock is the elapsed
  // scene time, so the pulse is refresh-rate independent.
  useFrame(({ clock }) => {
    const phase = clock.getElapsedTime()
    for (const mesh of rings.current.values()) {
      const pulse = (Math.sin(phase * Math.PI * 4) + 1) / 2
      mesh.scale.setScalar(0.85 + pulse * 0.3)
      mesh.rotation.y = phase
    }
  })

  return (
    <>
      {towers.filter(isUpgradeReady).map((tower) => (
        <mesh
          key={tower.id}
          ref={(node) => {
            if (node) rings.current.set(tower.id, node)
            else rings.current.delete(tower.id)
          }}
          geometry={geometry}
          material={material}
          rotation-x={Math.PI / 2}
          position={[
            fileToWorldX(board, tower.square.file),
            RING_Y,
            rankToWorldZ(board, tower.square.rank),
          ]}
        />
      ))}
    </>
  )
}
