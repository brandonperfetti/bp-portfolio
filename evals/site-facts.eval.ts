import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import {
  ADJACENT_CONTEXT_CASES,
  REPO_GROUNDED_CASES,
  REPO_UNKNOWN_CASES,
  SITE_FACT_CASES,
  SITE_STACK_CASES,
  TECH_LIST_CASES,
  TECH_SOURCING_CASES,
  UNGROUNDED_CASES,
} from './fixtures/datasets'
import { createCitationScorers } from './citation-scorers'
import { GITHUB_REPO_FIXTURES } from './fixtures/github-repos'
import { createFixtureRetriever } from './fixtures/retriever'
import { factuality } from './graded-scorers'
import { containsExpectedFact, refusesWhenNotGrounded } from './scorers'

/**
 * Site-fact accuracy for grounded Corvus turns (#82, eval tier 1).
 *
 * @remarks The question #82 actually asks is not whether Corvus is fluent. It
 * is whether, when Corvus states a fact about this site, the fact is true and
 * the answer says where it came from. Three blocks, because there are three
 * distinct ways to get that wrong, and one score that mixed them would tell
 * you nothing:
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
 * Wave 4 adds a fourth block for a fourth way to get it wrong: **sourcing**.
 * The corpus DOES contain the answer and Corvus states it correctly, but
 * credits the technology's own homepage instead of the site's page. Block 1
 * cannot see that failure — an answer citing only `postgresql.org` scores 0
 * there indistinguishably from an answer citing nothing — so it gets a block
 * and a scorer of its own.
 *
 * Threshold: this file is ALSO run on its own by `pnpm eval:facts`, because
 * evalite's `--threshold` is one global average over the whole run with no
 * per-block form — so without a second scoped invocation a weak site-fact
 * block could hide behind strong persona scores (#82 decision D4(b)). Note
 * that the new block widens both averages it feeds: it adds six scores to
 * `eval:facts`' pool and to `eval:ci`'s global one. That is the loosening
 * `docs/AI.md` already warns about; if it becomes real the ratchet is to raise
 * the floor, not to shrink the block.
 */
const {
  citesKnownSourceUrl,
  neverFabricatesSiteUrl,
  citesSiteSourceNotVendor,
  citesRepoSourceUrl,
  neverFabricatesRepoUrl,
  citesRepoNotTechList,
  citesTechListNotRepo,
} = createCitationScorers()

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

/**
 * Site corpus AND repository corpus, at the production floor (#147).
 *
 * @remarks The four wave-5 blocks all use this one, and the reason is the same
 * for each: three of them are disambiguations, and a disambiguation whose
 * context window holds only one candidate is not a test. `/tech` and the
 * `bp-portfolio` repository document have to be able to compete for the same
 * question before "cite the one the question asks about" means anything.
 *
 * The site-only `retrieve` above is untouched, so the four blocks that existed
 * before this batch retrieve exactly the corpus their recorded scores were
 * measured against.
 */
const retrieveWithRepos = createFixtureRetriever({
  repos: GITHUB_REPO_FIXTURES,
})

evalite('Corvus site facts · grounded answers', {
  data: async () => SITE_FACT_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  // `Factuality` is the one graded scorer in this batch, and it sits on top of
  // two deterministic ones on purpose: when they disagree, the disagreement is
  // legible. Note it calls OpenAI regardless of `AI_CHAT_PROVIDER` — autoevals
  // has no Anthropic path — the same provider asymmetry the embedding module
  // already carries. It arrives through `graded-scorers.ts` so the #122
  // empty-output floor applies to it too, and so this file and the matrix
  // build it identically.
  scorers: [containsExpectedFact, citesKnownSourceUrl, factuality],
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

evalite("Corvus site facts · cites the site's page for a technology", {
  data: async () => TECH_SOURCING_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve }),
  // Three scorers, and the pair is the point: `containsExpectedFact` says the
  // FACT was right, `citesSiteSourceNotVendor` says the SOURCE was. Wave 3's
  // failure scored well on the first and badly on the second, and one number
  // could not have told them apart.
  scorers: [
    containsExpectedFact,
    citesKnownSourceUrl,
    citesSiteSourceNotVendor,
  ],
})

/**
 * Wave 5 (#147): four blocks for the repo-grounded corpus.
 *
 * @remarks Registration count moves from 4 blocks to 8 in this file, and the
 * global `eval:ci` count from 34 to 41 — recorded here because the thresholds
 * are averages over a pool and adding to the pool moves them. That is the
 * loosening `docs/AI.md` warns about, and the response is #122's ratchet
 * against a fresh keyed run, never a shrunken block.
 */
evalite('Corvus site facts · a known public repository', {
  data: async () => REPO_GROUNDED_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve: retrieveWithRepos }),
  // The pair again: `containsExpectedFact` says the stack was right,
  // `citesRepoSourceUrl` says the repository was named as its source. #147's
  // measured baseline scored well on the first and 0 on the second, because
  // there was nothing in the corpus to cite.
  scorers: [containsExpectedFact, citesRepoSourceUrl, factuality],
})

evalite('Corvus site facts · declines a repository that does not exist', {
  data: async () => REPO_UNKNOWN_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve: retrieveWithRepos }),
  scorers: [refusesWhenNotGrounded, neverFabricatesRepoUrl],
})

evalite('Corvus site facts · what THIS SITE runs on', {
  data: async () => SITE_STACK_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve: retrieveWithRepos }),
  scorers: [containsExpectedFact, citesRepoNotTechList],
})

evalite('Corvus site facts · what technologies Brandon works with', {
  data: async () => TECH_LIST_CASES,
  task: (input) => askCorvusGrounded(input, { retrieve: retrieveWithRepos }),
  // The mirror image, and it is here so a prompt change that over-corrects
  // toward the repository fails a gate instead of passing one.
  scorers: [containsExpectedFact, citesTechListNotRepo],
})
