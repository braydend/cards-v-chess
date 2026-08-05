import { Instance, Instances } from '@react-three/drei'
import { BUILDABLE_RANKS } from '../data/towerRanks'
import type { BoardSpec, CardRank } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'

/** One colour per rank, so firing geometry is readable at a glance. */
export const RANK_COLOURS: Record<CardRank, string> = {
  2: '#2e86c1',
  3: '#16a085',
  4: '#8e44ad',
  5: '#d4ac0d',
}

/**
 * Towers are static, so they need no frame loop — they re-render only when one
 * is placed.
 *
 * They have no health yet and cannot be damaged or repaired; a Piece landing on
 * one does not yet attack it. Those are the next part of this slice.
 *
 * Grouped by rank so each rank gets its own instanced draw call, keeping one
 * shared geometry and material per group.
 */
export function Towers({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)

  return (
    <>
      {BUILDABLE_RANKS.map((rank) => {
        const ofRank = towers.filter((tower) => tower.cardRank === rank)
        if (ofRank.length === 0) return null

        return (
          <Instances key={rank} limit={128} castShadow>
            <cylinderGeometry args={[0.24, 0.32, 0.55 + rank * 0.06, 6]} />
            <meshStandardMaterial color={RANK_COLOURS[rank]} flatShading />
            {ofRank.map((tower) => (
              <Instance
                key={tower.id}
                position={[
                  fileToWorldX(board, tower.square.file),
                  (0.55 + rank * 0.06) / 2,
                  rankToWorldZ(board, tower.square.rank),
                ]}
              />
            ))}
          </Instances>
        )
      })}
    </>
  )
}
