import { defineConfig } from 'evalite/config'

/**
 * Evalite runner config for Corvus evals (`pnpm eval` to watch,
 * `pnpm eval:ci` in CI with a pass threshold).
 *
 * @remarks This file lives in `evals/`, not the repo root, and the `eval` /
 * `eval:ci` scripts `cd evals` before invoking evalite. That is load-bearing,
 * not tidiness. Evalite hands Vitest a **root-level** `include` of
 * `**\/*.eval.?(m)ts` and its own cwd as `root`; under a Vitest config that
 * defines `test.projects` it is the per-project `include` that selects files,
 * so a root-level include selects nothing. Run from the repo root, evalite
 * therefore collected the `unit` and `storybook` projects' `*.test.ts(x)`
 * files as "evals" and never loaded a single `*.eval.ts`. Running from
 * `evals/` — a directory with no Vitest config — restores collection, and
 * evalite loads this config from its cwd. `scripts/eval-harness.test.ts`
 * guards every link in that chain.
 */
export default defineConfig({
  testTimeout: 60_000,
})
