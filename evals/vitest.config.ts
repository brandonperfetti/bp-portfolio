import { defineConfig } from 'vitest/config'

/**
 * The eval run's own Vitest root — deliberately empty, and deliberately here.
 *
 * @remarks Evalite creates Vitest with its cwd as `root` and a **root-level**
 * `include` of `**\/*.eval.?(m)ts`. Under a Vitest config that defines
 * `test.projects` it is each project's own `include` that selects files, so a
 * root-level include selects nothing — which is why `pnpm eval:ci` used to
 * collect the repo's `unit` and `storybook` `*.test.ts(x)` files as "evals"
 * and never load a single `*.eval.ts`.
 *
 * `cd evals` alone does not escape that: Vitest searches **upward** from
 * `root` for a config file, so from `evals/` it still resolved the repo-root
 * `vitest.config.ts` and its two projects (measured on vitest 4.1.10 — with
 * this file absent, `globTestSpecifications()` from `evals/` returns `[]`).
 * This file is the nearest config, so it wins the upward search, and because
 * it declares no `projects` evalite's root-level include is what selects
 * files again.
 *
 * Keep it empty. Anything added here — above all a `projects` array — is a
 * candidate for breaking collection a second time. Eval helpers import
 * product code by relative path (`../src/...`) precisely so this file never
 * needs a `resolve.alias`; `scripts/eval-harness.test.ts` guards both.
 */
export default defineConfig({})
