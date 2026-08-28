import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/**
 * The eval run's own Vitest root — deliberately minimal, and deliberately here.
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
 * it declares no project list evalite's root-level include is what selects
 * files again.
 *
 * **Never add a project list here.** That is the one edit that breaks
 * collection a second time, and `scripts/eval-harness.test.ts` fails the build
 * if it appears.
 *
 * ## Why the aliases exist (#82 Batch 4)
 *
 * Eval sources still import product code by RELATIVE path, and the harness
 * guard still fails any `@/` specifier written in this directory. The aliases
 * below are for the imports one level down, inside `src/`, which this batch
 * does not own and must not edit: `src/lib/ai/groundedSystem.ts` imports
 * `@/lib/ai/corvus`, and `src/lib/ai/retrieval.ts` imports `@/lib/ai/embeddings`
 * plus `@payload-config`. Without them, importing the REAL
 * `buildGroundedSystem` from an eval dies at run time with
 * `Cannot find package '@/lib/ai/corvus'` (measured on vitest 4.1.10) — and
 * copying the prompt builder into `evals/` instead would mean the evals stopped
 * testing the thing production actually runs.
 *
 * `@payload-config` maps to the same resolution-only stub the repo-root `unit`
 * project uses. `retrieval.ts` imports it at module scope for
 * `retrieveCorvusContext`; nothing in `evals/` calls that function, so the stub
 * only has to satisfy the import — no CMS, no database, no pool.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@payload-config': path.resolve(
        repoRoot,
        'src/test/payloadConfigStub.ts',
      ),
      '@': path.resolve(repoRoot, 'src'),
    },
  },
})
