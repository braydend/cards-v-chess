import { Instance, Instances, type PositionMesh } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { TOWER_TYPE_IDS } from '../data/towerTypes'
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { TOWER_COLOURS } from './rankColours'
import { CRITICAL_PULSE_HZ, DEATH_FLARE_MS, HIT_FLASH_MS, towerColour } from './towerColour'
import { diffTowers, type Ghost, type TowerAnimation } from './towerDiff'
import { TOWER_RADIUS_BOTTOM, TOWER_RADIUS_TOP, TOWER_SEGMENTS, towerHeight } from './towerGeometry'

/**
 * Towers, and everything a player can read off them without opening a panel.
 *
 * They block movement and take damage from the Pieces they block.
 *
 * Five signals, all achieved by mutating the existing instanced meshes — no new
 * geometry, and no React render per frame:
 *
 * - **Health** darkens the Tower's type colour (the long-standing behaviour,
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
  const lastEntityId = useRef(0)
  const expiryTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  // The diff runs from a store subscription rather than a render-driven effect.
  // Two reasons: a Tower death is an external event, so `setGhosts` belongs in a
  // subscription callback — calling it synchronously in an effect body causes the
  // cascading render `react-hooks/set-state-in-effect` warns about — and a
  // subscription fires on every publish, not only on renders this component
  // happens to perform.
  useEffect(() => {
    const initialSnapshot = useGameStore.getState().snapshot
    lastEntityId.current = initialSnapshot.nextEntityId

    // Captured once so the cleanup below reads the same Set this effect
    // populated, rather than `expiryTimers.current` as it stands whenever
    // cleanup happens to run — the ref itself is never reassigned, but this
    // is what the lint rule for refs-in-cleanup wants regardless.
    const timers = expiryTimers.current

    // Seed from whatever is already on the board. The returned list is
    // necessarily empty: nothing can have fallen out of a map that was empty a
    // moment ago, which is why no state update belongs here.
    diffTowers(animations.current, initialSnapshot)

    const unsubscribe = useGameStore.subscribe((store) => {
      const snapshot = store.snapshot

      // `reset()` rewinds `nextEntityId` to 1 — the only way it can ever go
      // backwards within a run. Catching that here clears out any ghost still
      // riding out its flare from the previous run immediately, rather than
      // leaving a previous-run ghost on screen for up to DEATH_FLARE_MS after
      // "Play again", and cancels their pending expiry timers so none of them
      // later fires a filter against an already-cleared `ghosts` array.
      // `ghostStartedAt` needs no attention here — the pruning effect below
      // reconciles it against `ghosts` after every change, including this one.
      if (snapshot.nextEntityId < lastEntityId.current) {
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
        setGhosts([])
      }
      lastEntityId.current = snapshot.nextEntityId

      const fallen = diffTowers(animations.current, snapshot)
      if (fallen.length === 0) return

      setGhosts((current) => [...current, ...fallen])

      // Each ghost expires on its own timer rather than a shared batch one. A
      // batch timer restarts on every death, so sustained fire would keep an
      // already-invisible ghost mounted — an instance slot and a per-frame call
      // — until a DEATH_FLARE_MS quiet gap. Filtering by object identity rather
      // than id is deliberate: a `Ghost` record is a unique object that
      // survives the `[...current, ...fallen]` spread untouched, so identity
      // can never match a Tower id that a later `reset()` happens to reuse,
      // where a string comparison theoretically could.
      for (const ghost of fallen) {
        const timer = setTimeout(() => {
          timers.delete(timer)
          setGhosts((current) => current.filter((candidate) => candidate !== ghost))
        }, DEATH_FLARE_MS)
        timers.add(timer)
      }
    })

    return () => {
      unsubscribe()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  // Prunes flare-timing entries for ghosts that have left state. This runs
  // after commit, which is the whole point: deleting an entry while its ghost
  // is still in the committed `ghosts` array would let the frame loop re-stamp
  // `startedAt` and flash the ghost back to full scale for one frame — and
  // leave that entry orphaned, since ids are never reused within a run.
  useEffect(() => {
    if (ghostStartedAt.current.size === 0) return

    const live = new Set(ghosts.map((ghost) => ghost.id))
    for (const id of ghostStartedAt.current.keys()) {
      if (!live.has(id)) ghostStartedAt.current.delete(id)
    }
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
        tower.type,
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
      // meshKey is precomputed on the Ghost record (see towerDiff.ts) so this
      // lookup never allocates a string in the frame loop.
      const mesh = meshes.current.get(ghost.meshKey)
      if (!mesh) continue

      let startedAt = ghostStartedAt.current.get(ghost.id)
      if (startedAt === undefined) {
        startedAt = now
        ghostStartedAt.current.set(ghost.id, now)
      }

      const remaining = Math.max(0, 1 - (now - startedAt) / (DEATH_FLARE_MS / 1000))

      towerColour(mesh.color, ghost.type, 0, remaining, now * CRITICAL_PULSE_HZ)
      mesh.scale.setScalar(remaining)
    }
  })

  return (
    <>
      {TOWER_TYPE_IDS.map((type) => {
        const live = towers.filter((tower) => tower.type === type)
        const dying = ghosts.filter((ghost) => ghost.type === type)
        if (live.length === 0 && dying.length === 0) return null

        const height = towerHeight(type)

        // One instanced draw call per type, shared geometry and material, with
        // ghosts riding in the same group so a death costs no extra call.
        return (
          <Instances key={type} limit={128} castShadow>
            <cylinderGeometry args={[TOWER_RADIUS_TOP, TOWER_RADIUS_BOTTOM, height, TOWER_SEGMENTS]} />
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
                color={TOWER_COLOURS[type]}
                position={[
                  fileToWorldX(board, tower.square.file),
                  height / 2,
                  rankToWorldZ(board, tower.square.rank),
                ]}
              />
            ))}

            {dying.map((ghost) => (
              <Instance
                // ghost.meshKey (namespaced in towerDiff.ts) so this can never
                // collide with a live Tower's key. Tower ids restart at 1 after
                // reset(), and a ghost outlives its Tower by up to
                // DEATH_FLARE_MS, so a fresh `tower-1` and a dying `tower-1`
                // can coexist for a moment — sharing one key would apply the
                // ghost's shrinking scale to the live Tower and evict it from
                // `meshes`.
                key={ghost.meshKey}
                // This ref callback is not unmount-only: drei's Instance calls
                // useImperativeHandle(ref, () => group.current, []), and React
                // appends `ref` itself to that dependency array. Since this is
                // a fresh inline closure every render, the effect's deps
                // change on every render of Towers, not just when this ghost
                // mounts or unmounts — so it detaches and reattaches
                // (`ref(null)` then `ref(mesh)`) on every render this
                // component happens to do while the ghost is still alive.
                // Deleting from `meshes` here is safe because re-setting it a
                // moment later is idempotent, but `ghostStartedAt` must NOT be
                // touched here: clearing it mid-life would reset the flare's
                // start time on the very next frame, snapping `remaining`
                // back to 1 repeatedly instead of letting it shrink. That
                // cleanup is handled entirely by the pruning effect above,
                // which reconciles `ghostStartedAt` against `ghosts` after
                // every commit — never from a ref callback that can fire
                // mid-life like this one.
                ref={(mesh: PositionMesh | null) => {
                  if (mesh) meshes.current.set(ghost.meshKey, mesh)
                  else meshes.current.delete(ghost.meshKey)
                }}
                color={TOWER_COLOURS[type]}
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
