import { Instance, Instances, type PositionMesh } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { BUILDABLE_RANKS } from '../data/towerRanks'
import type { BoardSpec, CardRank } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { RANK_COLOURS } from './rankColours'
import { CRITICAL_PULSE_HZ, DEATH_FLARE_MS, HIT_FLASH_MS, towerColour } from './towerColour'
import { diffTowers, type Ghost, type TowerAnimation } from './towerDiff'

function towerHeight(cardRank: CardRank): number {
  return 0.55 + cardRank * 0.06
}

/**
 * Towers, and everything a player can read off them without opening a panel.
 *
 * Four signals, all achieved by mutating the existing instanced meshes — no new
 * geometry, and no React render per frame:
 *
 * - **Health** darkens the Tower's rank colour (the long-standing behaviour,
 *   moved from render-time to frame-time).
 * - **A hit** flares it bright and squashes it briefly.
 * - **Critical health** pulses it toward a warning red.
 * - **Destruction** flares and shrinks a short-lived ghost, so a Tower does not
 *   simply pop out of existence.
 *
 * Hits and deaths are found by **diffing published snapshots**, not by engine
 * events: `advance()` runs up to five ticks per `emit()`, so anything the engine
 * wrote per-tick and cleared per-tick would be lost exactly when the frame rate
 * drops. A health change is what publishes a snapshot, so a diff cannot miss one.
 */
export function Towers({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)
  const [ghosts, setGhosts] = useState<readonly Ghost[]>([])

  const animations = useRef(new Map<string, TowerAnimation>())
  const ghostStartedAt = useRef(new Map<string, number>())
  const meshes = useRef(new Map<string, PositionMesh>())

  // The diff runs from a store subscription rather than a render-driven effect.
  // Two reasons: a Tower death is an external event, so `setGhosts` belongs in a
  // subscription callback — calling it synchronously in an effect body causes the
  // cascading render `react-hooks/set-state-in-effect` warns about — and a
  // subscription fires on every publish, not only on renders this component
  // happens to perform.
  useEffect(() => {
    // Seed from whatever is already on the board. The returned list is
    // necessarily empty: nothing can have fallen out of a map that was empty a
    // moment ago, which is why no state update belongs here.
    diffTowers(animations.current, useGameStore.getState().snapshot)

    return useGameStore.subscribe((store) => {
      const fallen = diffTowers(animations.current, store.snapshot)
      if (fallen.length > 0) setGhosts((current) => [...current, ...fallen])
    })
  }, [])

  // Ghosts are cleared as a batch. Two deaths close together therefore leave the
  // first ghost on screen slightly longer, which is invisible in practice — its
  // scale has already reached zero.
  useEffect(() => {
    if (ghosts.length === 0) return

    const timer = setTimeout(() => {
      setGhosts([])
      ghostStartedAt.current.clear()
    }, DEATH_FLARE_MS)

    return () => clearTimeout(timer)
  }, [ghosts])

  useFrame((state) => {
    const now = state.clock.elapsedTime

    for (const tower of towers) {
      const mesh = meshes.current.get(tower.id)
      const animation = animations.current.get(tower.id)
      if (!mesh || !animation) continue

      if (animation.flashPending) {
        animation.flashPending = false
        animation.flashStartedAt = now
      }

      const flashProgress =
        animation.flashStartedAt < 0
          ? 0
          : Math.max(0, 1 - (now - animation.flashStartedAt) / (HIT_FLASH_MS / 1000))

      towerColour(
        mesh.color,
        tower.cardRank,
        tower.health / tower.maxHealth,
        flashProgress,
        now * CRITICAL_PULSE_HZ,
      )

      // Squash and recover on impact. Scale rather than position, so the Tower
      // stays seated on its square instead of hopping.
      const squash = flashProgress * 0.12
      mesh.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
    }

    for (const ghost of ghosts) {
      const mesh = meshes.current.get(ghost.id)
      if (!mesh) continue

      let startedAt = ghostStartedAt.current.get(ghost.id)
      if (startedAt === undefined) {
        startedAt = now
        ghostStartedAt.current.set(ghost.id, now)
      }

      const remaining = Math.max(0, 1 - (now - startedAt) / (DEATH_FLARE_MS / 1000))

      towerColour(mesh.color, ghost.cardRank, 0, remaining, now * CRITICAL_PULSE_HZ)
      mesh.scale.setScalar(remaining)
    }
  })

  return (
    <>
      {BUILDABLE_RANKS.map((cardRank) => {
        const live = towers.filter((tower) => tower.cardRank === cardRank)
        const dying = ghosts.filter((ghost) => ghost.cardRank === cardRank)
        if (live.length === 0 && dying.length === 0) return null

        const height = towerHeight(cardRank)

        // One instanced draw call per rank, shared geometry and material, with
        // ghosts riding in the same group so a death costs no extra call.
        return (
          <Instances key={cardRank} limit={128} castShadow>
            <cylinderGeometry args={[0.24, 0.32, height, 6]} />
            <meshStandardMaterial flatShading />

            {live.map((tower) => (
              <Instance
                key={tower.id}
                // Braces, and no implicit return: React 19 treats a value
                // returned from a ref callback as a cleanup function.
                ref={(mesh: PositionMesh | null) => {
                  if (mesh) meshes.current.set(tower.id, mesh)
                  else meshes.current.delete(tower.id)
                }}
                // Correct on the first frame, before useFrame has run once.
                color={RANK_COLOURS[cardRank]}
                position={[
                  fileToWorldX(board, tower.square.file),
                  height / 2,
                  rankToWorldZ(board, tower.square.rank),
                ]}
              />
            ))}

            {dying.map((ghost) => (
              <Instance
                key={ghost.id}
                ref={(mesh: PositionMesh | null) => {
                  if (mesh) meshes.current.set(ghost.id, mesh)
                  else meshes.current.delete(ghost.id)
                }}
                color={RANK_COLOURS[cardRank]}
                position={[
                  fileToWorldX(board, ghost.file),
                  height / 2,
                  rankToWorldZ(board, ghost.boardRank),
                ]}
              />
            ))}
          </Instances>
        )
      })}
    </>
  )
}
