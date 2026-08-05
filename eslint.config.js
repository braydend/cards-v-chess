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
    files: ['src/game/**/*.ts', 'src/data/**/*.ts'],
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
)
