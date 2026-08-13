/**
 * Normalises a user-supplied seed to the shape the engine expects.
 *
 * The engine hashes whatever string it is given, so "same seed" means "same
 * characters". A URL or a copy-paste can smuggle in leading/trailing
 * whitespace or an inconsistent case, so this is the single answer for seed
 * shape — the start-screen field and the URL read both call it, and they
 * cannot disagree. Any non-empty string is a valid seed; nothing else is
 * validated.
 */
export function normalizeSeed(input: string): string {
  return input.trim().toLowerCase()
}

/**
 * Reads the `?seed=` value from a URL search string.
 *
 * Takes the raw search string rather than touching `window.location`, so the
 * decision is pure and testable. Returns the normalised seed, or `null` when
 * the param is absent or empties on normalisation — an absent seed and an
 * unplayable one are the same thing to the caller.
 */
export function seedFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('seed')
  if (raw === null) return null

  const normalized = normalizeSeed(raw)
  return normalized === '' ? null : normalized
}

/**
 * Builds the `?seed=` search string for a run seed.
 *
 * The write-side counterpart of `seedFromUrl`. A seed is free text, so it may
 * carry characters the URL reserves — `&` would split into a sibling param and
 * `#` would truncate the search. Percent-encoding writes exactly what
 * `URLSearchParams` decodes on read, so the URL and the run it names cannot
 * disagree the way an unencoded write could. The `startRun` caller supplies
 * the seed already normalised, so this stays pure string surgery: no engine,
 * no `window.history`.
 */
export function urlForSeed(seed: string): string {
  return `?seed=${encodeURIComponent(seed)}`
}