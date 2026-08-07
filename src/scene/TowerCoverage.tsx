import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'
import { squareKey, type BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { SQUARE_SIZE, fileToWorldX, rankToWorldZ } from './coords'
import {
  blockerSquares,
  coverageSelection,
  selectedFootprint,
  squaresListsEqual,
} from './towerCoverage'

/**
 * Amber, against `CoveragePreview`'s teal.
 *
 * The split is semantic rather than decorative: teal is a promise about a Card
 * that has not been played, amber is a fact about a Tower that exists. The two
 * footprints overlap constantly — placing a second Tower beside the first is the
 * normal case — and one colour for both would be unreadable exactly when the
 * comparison matters most.
 *
 * **The colour and its strength were measured, not chosen.** A first pass used
 * `#f6ad55` at opacity 0.34, on the reasoning that a sticky overlay should be
 * fainter than a transient one. Screenshots of the real scene killed that twice
 * over: a warm hue that weak barely shifts the light squares (`#e6e0cf`) at all,
 * and on the dark squares it reads as dirt rather than as light. Worse, the teal
 * preview drawn above it swamped it — an amber square under teal looked the same
 * as a teal square with nothing under it, which destroys the one thing drawing
 * both overlays at once is for. At the values below the overlap resolves to a
 * distinct yellow-green, so all four states are legible: amber only, teal only,
 * both, neither. Re-measure against a screenshot before weakening either value.
 */
const PLACED_COVERAGE = '#ffb84a'
const PLACED_COVERAGE_OPACITY = 0.46

/**
 * The footprint's height band: a 0.01-tall box centred at 0.014, so it spans
 * 0.009 to 0.019 and is coplanar with nothing else drawn flat on the board.
 *
 * Its neighbours: the board squares end at 0.00, `PlacementSurface` sits at
 * 0.02, `CoveragePreview`'s teal box spans 0.03 to 0.05, `SelectionMarker`'s
 * ring is at 0.06 and `FirePulses` spans 0.065 to 0.075.
 *
 * **Height keeps these overlays from being coplanar. It does not order them.**
 * That distinction was got wrong here first time round and is worth stating
 * plainly, because it is not visible from the code. three.js sorts the
 * transparent list on the projected z of each object's **world origin**
 * (`reversePainterSortStable`), and drei's `Instances` puts every instance's
 * position in `instanceMatrix` while leaving the `InstancedMesh` itself at the
 * world origin. Measured in the running scene: this overlay and
 * `CoveragePreview`'s both report a world position of exactly `(0, 0, 0)`, so
 * `FOOTPRINT_Y` is invisible to the sort no matter what it is set to. What the
 * band still buys is real but narrower — two coplanar quads with
 * `depthWrite: false` produce a genuine z-fight, so the gaps stay.
 *
 * Ordering is `RENDER_ORDER` below, which is explicit for exactly this reason.
 */
const FOOTPRINT_HEIGHT = 0.01
const FOOTPRINT_Y = 0.014

/**
 * Where this overlay sits in the flat-overlay stack, lowest first: this
 * footprint (1), `CoveragePreview`'s teal box (2) and its illegal marker (3),
 * `SelectionMarker`'s ring (4), `FirePulses` (5).
 *
 * Amber below teal is the design decision — the Card being considered draws over
 * the Tower already standing, because the active decision belongs on top — and
 * `renderOrder` is what enforces it. Do not rely on height, JSX order or mount
 * order for this. All three were tried: heights are invisible to the sort (see
 * above), and while the current default order happens to come out right, nothing
 * in the scene graph states it, so an unrelated remount can reshuffle it. The
 * composite really does change — amber over teal is a different colour from teal
 * over amber, and §3's measured palette assumes the latter.
 *
 * `FirePulses` already reached this conclusion independently and set its own
 * `renderOrder`; this is the same fix applied to the whole stack. Every value in
 * the ladder must stay distinct, because a tie falls back to the same unstable
 * sort this exists to avoid.
 */
const RENDER_ORDER = 1

/**
 * Every square the selected Tower covers, lit while it is selected.
 *
 * `CoveragePreview` answers "where would this Tower shoot?" for a Tower that
 * does not exist yet, and the answer disappeared the moment the Card was played.
 * That is backwards: placement is a one-off decision, while living with the
 * placement is the rest of the run, and every later decision — where the next
 * Tower goes, which Tower is worth a ♠, whether a file is covered at all —
 * depends on footprints that were invisible.
 *
 * Selection is the trigger rather than hover, because the click already exists
 * and because a sticky footprint is worth more than a flickering one: it can be
 * orbited, read against the Pieces walking into it, and compared with a build
 * preview. Hover would also fight the build preview, which is hover-driven too.
 *
 * **Showing coverage is reserved for a selected Tower, as a design decision and
 * not just an implementation convenience.** Hovering an unselected Tower shows
 * nothing, deliberately — the footprint is something the player asks for, not
 * something the board throws up whenever the pointer crosses a Tower. Adding a
 * hover preview would reopen a settled call; see the design doc.
 *
 * Both overlays draw at once, with no suppression rule. "Where is my coverage
 * thin?" is answered by seeing a new teal footprint against the existing amber
 * one, and hiding either would make the comparison impossible.
 *
 * **An aura shares this footprint**, which the rebalanced ladder makes the more
 * valuable half. `TowerRankDef.aura` applies to every Piece its Tower covers, so
 * these squares are exactly the rank-8 Amplifier's amplified zone and the rank-9
 * Freezer's slowed zone — roles whose whole value is the area rather than the
 * shot. The rank-7 Wall is the opposite case and lights nothing at all, which is
 * correct rather than broken: `none` geometry covers no square.
 *
 * This shows coverage, not targeting. A shot is capped at `targetsPerShot` and
 * picks the Pieces nearest the Core, so a footprint of dozens of squares can
 * resolve to a single Piece — a rank-9 Freezer lights a 5x5 disc and hits 3 of
 * the Pieces standing in it. The panel carries that
 * figure. Lighting only the squares a shot would hit would change every tick,
 * which is not what a reference overlay is for.
 *
 * Plumbing only: what to draw is decided in `towerCoverage.ts`, which is pure
 * and tested, because there is no jsdom here and a conditional in this file
 * would be a conditional no test can reach.
 */
export function TowerCoverage({ board }: { board: BoardSpec }) {
  const selectedTowerId = useUiStore((store) => store.selectedTowerId)
  // Subscribed to the Tower list rather than read from `simulation.getState()`.
  // An unsubscribed read would look cheaper — this component would stop
  // re-rendering on Tower hits entirely — and it would break the one case the
  // overlay has to handle: a Tower destroyed while its panel is open cannot
  // re-render anything, so the footprint would hang over an empty square until
  // some unrelated state change happened to redraw it.
  const towers = useGameStore((store) => store.snapshot.towers)

  // Identity-stable blocker squares: zustand keeps the previous selector value
  // when `squaresListsEqual` says the new one is equal, so this array reference
  // changes only when a Tower is built or destroyed. The memo keys on it, so a
  // hit or a cooldown tick — which refresh the `towers` array on every publish
  // — costs the footprint nothing. See `blockerSquares` in towerCoverage.ts.
  const blockers = useGameStore(
    (store) => blockerSquares(store.snapshot.towers),
    squaresListsEqual,
  )

  // Reduced to scalars, deliberately — though be clear about what that buys.
  // Every publish hands this component a fresh `towers` array, so it re-renders
  // on any Piece hop or Tower hit whether the memo hits or not; the array is
  // fresh per publish, not per tick, because `structuralKey` deliberately
  // excludes `fireCooldownMs` so a firing tick never reaches React at all. What
  // the memo skips is the `allSquares` walk and its ~64 short-lived objects, not
  // the re-render and not rebuilding the `Instance` children. The stronger reason
  // for the scalars is correctness of the dependency list: a memo body that read
  // `towers` would need `towers` as a dep, and then it would recompute on every
  // publish regardless.
  //
  // The blocker list is a second, identity-stable dependency: it is the one
  // thing that genuinely reshapes the footprint beyond the selected Tower's own
  // rank and square, and `squaresListsEqual` keeps it stable between build and
  // destroy events.
  const selection = coverageSelection(towers, selectedTowerId)
  const cardRank = selection?.cardRank
  const file = selection?.file
  const boardRank = selection?.boardRank

  const footprint = useMemo(
    () => selectedFootprint(board, cardRank, file, boardRank, blockers),
    [board, cardRank, file, boardRank, blockers],
  )

  if (!footprint) return null

  return (
    // `key` on the same expression as `limit`, and it is load-bearing — see the
    // long comment in Board.tsx for what drei's `Instances` does with a `limit`
    // that grows after its buffers are allocated. An Ace grows the board while a
    // Tower is selected, so this is reachable rather than theoretical.
    <Instances
      key={board.files * board.ranks}
      limit={board.files * board.ranks}
      renderOrder={RENDER_ORDER}
    >
      <boxGeometry args={[SQUARE_SIZE * 0.9, FOOTPRINT_HEIGHT, SQUARE_SIZE * 0.9]} />
      <meshBasicMaterial
        color={PLACED_COVERAGE}
        transparent
        opacity={PLACED_COVERAGE_OPACITY}
        depthWrite={false}
      />
      {footprint.covered.map((square) => (
        <Instance
          key={squareKey(square)}
          position={[
            fileToWorldX(board, square.file),
            FOOTPRINT_Y,
            rankToWorldZ(board, square.rank),
          ]}
        />
      ))}
    </Instances>
  )
}
