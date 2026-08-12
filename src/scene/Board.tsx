import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { allSquares, findCard, squareKey, type BoardSpec } from '../game'
import { getState } from '../state/simulation'
import { dispatch } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { COARSE_POINTER_QUERY, useMediaQuery } from '../ui/useMediaQuery'
import { resolveBoardAction } from './boardClick'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ, worldXToFile, worldZToRank } from './coords'
import { CoveragePreview } from './CoveragePreview'
import { FirePulses } from './FirePulses'
import { SelectionMarker } from './SelectionMarker'
import { StagingRank } from './StagingRank'
import { TowerCoverage } from './TowerCoverage'

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
      {/*
       * `key` is load-bearing, not decoration — do not remove it.
       *
       * drei's `Instances` allocates its instanceMatrix and instanceColor
       * buffers once, in a `useState` initialiser sized from `limit`. A later
       * `limit` change is read by its frame loop (which sets `mesh.count`) but
       * never resizes those buffers. So an Ace taking the board from 8x8 to 8x9
       * left 64 slots backing a draw of 72: three.js asked WebGL to upload
       * 72*16 floats into a 64*16 array, every upload failed with
       * `INVALID_VALUE: bufferSubData: srcOffset + length too large`, and the
       * eight unwritten instances drew as garbage geometry — the wedge across
       * the scene that was long misattributed to the shadow frustum.
       *
       * Keying on the square count remounts `Instances` so the buffers are
       * reallocated at the new size. A remount per Ace is cheap; it happens
       * once per board growth, never per frame. A fixed generous `limit` was
       * the alternative and is rejected: board growth is uncapped, so that just
       * moves the same failure further out — and CLAUDE.md forbids deriving a
       * board extent from a constant.
       */}
      <Instances key={squares.length} limit={squares.length} receiveShadow>
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

      {/* Above the overlay block on purpose: the ledge is a solid, depth-writing
          box like the board squares themselves, not one of the flat overlays the
          comment below governs. Putting it in that list would make that comment
          false about its own first entry. */}
      <StagingRank board={board} />

      {/* Every flat overlay below writes no depth, so neither JSX order nor the
          height each of them sits at decides what draws on top — each declares an
          explicit `renderOrder`, lowest first in the order listed here. See
          `TowerCoverage.tsx` for why heights cannot do this job. */}
      <TowerCoverage board={board} />
      <CoveragePreview board={board} />
      <SelectionMarker board={board} />
      <FirePulses board={board} />
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
  const coarse = useMediaQuery(COARSE_POINTER_QUERY)

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

        const square = {
          file: worldXToFile(board, event.point.x),
          rank: worldZToRank(board, event.point.z),
        }

        const {
          selectedCardIds,
          clearSelection,
          selectedTowerId,
          setSelectedTowerId,
          previewedSquare,
          setPreviewedSquare,
        } = useUiStore.getState()

        // Live state, not the published snapshot: a click must act on the board
        // as it is now, not as it was at the last structural publish. Reading on
        // demand also keeps Board out of the snapshot subscription — subscribing
        // would re-render all 64 square instances on every Tower hit.
        const state = getState()

        // Only a lone selected Card reaches the board — a J or Q's Tower
        // target. A multi-card hand is committed from the Deck, not via the
        // board, so a bigger selection carries no board action.
        const selectedCardId = selectedCardIds[0]
        const card =
          selectedCardIds.length === 1 && selectedCardId !== undefined
            ? (findCard(state.deck, selectedCardId) ?? null)
            : null

        // Every branch below is decided by `resolveBoardAction`, which is pure
        // and unit-tested. Nothing but plumbing lives in this handler.
        const action = resolveBoardAction({
          square,
          towers: state.towers,
          selectedTowerId,
          card,
          pendingTower: state.pendingTower,
          pointer: coarse ? 'coarse' : 'fine',
          previewedSquare,
        })

        if (action.kind === 'select') {
          setSelectedTowerId(action.towerId)
          return
        }

        if (action.kind === 'deselect') {
          setSelectedTowerId(null)
          return
        }

        // On touch the first tap commits the square for preview rather than
        // playing. The next tap on the same square falls through to the play
        // branches below — `resolveBoardAction` gates the preview on a
        // different square.
        if (action.kind === 'preview') {
          setPreviewedSquare(action.square)
          return
        }

        // `dispatch` reports whether the play actually landed. A refusal (an
        // occupied square, the Core square, ...) must not clear the selection —
        // the Card was not consumed, so the player should not have to re-pick it.
        if (!dispatch(action.command)) return

        clearSelection()
        setPreviewedSquare(null)
      }}
    >
      <planeGeometry args={[board.files * SQUARE_SIZE, board.ranks * SQUARE_SIZE]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
