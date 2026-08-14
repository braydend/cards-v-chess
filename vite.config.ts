import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project at /cards-v-chess/, so production assets need
// that prefix or every URL 404s. Dev stays at the root, since the dev server
// serves files directly and has no subpath to account for. Preview must use
// the same base as build: `vite preview` serves the already-built `dist/`,
// whose index.html hard-codes whatever base build ran with, so serving preview
// from `/` would 404 every asset and silently fall through to the SPA fallback.
const PAGES_BASE = '/cards-v-chess/'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
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
        // uiStore.ts is view-only state — the picked Card, its play mode, the
        // hovered square, the selected Tower — same category as scene/ and ui/,
        // just living in state/ because it's a zustand store. It holds nothing
        // the simulation reads, and every decision taken off it lives in a pure,
        // separately tested module (ui/handSelection.ts, scene/boardClick.ts)
        // rather than in the store. store.ts and structuralKey.ts stay measured: they are
        // the simulation bridge, not view state. A new file in state/ belongs
        // here only if, like uiStore.ts, it holds UI-facing selection/pointer
        // state rather than mirroring the simulation.
        'src/state/uiStore.ts',
        // data/ is data, not code — a percentage over constant tables measures
        // nothing.
        'src/data/**',
        // seeds.ts is the same: a constant table, only read by the advisory
        // balance gate, which this coverage run deliberately excludes.
        'src/balance/seeds.ts',
      ],
      thresholds: {
        // A ratchet against regression, not a statement of the right level.
        // These numbers track the tree they were last measured against and
        // are expected to be re-set as the codebase grows — re-measure before
        // assuming they still reflect current coverage.
        //
        // This is an allowlist, not a global floor: a directory only gets a
        // gate once it has an entry here. A brand-new measured directory (a
        // future src/engine/, say) is included by the `include` glob above
        // and so counts toward the overall coverage report, but has no
        // threshold of its own and cannot fail the build no matter how
        // untested it is. Adding a new top-level src/ directory that should
        // be held to a standard means adding its own entry below.
        'src/game/**': { statements: 85, branches: 85, functions: 85, lines: 90 },
        // Measured against the unit tests alone (strategy/driver/bots/metrics/
        // thresholds). The balance GATE (balance.test.ts) is excluded from this
        // run — CI runs it separately, advisory — so the gate's long sims do
        // not inflate (or gate) this number. Re-measure before adjusting: the
        // last read was 94.1/84.4/98.5/95.9.
        'src/balance/**': { statements: 90, branches: 82, functions: 95, lines: 92 },
        'src/state/**': { statements: 90, branches: 95, functions: 85, lines: 90 },
      },
    },
  },
}))
