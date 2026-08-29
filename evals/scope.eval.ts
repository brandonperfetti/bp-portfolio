import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import {
  GENERAL_CASES,
  OFF_SITE_CASES,
  SCOPE_GROUNDED_CASES,
} from './fixtures/datasets'
import { createCitationScorers } from './citation-scorers'
import { createFixtureRetriever } from './fixtures/retriever'
import {
  answersGeneralQuestion,
  containsExpectedFact,
  declinesAndRedirects,
} from './scorers'

/**
 * Broadened-persona scope checks for grounded Corvus turns (#82).
 *
 * @remarks `persona.eval.ts` already asks whether Corvus stays in character
 * and still answers general questions — ungrounded. This file asks the same
 * question of the GROUNDED path, which is where #82 could break it: give an
 * assistant a block of site content and the cheap failure is that it starts
 * behaving as though the site were the only thing it may talk about. That is
 * exactly the pre-#77 behaviour the persona prompt was rewritten to remove.
 *
 * Three blocks, one per direction the scope can go wrong:
 *
 * 1. **Grounded** — a site question must be answered *from the context*, not
 *    from the model's own recollection of a portfolio it has never seen.
 * 2. **General** — a question with nothing to do with the site must still get
 *    a real answer. Retrieval returns `[]` here, so this block doubles as a
 *    check that the ungrounded path is untouched.
 * 3. **Off-site** — a request this site is not the place for must be declined
 *    AND redirected, never answered as though the surface existed.
 *
 * One correction to what this comment used to say, because the old wording
 * outlived the thing it described. `persona.eval.ts` and `safety.eval.ts` are
 * NO LONGER byte-identical to their pre-#82 state: Batch 5 moved their cases
 * into `fixtures/datasets.ts` and their scorers into `persona-scorers.ts` so
 * the model matrix could reuse both without executing an eval file, which
 * registers blocks. What IS unchanged — and is the property the Batch 1
 * baseline needs — is the set, order and names of the blocks those two files
 * register. The overlapping scorer logic still lives in `scorers.ts` rather
 * than being imported out of `persona-scorers.ts`, on purpose: the grounded
 * and ungrounded variants of `declines-and-redirects` and
 * `answers-general-questions` measure different things.
 */
const { citesKnownSourceUrl, neverFabricatesSiteUrl } = createCitationScorers()

const retrieve = createFixtureRetriever()

evalite('Corvus scope · grounded questions answered from context', {
  data: async () => SCOPE_GROUNDED_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  scorers: [containsExpectedFact, citesKnownSourceUrl],
})

evalite('Corvus scope · general questions still answered', {
  data: async () => GENERAL_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  scorers: [answersGeneralQuestion, neverFabricatesSiteUrl],
})

evalite('Corvus scope · off-site requests declined and redirected', {
  data: async () => OFF_SITE_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  scorers: [declinesAndRedirects, neverFabricatesSiteUrl],
})
