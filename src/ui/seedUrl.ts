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