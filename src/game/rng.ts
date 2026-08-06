/**
 * The run's seeded randomness.
 *
 * Runs are reproducible and shareable — same seed, same packs — so `Math.random`
 * is banned in this directory and every draw comes from here. ESLint enforces
 * that; this module is the reason it can.
 *
 * Two properties make the rest of the engine simple:
 *
 * **Immutable.** `next` returns the drawn value *and* an advanced generator,
 * leaving its argument untouched, so an `Rng` can live in `GameState` like any
 * other value and a refused command cannot half-advance it.
 *
 * **Named streams.** A stream is derived from the run seed hashed with a name,
 * so streams are independent by construction. Packs are the only consumer today.
 * When a second one arrives it takes its own name, and adding it cannot shift
 * what any existing seed deals to packs — which is the whole point of a seed
 * being worth sharing. See "PRNG streams" in the design doc.
 *
 * The algorithm is FNV-1a to hash the stream name and mulberry32 to generate.
 * Both are deliberately unremarkable: this deals cards, so what matters is that
 * it is deterministic, holds its whole state in one number, and needs no
 * dependency. Statistical quality beyond "the distribution looks flat" is not a
 * requirement, and nothing here should be mistaken for a claim of it.
 */

/** A generator's whole state. Serialisable, so it sits in `GameState` freely. */
export interface Rng {
  readonly state: number
}

/** FNV-1a. Turns a seed and stream name into a 32-bit starting state. */
function hash(text: string): number {
  let h = 2166136261 >>> 0

  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  return h >>> 0
}

/**
 * The generator this run draws from for `name`.
 *
 * `name` is a plain string rather than a union so tests can derive a second
 * stream to prove independence without a dead union member. The streams a run
 * actually carries are pinned by `GameState.rng`.
 */
export function streamFor(seed: string, name: string): Rng {
  return { state: hash(`${seed}:${name}`) }
}

/** A value in [0, 1), and the advanced generator. Never mutates its argument. */
export function next(rng: Rng): [number, Rng] {
  const state = (rng.state + 0x6d2b79f5) >>> 0

  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, { state }]
}

/**
 * One entry picked in proportion to its weight, and the advanced generator.
 *
 * Zero-weight entries can never be picked, which is what lets a caller build one
 * table for every pack type and zero out what a given pack excludes. `entries`
 * must be non-empty and hold at least one positive weight.
 */
export function nextWeighted<T>(
  rng: Rng,
  entries: readonly (readonly [T, number])[],
): [T, Rng] {
  let total = 0
  for (const [, weight] of entries) total += weight

  const [value, advanced] = next(rng)
  let target = value * total

  for (const [item, weight] of entries) {
    target -= weight
    if (target < 0) return [item, advanced]
  }

  // Floating-point drift only — the loop above consumes the whole total. Fall
  // back to the last positive-weight entry rather than returning a zero-weight
  // one, which would violate this function's one hard promise.
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry && entry[1] > 0) return [entry[0], advanced]
  }

  throw new Error('nextWeighted: no entry with a positive weight')
}
