import { useGameStore } from '../state/store'
import { Banner } from './Banner'
import { guardRoundBanner } from './guardRoundBanner'

/**
 * The King's Guard announcement.
 *
 * Reads the snapshot and mounts the banner the moment a Guard round enters
 * progress. Keyed by round number so each Guard round remounts the banner
 * and replays the flash even if React otherwise would not remount it (a
 * round resolving and the next auto-starting inside one publish batch).
 * Mounting (and the CSS animation) is the whole mechanism — no timers, no
 * effects, no engine changes.
 */
export function GuardRoundBanner() {
  const snapshot = useGameStore((store) => store.snapshot)
  const message = guardRoundBanner(snapshot.phase, snapshot.roundNumber)

  if (message === null) return null
  return <Banner key={snapshot.roundNumber} message={message} />
}
