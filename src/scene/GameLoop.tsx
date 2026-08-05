import { useFrame } from '@react-three/fiber'
import { advance } from '../state/simulation'

/**
 * Drives the simulation from R3F's frame loop.
 *
 * Note what is absent: no `setState`, no store write, no React work at all. It
 * hands the raw frame delta to the accumulator, which converts it into fixed
 * steps. The store updates itself by subscription, and only when the board
 * actually changed.
 */
export function GameLoop() {
  useFrame((_, delta) => {
    advance(delta * 1000)
  })

  return null
}
