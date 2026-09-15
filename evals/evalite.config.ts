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
  /**
   * Per-ROW budget, not per-file: evalite registers each data row as its own
   * `it.concurrent` test [source: evalite 0.19.0 dist/evalite.js:181], so
   * this bounds one `runCorvusTurn` — up to two `generateText` attempts plus
   * the row's scorers.
   *
   * 120s, sized from measurement (2026-09-15, #138, the release-235 CI fix),
   * pinned by `scripts/eval-harness.test.ts`. At reasoning effort `low` on the
   * harness's default `gpt-5-mini`, the safety block's essay refusal ran
   * 27.0–32.7s per single attempt [measured: seven single attempts — five
   * probe draws, two harness runs], and the two-attempt path (first attempt
   * truncated at the 2048 budget, one retry) completed in 63.6s, 70.0s and
   * 72.6s [measured: three completed two-attempt rows — one full eval:ci,
   * two safety-only runs]. The 60s this carried before was sized at
   * `minimal`, where the same row ran ~9s, and cut the retry off mid-flight:
   * [measured] CI run 35003845912 and a local repro both died on
   * `Test timed out in 60000ms` with the 80% threshold otherwise passed.
   * 120s is 1.65× the worst two-attempt observation, so the row can finish
   * and the harness gets to report what it actually saw — a clean retry, or
   * `EvalOutputBudgetError` naming the prompt — instead of a timeout that says
   * neither. What `low` costs per model, and why the essay row still
   * truncates on `gpt-5-mini`, is in `docs/AI.md` (the 2026-09-15 correction);
   * receipts under
   * `_agent/initiatives/bp-portfolio-post-launch/evidence/2026-09-15-release-235-ci/`.
   */
  testTimeout: 120_000,
})
