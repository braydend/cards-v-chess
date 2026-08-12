import { useState } from 'react'
import type { Card, Command, FaceRank, HandType, RoundPhase } from '../game'
import { HAND_SIZES } from '../game'
import { TOWER_TYPE_IDS, type TowerTypeId } from '../data/towerTypes'
import { dispatch } from '../state/store'
import { FACE_ACTION, commitCommand, selectionSummary } from './handSelection'

/** Player-facing name of each hand. */
const HAND_LABELS: Record<HandType, string> = {
  highCard: 'High card',
  pair: 'Pair',
  twoPair: 'Two pair',
  threeOfAKind: 'Three of a kind',
  straight: 'Straight',
  flush: 'Flush',
  fullHouse: 'Full house',
  fourOfAKind: 'Four of a kind',
  straightFlush: 'Straight flush',
  royalFlush: 'Royal flush',
}

/** Where a lone Jack or Queen points next — its action needs a Tower click. */
const FACE_TARGET_HINT: Record<'J' | 'Q', string> = {
  J: 'Click a Tower to shield it',
  Q: 'Click a Tower to add +1 range',
}

/**
 * The command a face Card's action produces straight from the Deck, or null
 * when the action needs a board target. J/Q need a Tower click, which the
 * board resolves; K/A are untargeted and play from here.
 */
function faceActionCommand(rank: FaceRank, cardId: string): Command | null {
  if (rank === 'K') return { kind: 'reinforceCore', cardId }
  if (rank === 'A') return { kind: 'expandBoard', cardId }
  return null
}

/**
 * The hand panel: what the current selection means and what can be done with
 * it. Shared by the desktop Deck and the mobile strip so the two cannot drift.
 *
 * `onCommitted` runs when a command lands — it clears the selection (and, in
 * the callers, the touch preview). The parent keys this component on the
 * selection, so a change in the picked cards remounts it and the royal-flush
 * Tower choice resets — no effect, no stale type.
 */
export function HandPanel({
  cards,
  phase,
  onCommitted,
}: {
  readonly cards: readonly Card[]
  readonly phase: RoundPhase
  readonly onCommitted: () => void
}) {
  const summary = selectionSummary(cards)
  const [royalType, setRoyalType] = useState<TowerTypeId | null>(null)

  function commit(chosenType?: TowerTypeId) {
    const command = commitCommand(cards, chosenType)
    if (command && dispatch(command)) onCommitted()
  }

  if (summary.kind === 'empty') {
    return <p className="hud__hint">Pick Cards to form a hand.</p>
  }

  if (summary.kind === 'invalid') {
    return <p className="hud__hint">These Cards are not one hand.</p>
  }

  if (summary.kind === 'singleFace') {
    const face = cards[0]
    return (
      <div className="handPanel">
        <p className="handPanel__label">{FACE_ACTION[summary.rank]}</p>

        {summary.rank === 'J' || summary.rank === 'Q' ? (
          <p className="hud__hint">{FACE_TARGET_HINT[summary.rank]}</p>
        ) : face ? (
          <button
            type="button"
            className="deck__play"
            onClick={() => {
              const command = faceActionCommand(summary.rank, face.id)
              if (command && dispatch(command)) onCommitted()
            }}
          >
            Play
          </button>
        ) : null}

        {phase === 'gap' ? (
          <button type="button" className="deck__mode" onClick={() => commit()}>
            Commit as high card
          </button>
        ) : null}
      </div>
    )
  }

  if (summary.kind === 'singleJoker') {
    const joker = cards[0]
    return (
      <div className="handPanel">
        <p className="handPanel__label">Clear every Piece on the board</p>
        {joker ? (
          <button
            type="button"
            className="deck__play"
            onClick={() => {
              const command: Command = { kind: 'clearPieces', cardId: joker.id }
              if (dispatch(command)) onCommitted()
            }}
          >
            Play
          </button>
        ) : null}
      </div>
    )
  }

  const isRoyal = summary.hand === 'royalFlush'
  return (
    <div className="handPanel">
      <p className="handPanel__label">
        {HAND_LABELS[summary.hand]} ({HAND_SIZES[summary.hand]}) — builds {summary.towerLabel}
      </p>

      {isRoyal ? (
        <div className="handPanel__types">
          {TOWER_TYPE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`handPanel__type${royalType === id ? ' handPanel__type--active' : ''}`}
              onClick={() => setRoyalType(id)}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="deck__play"
        disabled={phase !== 'gap' || (isRoyal && royalType === null)}
        onClick={() => commit(isRoyal ? (royalType ?? undefined) : undefined)}
      >
        Commit hand
      </button>
    </div>
  )
}
