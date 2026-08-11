import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Two projects share this config (run one with `--project=<name>`):
 *
 * - `unit` — jsdom component/unit tests (files matching `.test.ts(x)` under
 *   `src`), the fast default for `pnpm test` and coverage. It also picks up
 *   tests beside the repo scripts: the page-parity harness (#24) keeps every
 *   rule that decides pass/fail in a browserless module precisely so it can be
 *   covered here rather than only in an environment with browsers installed.
 * - `storybook` — every story becomes a browser-mode test (Playwright
 *   Chromium) via addon-vitest; `play` functions are the interaction tests
 *   (Phase 7). `PLAYWRIGHT_EXECUTABLE_PATH` overrides the browser binary
 *   for sandboxed environments; CI installs the default one.
 */
const serverBlockStub = path.resolve(rootDir, '.storybook/serverBlockStubs.tsx')

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    projects: [
      {
        extends: true,
        resolve: {
          alias: {
            // Resolution-only stub: unit tests mock getPayload themselves,
            // but route handlers import @payload-config at module scope.
            '@payload-config': path.resolve(
              rootDir,
              'src/test/payloadConfigStub.ts',
            ),
            '@': path.resolve(rootDir, 'src'),
          },
        },
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        resolve: {
          // Array form: the server-block stubs MUST match before the plain
          // `@` prefix, or the browser bundle drags in the Payload Local
          // API (mirrors the viteFinal aliases in .storybook/main.ts).
          alias: [
            {
              find: /^@\/blocks\/ArticlesArchive\/Component$/,
              replacement: serverBlockStub,
            },
            {
              find: /^@\/blocks\/WorkHistoryCard\/Component$/,
              replacement: serverBlockStub,
            },
            {
              find: /^@\//,
              replacement: `${path.resolve(rootDir, 'src')}/`,
            },
          ],
        },
        plugins: [
          storybookTest({
            configDir: path.join(rootDir, '.storybook'),
            storybookScript: 'pnpm storybook --no-open',
          }),
        ],
        // Next's compiled @opentelemetry shim (pulled in via the AI SDK)
        // references __dirname, which doesn't exist in the browser bundle.
        define: {
          __dirname: JSON.stringify('/'),
        },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
                ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
                : {},
            }),
            instances: [{ browser: 'chromium' }],
          },
          setupFiles: ['./.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
})
