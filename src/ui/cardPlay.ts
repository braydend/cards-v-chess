import { towerRank } from '../data/towerRanks'
import { commandFor, isBuildableRank, type Card, type Command, type PlayMode } from '../game'
import { GEOMETRY_LABELS } from './geometryLabels'

const FACE_ACTION = {
  J: 'Shield a Tower',
  Q: 'Echo a Tower',
  K: 'Reinforce the Core',
  A: 'Expand the board',
} as const

/**
 * What playing this Card for its rank would do.
 *
 * A numbered Card builds; a face Card acts instead; a Joker has one play and no
 * rank at all. Geometry leads range and damage here on purpose: shape is what
 * decides whether a Tower is worth building at all (a diagonal Tower only ever
 * hits one square colour), where range and damage are just numbers on a curve.
 * The geometry text is `GEOMETRY_LABELS` verbatim — this must never fork into a
 * second copy of that table.
 *
 * `range` is abbreviated to `R` because the button is one line in a narrow
 * panel. `TowerPanel` still spells it out in full; it has a whole line to
 * itself there.
 *
 * Pure and separate from `Deck.tsx` because there is no jsdom here — a decision
 * left in a `.tsx` file cannot be tested at all. See CLAUDE.md.
 */
export function rankModeLabel(card: Card): string {
  if (card.kind === 'joker') return 'Clear every Piece'
  if (!isBuildableRank(card.rank)) return FACE_ACTION[card.rank]

  const def = towerRank(card.rank)
  return `Build — ${GEOMETRY_LABELS[def.geometry]} (R${def.range}, ${def.damage} dmg)`
}

/** What the player should click next for this Card in this mode. */
export function targetHint(
  card: Card,
  playMode: PlayMode,
  towerCount: number,
  echoSourceTowerId: string | null,
): string {
  const noTowers = towerCount === 0 ? ' — you have none yet' : ''

  if (playMode === 'support' && card.kind === 'standard') {
    // A numbered Card reaches only its own rank; a face card reaches anything.
    return isBuildableRank(card.rank)
      ? `Click a rank-${card.rank} Tower to support${noTowers}`
      : `Click any Tower to support${noTowers}`
  }

  if (card.kind === 'standard' && card.rank === 'J') {
    return `Click a Tower to shield${noTowers}`
  }

  if (card.kind === 'standard' && card.rank === 'Q') {
    return echoSourceTowerId
      ? 'Now click an empty square for the echo'
      : `Click the Tower to echo${noTowers}`
  }

  return 'Click a square on the board'
}

/**
 * The command a Card produces when played straight from the Deck — the
 * untargeted plays (King, Ace, Joker) — or null when the play needs a board
 * target. Shared by the desktop Deck and the mobile selected-card strip so the
 * two cannot drift. Wraps the engine's `commandFor`; it does not validate.
 */
export function untargetedPlay(card: Card, mode: PlayMode): Command | null {
  return mode === 'build' ? commandFor(card, 'build', { kind: 'none' }) : null
}
