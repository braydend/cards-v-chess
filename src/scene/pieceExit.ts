import type { GameState, PieceTier, PieceTypeId } from '../game'

/**
 * A Piece that has left `GameState`, held briefly so its exit is visible.
 *
 * Carries its own square, type, and tier for the reason `Ghost` in towerDiff.ts
 * and `FirePulse` in firePulse.ts both do: once the Piece leaves state, this
 * record is the only place the renderer still knows what it was or where it
 * stood. Tier rides along so a ghost bursts in the colour the Piece's tier
 * carries, matching the live piece.
 */
export interface PieceGhost {
  readonly id: string
  /**
   * The ghost's React key, precomputed. Namespaced away from live Piece ids
   * because `reset()` rewinds the entity counter to 1: a ghost outlives its
   * Piece, so an unprefixed key could collide with a freshly spawned Piece that
   * reuses the id.
   */
  readonly meshKey: string
  readonly typeId: PieceTypeId
  readonly tier: PieceTier
  readonly reason: 'leak' | 'kill'
  readonly file: number
  readonly boardRank: number
}

export interface PieceExitDiff {
  readonly ghosts: readonly PieceGhost[]
  /**
   * `reset()` was detected. The caller must drop every live ghost and cancel
   * their expiry timers, or a previous run's ghosts ride into the new one.
   */
  readonly runReset: boolean
}

interface SeenPiece {
  readonly typeId: PieceTypeId
  readonly tier: PieceTier
  readonly file: number
  readonly boardRank: number
}

/**
 * Per-run bookkeeping. Lives in a ref, never in state: it is written from a
 * store subscription and routing it through React would buy nothing.
 */
export interface ExitTracker {
  readonly seen: Map<string, SeenPiece>
  lastClears: number
  lastEntityId: number
}

export function createExitTracker(): ExitTracker {
  return { seen: new Map(), lastClears: 0, lastEntityId: 0 }
}

/**
 * Reconciles bookkeeping against a published snapshot and returns the Pieces
 * that left, tagged with why. Mutates `tracker` in place — seeding Pieces it has
 * not seen, updating their squares, and deleting the departed — but touches no
 * React and no three.js, which is what makes it testable without a renderer.
 *
 * The first call on a fresh tracker necessarily returns nothing: no Piece can
 * have left a map that was empty a moment ago.
 *
 * **A KILL IS THE ABSENCE OF A RECORD, and that is exhaustive rather than a
 * guess.** There are exactly five ways a Piece leaves `state.pieces` — a leak, a
 * Tower kill, a promotion, a Joker's Clear, and `reset()`. The engine records
 * the first and third in `recentExits`; `clears` catches the fourth and
 * `nextEntityId` the fifth. A Tower kill is what remains. `startRound` does not
 * clear `pieces` — survivors persist through the gap — so there is no sixth,
 * round-boundary case.
 *
 * A kill burst is drawn at the Piece's LAST PUBLISHED square, which can be one
 * hop behind where the player last saw it: `Pieces.tsx` draws from live state,
 * so a Piece that hopped during the frame it died was drawn at the newer square.
 * The error is bounded at exactly one square and cannot compound — a frame
 * advances at most 83.3ms of simulation, and the fastest hop on the roster is a
 * Pawn's 900ms cut to 630ms by a King aura. A leak, where the start position
 * actually matters, is exact: the engine records `from` as it happens.
 */
export function diffPieceExits(tracker: ExitTracker, snapshot: GameState): PieceExitDiff {
  // `reset()` rewinds `nextEntityId` to 1 — the only way it can go backwards
  // within a run. Deliberately NOT a `phase === 'inProgress'` gate, which is
  // how `diffTowers` suppresses `reset()`: the leak that fells the Core sets
  // `defeated` in the same tick, so a phase gate would drop the single most
  // important impact in a run. This detector catches `reset()` without that
  // cost.
  const runReset = snapshot.nextEntityId < tracker.lastEntityId
  tracker.lastEntityId = snapshot.nextEntityId

  // Monotonic, so a comparison cannot miss one the way a per-tick flag would
  // when `advance` runs five ticks per emit.
  const cleared = snapshot.clears > tracker.lastClears
  tracker.lastClears = snapshot.clears

  const live = new Set<string>()

  for (const piece of snapshot.pieces) {
    live.add(piece.id)
    tracker.seen.set(piece.id, {
      typeId: piece.typeId,
      tier: piece.tier,
      file: piece.square.file,
      boardRank: piece.square.rank,
    })
  }

  const ghosts: PieceGhost[] = []

  for (const [id, seen] of tracker.seen) {
    if (live.has(id)) continue
    // Deleting the current entry while iterating a Map is safe, and is what
    // `diffTowers` already does.
    tracker.seen.delete(id)

    if (runReset || cleared) continue

    const record = snapshot.recentExits.find((candidate) => candidate.pieceId === id)

    if (record?.reason === 'promotion') continue

    if (record?.reason === 'leak') {
      ghosts.push({
        id,
        meshKey: `ghost:${id}`,
        typeId: record.typeId,
        tier: seen.tier,
        reason: 'leak',
        // From the record, not from `seen`: the Piece can have hopped more than
        // once inside the tick it leaked, and the engine recorded where it
        // actually was.
        file: record.from.file,
        boardRank: record.from.rank,
      })
      continue
    }

    ghosts.push({
      id,
      meshKey: `ghost:${id}`,
      typeId: seen.typeId,
      tier: seen.tier,
      reason: 'kill',
      file: seen.file,
      boardRank: seen.boardRank,
    })
  }

  return { ghosts, runReset }
}

/**
 * Presentation constants, tunable by feel — the same category as `HIT_FLASH_MS`
 * in towerColour.ts and `PULSE_FADE_MS` in firePulse.ts. Nothing in the engine
 * reads them and none is a balance value. All PLACEHOLDERS.
 */
export const LEAK_LUNGE_MS = 180
export const LEAK_BURST_MS = 70
export const KILL_BURST_MS = 180

/** How much a kill swells before collapsing, and how far through it peaks. */
const KILL_PEAK = 1.35
const KILL_PEAK_AT = 0.4

/** How long each kind of ghost stays mounted. */
export const GHOST_LIFETIME_MS: Record<PieceGhost['reason'], number> = {
  leak: LEAK_LUNGE_MS + LEAK_BURST_MS,
  kill: KILL_BURST_MS,
}

/**
 * Slack added on top of `GHOST_LIFETIME_MS` when scheduling a ghost's expiry
 * timer, in `PieceExits.tsx`.
 *
 * The timer is started the moment the store publish arrives. But a ghost's
 * own animation clock — `GhostMesh`'s `startedAt` — is not stamped until the
 * FIRST `useFrame` tick after the mesh mounts, which can land up to a whole
 * frame later than the publish that scheduled the timer. Without slack, the
 * wall-clock timer can fire before `ghostScale` has finished collapsing to 0,
 * so the mesh unmounts mid-shrink instead of vanishing at scale 0 — exactly
 * the "piece just disappears" complaint issue #12 exists to fix.
 *
 * Sized to outlast a full frame at a low refresh rate — 30fps, ~33ms, the
 * rate the visible-truncation numbers above were measured at — rather than
 * only at 60fps (~17ms), plus a small margin for the commit between the
 * publish and the mesh actually mounting. The cost of overshooting is cheap
 * (a spent ghost sits at scale 0, one idle mesh, for a few extra
 * milliseconds); the cost of undershooting is the visible pop this exists to
 * fix. Applied at the scheduling site rather than folded into
 * `GHOST_LIFETIME_MS` itself, because that constant describes the
 * animation's own length — a different fact from how long the mesh should
 * stay mounted.
 */
export const GHOST_EXPIRY_SLACK_MS = 40

/**
 * How far along its lunge a leak ghost is, 0..1.
 *
 * Squared, so it accelerates into the Core. A leak is a strike, not another hop
 * — which is also why the caller drops `Pieces.tsx`'s `sin` arc for these.
 */
export function lungeProgress(ageMs: number): number {
  const linear = Math.min(1, Math.max(0, ageMs / LEAK_LUNGE_MS))

  return linear * linear
}

/** Whether the impact has landed, so the Core flash is stamped exactly once. */
export function hasLanded(ageMs: number): boolean {
  return ageMs >= LEAK_LUNGE_MS
}

/**
 * A ghost's scale this frame, 0 once it is spent.
 *
 * Scale rather than opacity, and one shared material per Piece type rather than
 * one per ghost. Rank 10's `targetsPerShot` is unbounded, so a volley can kill
 * an arbitrary number of Pieces at once and per-ghost material churn has no
 * ceiling; sharing one emissive material instead would force every simultaneous
 * burst into lockstep at whatever age the last one set. Scale is per-mesh, so it
 * is immune to both.
 *
 * A leak holds full size through the lunge and then collapses, so the strike
 * lands at full weight. A kill swells and then collapses.
 */
export function ghostScale(reason: PieceGhost['reason'], ageMs: number): number {
  if (reason === 'leak') {
    if (ageMs <= LEAK_LUNGE_MS) return 1

    return Math.max(0, 1 - (ageMs - LEAK_LUNGE_MS) / LEAK_BURST_MS)
  }

  const progress = Math.min(1, Math.max(0, ageMs / KILL_BURST_MS))

  if (progress < KILL_PEAK_AT) {
    return 1 + (KILL_PEAK - 1) * (progress / KILL_PEAK_AT)
  }

  return KILL_PEAK * (1 - (progress - KILL_PEAK_AT) / (1 - KILL_PEAK_AT))
}
