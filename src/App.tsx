import { Canvas } from '@react-three/fiber'
import { GameScene } from './scene/GameScene'
import { Hud } from './ui/Hud'

export function App() {
  return (
    <>
      <Canvas shadows camera={{ position: [0, 9, 10], fov: 45 }}>
        <color attach="background" args={['#151a21']} />
        <GameScene />
      </Canvas>
      <Hud />
    </>
  )
}
