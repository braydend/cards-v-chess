import { Instance, Instances } from '@react-three/drei'
import { Color } from 'three'
import { BUILDABLE_RANKS } from '../data/towerRanks'
import type { BoardSpec } from '../game'
import { useGameStore } from '../state/store'
import { fileToWorldX, rankToWorldZ } from './coords'
import { RANK_COLOURS } from './rankColours'

const DAMAGED = new Color('#3b0d0d')

/**
 * Darkens a Tower's colour as it loses health, so damage is legible without a
 * health bar. Allocates, but only on a structural re-render — never per frame.
 */
function damagedColour(base: string, healthFraction: number): string {
  return new Color(base).lerp(DAMAGED, (1 - healthFraction) * 0.85).getStyle()
}

/**
 * Towers are static, so they need no frame loop — they re-render only when one
 * is placed.
 *
 * They block movement and take damage from the Pieces they block, darkening as
 * their health drops. ♥ repair exists, but it is bounded by a finite Deck — see
 * the load-bearing invariant comment in `src/game/tick.ts:80-90` for why a
 * Tower under sustained attack still always eventually falls.
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
            <meshStandardMaterial flatShading />
            {ofRank.map((tower) => (
              <Instance
                key={tower.id}
                position={[
                  fileToWorldX(board, tower.square.file),
                  (0.55 + rank * 0.06) / 2,
                  rankToWorldZ(board, tower.square.rank),
                ]}
                color={damagedColour(RANK_COLOURS[rank], tower.health / tower.maxHealth)}
              />
            ))}
          </Instances>
        )
      })}
    </>
  )
}
