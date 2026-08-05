import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { allSquares, commandFor, findCard, squareKey, type BoardSpec, type PlayTarget } from '../game'
import * as simulation from '../state/simulation'
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

        const { selectedCardId, playMode, setSelectedCardId } = useUiStore.getState()
        if (!selectedCardId) return

        const square = {
          file: worldXToFile(board, event.point.x),
          rank: worldZToRank(board, event.point.z),
        }

        // Live state, not the published snapshot: a click must act on the board
        // as it is now, not as it was at the last structural publish.
        const state = simulation.getState()
        const card = findCard(state.deck, selectedCardId)
        if (!card) return

        const clickedTower = state.towers.find(
          (tower) => tower.square.file === square.file && tower.square.rank === square.rank,
        )

        // Echo is the only play needing two board targets: a source Tower to
        // Echo, then a square to build the copy on. Until a source is picked,
        // clicking a Tower with a Queen selected picks it rather than
        // attempting a play — that two-click sequencing is inherent to Echo's
        // UX and lives here; which Command the resulting target produces does
        // not, and comes from `commandFor`.
        const { echoSourceTowerId, setEchoSourceTowerId } = useUiStore.getState()

        if (playMode === 'build' && card.kind === 'standard' && card.rank === 'Q' && !echoSourceTowerId) {
          if (clickedTower) setEchoSourceTowerId(clickedTower.id)
          return
        }

        const target: PlayTarget =
          playMode === 'build' && echoSourceTowerId
            ? { kind: 'echo', sourceTowerId: echoSourceTowerId, square }
            : clickedTower
              ? { kind: 'tower', towerId: clickedTower.id }
              : { kind: 'square', square }

        const command = commandFor(card, playMode, target)
        if (!command) return

        // `dispatch` reports whether the play actually landed. A refusal (an
        // occupied square, the Core square, an Echo source Tower that died
        // between the two clicks, ...) must not clear the selection — the
        // Card was not consumed, so the player should not have to re-pick it.
        if (!dispatch(command)) return

        if (command.kind === 'echoTower') setEchoSourceTowerId(null)
        setSelectedCardId(null)
      }}
    >
      <planeGeometry args={[board.files * SQUARE_SIZE, board.ranks * SQUARE_SIZE]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
