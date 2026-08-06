import { towerRank } from '../data/towerRanks'
import { commandFor, isBuildableRank, type Card } from '../game'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { GEOMETRY_LABELS } from './geometryLabels'
import { supportModeLabel } from './supportLabel'

const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', spades: '♠', clubs: '♣' } as const

const FACE_ACTION = {
  J: 'Shield a Tower',
  Q: 'Echo a Tower',
  K: 'Reinforce the Core',
  A: 'Expand the board',
} as const

function cardLabel(card: Card): string {
  if (card.kind === 'joker') return 'Joker'
  return `${card.rank}${SUIT_GLYPH[card.suit]}`
}

/**
 * What playing this Card for its rank would do.
 *
 * A numbered Card builds; a face Card acts instead; a Joker has one play and no
 * rank at all.
 *
 * Geometry leads range and damage here on purpose: shape is what decides
 * whether a Tower is worth building at all (a diagonal Tower only ever hits
 * one square colour), where range and damage are just numbers on a curve. The
 * geometry text is `GEOMETRY_LABELS` verbatim — this must never fork into a
 * second copy of that table.
 *
 * `range` is abbreviated to `R` because the button is one line in a narrow
 * panel and the longest geometry sentence (diagonal's, with its own aside)
 * does not leave room for the whole word — spelling it out wraps the label
 * even at the panel's normal resting width. `TowerPanel` still spells it out
 * in full; it has a whole line to itself there.
 */
function rankModeLabel(card: Card): string {
  if (card.kind === 'joker') return 'Clear every Piece'
  if (!isBuildableRank(card.rank)) return FACE_ACTION[card.rank]

  const def = towerRank(card.rank)
  return `Build — ${GEOMETRY_LABELS[def.geometry]} (R${def.range}, ${def.damage} dmg)`
}

/**
 * The Deck: every Card held this run, always visible and always playable.
 *
 * There is no hand and no draw pile, so nothing here is hidden. Duplicates are
 * individually selectable — three 5♦ are three distinct Cards, and playing one
 * leaves two.
 */
export function Deck() {
  const deck = useGameStore((store) => store.snapshot.deck)
  const towers = useGameStore((store) => store.snapshot.towers)
  const selectedCardId = useUiStore((store) => store.selectedCardId)
  const setSelectedCardId = useUiStore((store) => store.setSelectedCardId)
  const playMode = useUiStore((store) => store.playMode)
  const setPlayMode = useUiStore((store) => store.setPlayMode)
  const echoSourceTowerId = useUiStore((store) => store.echoSourceTowerId)
  const setEchoSourceTowerId = useUiStore((store) => store.setEchoSourceTowerId)

  const selected = deck.find((card) => card.id === selectedCardId)

  // King, Ace and Joker take no target, so they resolve from here rather than
  // waiting for a board click — but only when played for their rank. Every face
  // Card can also be played for its suit, and that play needs a Tower.
  const untargeted =
    selected && playMode === 'build' ? commandFor(selected, 'build', { kind: 'none' }) : null

  return (
    <div className="deck">
      <div className="deck__header">
        <span className="hud__label">Deck</span>
        <span className="hud__muted">{deck.length} cards</span>
      </div>

      <ul className="deck__cards">
        {deck.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className={`deck__card${card.id === selectedCardId ? ' deck__card--active' : ''}${
                card.kind === 'standard' ? ` deck__card--${card.suit}` : ' deck__card--joker'
              }`}
              onClick={() => {
                // Clear any half-finished Echo so it cannot leak into the next play.
                setEchoSourceTowerId(null)
                // Each Card is picked fresh in rank mode. Carrying the previous
                // Card's mode across would leave a Joker stuck in a suit mode it
                // cannot offer, with no button to switch back.
                setPlayMode('build')
                setSelectedCardId(card.id === selectedCardId ? null : card.id)
              }}
            >
              {cardLabel(card)}
            </button>
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="deck__detail">
          <div className="deck__modes">
            <button
              type="button"
              className={`deck__mode${playMode === 'build' ? ' deck__mode--active' : ''}`}
              onClick={() => setPlayMode('build')}
            >
              {rankModeLabel(selected)}
            </button>

            {selected.kind === 'standard' ? (
              <button
                type="button"
                className={`deck__mode${playMode === 'support' ? ' deck__mode--active' : ''}`}
                onClick={() => setPlayMode('support')}
              >
                {supportModeLabel(selected.suit, selected.rank)}
              </button>
            ) : null}
          </div>

          {untargeted ? (
            <button
              type="button"
              className="deck__play"
              onClick={() => {
                // Refused only if the game is defeated (the Card is otherwise
                // guaranteed legal) — but a refusal must not clear the
                // selection, since the Card was not consumed.
                if (dispatch(untargeted)) setSelectedCardId(null)
              }}
            >
              Play
            </button>
          ) : (
            <p className="hud__hint">{targetHint(selected, playMode, towers.length, echoSourceTowerId)}</p>
          )}
        </div>
      ) : (
        <p className="hud__hint">Pick a Card to play it.</p>
      )}
    </div>
  )
}


/** What the player should click next for this Card in this mode. */
function targetHint(
  card: Card,
  playMode: 'build' | 'support',
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
