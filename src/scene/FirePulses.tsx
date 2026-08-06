import { Instance, Instances, type PositionMesh } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import { AdditiveBlending, type Group } from 'three'
import { allSquares, squareKey, type BoardSpec } from '../game'
import { getState } from '../state/simulation'
import { accumulateBoardFlash, isFlashLive, type BoardFlash } from './boardFlash'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'
import { accumulatePulses, detectShots, isPulseLive, type FirePulse } from './firePulse'

/**
 * Above the coverage preview, whose box top sits at 0.05, and the selection
 * marker at 0.06. Nothing in that stack writes depth, so there is no z-fight
 * against the board — but coplanar transparent quads sort unstably by camera
 * distance, so the pulse takes its own height and an explicit `renderOrder`
 * rather than relying on that sort. The box is 0.01 tall, so it spans
 * 0.065–0.075 and stays clear of the marker entirely.
 *
 * Drawing over a hovered build preview is fine: additive on teal lightens it,
 * for a fraction of a second.
 *
 * This file had the only correct instinct in the stack, and the rest of the stack
 * has since been brought up to it: every flat overlay now states its position
 * explicitly — `TowerCoverage`'s amber footprint (1), `CoveragePreview`'s teal
 * box (2) and illegal marker (3), `SelectionMarker`'s ring (4), this (5). The
 * value here moved from 1 to 5 to stay topmost as the others were numbered; it
 * has to remain the highest, and every value distinct, because a tie drops back
 * to the camera-dependent sort. `TowerCoverage.tsx` carries the reasoning, and
 * the measurement that heights cannot order instanced overlays at all.
 */
const PULSE_Y = 0.07
const PULSE_HEIGHT = 0.01
const RENDER_ORDER = 5

/**
 * A Tower's shots, as a ring of lit squares expanding through its firing
 * geometry — so the player can read where a Tower reaches and how often it
 * fires, neither of which a silent Tower shows.
 *
 * Every decision lives in `firePulse.ts` and is unit-tested; this is plumbing.
 * It subscribes to nothing: `board` arrives as a prop and everything else is
 * read live from `getState()` in the frame loop, the same way `Pieces.tsx`
 * interpolates. Nothing here reaches React, so a shot costs no render.
 *
 * The layer is a fixed instance per board square, mounted once and never
 * remounted for a shot. Additive blending is what makes that work: black
 * contributes nothing, so an unlit square needs no special case, and
 * overlapping pulses sum into something brighter for free. The alternative —
 * an instance per lit square per pulse — would need a `limit` guessed from a
 * concurrent pulse count that nothing bounds.
 *
 * It also carries the board-wide flash a Joker's Clear produces. That shares
 * this layer rather than mounting a second full-board additive one: the
 * alternative doubles the permanent instance count to serve the rarest effect
 * in the game. The maths lives in `boardFlash.ts`, kept out of `firePulse.ts`
 * because that module's whole contract is about shots.
 */
export const FirePulses = memo(function FirePulses({ board }: { board: BoardSpec }) {
  const squares = useMemo(() => allSquares(board), [board])

  // An array, not a Map: `squareKey(square)` in the frame loop would allocate
  // a string per square per frame. `allSquares` is row-major (rank outer, file
  // inner), which is the order `accumulatePulses` writes, so one index serves
  // both.
  const meshes = useRef<(PositionMesh | null)[]>([])
  const pulses = useRef<FirePulse[]>([])
  const lastCooldownMs = useRef(new Map<string, number>())
  const lastEntityId = useRef(0)
  const flash = useRef<BoardFlash | null>(null)
  const lastClears = useRef(0)
  const group = useRef<Group>(null)

  // Reallocated only when the board grows, never per frame.
  const intensity = useMemo(() => new Float32Array(squares.length * 3), [squares.length])

  useFrame((state) => {
    const now = state.clock.elapsedTime
    const liveState = getState()

    // `reset()` rewinds `nextEntityId` to 1 — the only way it goes backwards
    // within a run. Without this, a previous run's pulses would ride into the
    // new one, and a remembered cooldown under a reused Tower id would read as
    // a shot that never happened.
    if (liveState.nextEntityId < lastEntityId.current) {
      pulses.current.length = 0
      lastCooldownMs.current.clear()
      // `reset()` rewinds `clears` to 0 too, and a remembered higher count
      // would swallow the new run's first Clear.
      flash.current = null
      lastClears.current = 0
    }
    lastEntityId.current = liveState.nextEntityId

    // Monotonic, so reading it per frame cannot miss one — unlike a per-tick
    // flag, which `advance` would lose when it runs five ticks per emit. Two
    // Clears between frames draw one flash, which is right: they are 300ms
    // apart at worst and the board is empty either way.
    if (liveState.clears > lastClears.current) {
      flash.current = { startedAt: now }
    }
    lastClears.current = liveState.clears

    // Compacted in place rather than with `filter`, which allocates a fresh
    // array on every frame — including the idle ones, where there is nothing
    // to filter. Mutating in place also keeps `pulses.current`'s identity
    // stable instead of rebinding the ref 60 times a second.
    const live = pulses.current
    let write = 0
    for (let read = 0; read < live.length; read += 1) {
      const pulse = live[read]
      if (pulse && isPulseLive(pulse, now, board)) {
        live[write] = pulse
        write += 1
      }
    }
    live.length = write

    pulses.current.push(...detectShots(lastCooldownMs.current, liveState.towers, now))

    // Toggle `visible` rather than unmount, so no material ever recompiles.
    // Stale colours behind a hidden group do not cost more than one frame:
    // child layout effects run before a parent's, so drei's `Instances`
    // frame callback is registered before this one and runs first every
    // frame, including the frame a new pulse arrives. That frame draws with
    // last pulse's final (near-zero, by construction) colours for ~16ms
    // before this callback overwrites them — visually negligible, and not
    // worth reordering the component to avoid.
    const currentFlash = flash.current
    const flashLive = currentFlash !== null && isFlashLive(currentFlash, now)
    if (!flashLive) flash.current = null

    if (group.current) group.current.visible = pulses.current.length > 0 || flashLive
    if (pulses.current.length === 0 && !flashLive) return

    // Zeroes the board's region first, which is why it runs even with no pulses
    // in flight. `accumulateBoardFlash` adds on top and never zeroes.
    accumulatePulses(intensity, board, pulses.current, now)
    accumulateBoardFlash(intensity, board, flashLive ? currentFlash : null, now)

    for (let i = 0; i < squares.length; i += 1) {
      const mesh = meshes.current[i]
      if (!mesh) continue

      const base = i * 3
      mesh.color.setRGB(
        intensity[base] ?? 0,
        intensity[base + 1] ?? 0,
        intensity[base + 2] ?? 0,
      )
    }
  })

  return (
    <group ref={group}>
      {/*
       * `key` is load-bearing, not decoration — do not remove it. See the long
       * comment in Board.tsx: drei's `Instances` sizes its buffers once from
       * `limit`, and a later `limit` change moves `mesh.count` without
       * resizing them, which is the Ace wedge.
       *
       * It is load-bearing here in a way it is not in `CoveragePreview`. That
       * component unmounts whenever nothing is hovered, so it reallocates by
       * accident. This one never unmounts, so an Ace really would grow `limit`
       * past buffers allocated at the old size.
       */}
      <Instances key={squares.length} limit={squares.length} renderOrder={RENDER_ORDER}>
        <boxGeometry args={[SQUARE_SIZE * 0.9, PULSE_HEIGHT, SQUARE_SIZE * 0.9]} />
        {/*
         * Additive so the pulse brightens whatever square it sits on. The rank
         * palette has uneven contrast against the board's cream and slate —
         * yellow rank 5 is weak on cream, grey rank 10 on slate — and additive
         * removes that problem outright instead of correcting per rank.
         *
         * `toneMapped={false}` because App.tsx passes no `gl` override, so R3F
         * applies its default ACES tone mapping, which rolls off precisely the
         * bright end additive blending produces.
         */}
        <meshBasicMaterial
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />

        {squares.map((square, index) => (
          <Instance
            key={squareKey(square)}
            // Braces, and no implicit return: React 19 treats a value returned
            // from a ref callback as a cleanup function.
            //
            // This fires far more often than mount and unmount. `GameScene`
            // selects `core`, which `tick` rebuilds every tick, so `Board`
            // re-renders on every publish — and drei's `Instance` reattaches
            // its ref on each one. Harmless here only because no timing lives
            // per-mesh: it is all on the `FirePulse` records, and a briefly
            // null handle is absorbed by the guard in the frame loop. See the
            // ghost ref comment in Towers.tsx for the version of this that
            // bites. `memo` above stops the churn anyway, since `board`
            // identity is stable between Aces.
            ref={(mesh: PositionMesh | null) => {
              meshes.current[index] = mesh
            }}
            // Black is invisible under additive blending, so an unlit square
            // needs nothing special — and this is correct on the first frame,
            // before useFrame has run once.
            color="#000000"
            position={[
              fileToWorldX(board, square.file),
              PULSE_Y,
              rankToWorldZ(board, square.rank),
            ]}
          />
        ))}
      </Instances>
    </group>
  )
})
