import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three'
import type { BoardSpec, PieceTier } from '../game'
import { getState } from '../state/simulation'
import { useGameStore } from '../state/store'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'
import { BUFF_RING_COLOUR } from './pieceColours'
import { REST_Y, usePieceModels } from './pieceModels'
import { PROMOTION_POP_MS, promotionPopLift, promotionPopScale } from './promotionPop'
import { TIER_COLOURS } from './tierColours'
import { createCloakTracker, cloakAgeMs, cloakOpacity } from './cloakFlicker'

/**
 * How long the visual hop takes. Deliberately much shorter than a piece's move
 * interval, so a piece hops crisply and then waits — reading as a chess move
 * rather than a creep sliding along a path.
 */
const HOP_ANIMATION_MS = 220
const HOP_ARC = 0.4

/**
 * The King's radius ring sits at the BOTTOM of the flat-overlay ladder —
 * lowest renderOrder, so every interactive overlay paints over it — and is
 * the one overlay that is always present while its King lives. Ladder,
 * lowest first: this ring (0), TowerCoverage's amber footprint (1),
 * CoveragePreview's teal box (2) and illegal marker (3), SelectionMarker (4),
 * FirePulses (5). TowerCoverage.tsx carries the reasoning.
 */
const KING_RADIUS_RENDER_ORDER = 0
/** Height band of the King's radius ring, clear of the buff ring (0.02) and CoveragePreview's box (0.03+). */
const KING_RADIUS_Y = 0.026

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
    // The King's radius: a faint ring wider than the buff ring, at its own
    // height band so it is coplanar with nothing, and the lowest renderOrder
    // rung so it never covers an interactive overlay.
    const radiusRing = new RingGeometry(SQUARE_SIZE * 0.44, SQUARE_SIZE * 0.52, 32)
    const radiusMaterial = new MeshBasicMaterial({
      color: BUFF_RING_COLOUR,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
    const byTier = new Map<PieceTier, Material>()

    for (const [tier, colour] of Object.entries(TIER_COLOURS)) {
      byTier.set(tier as PieceTier, new MeshStandardMaterial({ color: colour, flatShading: true }))
    }

    return { byTier, ring, ringMaterial, radiusRing, radiusMaterial }
  }, [])

  useEffect(
    () => () => {
      // The model geometries are owned by pieceModels.ts and shared with
      // PieceExits.tsx, so dispose only what this component created.
      for (const material of resources.byTier.values()) material.dispose()
      resources.ring.dispose()
      resources.ringMaterial.dispose()
      resources.radiusRing.dispose()
      resources.radiusMaterial.dispose()
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
            tier={piece.tier}
            board={board}
            geometry={geometry}
            material={material}
            ringGeometry={resources.ring}
            ringMaterial={resources.ringMaterial}
            radiusGeometry={resources.radiusRing}
            radiusMaterial={resources.radiusMaterial}
          />
        )
      })}
    </>
  )
}

function PieceMesh({
  pieceId,
  promoted,
  tier,
  board,
  geometry,
  material,
  ringGeometry,
  ringMaterial,
  radiusGeometry,
  radiusMaterial,
}: {
  pieceId: string
  promoted: boolean
  tier: PieceTier
  board: BoardSpec
  geometry: BufferGeometry
  material: Material
  ringGeometry: BufferGeometry
  ringMaterial: Material
  radiusGeometry: BufferGeometry
  radiusMaterial: Material
}) {
  const ref = useRef<Mesh>(null)
  const ringRef = useRef<Mesh>(null)
  const radiusRef = useRef<Mesh>(null)
  const firstSeenAt = useRef(-1)
  const cloakTracker = useRef(createCloakTracker())

  // Opacity is per-material, and materials are shared per tier — so only the
  // Black tier, the one that cloak-flickers, gets a per-Piece clone. The clone
  // is transparent so the opacity writes render; green/yellow/red keep the
  // shared material. Disposed on unmount alongside the shared ones.
  const meshMaterial = useMemo(() => {
    if (tier !== 'black') return material
    const clone = material.clone()
    clone.transparent = true
    return clone
  }, [tier, material])

  // The frame loop writes opacity through `meshMaterialRef.current` rather than
  // `meshMaterial` directly: `react-hooks/immutability` treats any value that
  // flowed through a hook as immutable, but recognises a write to a ref's
  // `.current` — the same escape PieceExits.tsx uses for the Core flash. Tier
  // and `material` are stable for a mounted PieceMesh, so `meshMaterial` never
  // changes after mount and the ref is initialised once.
  const meshMaterialRef = useRef(meshMaterial)

  useEffect(
    () => () => {
      if (meshMaterial !== material) meshMaterial.dispose()
    },
    [meshMaterial, material],
  )

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
    const healthFraction = piece.health / piece.maxHealth
    const scale = (0.55 + healthFraction * 0.45) * pop
    const flashAgeMs = cloakAgeMs(
      cloakTracker.current,
      state.recentMisses,
      pieceId,
      state.roundNumber,
      now * 1000,
    )
    if (meshMaterialRef.current !== material) {
      meshMaterialRef.current.opacity = cloakOpacity(flashAgeMs)
    }
    mesh.scale.set(scale, scale, scale)

    // Toggling `visible` rather than mounting conditionally — mounting would
    // recompile the material. No state is set here.
    //
    // The buff is PERMANENT once latched, so the ring shows whenever the Piece
    // carries a stack — including the gap between rounds, and after the King
    // that granted it is long gone. (The old per-tick positional aura had to
    // gate on `inProgress` because a stranded flag would otherwise linger over
    // a dead King; a latched stack is the feature, not a stale read.) Scale
    // grows with the stack count so intensity reads as strength.
    const ring = ringRef.current
    if (ring) {
      ring.visible = piece.kingAuraStacks > 0
      if (ring.visible) {
        const ringScale = 1 + 0.1 * (piece.kingAuraStacks - 1)
        ring.scale.set(ringScale, ringScale, ringScale)
        ring.position.set(mesh.position.x, 0.02, mesh.position.z)
      }
    }

    // The King's radius ring: faint, always on while the King lives, toggled
    // like the buff ring. Its own height band and renderOrder rung keep it
    // ordered against the other flat overlays.
    const radius = radiusRef.current
    if (radius) {
      radius.visible = piece.typeId === 'king'
      if (radius.visible) {
        radius.position.set(mesh.position.x, KING_RADIUS_Y, mesh.position.z)
      }
    }
  })

  return (
    <>
      <mesh ref={ref} geometry={geometry} material={meshMaterial} castShadow />
      <mesh
        ref={ringRef}
        geometry={ringGeometry}
        material={ringMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
      <mesh
        ref={radiusRef}
        geometry={radiusGeometry}
        material={radiusMaterial}
        renderOrder={KING_RADIUS_RENDER_ORDER}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={false}
      />
    </>
  )
}
