import { PACK_TYPES } from '../data/packs'
import { VICTORY_ROUND, roundSpec } from '../data/rounds'
import { canAfford, createInitialState, step, tick } from '../game'
import type { GameState } from '../game'
import type { Bot, RoundTrace, RunResult } from './types'

export const FIXED_DT_MS = 1000 / 60

/**
 * How many commands the driver will accept from a bot within one gap.
 *
 * Defensive only: a well-behaved bot is bounded by the deck cap and its Ink,
 * both finite. The bound exists so a runaway bot cannot spin the gap forever.
 */
const MAX_GAP_COMMANDS = 10_000

/**
 * Whether a player in this gap is permanently stuck: no cards left to commit
 * and no pack they can afford. The "running out of cards" open question.
 */
export function isStarved(state: GameState): boolean {
  if (state.deck.length > 0) return false
  return !PACK_TYPES.some((pack) => canAfford(state.ink, pack, state.packPurchases[pack]))
}

export interface RunOptions {
  /** Stop the run once `roundNumber` exceeds this. Defaults to `VICTORY_ROUND`. */
  readonly maxRounds?: number
}

/**
 * Drives one full run: the real engine, nothing else.
 *
 * `tick` at the engine's fixed timestep, `step` for every bot command, refused
 * commands detected by identity (a refusal returns the same state object) and
 * skipped. Ends on `defeated`, `victory`, or `maxRounds`.
 */
export function runSimulation(seed: string, bot: Bot, options: RunOptions = {}): RunResult {
  const maxRounds = options.maxRounds ?? VICTORY_ROUND
  let state = createInitialState(seed)
  const rounds: RoundTrace[] = []
  const starvationRounds: number[] = []

  while (state.phase === 'gap' || state.phase === 'inProgress') {
    if (state.phase !== 'gap') break // defence: never reached by the loop shape below

    if (state.roundNumber > maxRounds) break
    if (isStarved(state)) starvationRounds.push(state.roundNumber)

    const roundNumber = state.roundNumber
    const startPieces = state.pieces.length
    const startLeaks = state.leaks
    const spawned = roundSpec(roundNumber).spawns.length

    state = resolveGap(state, bot)
    const started = step(state, { kind: 'startRound' })
    if (started === state) break // startRound refused — a bot left a Tower pending; do not hang

    const result = runRound(started, bot)
    state = result.state
    const leaked = state.leaks - startLeaks
    // Every Piece that entered the round — carried over plus spawned — either
    // leaked, died, or is still standing. Kills is the middle term.
    const killed = Math.max(0, startPieces + spawned - state.pieces.length - leaked)
    rounds.push({ roundNumber, spawned, killed, leaked, clearTimeMs: result.clearTimeMs })
  }

  return {
    seed,
    botName: bot.name,
    outcome: state.phase === 'victory' ? 'won' : state.phase === 'defeated' ? 'defeated' : 'stopped',
    finalRound: state.roundNumber,
    coreHealth: state.core.health,
    coreMaxHealth: state.core.maxHealth,
    ink: state.ink,
    leaks: state.leaks,
    clears: state.clears,
    totalKills: rounds.reduce((sum, trace) => sum + trace.killed, 0),
    starved: starvationRounds.length > 0,
    starvationRounds,
    rounds,
  }
}

/** Polls the bot for commands until it is done, then returns the settled state. */
function resolveGap(state: GameState, bot: Bot): GameState {
  let current = state
  for (let i = 0; i < MAX_GAP_COMMANDS; i += 1) {
    const command = bot.decide(current)
    if (!command) return current
    const next = step(current, command)
    if (next === current) return current // refused — a stateless bot would repeat it forever
    current = next
  }
  return current
}

/** Advances one round until it leaves `inProgress`, polling the bot once per tick. */
function runRound(state: GameState, bot: Bot): { state: GameState; clearTimeMs: number } {
  let current = state
  let clearTimeMs = 0
  while (current.phase === 'inProgress') {
    const command = bot.decide(current)
    if (command) {
      const next = step(current, command)
      if (next !== current) {
        current = next
        continue
      }
    }
    clearTimeMs = current.roundElapsedMs
    current = tick(current, FIXED_DT_MS)
  }
  return { state: current, clearTimeMs }
}
