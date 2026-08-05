import { Instance, Instances } from '@react-three/drei'
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'

const CARDS_COLOUR = '#2e86c1'

/**
 * Towers are static, so they need no frame loop at all — they re-render only
 * when one is placed.
 *
 * They have no combat behaviour and no health yet. Towers are designed to be
 * destructible, and their firing geometry comes from the Card rank that built
 * them. Neither is implemented. See CLAUDE.md.
 */
export function Towers({ board }: { board: BoardSpec }) {
  const towers = useGameStore((store) => store.snapshot.towers)

  return (
    <Instances limit={256} castShadow>
      <cylinderGeometry args={[0.26, 0.34, 0.6, 6]} />
      <meshStandardMaterial color={CARDS_COLOUR} flatShading />
      {towers.map((tower) => (
        <Instance
          key={tower.id}
          position={[
            fileToWorldX(board, tower.square.file),
            0.3,
            rankToWorldZ(board, tower.square.rank),
          ]}
        />
      ))}
    </Instances>
  )
}
