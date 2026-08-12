import { useEffect, useState } from 'react'
import { ALL_CARD_RANKS, SUITS } from '../data/cards'
import { DECK_CAP } from '../data/deck'
import { PIECE_TYPES } from '../data/pieceTypes'
import { TIERS } from '../data/tiers'
import { stagingRank } from '../game'
import type { CardRank, PieceTier, PieceTypeId, Suit } from '../game'
import { dispatch, useGameStore } from '../state/store'
import { useUiStore } from '../state/uiStore'
import { resetRun } from './cardActions'

const PIECE_IDS = Object.keys(PIECE_TYPES) as PieceTypeId[]
const TIER_IDS = Object.keys(TIERS) as PieceTier[]

/**
 * The developer panel: round selection, an any-card picker, a Piece spawner,
 * and Ink/Core/board/tower utilities for testing every mechanic (issue #60).
 *
 * Deliberately NOT a modal — the player must keep clicking the board (to place
 * towers) while it is open. Form state is local and never touches the
 * simulation; each control dispatches one dev command through the normal
 * surface. The whole component is guarded by `import.meta.env.DEV`, which Vite
 * statically replaces, so it — and the hotkey listener — are dead-code
 * eliminated from the production bundle. There is no engine-side gate.
 */
export function DevPanel() {
  const open = useUiStore((store) => store.devPanelOpen)
  const setOpen = useUiStore((store) => store.setDevPanelOpen)
  const snapshot = useGameStore((store) => store.snapshot)
  const { board, roundNumber, phase, core, towers, deck, ink } = snapshot

  const [roundInput, setRoundInput] = useState(String(roundNumber))
  const [cardRank, setCardRank] = useState<CardRank | ''>('')
  const [cardSuit, setCardSuit] = useState<Suit>('hearts')
  const [pieceType, setPieceType] = useState<PieceTypeId>('pawn')
  const [pieceTier, setPieceTier] = useState<PieceTier>('green')
  const [fileInput, setFileInput] = useState('0')
  const [rankInput, setRankInput] = useState('0')
  const [inkInput, setInkInput] = useState('100')
  const [coreHealthInput, setCoreHealthInput] = useState(String(core.health))
  const [coreMaxInput, setCoreMaxInput] = useState(String(core.maxHealth))
  const [growInput, setGrowInput] = useState('1')

  // Backquote toggles the panel. The listener is a plain event handler — no
  // setState in an effect — and it ships nowhere because the guard at the top
  // of the effect body skips registration outside dev builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '`') return
      event.preventDefault()
      useUiStore.getState().setDevPanelOpen(!useUiStore.getState().devPanelOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!import.meta.env.DEV) return null

  if (!open) {
    return (
      <button type="button" className="dev-panel__toggle" onClick={() => setOpen(true)}>
        Dev
      </button>
    )
  }

  const maxFile = board.files - 1
  const maxRank = stagingRank(board)

  return (
    <div className="dev-panel" role="dialog" aria-label="Developer tools">
      <div className="dev-panel__head">
        <span className="hud__label">Developer tools</span>
        <button type="button" className="dev-panel__close" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Round</h2>
        <div className="dev-panel__row">
          <label>
            Round number
            <input
              type="number"
              min={1}
              value={roundInput}
              disabled={phase !== 'gap'}
              onChange={(event) => setRoundInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            disabled={phase !== 'gap'}
            onClick={() => dispatch({ kind: 'devSetRound', roundNumber: Number(roundInput) })}
          >
            Set round
          </button>
        </div>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Deck</h2>
        <div className="dev-panel__row">
          <select
            value={cardRank}
            onChange={(event) =>
              setCardRank(event.target.value === '' ? '' : (event.target.value as CardRank))
            }
          >
            <option value="">Joker</option>
            {ALL_CARD_RANKS.map((rank) => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </select>
          <select
            value={cardSuit}
            disabled={cardRank === ''}
            onChange={(event) => setCardSuit(event.target.value as Suit)}
          >
            {SUITS.map((suit) => (
              <option key={suit} value={suit}>
                {suit}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="hud__button"
            onClick={() =>
              dispatch(
                cardRank === ''
                  ? { kind: 'devAddCard' }
                  : { kind: 'devAddCard', rank: cardRank, suit: cardSuit },
              )
            }
          >
            Add card
          </button>
        </div>
        <p className="hud__hint">{deck.length} / {DECK_CAP} cards — the picker ignores the cap.</p>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Pieces</h2>
        <div className="dev-panel__row">
          <select
            value={pieceType}
            onChange={(event) => setPieceType(event.target.value as PieceTypeId)}
          >
            {PIECE_IDS.map((typeId) => (
              <option key={typeId} value={typeId}>
                {PIECE_TYPES[typeId].label}
              </option>
            ))}
          </select>
          <select
            value={pieceTier}
            onChange={(event) => setPieceTier(event.target.value as PieceTier)}
          >
            {TIER_IDS.map((tier) => (
              <option key={tier} value={tier}>
                {TIERS[tier].label}
              </option>
            ))}
          </select>
          <label>
            File
            <input
              type="number"
              min={0}
              max={maxFile}
              value={fileInput}
              onChange={(event) => setFileInput(event.target.value)}
            />
          </label>
          <label>
            Rank
            <input
              type="number"
              min={0}
              max={maxRank}
              value={rankInput}
              onChange={(event) => setRankInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() =>
              dispatch({
                kind: 'devSpawnPiece',
                typeId: pieceType,
                tier: pieceTier,
                square: { file: Number(fileInput), rank: Number(rankInput) },
              })
            }
          >
            Spawn
          </button>
        </div>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Economy</h2>
        <div className="dev-panel__row">
          <label>
            Ink
            <input
              type="number"
              min={1}
              value={inkInput}
              onChange={(event) => setInkInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() => dispatch({ kind: 'devAddInk', amount: Number(inkInput) })}
          >
            Add ink
          </button>
        </div>
        <p className="hud__hint">{ink} ink available.</p>
        <div className="dev-panel__row">
          <label>
            Core health
            <input
              type="number"
              min={1}
              value={coreHealthInput}
              onChange={(event) => setCoreHealthInput(event.target.value)}
            />
          </label>
          <label>
            Core max
            <input
              type="number"
              min={1}
              value={coreMaxInput}
              onChange={(event) => setCoreMaxInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() =>
              dispatch({
                kind: 'devSetCoreHealth',
                health: Number(coreHealthInput),
                maxHealth: Number(coreMaxInput),
              })
            }
          >
            Set core
          </button>
        </div>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Board</h2>
        <div className="dev-panel__row">
          <label>
            +ranks
            <input
              type="number"
              min={1}
              value={growInput}
              onChange={(event) => setGrowInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="hud__button"
            onClick={() => dispatch({ kind: 'devGrowBoard', ranks: Number(growInput) })}
          >
            Grow
          </button>
        </div>
        <p className="hud__hint">
          {board.files}×{board.ranks}
        </p>
      </section>

      <section className="dev-panel__section">
        <h2 className="dev-panel__title">Utilities</h2>
        <div className="dev-panel__row">
          <button type="button" className="hud__button" onClick={() => dispatch({ kind: 'devClearPieces' })}>
            Clear pieces
          </button>
          <button type="button" className="hud__button" onClick={() => resetRun()}>
            Reset run
          </button>
        </div>
        <ul className="dev-panel__towers">
          {towers.map((tower) => (
            <li key={tower.id}>
              <span>
                Rank {tower.cardRank} — {tower.square.file},{tower.square.rank}
              </span>
              <button
                type="button"
                className="dev-panel__remove"
                onClick={() => dispatch({ kind: 'devRemoveTower', towerId: tower.id })}
              >
                Remove
              </button>
            </li>
          ))}
          {towers.length > 0 ? (
            <li>
              <button
                type="button"
                className="hud__button"
                onClick={() =>
                  towers.forEach((tower) => dispatch({ kind: 'devRemoveTower', towerId: tower.id }))
                }
              >
                Remove all towers
              </button>
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
