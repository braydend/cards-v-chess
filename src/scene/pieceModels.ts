import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type BufferGeometry, type Mesh, type Object3D } from 'three'
import type { PieceTypeId } from '../game'

/**
 * ATTRIBUTION — CC-BY 4.0.
 *
 * The Chess Piece models are from "Chess Pieces" by aitordsgn
 * (https://sketchfab.com/aitordsgn), published on Sketchfab
 * (https://sketchfab.com/3d-models/chess-pieces-d2d7fec42d0a405d910b3ef751b30f38),
 * licensed under Creative Commons Attribution 4.0
 * (https://creativecommons.org/licenses/by/4.0/).
 *
 * The model archive lives in `public/models/chess_pieces/` alongside its
 * `license.txt`. The same credit appears in the HUD's Credits panel
 * (`src/ui/Credits.tsx`) and in `README.md`.
 */

/** Base-aware URL: dev serves at `/`, GitHub Pages at `/cards-v-chess/`. */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/chess_pieces/scene.gltf`

/** Every Piece type the game renders, in the type union's declared order. */
export const PIECE_TYPE_IDS: PieceTypeId[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king']

/** The model's top-level scene node name for each Piece type. */
const NODE_NAME_BY_TYPE: Record<PieceTypeId, string> = {
  pawn: 'Pawn',
  knight: 'Knight',
  bishop: 'Bishop',
  rook: 'Rook',
  queen: 'Queen',
  king: 'King',
}

/**
 * Knight, King, and Bishop stand on Z in the source model (their velvet base
 * disks lie in the xy-plane and their bodies run along +Z); the others already
 * stand on Y. These rotate −90° about X so every piece stands upright on the
 * board. Measured from the GLTF accessor bounds, not assumed.
 */
const ROTATE_ON_X: ReadonlySet<PieceTypeId> = new Set(['knight', 'king', 'bishop'])

/**
 * Uniform scale so the pieces fit 1-unit board squares. Placeholder for visual
 * review — see the design doc's open question; 0.65 is the fallback.
 */
const MODEL_SCALE = 0.75

/** Every piece's origin sits at its base after extraction, so all rest on the
 * board at the same height. */
export const REST_Y = 0

let cached: Record<PieceTypeId, BufferGeometry> | null = null

/**
 * The shared per-type geometries, one instance each, built once and cached for
 * the app's lifetime. `useLoader` suspends until the model is loaded, so
 * callers must be under a Suspense boundary (see GameScene).
 */
export function usePieceModels(): Record<PieceTypeId, BufferGeometry> {
  const gltf = useLoader(GLTFLoader, MODEL_URL)
  if (cached === null) {
    cached = {} as Record<PieceTypeId, BufferGeometry>
    for (const typeId of PIECE_TYPE_IDS) {
      cached[typeId] = extractPieceGeometry(gltf.scene, typeId)
    }
  }
  return cached
}

/**
 * Extract one Piece type from the loaded scene: merge its two parts (the
 * *_Plastic body and the *_Velvet base) into a single geometry, stand it on Y,
 * scale it, and translate so the base sits at y = 0. Pure over a three.js
 * scene, so it can be verified headlessly; `usePieceModels` is the only React
 * in this file.
 */
export function extractPieceGeometry(scene: Object3D, typeId: PieceTypeId): BufferGeometry {
  const node = scene.getObjectByName(NODE_NAME_BY_TYPE[typeId])
  if (!node) throw new Error(`No "${NODE_NAME_BY_TYPE[typeId]}" node in ${MODEL_URL}`)

  node.updateMatrixWorld(true)
  // The piece node's own matrix places it in the scene layout — a 100x scale,
  // an axis rotation, and a row offset, all baked into the FBX-to-glTF export.
  // We want the geometry in the piece node's LOCAL space, so invert its world
  // matrix and premultiply it into each part's world transform. That strips
  // everything above the piece node and leaves only each mesh's transform
  // relative to it (identity in this model), so the part lands in the natural
  // per-piece orientation measured from the accessor bounds.
  const worldToLocal = node.matrixWorld.clone().invert()

  const parts: BufferGeometry[] = []
  node.traverse((child) => {
    if (!(child as Mesh).isMesh) return
    const mesh = child as Mesh
    const part = mesh.geometry.clone()
    part.applyMatrix4(worldToLocal.clone().multiply(mesh.matrixWorld))
    parts.push(part)
  })

  const merged = mergeGeometries(parts)
  if (!merged) throw new Error(`Could not merge "${NODE_NAME_BY_TYPE[typeId]}" parts`)

  if (ROTATE_ON_X.has(typeId)) merged.rotateX(-Math.PI / 2)
  merged.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE)
  merged.computeBoundingBox()
  const minY = merged.boundingBox?.min.y ?? 0
  merged.translate(0, -minY, 0)

  return merged
}
