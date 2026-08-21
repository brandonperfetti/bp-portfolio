import { defineConfig } from 'evalite/config'

/**
 * Evalite runner config for Corvus evals (`pnpm eval` to watch,
 * `pnpm eval:ci` in CI with a pass threshold).
 */
export default defineConfig({
  testTimeout: 60_000,
})
