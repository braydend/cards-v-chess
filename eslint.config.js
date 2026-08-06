import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

// CLAUDE.md's one hard rule: the rules engine never depends on the renderer.
// Enforced here so it cannot erode by accident.
const RENDERER_PACKAGES = [
  'react',
  'react-dom',
  'three',
  'zustand',
  '@react-three/fiber',
  '@react-three/drei',
]

const BOUNDARY_MESSAGE =
  'src/game and src/data must stay renderer-agnostic — no React, no three.js, no view state. See CLAUDE.md.'

const BARREL_MESSAGE =
  'Import engine code through the src/game barrel (../game), not a module inside it — see src/game/index.ts. A deep import reaches past the public surface and can see something the barrel deliberately does not export.'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
  },
  {
    // Note: the top-level `configs.recommended` / `configs['recommended-latest']`
    // exports are still eslintrc-shaped (plugins as an array). The flat-config
    // versions live under `configs.flat`.
    ...reactHooks.configs.flat['recommended-latest'],
    files: ['src/**/*.tsx'],
  },
  {
    files: ['src/game/**/*.{ts,tsx}', 'src/data/**/*.{ts,tsx}'],
    rules: {
      // CLAUDE.md's determinism invariant: runs are seeded and the simulation
      // must stay reproducible, so randomness comes from a seeded PRNG carried
      // in GameState. Math.max and friends stay allowed — only random is banned.
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Runs are seeded — src/game and src/data must draw randomness from the PRNG in GameState, never Math.random. See CLAUDE.md.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: RENDERER_PACKAGES.map((name) => ({ name, message: BOUNDARY_MESSAGE })),
          patterns: [
            {
              group: ['three/**', '@react-three/**', '**/scene/**', '**/ui/**', '**/state/**'],
              message: BOUNDARY_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  {
    // The previous block restricts what src/game may import (outbound). This
    // one restricts what may import INTO src/game (inbound): the renderer must
    // go through the public surface at `src/game/index.ts`, never reach past it
    // into a module inside. A deep import can see something the barrel
    // deliberately does not export, and it is how the marker in
    // `CoveragePreview.tsx` could quietly drift from the refusal in
    // `cardPlays.ts` if someone imported `placement.ts` directly instead.
    files: ['src/scene/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/state/**/*.{ts,tsx}'],
    // Test files are exempt: `structuralKey.test.ts` imports `../game/fixtures`,
    // a test-only builder module that is deliberately not on the public surface
    // and has no reason to be — production code never needs it.
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/game/*'],
              message: BARREL_MESSAGE,
            },
          ],
        },
      ],
    },
  },
)
