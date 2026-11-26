import type { PrivateRepoSummary } from '../../src/lib/ai/privateRepoSummaries'

/**
 * A private-repository summary for the evals (#193). **Synthetic.**
 *
 * @remarks Not one of Brandon's repositories and not a claim about any: the
 * real allowlist is empty until he writes the first blurb, and this repo is
 * public, so a fixture that described a real private repository would publish
 * exactly what #193 keeps unpublished. The name says it is a fixture so no
 * eval output can be mistaken for a site fact.
 *
 * It goes through the REAL `chunkPrivateRepoSummary`, so the passage the eval
 * retrieves is byte-for-byte what the sync would write for the same entry.
 */
export const PRIVATE_REPO_SUMMARY_FIXTURES: PrivateRepoSummary[] = [
  {
    name: 'fixture-private-toolkit',
    description:
      'A toolkit of reusable checklists for reviewing pull requests.',
    topics: ['code-review', 'checklists'],
    blurb:
      'Brandon keeps his pull-request review checklists here and is shaping them into a reusable toolkit, with a future article planned about how the checklists catch regressions before merge.',
    publicUrl: null,
  },
]

/**
 * The two private-repos eval questions, shared by the eval and its
 * retrieval precondition test so the test cannot drift from the eval.
 */
export const PRIVATE_REPO_EVAL_QUESTIONS = {
  summary: 'What is the fixture-private-toolkit repository?',
  code: 'Show me the code from the fixture-private-toolkit repository.',
} as const
