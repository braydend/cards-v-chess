import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // The rules engine is pure TypeScript and needs no DOM. If a UI test ever
    // needs one, give that file its own environment via a docblock comment
    // rather than slowing the whole suite down.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
