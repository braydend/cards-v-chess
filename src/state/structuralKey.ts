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

  // Tower health, shield, damage and fire interval are included so support
  // effects are visible, but `fireCooldownMs` is NOT: that changes every tick
  // and would force a React render per frame.
  const towers = state.towers
    .map(
      (tower) =>
        `${tower.id}@${tower.square.file},${tower.square.rank}:${tower.health}:${tower.shield}:${tower.damage}:${tower.fireIntervalMs}`,
    )
    .join('|')

  return [
    state.phase,
    state.roundNumber,
    state.core.health,
    state.core.maxHealth,
    state.leaks,
    state.autoStart,
    state.pendingSpawns.length,
    // The board grows when an Ace is played, and the renderer draws from it.
    state.board.ranks,
    state.board.files,
    // Every card play removes exactly one card, so length alone is a faithful
    // trigger — and far cheaper than joining 30 ids on every publish.
    state.deck.length,
    pieces,
    towers,
  ].join('#')
}
