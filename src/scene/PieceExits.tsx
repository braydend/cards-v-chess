import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { MeshStandardMaterial, type BufferGeometry, type Material, type Mesh } from 'three'
import type { BoardSpec, PieceTypeId, Square } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import type { CoreFlash } from './coreFlash'
import { PIECE_COLOURS } from './pieceColours'
import { PIECE_TYPE_IDS, REST_Y, usePieceModels } from './pieceModels'
import {
  GHOST_EXPIRY_SLACK_MS,
  GHOST_LIFETIME_MS,
  createExitTracker,
  diffPieceExits,
  ghostScale,
  hasLanded,
  lungeProgress,
  type PieceGhost,
} from './pieceExit'

/**
 * A Piece's exit, held on screen briefly after it leaves `GameState` — a leak
 * lunging into the Core, a Tower kill bursting where it stood.
 *
 * Almost every decision lives in `pieceExit.ts` and is unit-tested; this is
 * mostly plumbing. Three small decisions live here instead, each documented
 * where it happens: the once-only `stamped` latch on the Core flash below,
 * the expiry-timer scheduling a few lines down, and the clear-and-cancel
 * response to `runReset`. Separate from `Pieces.tsx` on purpose: these have a
 * different lifetime, a different source (the store subscription, not
 * `getState()`), and their own React state and timers.
 *
 * Promotions are absent by design. A promoted Pawn is silenced by its exit
 * record, and the arriving Queen pops in `Pieces.tsx`, on the mesh that already
 * exists for her.
 */
export function PieceExits({
  board,
  flash,
}: {
  board: BoardSpec
  flash: RefObject<CoreFlash>
}) {
  const coreSquare = useGameStore((store) => store.snapshot.core.square)
  const [ghosts, setGhosts] = useState<readonly PieceGhost[]>([])
  const tracker = useRef(createExitTracker())
  const expiryTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  // One geometry and one material per type, shared across every ghost of it,
  // per CLAUDE.md. Ghosts fade by scale rather than opacity, which is what lets
  // them share an opaque material at all — see `ghostScale`.
  const models = usePieceModels()
  const resources = useMemo(() => {
    const byType = new Map<PieceTypeId, { geometry: BufferGeometry; material: Material }>()

    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: models[typeId],
        material: new MeshStandardMaterial({
          color: PIECE_COLOURS[typeId],
          emissive: PIECE_COLOURS[typeId],
          emissiveIntensity: 0.6,
          flatShading: true,
        }),
      })
    }

    return byType
  }, [models])

  useEffect(
    () => () => {
      // The model geometries are owned by pieceModels.ts and shared with
      // Pieces.tsx, so dispose only what this component created.
      for (const { material } of resources.values()) material.dispose()
    },
    [resources],
  )

  useEffect(() => {
    // Captured once so the cleanup below reads the same Set this effect
    // populated, which is what the lint rule for refs-in-cleanup wants.
    const timers = expiryTimers.current
    const exits = tracker.current

    // Seed from whatever is already on the board. The returned list is
    // necessarily empty — no Piece can have left a map that was empty a moment
    // ago — which is why no state update belongs here.
    diffPieceExits(exits, useGameStore.getState().snapshot)

    const unsubscribe = useGameStore.subscribe((store) => {
      const { ghosts: fresh, runReset } = diffPieceExits(exits, store.snapshot)

      // `reset()` clears the whole board at once. Drop any ghost still riding
      // out its burst rather than leaving a previous run's Piece on screen, and
      // cancel their timers so none later filters an already-cleared array.
      if (runReset) {
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
        setGhosts([])
      }

      if (fresh.length === 0) return

      setGhosts((current) => [...current, ...fresh])

      // Each ghost expires on its own timer rather than a shared batch one. A
      // batch timer restarts on every death, so sustained fire would keep an
      // already-invisible ghost mounted until a quiet gap. Filtering by object
      // identity rather than id is deliberate: a `PieceGhost` is a unique object
      // that survives the spread above untouched, so identity can never match a
      // Piece id that a later `reset()` happens to reuse.
      for (const ghost of fresh) {
        // + GHOST_EXPIRY_SLACK_MS: this timer starts now, on the publish, but
        // the ghost's own animation clock does not start until its first
        // `useFrame` tick — up to a frame later. See the constant's doc
        // comment in pieceExit.ts.
        const timer = setTimeout(() => {
          timers.delete(timer)
          setGhosts((current) => current.filter((candidate) => candidate !== ghost))
        }, GHOST_LIFETIME_MS[ghost.reason] + GHOST_EXPIRY_SLACK_MS)
        timers.add(timer)
      }
    })

    return () => {
      unsubscribe()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  return (
    <>
      {ghosts.map((ghost) => {
        const shared = resources.get(ghost.typeId)
        if (!shared) return null

        return (
          <GhostMesh
            key={ghost.meshKey}
            ghost={ghost}
            board={board}
            coreSquare={coreSquare}
            geometry={shared.geometry}
            material={shared.material}
            flash={flash}
          />
        )
      })}
    </>
  )
}

function GhostMesh({
  ghost,
  board,
  coreSquare,
  geometry,
  material,
  // Destructured to `flashRef`, not `flash`: `react-hooks/immutability` (part
  // of `recommended-latest`) cannot see that this prop is a ref forwarded from
  // `GameScene`, so it flags the write below as a prop mutation. It recognises
  // a ref by a variable ending in "Ref" — the rule's own error message
  // suggests exactly this rename — which is why this is a local rename rather
  // than a suppression: the prop name and type stay exactly as specified.
  flash: flashRef,
}: {
  ghost: PieceGhost
  board: BoardSpec
  coreSquare: Square
  geometry: BufferGeometry
  material: Material
  flash: RefObject<CoreFlash>
}) {
  const ref = useRef<Mesh>(null)
  const startedAt = useRef(-1)
  const stamped = useRef(false)

  // Mutates the mesh transform directly. No state is set here and nothing is
  // allocated — the sanctioned way to do per-frame work in R3F.
  useFrame((state) => {
    const mesh = ref.current
    if (!mesh) return

    const now = state.clock.elapsedTime
    // The mesh's own mount is the start of its burst, so nothing needs to carry
    // a timestamp through React.
    if (startedAt.current < 0) startedAt.current = now
    const ageMs = (now - startedAt.current) * 1000

    const restY = REST_Y
    const fromX = fileToWorldX(board, ghost.file)
    const fromZ = rankToWorldZ(board, ghost.boardRank)

    if (ghost.reason === 'leak') {
      // No `sin` arc, unlike a hop: a leak is a strike, and `lungeProgress`
      // accelerates into it.
      const progress = lungeProgress(ageMs)
      const toX = fileToWorldX(board, coreSquare.file)
      const toZ = rankToWorldZ(board, coreSquare.rank)

      mesh.position.set(fromX + (toX - fromX) * progress, restY, fromZ + (toZ - fromZ) * progress)

      // Stamped once, at contact — not when the engine resolved the leak, which
      // was a whole lunge earlier. `stamped` is what keeps a 200ms flash from
      // being re-stamped every frame after impact.
      if (!stamped.current && hasLanded(ageMs)) {
        stamped.current = true
        flashRef.current.startedAt = now
      }
    } else {
      mesh.position.set(fromX, restY, fromZ)
    }

    const scale = ghostScale(ghost.reason, ageMs)
    mesh.scale.set(scale, scale, scale)
  })

  return <mesh ref={ref} geometry={geometry} material={material} castShadow />
}
