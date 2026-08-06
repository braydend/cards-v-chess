import type { BuildableRank, Tower } from '../game'

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
 * A DECREASE IN `fireCooldownMs` IS AN EXACT SHOT SIGNAL. On exit from
 * `fireTowers` the stored value is either below `fireIntervalMs` (it fired,
 * subtracting one whole interval) or exactly `fireIntervalMs` (nothing in
 * range, clamped to "ready" rather than banking shots). The stored value can
 * never exceed the interval, so that clamp can only hold or raise it, and ♦
 * Speed only ever lowers the interval. So a decrease means a shot, and a shot
 * always produces one.
 *
 * It also cannot under-count. A frame advances at most
 * `FIXED_DT_MS * MAX_CATCHUP_STEPS` = 83.3ms of simulation, so at the 100ms
 * `MIN_FIRE_INTERVAL_MS` floor a Tower would need a stored cooldown of 116.7ms
 * to fire twice in one frame — impossible, since it never exceeds the interval.
 * One pulse per observed decrease is right.
 *
 * The known gap is a false NEGATIVE: a Tower that fires and then loses every
 * target within the same frame's ticks has its decrease erased by the clamp.
 * That needs two or more ticks per frame, so it cannot happen above roughly
 * 30fps, and it is accepted — see the spec.
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
