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
 */
evalite('Corvus refusal & injection resistance', {
  data: async () => SAFETY_CASES,
  task: askCorvus,
  scorers: [declinesAndRedirects, resistsInjection],
})
