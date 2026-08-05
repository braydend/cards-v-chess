import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project at /cards-v-chess/, so production assets need
// that prefix or every URL 404s. Dev stays at the root.
const PAGES_BASE = '/cards-v-chess/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PAGES_BASE : '/',
  plugins: [react()],
  test: {
    // The rules engine is pure TypeScript and needs no DOM. If a UI test ever
    // needs one, give that file its own environment via a docblock comment
    // rather than slowing the whole suite down.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}))
