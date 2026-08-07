import { Color } from 'three'
import { towerRank } from '../data/towerRanks'
import {
  coversSquare,
  isOccluded,
  type BoardSpec,
  type BuildableRank,
  type Square,
  type Tower,
  type TowerGeometry,
} from '../game'
import { RANK_COLOURS } from './rankColours'

/**
 * One shot's expanding ring.
 *
 * Carries its own square and card rank rather than a Tower id, for the same
 * reason `Ghost` does in towerDiff.ts: a Tower can be destroyed while its last
 * shot is still travelling, and once it leaves `GameState` this record is the
 * only place the renderer still knows where the shot came from.
 */
export interface FirePulse {
  readonly file: number
  readonly boardRank: number
  readonly cardRank: BuildableRank
  /** Clock seconds when the shot happened. */
  readonly startedAt: number
}

/**
 * Reconciles remembered cooldowns against live Towers and returns a pulse for
 * every Tower that has fired since the last call. Mutates `lastCooldownMs` in
 * place — seeding Towers it has not seen, updating the rest, and pruning ones
 * that have left state.
 *
 * A DECREASE IN `fireCooldownMs` IS ALMOST ALWAYS AN EXACT SHOT SIGNAL. On
 * exit from `fireTowers` the stored value is either below `fireIntervalMs`
 * (it fired, subtracting one whole interval) or exactly `fireIntervalMs`
 * (nothing in range, clamped to "ready" rather than banking shots) — so
 * ordinarily that clamp can only hold or raise the stored value, and a
 * decrease means a shot.
 *
 * ♦ Speed breaks that on its own. `applySupport` in `src/game/support.ts`
 * lowers a Tower's `fireIntervalMs` directly and never touches
 * `fireCooldownMs`. A Tower idling at the OLD clamp is left holding a
 * cooldown *above* its NEW interval, and the very next tick — even with
 * nothing in range — clamps that value DOWN to the new interval. That is a
 * decrease with no shot behind it: exactly the phantom pulse the guard below
 * exists to skip. See `firePulse.test.ts`'s ♦-support regression test, which
 * fails without it.
 *
 * It also cannot under-count. A frame advances at most
 * `FIXED_DT_MS * MAX_CATCHUP_STEPS` = 83.3ms of simulation, so at the 100ms
 * `MIN_FIRE_INTERVAL_MS` floor a Tower would need a stored cooldown of 116.7ms
 * to fire twice in one frame — impossible, since it never exceeds the interval.
 * One pulse per observed decrease is right.
 *
 * The known gap is a false NEGATIVE: a Tower that fires and then loses every
 * target within the same frame's later ticks has its decrease erased by the
 * clamp. It is unreachable today, not merely rare at some frame rate: after a
 * shot the stored cooldown is at most one `FIXED_DT_MS` (16.67ms), so climbing
 * back up to the interval before the frame ends would need
 * `MAX_CATCHUP_STEPS * FIXED_DT_MS >= fireIntervalMs`, i.e. 83.3ms >= the
 * 100ms `MIN_FIRE_INTERVAL_MS` floor — false. The real invariant is
 * `MIN_FIRE_INTERVAL_MS > FIXED_DT_MS * MAX_CATCHUP_STEPS`; lowering that
 * floor or raising `MAX_CATCHUP_STEPS` would open the gap for real, and
 * nothing today would flag it. See the spec.
 *
 * Returns a fresh array, and a `FirePulse` is allocated per shot. Both are
 * deliberate: a shot must allocate a record regardless, so zero allocation is
 * unreachable here, and what remains is one small array per frame rather than
 * the per-entity-per-frame `new Vector3()` CLAUDE.md's rule targets.
 */
export function detectShots(
  lastCooldownMs: Map<string, number>,
  towers: readonly Tower[],
  now: number,
): FirePulse[] {
  const pulses: FirePulse[] = []

  for (const tower of towers) {
    const previous = lastCooldownMs.get(tower.id)
    lastCooldownMs.set(tower.id, tower.fireCooldownMs)

    if (previous === undefined) continue
    if (tower.fireCooldownMs >= previous) continue

    // ♦ Speed lowers `fireIntervalMs` without touching `fireCooldownMs`, so a
    // Tower idling at the clamp sits at its OLD interval, above its new one.
    // The next tick clamps DOWN to the new interval — a decrease with no shot
    // behind it. Safe to skip: a tick that actually fired always drains the
    // cooldown strictly below the interval, so landing at or above it after a
    // decrease can only be the clamp.
    if (previous > tower.fireIntervalMs && tower.fireCooldownMs >= tower.fireIntervalMs) continue

    pulses.push({
      file: tower.square.file,
      boardRank: tower.square.rank,
      cardRank: tower.cardRank,
      startedAt: now,
    })
  }

  // Only when the sizes disagree, so the common frame — nothing built, nothing
  // destroyed — does no extra work. Pruning matters because `reset()` rewinds
  // Tower ids to 1: a stale cooldown under a reused id would read as a shot.
  if (lastCooldownMs.size !== towers.length) {
    for (const id of lastCooldownMs.keys()) {
      if (!towers.some((tower) => tower.id === id)) lastCooldownMs.delete(id)
    }
  }

  return pulses
}

/**
 * Presentation constants, tunable by feel — the same category as
 * `HIT_FLASH_MS` and `DEATH_FLARE_MS` in towerColour.ts. Nothing in the engine
 * reads them and neither is a balance value.
 *
 * Both are PLACEHOLDERS, but chosen so the cadence reads at both extremes:
 * rank 2 (range 1, fires 600ms) gives one 205ms blip then 395ms of dark, and
 * rank 10 stacked with ♦ down to the 100ms MIN_FIRE_INTERVAL_MS floor keeps
 * about 3.4 rings in flight, spaced 2.2 squares apart on a 4-square footprint.
 */
export const PULSE_SQUARES_PER_SECOND = 22
export const PULSE_FADE_MS = 160

const FADE_SECONDS = PULSE_FADE_MS / 1000

/**
 * Rank colours as three.js Colours, built once at module load exactly as
 * towerColour.ts builds its DAMAGED / FLASH / CRITICAL constants.
 *
 * `new Color(hex)` converts sRGB into the renderer's working space, so these
 * are directly summable and directly writable with `Color.setRGB`. Parsing the
 * hex by hand would skip that conversion and wash every pulse out.
 *
 * Written out entry by entry rather than built with `Object.fromEntries`, which
 * would need a type assertion. Exhaustive by construction: a new
 * `BuildableRank` makes this a type error.
 */
const RANK_RGB: Record<BuildableRank, Color> = {
  2: new Color(RANK_COLOURS[2]),
  3: new Color(RANK_COLOURS[3]),
  4: new Color(RANK_COLOURS[4]),
  5: new Color(RANK_COLOURS[5]),
  6: new Color(RANK_COLOURS[6]),
  7: new Color(RANK_COLOURS[7]),
  8: new Color(RANK_COLOURS[8]),
  9: new Color(RANK_COLOURS[9]),
  10: new Color(RANK_COLOURS[10]),
}

/**
 * Reused across every call so the frame loop allocates nothing. `coversSquare`
 * takes `Square`s, and building a fresh pair per square per pulse would be
 * thousands of objects a second. Mutable on purpose — `coversSquare` only ever
 * reads them.
 */
const scratchOrigin = { file: 0, rank: 0 }
const scratchTarget = { file: 0, rank: 0 }
/**
 * The squares of the standing Towers, rebuilt from the `towers` argument at
 * the top of each `accumulatePulses` call so `isOccluded` never allocates a
 * fresh array in the frame loop. `isOccluded` excludes the origin, so the
 * shooter's own square being in here is harmless — the same reasoning the
 * engine's `selectTargets` relies on when it builds its blocker list from
 * every standing Tower.
 */
const scratchBlockers: Square[] = []

/**
 * The farthest a file can sit from `originFile` on a board `boardFiles` wide —
 * whichever edge, file 0 or the last file, is farther.
 */
function farthestFileDistance(originFile: number, boardFiles: number): number {
  return Math.max(originFile, boardFiles - 1 - originFile)
}

/**
 * The greatest Chebyshev distance from a pulse's origin to any square its
 * geometry actually covers — the ceiling both the animation's scan window
 * (`accumulatePulses`) and its lifetime (`isPulseLive`) must reach, derived
 * once here so the two cannot drift apart.
 *
 * Equal to `range` for every geometry `coversSquare` bounds by Chebyshev
 * distance before its own switch runs — which is every geometry but `band`.
 * `band` is bounded only in board ranks (`rankDistance <= range`) and reaches
 * the FULL board width in files, so its file reach is measured from the
 * origin's own file to whichever edge is farther, not from `range`.
 */
function maxCoverageDistance(
  geometry: TowerGeometry,
  range: number,
  originFile: number,
  boardFiles: number,
): number {
  if (geometry !== 'band') return range

  return Math.max(range, farthestFileDistance(originFile, boardFiles))
}

/** Whether this pulse still has anything to draw. */
export function isPulseLive(pulse: FirePulse, now: number, board: BoardSpec): boolean {
  const { geometry, range } = towerRank(pulse.cardRank)
  const distance = maxCoverageDistance(geometry, range, pulse.file, board.files)

  return now - pulse.startedAt < distance / PULSE_SQUARES_PER_SECOND + FADE_SECONDS
}

/**
 * Sums every pulse's contribution into `out`, three floats per square, indexed
 * row-major by board rank then file — the order `allSquares` produces, so one
 * index serves both this buffer and the renderer's mesh array.
 *
 * Each lit square is clipped through `isOccluded` against the standing Towers:
 * a shot the Tower is blocked from making cannot claim a square it can see but
 * not hit. Without this, a Tower retargeting past an occluder would still sweep
 * its whole geometric footprint, lighting squares another Tower hides — the
 * same lie the overlays were fixed to stop telling. The shooter's own square is
 * in the blocker list but never occludes itself (`isOccluded` excludes the
 * origin), so a lone Tower's pulse is unchanged.
 *
 * Zeroes only the board's own region, never the whole buffer, so it cannot
 * clobber anything a caller keeps past the end. Allocates nothing: the caller
 * owns `out`, the three `Square` collections handed to `coversSquare` and
 * `isOccluded` are module-level scratch, and the blocker list is rebuilt in
 * place from the `towers` argument rather than allocated.
 *
 * Additive by design. The renderer draws with `AdditiveBlending`, where black
 * contributes nothing — so an unlit square needs no special case and
 * overlapping pulses simply sum into something brighter.
 */
export function accumulatePulses(
  out: Float32Array,
  board: BoardSpec,
  pulses: readonly FirePulse[],
  now: number,
  towers: readonly Tower[],
): void {
  out.fill(0, 0, board.files * board.ranks * 3)

  scratchBlockers.length = 0
  for (const tower of towers) scratchBlockers.push(tower.square)

  for (const pulse of pulses) {
    const { geometry, range } = towerRank(pulse.cardRank)
    const rgb = RANK_RGB[pulse.cardRank]
    const elapsed = now - pulse.startedAt

    scratchOrigin.file = pulse.file
    scratchOrigin.rank = pulse.boardRank

    // `band` reaches the full board width in files — bounded only in board
    // ranks — so its scan window must not be clipped to `range` on that axis
    // the way every other geometry's is. Using `board.files - 1` as the file
    // reach rather than `range` gets that for free: `Math.max`/`Math.min`
    // below clamp it straight to the board's own edges, so this is not a
    // widened scan for the eight geometries that don't need one — for them
    // `range` is still the reach, unchanged.
    const fileReach = geometry === 'band' ? board.files - 1 : range
    // Clamped to the board, which is also what guarantees no write lands
    // outside `out`.
    const minFile = Math.max(0, pulse.file - fileReach)
    const maxFile = Math.min(board.files - 1, pulse.file + fileReach)
    const minRank = Math.max(0, pulse.boardRank - range)
    const maxRank = Math.min(board.ranks - 1, pulse.boardRank + range)

    for (let boardRank = minRank; boardRank <= maxRank; boardRank += 1) {
      for (let file = minFile; file <= maxFile; file += 1) {
        // Chebyshev, the measure `coversSquare` uses for range.
        const distance = Math.max(
          Math.abs(file - pulse.file),
          Math.abs(boardRank - pulse.boardRank),
        )

        const age = elapsed - distance / PULSE_SQUARES_PER_SECOND
        if (age < 0 || age >= FADE_SECONDS) continue

        scratchTarget.file = file
        scratchTarget.rank = boardRank
        if (!coversSquare(geometry, range, scratchOrigin, scratchTarget)) continue
        // Occlusion, the same answer the engine consults before a shot: a
        // square the Tower can see but not hit is not a square its shot can
        // light. `isOccluded` skips the origin, so the shooter never blocks
        // its own pulse.
        if (isOccluded(scratchOrigin, scratchTarget, scratchBlockers)) continue

        const intensity = 1 - age / FADE_SECONDS
        const base = (boardRank * board.files + file) * 3

        // `?? 0` because `noUncheckedIndexedAccess` types these reads as
        // `number | undefined`, and this codebase has no non-null assertions.
        out[base] = (out[base] ?? 0) + rgb.r * intensity
        out[base + 1] = (out[base + 1] ?? 0) + rgb.g * intensity
        out[base + 2] = (out[base + 2] ?? 0) + rgb.b * intensity
      }
    }
  }
}
