import type { GameState } from '../game'

/**
 * A string that changes only when something React needs to re-render changes.
 *
 * Deliberately excludes `roundElapsedMs`, `moveCooldownMs`, and `prevSquare` —
 * those change every single tick, and including them would push a React render
 * 60 times a second, which is exactly the R3F pitfall CLAUDE.md forbids.
 *
 * Because pieces move in discrete hops, this key changes only a few times per
 * second. Smooth motion between squares is the renderer's job, done by mutating
 * refs inside `useFrame`.
 */
export function structuralKey(state: GameState): string {
  const pieces = state.pieces
    .map((piece) => `${piece.id}@${piece.square.file},${piece.square.rank}:${piece.health}`)
    .join('|')

  const towers = state.towers
    .map((tower) => `${tower.id}@${tower.square.file},${tower.square.rank}`)
    .join('|')

  return [
    state.phase,
    state.roundNumber,
    state.core.health,
    state.leaks,
    state.autoStart,
    state.pendingSpawns.length,
    pieces,
    towers,
  ].join('#')
}
