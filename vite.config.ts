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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // `include` is set explicitly on purpose. By default coverage counts only
      // files the tests import, which means a brand-new untested file in
      // src/game/ would not move the number at all — the threshold would fail
      // to catch exactly what it exists to catch.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // The renderer is deliberately untested: it needs a browser, and the
        // engine boundary exists so the game is testable without one.
        'src/scene/**',
        'src/ui/**',
        'src/App.tsx',
        'src/main.tsx',
        // uiStore.ts is view-only state (selectedRank, hoveredSquare) — same
        // category as scene/ and ui/, just living in state/ because it's a
        // zustand store. store.ts and structuralKey.ts stay measured: they are
        // the simulation bridge, not view state. A new file in state/ belongs
        // here only if, like uiStore.ts, it holds UI-facing selection/pointer
        // state rather than mirroring the simulation.
        'src/state/uiStore.ts',
        // data/ is data, not code — a percentage over constant tables measures
        // nothing.
        'src/data/**',
      ],
      thresholds: {
        // A ratchet against regression, not a statement of the right level.
        // These numbers track the tree they were last measured against and
        // are expected to be re-set as the codebase grows — re-measure before
        // assuming they still reflect current coverage.
        'src/game/**': { statements: 85, branches: 85, functions: 85, lines: 90 },
        'src/state/**': { statements: 90, branches: 95, functions: 85, lines: 90 },
      },
    },
  },
}))
