import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import { pieceType } from '../data/pieceTypes'
import type { BoardSpec, PieceTier } from '../game'
import { getState } from '../state/simulation'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { BUFF_RING_COLOUR } from './pieceColours'
import { REST_Y, usePieceModels } from './pieceModels'
import { PROMOTION_POP_MS, promotionPopLift, promotionPopScale } from './promotionPop'
import { TIER_COLOURS } from './tierColours'
import { createWhiffTracker, whiffAgeMs, whiffScale } from './whiff'

/**
 * How long the visual hop takes. Deliberately much shorter than a piece's move
 * interval, so a piece hops crisply and then waits — reading as a chess move
 * rather than a creep sliding along a path.
 */
const HOP_ANIMATION_MS = 220
const HOP_ARC = 0.4

export function Pieces({ board }: { board: BoardSpec }) {
  // Subscribes to the structural snapshot: re-renders when a piece spawns or
  // dies, not when one moves. Movement is handled by mutation below.
  const pieces = useGameStore((store) => store.snapshot.pieces)

  // The shared model geometries, one per type, cached module-wide. Suspends
  // until the GLTF is loaded — the `<Suspense>` in GameScene holds the board
  // up while it streams in.
  const models = usePieceModels()

  // One geometry per type (from `pieceModels`) and one material per tier,
  // shared across every instance of each, per CLAUDE.md. Built once, disposed
  // on unmount.
  const resources = useMemo(() => {
    const ring = new RingGeometry(0.34, 0.42, 16)
    const ringMaterial = new MeshStandardMaterial({ color: BUFF_RING_COLOUR, emissive: BUFF_RING_COLOUR })
    const byTier = new Map<PieceTier, Material>()

    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      byTier.set(tier as PieceTier, new MeshStandardMaterial({ color: colour, flatShading: true }))
    }

    return { byTier, ring, ringMaterial }
  }, [])

  useEffect(
    () => () => {
      // The model geometries are owned by pieceModels.ts and shared with
      // PieceExits.tsx, so dispose only what this component created.
      for (const material of resources.byTier.values()) material.dispose()
      resources.ring.dispose()
      resources.ringMaterial.dispose()
    },
    [resources],
  )

  return (
    <>
      {pieces.map((piece) => {
        const geometry = models[piece.typeId]
        const material = resources.byTier.get(piece.tier)
        if (!geometry || !material) return null

        return (
          <PieceMesh
            key={piece.id}
            pieceId={piece.id}
            promoted={piece.promoted}
            board={board}
            geometry={geometry}
            material={material}
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
          />
        )
      })}
    </>
  )
}

function PieceMesh({
  pieceId,
  promoted,
  board,
  geometry,
  material,
  ringGeometry,
  ringMaterial,
}: {
  pieceId: string
  promoted: boolean
  board: BoardSpec
  geometry: BufferGeometry
  material: Material
  ringGeometry: BufferGeometry
  ringMaterial: Material
}) {
  const ref = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)
  const firstSeenAt = useRef(-1)
  const whiffTracker = useRef(createWhiffTracker())

  // Reads live simulation state and mutates the mesh transform directly. No
  // state is set here, and nothing is allocated — the sanctioned way to do
  // per-frame work in R3F.
  useFrame((frame) => {
    const mesh = ref.current
    if (!mesh) return

    const state = getState()
    const piece = state.pieces.find((candidate) => candidate.id === pieceId)
    if (!piece) return

    const now = frame.clock.elapsedTime
    if (firstSeenAt.current < 0) firstSeenAt.current = now

    // A promoted Queen gets a fresh entity id, and `Pieces` keys each mesh on
    // `piece.id` — so this mesh's first frame IS the promotion, and no diff is
    // needed to spot it. An unpromoted Piece is handed a spent age, so both
    // helpers return neutral and cost nothing.
    const popAgeMs = promoted ? (now - firstSeenAt.current) * 1000 : PROMOTION_POP_MS
    const pop = promotionPopScale(popAgeMs)

    const progress = Math.min(1, piece.moveCooldownMs / HOP_ANIMATION_MS)

    const fromX = fileToWorldX(board, piece.prevSquare.file)
    const fromZ = rankToWorldZ(board, piece.prevSquare.rank)
    const toX = fileToWorldX(board, piece.square.file)
    const toZ = rankToWorldZ(board, piece.square.rank)

    const restY = REST_Y

    mesh.position.set(
      fromX + (toX - fromX) * progress,
      restY + Math.sin(progress * Math.PI) * HOP_ARC + promotionPopLift(popAgeMs),
      fromZ + (toZ - fromZ) * progress,
    )

    // Shrink as it takes damage, so Tower fire has visible effect before the
    // Piece dies. The promotion pop MULTIPLIES this rather than replacing it, so
    // a Queen shot during her pop still shrinks. Mutation only — no state, no
    // allocation.
    const healthFraction = piece.health / pieceType(piece.typeId).maxHealth
    const scale = (0.55 + healthFraction * 0.45) * pop
    const flashAgeMs = whiffAgeMs(
      whiffTracker.current,
      state.recentDodges,
      pieceId,
      state.roundNumber,
      now * 1000,
    )
    const whiff = whiffScale(flashAgeMs)
    mesh.scale.set(scale * whiff, scale * whiff, scale * whiff)

    // Toggling `visible` rather than mounting conditionally — mounting would
    // recompile the material. No state is set here.
    //
    // Also gated on `inProgress`: `tick` early-returns during the `gap`
    // phase, so a stranded Piece's `buffed` flag freezes at whatever it was
    // on the round's last tick. Without this, a Piece whose escorting King
    // died on that final tick would keep showing a ring for a King that no
    // longer exists, for the whole gap between rounds.
    const ring = ringRef.current
    if (ring) {
      ring.visible = state.phase === 'inProgress' && piece.buffed
      if (ring.visible) {
        ring.position.set(mesh.position.x, 0.02, mesh.position.z)
      }
    }
  })

  return (
    <>
      <mesh ref={ref} geometry={geometry} material={material} castShadow />
      <mesh
        ref={ringRef}
        geometry={ringGeometry}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
    </>
  )
}
