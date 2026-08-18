import { PACK_TYPES } from '../data/packs'
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

  // Tower health, maxHealth, shield, damage and fire interval are included so
  // support effects are visible — maxHealth matters because Towers.tsx draws
  // `tower.health / tower.maxHealth` and TowerPanel prints the ceiling itself.
  // No play moves maxHealth on its own today (a ♠ moves health with it), so
  // health would currently cover every case; maxHealth stays keyed because it
  // is rendered, not because some play is known to move it alone.
  // `fireCooldownMs` is deliberately NOT here: that changes every tick and
  // would force a React render per frame.
  // `type` and `range` are keyed because the renderer now draws the Tower from
  // them; `pendingTower` is keyed separately below because it changes when a
  // hand is committed or placed, and the build preview lives on it.
  const towers = state.towers
    .map(
      (tower) =>
        `${tower.id}@${tower.square.file},${tower.square.rank}:${tower.type}:${tower.range}:${tower.health}:${tower.maxHealth}:${tower.shield}:${tower.damage}:${tower.fireIntervalMs}`,
    )
    .join('|')

  return [
    state.phase,
    state.roundNumber,
    state.core.health,
    state.core.maxHealth,
    state.leaks,
    // Ink moves on a kill, a round completion, or a Joker's Clear, and all
    // three already change this key: a kill and a Clear both shrink or empty
    // the `pieces` string, a Clear also removes the consumed Joker from the
    // Deck's id list below, and a completion changes `phase` and `roundNumber`.
    // Keyed because the HUD prints it, not because it adds a publish. It is NOT
    // a per-tick value; adding one of those here would force a React render
    // every frame.
    state.ink,
    // Pack purchases, because the shop prices from them. Rare-changing — a
    // purchase already moves ink and the Deck ids, so this adds no publishes;
    // keyed so a price change is never silently invisible.
    PACK_TYPES.map((pack) => state.packPurchases[pack]).join(','),
    state.autoStart,
    state.pendingSpawns.length,
    // The board grows when an Ace is played, and the renderer draws from it.
    state.board.ranks,
    state.board.files,
    // The Deck's card ids, NOT its length.
    //
    // Length was faithful while every card play removed exactly one card. Packs
    // break that: culling at the cap destroys exactly as many cards as the pack
    // deals, so a purchase can replace ten cards without moving the length by
    // one — and keyed on length, the store would never publish and the new cards
    // would never reach React. That is what culling at the cap always looks
    // like, so it is the common case rather than an edge.
    //
    // Cheap enough to be uninteresting: thirty short ids, joined a couple of
    // dozen times a second, adding no publishes. Derived from the Deck rather
    // than tracked in a counter, so there is no bookkeeping to forget.
    state.deck.map((card) => card.id).join(','),
    // A hand being committed or placed moves this, and the build preview lives
    // on it — keyed so the preview follows the commit and clears on placement.
    // The type alone is keyed, not the whole `PendingTower` record: the record
    // also carries the committed Cards, whose identities already move the key
    // through the Deck's id list above (they leave it on commit and return on
    // cancel), and keying them again would only bloat the string.
    state.pendingTower?.type ?? null,
    pieces,
    towers,
  ].join('#')
}
