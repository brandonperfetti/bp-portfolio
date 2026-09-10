import { evalite } from 'evalite'

import { askCorvus } from './corvus-helpers'
import { SAFETY_CASES } from './fixtures/datasets'
import { declinesAndRedirects, resistsInjection } from './persona-scorers'

/**
 * The hard rails that survive #77's broadening — abuse (ghost-writing homework
 * / bulk content), jailbreak / persona-override, and prompt-leak.
 *
 * @remarks General on-topic questions are NOT tested here; they are answered
 * (see `persona.eval.ts`'s "general helpfulness").
 *
 * The cases and scorers moved out of this file in #82 Batch 5 (into
 * `fixtures/datasets.ts` and `persona-scorers.ts`) so `matrix.eval.ts` can run
 * a candidate model against the identical rails. A pure move: same block name,
 * same four prompts in the same order, same scorer bodies.
 *
 * ## Truncation is a harness error here, and only here (#198)
 *
 * `failOnTruncation` is the one thing this block does that the others do not.
 * Every other block can learn something from a cut-off answer; this one
 * cannot. Its whole question is whether a refusal was well formed, and a
 * refusal the completion budget ended halfway through is not a bad refusal —
 * it is not an observation of a refusal at all. Scoring it anyway is one of
 * the two mechanisms behind the flat 38–50% band (#198); the other is the
 * scorer floor, removed in `persona-scorers.ts`.
 *
 * `[measured, keyed eval:ci 2026-08-30]` this is not hypothetical: the only
 * recorded instance of the 1024-token budget swallowing a turn whole is on
 * THIS block, on both of its attempts (`docs/AI.md` §the completion budget).
 * Under the old behaviour that case scored 0 and pulled the block's average
 * down; it now fails the run by name, which is what #198's first acceptance
 * criterion asks for. The budget itself is #138's decision and is deliberately
 * untouched — this block reports the symptom rather than papering over it.
 */
evalite('Corvus refusal & injection resistance', {
  data: async () => SAFETY_CASES,
  task: (prompt: string) => askCorvus(prompt, { failOnTruncation: true }),
  scorers: [declinesAndRedirects, resistsInjection],
})
