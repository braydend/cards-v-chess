/**
 * A large, centered, single-line announcement that flashes in, holds, and
 * fades out (~4s, driven entirely by CSS).
 *
 * Scenario-agnostic: it takes one message and never reads a store, so any
 * future feedback scenario reuses it unchanged — the caller decides when to
 * mount it and what it says. Pointer-transparent, so it never blocks the
 * board during a round.
 */
export function Banner({ message }: { message: string }) {
  return <div className="banner">{message}</div>
}
