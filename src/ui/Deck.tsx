import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { rankModeLabel, targetHint, untargetedPlay } from './cardPlay'
import { CardFace } from './CardFace'
import { supportModeLabel } from './supportLabel'

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
  const untargeted = selected ? untargetedPlay(selected, playMode) : null

  return (
    <div className="deck">
      <div className="deck__header">
        <span className="hud__label">Deck</span>
        <span className="hud__muted">{deck.length} cards</span>
      </div>

      <ul className="deck__cards">
        {deck.map((card) => (
          <li key={card.id}>
            <CardFace
              card={card}
              modifier={card.id === selectedCardId ? 'deck__card--active' : undefined}
              onClick={() => {
                // Clear any half-finished Echo so it cannot leak into the next play.
                setEchoSourceTowerId(null)
                // Each Card is picked fresh in rank mode. Carrying the previous
                // Card's mode across would leave a Joker stuck in a suit mode it
                // cannot offer, with no button to switch back.
                setPlayMode('build')
                setSelectedCardId(card.id === selectedCardId ? null : card.id)
              }}
            />
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
