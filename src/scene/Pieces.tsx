import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ConeGeometry, MeshStandardMaterial, type BufferGeometry, type Material, type Mesh } from 'three'
import { pieceType } from '../data/pieceTypes'
import type { BoardSpec } from '../game'
import { getState } from '../state/simulation'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'

const CHESS_COLOUR = '#c0392b'
const PIECE_REST_Y = 0.35

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

  // One geometry and one material for every piece, per CLAUDE.md.
  const geometry = useMemo(() => new ConeGeometry(0.28, 0.55, 6), [])
  const material = useMemo(
    () => new MeshStandardMaterial({ color: CHESS_COLOUR, flatShading: true }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return (
    <>
      {pieces.map((piece) => (
        <PieceMesh
          key={piece.id}
          pieceId={piece.id}
          board={board}
          geometry={geometry}
          material={material}
        />
      ))}
    </>
  )
}

function PieceMesh({
  pieceId,
  board,
  geometry,
  material,
}: {
  pieceId: string
  board: BoardSpec
  geometry: BufferGeometry
  material: Material
}) {
  const ref = useRef<Mesh>(null)

  // Reads live simulation state and mutates the mesh transform directly. No
  // state is set here, and nothing is allocated — the sanctioned way to do
  // per-frame work in R3F.
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return

    const piece = getState().pieces.find((candidate) => candidate.id === pieceId)
    if (!piece) return

    const progress = Math.min(1, piece.moveCooldownMs / HOP_ANIMATION_MS)

    const fromX = fileToWorldX(board, piece.prevSquare.file)
    const fromZ = rankToWorldZ(board, piece.prevSquare.rank)
    const toX = fileToWorldX(board, piece.square.file)
    const toZ = rankToWorldZ(board, piece.square.rank)

    mesh.position.set(
      fromX + (toX - fromX) * progress,
      PIECE_REST_Y + Math.sin(progress * Math.PI) * HOP_ARC,
      fromZ + (toZ - fromZ) * progress,
    )

    // Shrink as it takes damage, so Tower fire has visible effect before the
    // Piece dies. Mutation only — no state, no allocation.
    const healthFraction = piece.health / pieceType(piece.typeId).maxHealth
    const scale = 0.55 + healthFraction * 0.45
    mesh.scale.set(scale, scale, scale)
  })

  return <mesh ref={ref} geometry={geometry} material={material} castShadow />
}
