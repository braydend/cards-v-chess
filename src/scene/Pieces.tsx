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
import type { BoardSpec, PieceTier, PieceTypeId } from '../game'
import { getState } from '../state/simulation'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { BUFF_RING_COLOUR, PIECE_COLOURS } from './pieceColours'
import { GEOMETRY_BY_TYPE, PIECE_TYPE_IDS, REST_Y_BY_TYPE } from './pieceGeometry'
import { PROMOTION_POP_MS, promotionPopLift, promotionPopScale } from './promotionPop'
import { TIER_COLOURS } from './tierColours'

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

  // One geometry and one material per type, shared across every instance of it,
  // per CLAUDE.md. Built once, disposed on unmount.
  const resources = useMemo(() => {
    const ring = new RingGeometry(0.34, 0.42, 16)
    const ringMaterial = new MeshStandardMaterial({ color: BUFF_RING_COLOUR, emissive: BUFF_RING_COLOUR })
    const tierRingMaterials = new Map<keyof typeof TIER_COLOURS, Material>()
    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      tierRingMaterials.set(
        tier as keyof typeof TIER_COLOURS,
        new MeshStandardMaterial({ color: colour, emissive: colour }),
      )
    }
    const byType = new Map<PieceTypeId, { geometry: BufferGeometry; material: Material }>()

    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: GEOMETRY_BY_TYPE[typeId](),
        material: new MeshStandardMaterial({ color: PIECE_COLOURS[typeId], flatShading: true }),
      })
    }

    return { byType, ring, ringMaterial, tierRingMaterials }
  }, [])

  useEffect(
    () => () => {
      for (const { geometry, material } of resources.byType.values()) {
        geometry.dispose()
        material.dispose()
      }
      resources.ring.dispose()
      resources.ringMaterial.dispose()
      for (const material of resources.tierRingMaterials.values()) material.dispose()
    },
    [resources],
  )

  return (
    <>
      {pieces.map((piece) => {
        const shared = resources.byType.get(piece.typeId)
        if (!shared) return null

        return (
          <PieceMesh
            key={piece.id}
            pieceId={piece.id}
            typeId={piece.typeId}
            tier={piece.tier}
            promoted={piece.promoted}
            board={board}
            geometry={shared.geometry}
            material={shared.material}
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
            tierRingMaterials={resources.tierRingMaterials}
          />
        )
      })}
    </>
  )
}

function PieceMesh({
  pieceId,
  typeId,
  tier,
  promoted,
  board,
  geometry,
  material,
  ringGeometry,
  ringMaterial,
  tierRingMaterials,
}: {
  pieceId: string
  typeId: PieceTypeId
  tier: PieceTier
  promoted: boolean
  board: BoardSpec
  geometry: BufferGeometry
  material: Material
  ringGeometry: BufferGeometry
  ringMaterial: Material
  tierRingMaterials: Map<keyof typeof TIER_COLOURS, Material>
}) {
  const ref = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)
  const tierRingRef = useRef<Mesh>(null)
  const firstSeenAt = useRef(-1)

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

    const restY = REST_Y_BY_TYPE[typeId]

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
    mesh.scale.set(scale, scale, scale)

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

    // The tier ring follows the mesh and stays visible whenever the Piece is
    // alive — unlike the buff ring it does not depend on `phase`, because the
    // tier is the Piece's own identity, not a transient aura.
    const tierRing = tierRingRef.current
    if (tierRing) {
      tierRing.visible = true
      tierRing.position.set(mesh.position.x, 0.01, mesh.position.z)
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
      {tier !== 'green' && (
        <mesh
          ref={tierRingRef}
          geometry={ringGeometry}
          material={tierRingMaterials.get(tier)}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        />
      )}
    </>
  )
}
