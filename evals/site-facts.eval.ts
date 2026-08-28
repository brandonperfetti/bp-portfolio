import { Factuality } from 'autoevals'
import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import {
  ADJACENT_CONTEXT_CASES,
  SITE_FACT_CASES,
  UNGROUNDED_CASES,
} from './fixtures/datasets'
import { createFixtureRetriever, fixtureSourceUrls } from './fixtures/retriever'
import {
  containsExpectedFact,
  createCitesKnownSourceUrl,
  createNeverFabricatesSiteUrl,
  refusesWhenNotGrounded,
} from './scorers'

/**
 * Site-fact accuracy for grounded Corvus turns (#82, eval tier 1).
 *
 * @remarks The question #82 actually asks is not whether Corvus is fluent. It
 * is whether, when Corvus states a fact about this site, the fact is true and
 * the answer says where it came from. Three blocks, because there are three
 * distinct ways to get that wrong, and one score that mixed them would tell
 * you nothing:
 *
 * (Prose note, and a real constraint: `scripts/eval-harness.test.ts` scans
 * this directory for import specifiers with a regex that does not know
 * comments from code, so the word "from" must never be followed directly by a
 * quote character anywhere in this file — including inside a doc comment.)
 *
 * 1. **Grounded answers** — the corpus contains the answer. Must state it and
 *    cite it.
 * 2. **Ungrounded** — the corpus does not contain the answer and retrieval
 *    returns `[]`, so the prompt is the untouched persona prompt. Must decline.
 * 3. **Adjacent context** — the corpus does not contain the answer but
 *    retrieval hands over five real, related passages anyway. Must still
 *    decline. This is the failure mode grounding *introduces*: every word in
 *    the context is true, so a confabulated answer built from it reads as
 *    well-sourced.
 *
 * Run against a fixture corpus, not a database: the CI `evals` job has no
 * Postgres service and no `DATABASE_URI`. What it does have is a provider key,
 * which is what these blocks need. The complementary tier —
 * `pgvector-integration.test.ts` — runs the real SQL against real pgvector in
 * the `e2e` job with a stubbed embedder, so the query path is verified where
 * the database is and the answer path is verified where the model is.
 *
 * Threshold: this file is ALSO run on its own by `pnpm eval:facts`, because
 * evalite's `--threshold` is one global average over the whole run with no
 * per-block form — so without a second scoped invocation a weak site-fact
 * block could hide behind strong persona scores (#82 decision D4(b)).
 */
const SOURCE_URLS = fixtureSourceUrls()
const citesKnownSourceUrl = createCitesKnownSourceUrl(SOURCE_URLS)
const neverFabricatesSiteUrl = createNeverFabricatesSiteUrl(SOURCE_URLS)

/** Production floor and top-k: the corpus answers, or it returns nothing. */
const retrieve = createFixtureRetriever()

/**
 * Floorless: always returns the five nearest chunks, however unrelated.
 *
 * @remarks Reproduces what `retrieval.ts` says a vector index does — "a
 * distance-sorted query with `LIMIT 5` ALWAYS returns five rows if five rows
 * exist, however unrelated they are". The floor is what normally saves us;
 * this retriever removes it deliberately.
 */
const retrieveWithoutFloor = createFixtureRetriever({ floor: 0 })

evalite('Corvus site facts · grounded answers', {
  data: async () => SITE_FACT_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  // `Factuality` is the one graded scorer in this batch, and it sits on top of
  // two deterministic ones on purpose: when they disagree, the disagreement is
  // legible. Note it calls OpenAI regardless of `AI_CHAT_PROVIDER` — autoevals
  // has no Anthropic path — the same provider asymmetry the embedding module
  // already carries.
  scorers: [containsExpectedFact, citesKnownSourceUrl, Factuality],
})

evalite('Corvus site facts · declines when the corpus lacks the answer', {
  data: async () => UNGROUNDED_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  scorers: [refusesWhenNotGrounded, neverFabricatesSiteUrl],
})

evalite('Corvus site facts · will not invent from adjacent context', {
  data: async () => ADJACENT_CONTEXT_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve: retrieveWithoutFloor }),
  scorers: [refusesWhenNotGrounded, neverFabricatesSiteUrl],
})
