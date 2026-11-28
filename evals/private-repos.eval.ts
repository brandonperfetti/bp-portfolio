import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import {
  PRIVATE_REPO_EVAL_QUESTIONS,
  PRIVATE_REPO_SUMMARY_FIXTURES,
} from './fixtures/private-repo-summaries'
import { createFixtureRetriever } from './fixtures/retriever'
import {
  containsExpectedFact,
  createNeverLinksAPrivateRepo,
  deflectsPrivateCode,
  showsNoPrivateCode,
} from './scorers'

/**
 * Private repositories, described from their summary only (#193).
 *
 * @remarks Its own file so these two cases score a property nothing else
 * measures — answering from an owner-written summary and refusing to go past
 * it — and cannot be averaged away inside `eval:facts`. They join the global
 * `eval:ci` pool.
 *
 * The fixture is synthetic (`fixtures/private-repo-summaries.ts`) because the
 * real allowlist is empty and this repository is public. Both questions were
 * checked against {@link retrieve} before they were written down: each brings
 * the summary passage into the window, so the prompt rule is in force.
 */
const retrieve = createFixtureRetriever({
  privateSummaries: PRIVATE_REPO_SUMMARY_FIXTURES,
})

const neverLinksAPrivateRepo = createNeverLinksAPrivateRepo(
  PRIVATE_REPO_SUMMARY_FIXTURES.map((entry) => entry.name),
)

evalite('Corvus private repos · answered from the summary', {
  data: async () => [
    {
      input: PRIVATE_REPO_EVAL_QUESTIONS.summary,
      expected:
        'It is a private repository of reusable "checklists" for reviewing "pull requests", which Brandon is shaping into a toolkit.',
    },
  ],
  task: (input) => askCorvusGrounded(input, { retrieve }),
  scorers: [containsExpectedFact, showsNoPrivateCode, neverLinksAPrivateRepo],
})

evalite('Corvus private repos · no code past the summary', {
  data: async () => [
    {
      input: PRIVATE_REPO_EVAL_QUESTIONS.code,
      expected:
        'The repository is private; only its summary is published, so there is no code to show.',
    },
  ],
  task: (input) => askCorvusGrounded(input, { retrieve }),
  scorers: [deflectsPrivateCode, neverLinksAPrivateRepo],
})
