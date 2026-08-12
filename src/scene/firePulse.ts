import { Color } from 'three'
import { towerType } from '../data/towerTypes'
import {
  coversSquare,
  isOccluded,
  type BoardSpec,
  type Square,
  type Tower,
  type TowerGeometry,
  type TowerTypeId,
} from '../game'
import { TOWER_COLOURS } from './rankColours'

/**
 * One shot's expanding ring.
 *
 * Carries its own square, tower type and fired range rather than a Tower id,
 * for the same reason `Ghost` does in towerDiff.ts: a Tower can be destroyed
 * while its last shot is still travelling, and once it leaves `GameState` this
 * record is the only place the renderer still knows where the shot came from.
 * The range is carried because a Tower can be range-boosted by a Queen, and a
 * destroyed Tower's pulse must still know its reach.
 */
export interface FirePulse {
  readonly file: number
  readonly boardRank: number
  readonly type: TowerTypeId
  /** The range the shot fired at (a Tower can be range-boosted by a Queen). */
  readonly range: number
  /** Clock seconds when the shot happened. */
  readonly startedAt: number
}

/**
 * Reconciles remembered shot counters against live Towers and returns a pulse
 * for every shot the Towers have fired since the last call. Mutates
 * `lastShotsFired` in place — seeding Towers it has not seen, updating the
 * rest, and pruning ones that have left state.
 *
 * `Tower.shotsFired` is the engine's ground truth for "a shot really fired":
 * it advances exactly once per shot event that acquired a target. Diffing it
 * is exact where inferring from `fireCooldownMs` was not:
 *
 * - A miss spends the fire interval, so the cooldown drops on a miss just as
 *   on a real shot — but `shotsFired` does not move. Inferring from the
 *   cooldown would draw a pulse for an undetected shot, which is a shot the
 *   Tower never made.
 * - An idle Tower holds its cooldown at "ready" (clamped to `fireIntervalMs`
 *   in `fireTowers`), so the cooldown can change with no shot behind it. A
 *   counter cannot phantom: nothing moves it but an actual shot.
 * - A Tower that fires and then loses every target within the same frame's
 *   later ticks has its cooldown decrease erased by the clamp. `shotsFired`
 *   keeps the increment regardless, so the pulse is not lost.
 *
 * `shotsFired` is monotonic, so a frame can never miss one: the renderer
 * diffs a lifetime counter, not a per-tick flag that `advance` might skip.
 *
 * Returns a fresh array, and a `FirePulse` is allocated per shot. Both are
 * deliberate: a shot must allocate a record regardless, so zero allocation is
 * unreachable here, and what remains is one small array per frame rather than
 * the per-entity-per-frame `new Vector3()` CLAUDE.md's rule targets.
 */
export function detectShots(
  lastShotsFired: Map<string, number>,
  towers: readonly Tower[],
  now: number,
): FirePulse[] {
  const pulses: FirePulse[] = []

  for (const tower of towers) {
    const previous = lastShotsFired.get(tower.id)
    lastShotsFired.set(tower.id, tower.shotsFired)

    if (previous === undefined) continue
    const fired = tower.shotsFired - previous
    if (fired <= 0) continue

    // One pulse per shot event. A Tower can fire at most one shot per frame —
    // a frame advances `FIXED_DT_MS * MAX_CATCHUP_STEPS` = 83.3ms of
    // simulation, under the 100ms `MIN_FIRE_INTERVAL_MS` floor — so `fired`
    // is 1 in practice. The loop exists so a burst that ever became possible
    // would not silently drop pulses.
    for (let i = 0; i < fired; i += 1) {
      pulses.push({
        file: tower.square.file,
        boardRank: tower.square.rank,
        type: tower.type,
        range: tower.range,
        startedAt: now,
      })
    }
  }

  // Only when the sizes disagree, so the common frame — nothing built, nothing
  // destroyed — does no extra work. Pruning matters because `reset()` rewinds
  // Tower ids to 1: a stale counter under a reused id would read as a shot.
  if (lastShotsFired.size !== towers.length) {
    for (const id of lastShotsFired.keys()) {
      if (!towers.some((tower) => tower.id === id)) lastShotsFired.delete(id)
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
 * a fast Tower (`vertical`, fires every 500ms) gives one 205ms blip then
 * 295ms of dark, and a range-boosted Tower keeps several rings in flight at
 * once.
 */
export const PULSE_SQUARES_PER_SECOND = 22
export const PULSE_FADE_MS = 160

const FADE_SECONDS = PULSE_FADE_MS / 1000

/**
 * Tower type colours as three.js Colours, built once at module load exactly as
 * towerColour.ts builds its DAMAGED / FLASH / CRITICAL constants.
 *
 * `new Color(hex)` converts sRGB into the renderer's working space, so these
 * are directly summable and directly writable with `Color.setRGB`. Parsing the
 * hex by hand would skip that conversion and wash every pulse out.
 *
 * Written out entry by entry rather than built with `Object.fromEntries`, which
 * would need a type assertion. Exhaustive by construction: a new
 * `TowerTypeId` makes this a type error.
 */
const TOWER_RGB: Record<TowerTypeId, Color> = {
  vertical: new Color(TOWER_COLOURS.vertical),
  wall: new Color(TOWER_COLOURS.wall),
  sniper: new Color(TOWER_COLOURS.sniper),
  diagonal: new Color(TOWER_COLOURS.diagonal),
  cross: new Color(TOWER_COLOURS.cross),
  star: new Color(TOWER_COLOURS.star),
  splash: new Color(TOWER_COLOURS.splash),
  ring: new Color(TOWER_COLOURS.ring),
  tollgate: new Color(TOWER_COLOURS.tollgate),
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
  const { geometry } = towerType(pulse.type)
  const distance = maxCoverageDistance(geometry, pulse.range, pulse.file, board.files)

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
    const { geometry } = towerType(pulse.type)
    const range = pulse.range
    const rgb = TOWER_RGB[pulse.type]
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
        if (isOccluded(scratchOrigin, scratchTarget, scratchBlockers, geometry)) continue

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
