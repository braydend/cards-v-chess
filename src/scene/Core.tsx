import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import { Color, type MeshStandardMaterial } from 'three'
import type { BoardSpec, Square } from '../game'
import { fileToWorldX, rankToWorldZ } from './coords'
import {
  coreColour,
  coreEmissiveIntensity,
  flashProgressAt,
  type CoreFlash,
} from './coreFlash'

/**
 * What the player defends.
 *
 * Colour and emissive intensity are driven from `coreFlash.ts` in the frame
 * loop rather than from JSX, so a leak impact can flash the Core at the moment
 * it lands. The resting appearance is unchanged: `coreColour` preserves the same
 * two colours and the same exclusive 0.3 threshold the declarative version used.
 *
 * `flash` is written by a leak ghost in `PieceExits`, not derived from
 * `core.health` — health drops when the leak resolves, a whole lunge before
 * anything arrives.
 */
export function Core({
  board,
  square,
  healthFraction,
  flash,
}: {
  board: BoardSpec
  square: Square
  healthFraction: number
  flash: RefObject<CoreFlash>
}) {
  const material = useRef<MeshStandardMaterial>(null)
  // Constructed once and mutated, never per frame.
  const colour = useMemo(() => new Color(), [])

  useFrame((state) => {
    const target = material.current
    if (!target) return

    // `RefObject<CoreFlash>.current` is non-nullable in React 19 — the ref is
    // created with an initial value — so this needs no guard.
    const progress = flashProgressAt(flash.current.startedAt, state.clock.elapsedTime)

    coreColour(colour, healthFraction, progress)
    target.color.copy(colour)
    target.emissive.copy(colour)
    target.emissiveIntensity = coreEmissiveIntensity(healthFraction, progress)
  })

  return (
    <mesh
      position={[fileToWorldX(board, square.file), 0.4, rankToWorldZ(board, square.rank)]}
      castShadow
    >
      <octahedronGeometry args={[0.45]} />
      <meshStandardMaterial ref={material} flatShading />
    </mesh>
  )
}
