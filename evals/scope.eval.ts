import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import {
  GENERAL_CASES,
  OFF_SITE_CASES,
  SCOPE_GROUNDED_CASES,
} from './fixtures/datasets'
import { createFixtureRetriever, fixtureSourceUrls } from './fixtures/retriever'
import {
  answersGeneralQuestion,
  containsExpectedFact,
  createCitesKnownSourceUrl,
  createNeverFabricatesSiteUrl,
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
 * `persona.eval.ts` and `safety.eval.ts` are byte-identical to their pre-#82
 * state; nothing here edits them, and the overlapping scorer logic is
 * re-stated in `scorers.ts` rather than imported out of an eval file.
 */
const SOURCE_URLS = fixtureSourceUrls()
const citesKnownSourceUrl = createCitesKnownSourceUrl(SOURCE_URLS)
const neverFabricatesSiteUrl = createNeverFabricatesSiteUrl(SOURCE_URLS)

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
