import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { allSquares, squareKey, type BoardSpec } from '../game'
import { dispatch } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ, worldXToFile, worldZToRank } from './coords'
import { CoveragePreview } from './CoveragePreview'

const LIGHT_SQUARE = '#e6e0cf'
const DARK_SQUARE = '#3c4655'

/**
 * The board squares, drawn as instances of a single geometry and material.
 * Instancing repeated meshes is a standing rule in CLAUDE.md; 64 separate
 * meshes would be 64 draw calls for no reason.
 */
export function Board({ board }: { board: BoardSpec }) {
  const squares = useMemo(() => allSquares(board), [board])

  return (
    <>
      <Instances limit={squares.length} receiveShadow>
        <boxGeometry args={[SQUARE_SIZE * 0.96, 0.12, SQUARE_SIZE * 0.96]} />
        <meshStandardMaterial flatShading />
        {squares.map((square) => (
          <Instance
            key={squareKey(square)}
            position={[fileToWorldX(board, square.file), -0.06, rankToWorldZ(board, square.rank)]}
            color={(square.file + square.rank) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE}
          />
        ))}
      </Instances>

      <CoveragePreview board={board} />
      <PlacementSurface board={board} />
    </>
  )
}

/**
 * A single transparent plane covering the board, used to turn pointer position
 * into a square. One raycast target instead of per-instance hit testing.
 *
 * Opacity 0 rather than `visible={false}` — three.js skips invisible objects
 * during raycasting, so an invisible mesh would never receive the pointer.
 */
function PlacementSurface({ board }: { board: BoardSpec }) {
  const setHoveredSquare = useUiStore((store) => store.setHoveredSquare)

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.02, 0]}
      onPointerMove={(event) => {
        const file = worldXToFile(board, event.point.x)
        const rank = worldZToRank(board, event.point.z)

        // CLAUDE.md forbids setState in fast handlers. Pointer moves fire far
        // more often than the square changes, so only publish on an actual
        // square change — 64 possible updates instead of one per mouse event.
        const current = useUiStore.getState().hoveredSquare
        if (current?.file === file && current?.rank === rank) return

        setHoveredSquare({ file, rank })
      }}
      onPointerOut={() => setHoveredSquare(null)}
      onClick={(event) => {
        event.stopPropagation()
        dispatch({
          kind: 'placeTower',
          square: {
            file: worldXToFile(board, event.point.x),
            rank: worldZToRank(board, event.point.z),
          },
          cardRank: useUiStore.getState().selectedRank,
        })
      }}
    >
      <planeGeometry args={[board.files * SQUARE_SIZE, board.ranks * SQUARE_SIZE]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
