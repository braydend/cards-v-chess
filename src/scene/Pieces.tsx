import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import { pieceType } from '../data/pieceTypes'
import type { BoardSpec, PieceTypeId } from '../game'
import { getState } from '../state/simulation'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { PIECE_COLOURS } from './pieceColours'

const GEOMETRY_BY_TYPE: Record<PieceTypeId, () => BufferGeometry> = {
  pawn: () => new ConeGeometry(0.28, 0.55, 6),
  knight: () => new BoxGeometry(0.4, 0.6, 0.3),
  bishop: () => new ConeGeometry(0.2, 0.8, 6),
  rook: () => new CylinderGeometry(0.32, 0.32, 0.45, 6),
  queen: () => new ConeGeometry(0.3, 0.9, 8),
  king: () => new CylinderGeometry(0.26, 0.3, 0.85, 8),
}

/**
 * Where each silhouette's origin sits so the Piece rests on the board rather
 * than in it — half its height, rounded to the nearest hundredth. The Pawn is
 * the exception: it keeps the existing hand-tuned 0.35 (not a half-height
 * value at all) so it looks unchanged from before this task.
 */
const REST_Y_BY_TYPE: Record<PieceTypeId, number> = {
  pawn: 0.35,
  knight: 0.3,
  bishop: 0.4,
  rook: 0.23,
  queen: 0.45,
  king: 0.43,
}

const PIECE_TYPE_IDS = Object.keys(GEOMETRY_BY_TYPE) as PieceTypeId[]

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
    const ringMaterial = new MeshStandardMaterial({ color: '#f1c40f', emissive: '#f1c40f' })
    const byType = new Map<PieceTypeId, { geometry: BufferGeometry; material: Material }>()

    for (const typeId of PIECE_TYPE_IDS) {
      byType.set(typeId, {
        geometry: GEOMETRY_BY_TYPE[typeId](),
        material: new MeshStandardMaterial({ color: PIECE_COLOURS[typeId], flatShading: true }),
      })
    }

    return { byType, ring, ringMaterial }
  }, [])

  useEffect(
    () => () => {
      for (const { geometry, material } of resources.byType.values()) {
        geometry.dispose()
        material.dispose()
      }
      resources.ring.dispose()
      resources.ringMaterial.dispose()
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
            board={board}
            geometry={shared.geometry}
            material={shared.material}
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
  typeId,
  board,
  geometry,
  material,
  ringGeometry,
  ringMaterial,
}: {
  pieceId: string
  typeId: PieceTypeId
  board: BoardSpec
  geometry: BufferGeometry
  material: Material
  ringGeometry: BufferGeometry
  ringMaterial: Material
}) {
  const ref = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)

  // Reads live simulation state and mutates the mesh transform directly. No
  // state is set here, and nothing is allocated — the sanctioned way to do
  // per-frame work in R3F.
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return

    const state = getState()
    const piece = state.pieces.find((candidate) => candidate.id === pieceId)
    if (!piece) return

    const progress = Math.min(1, piece.moveCooldownMs / HOP_ANIMATION_MS)

    const fromX = fileToWorldX(board, piece.prevSquare.file)
    const fromZ = rankToWorldZ(board, piece.prevSquare.rank)
    const toX = fileToWorldX(board, piece.square.file)
    const toZ = rankToWorldZ(board, piece.square.rank)

    const restY = REST_Y_BY_TYPE[typeId]

    mesh.position.set(
      fromX + (toX - fromX) * progress,
      restY + Math.sin(progress * Math.PI) * HOP_ARC,
      fromZ + (toZ - fromZ) * progress,
    )

    // Shrink as it takes damage, so Tower fire has visible effect before the
    // Piece dies. Mutation only — no state, no allocation.
    const healthFraction = piece.health / pieceType(piece.typeId).maxHealth
    const scale = 0.55 + healthFraction * 0.45
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
