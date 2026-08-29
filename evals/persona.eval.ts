import { evalite } from 'evalite'

import { askCorvus } from './corvus-helpers'
import { GENERAL_HELPFULNESS_CASES, PERSONA_CASES } from './fixtures/datasets'
import {
  answersGeneralQuestions,
  staysConcise,
  staysInCharacter,
} from './persona-scorers'

/**
 * Persona, tone, and #77's broadened general helpfulness — ungrounded.
 *
 * @remarks The cases and the scorers moved out of this file in #82 Batch 5
 * (into `fixtures/datasets.ts` and `persona-scorers.ts`) so `matrix.eval.ts`
 * can score a candidate model on exactly these cases with exactly these
 * scorers. Nothing about what runs here changed: same two blocks, same names,
 * same inputs in the same order, same scorer bodies — a pure move, so the
 * baseline recorded before it stays comparable to every run after it.
 */
evalite('Corvus persona & tone', {
  data: async () => PERSONA_CASES,
  task: askCorvus,
  scorers: [staysInCharacter, staysConcise],
})

evalite('Corvus general helpfulness', {
  data: async () => GENERAL_HELPFULNESS_CASES,
  task: askCorvus,
  scorers: [answersGeneralQuestions, staysConcise],
})
