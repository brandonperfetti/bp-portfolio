import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import tsdoc from 'eslint-plugin-tsdoc'

import safeHtml from './scripts/lib/eslint-safe-html.mjs'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'node_modules/**',
    'next-env.d.ts',
    // Payload-generated artifacts — regenerated, not hand-maintained.
    'src/payload-types.ts',
    'src/app/(payload)/admin/importMap.js',
    // Storybook build output.
    'storybook-static/**',
    // Playwright artifacts (HTML report bundles its own minified JS).
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['next-env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { tsdoc },
    rules: {
      // TSDoc syntax validation on doc comments (project standard §15b).
      'tsdoc/syntax': 'warn',
      'prefer-const': 'error',
      'no-fallthrough': 'error',
      'no-unused-vars': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // The JSON-LD escaping rule, gated (#248): `dangerouslySetInnerHTML`
    // takes its `__html` from `toSafeJsonLd` only, and silencing that needs a
    // written reason. Rule source and tests: scripts/lib/eslint-safe-html.*.
    plugins: { local: safeHtml },
    rules: {
      'local/no-unsanitized-html': [
        'error',
        {
          sanitizers: [{ name: 'toSafeJsonLd', from: ['@/lib/seo/jsonLd'] }],
        },
      ],
      'local/no-unjustified-html-disable': 'error',
    },
  },
  {
    // Payload migrations are generated DDL; unused args come from the template.
    files: ['src/migrations/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
])
