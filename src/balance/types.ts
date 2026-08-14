import type { PackType } from '../data/packs'
import type { TowerTypeId } from '../data/towerTypes'
import type { Command, GameState, HandType } from '../game'

/** A scripted player. Pure policy: decides a Command from the current state. */
export interface Bot {
  readonly name: string
  readonly decide: (state: GameState) => Command | null
}

/** One round's outcome, recorded by the driver. */
export interface RoundTrace {
  readonly roundNumber: number
  readonly spawned: number
  readonly killed: number
  readonly leaked: number
  readonly clearTimeMs: number
}

export type RunOutcome = 'won' | 'defeated' | 'stopped'

/** Everything the driver learns from one bot × seed run. */
export interface RunResult {
  readonly seed: string
  readonly botName: string
  readonly outcome: RunOutcome
  readonly finalRound: number
  readonly coreHealth: number
  readonly coreMaxHealth: number
  readonly ink: number
  readonly leaks: number
  readonly clears: number
  readonly totalKills: number
  readonly starved: boolean
  readonly starvationRounds: readonly number[]
  readonly rounds: readonly RoundTrace[]
}

/** Where a bot prefers to build. */
export type PlacementStrategy = 'maxCoverage' | 'spawnSide' | 'coreSide'

/** The knobs that turn one `makeBot` into three play styles. */
export interface BotParams {
  readonly name: string
  readonly placement: PlacementStrategy
  readonly packPreference: readonly PackType[]
  readonly inkReserve: number
  readonly minHand: HandType
  readonly royalChoice: TowerTypeId
  readonly emergencyClearThreshold: number
  readonly useExpand: boolean
}
