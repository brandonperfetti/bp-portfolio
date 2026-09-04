import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import { createCitationScorers } from './citation-scorers'
import { createGuardedScorer } from './empty-output'
import { GITHUB_REPO_FIXTURES } from './fixtures/github-repos'
import { createFixtureRetriever } from './fixtures/retriever'
import { containsExpectedFact } from './scorers'

/**
 * Who is "you", and whose stack is being asked about (#165, #167).
 *
 * @remarks A new file rather than more blocks in `site-facts.eval.ts`, for the
 * reason that file's own header gives about thresholds: `eval:facts` averages
 * over everything registered there, and these blocks measure a different
 * property (subject routing) from the four it already carries (grounding,
 * refusal, sourcing, repo-vs-tech-list). Keeping them apart means a routing
 * regression cannot be averaged away by strong grounding scores, and the
 * recorded `eval:facts` numbers stay comparable across this batch. They still
 * join the global `eval:ci` pool — which is the loosening `docs/AI.md` warns
 * about, answered by raising the floor against a fresh keyed run, never by
 * shrinking a block.
 *
 * **Not scored in this lane.** Every case below needs a provider key; the lane
 * that wrote them had none. They are written, registered and reviewable, and
 * Brandon runs them — see the summary for the exact commands.
 *
 * Three subjects, and the measured failure behind each:
 *
 * 1. **Brandon** (#165) — "What tech do you use?" on production 2026-09-04
 *    answered TypeScript, TanStack, Vite, Vercel, Expo. Nothing false; Next.js
 *    and React simply absent, because a similarity-ranked sample was being
 *    presented as a ranking.
 * 2. **Corvus** (#167) — the same question was read as being about Brandon at
 *    all. It was addressed to Corvus.
 * 3. **This site** (#167) — "What tech was this site built on?" answered Remix,
 *    TanStack, Netlify and Fly.io: the #147 rule keyed on "run on" phrasing and
 *    "built on" never reached it.
 */

const { citesTechListNotRepo } = createCitationScorers()

/**
 * Both corpora, at the production floor.
 *
 * @remarks Same reasoning as the wave-5 blocks in `site-facts.eval.ts`: a
 * disambiguation whose context window holds one candidate is not a test.
 * `/tech` and the `bp-portfolio` repository document have to be able to
 * compete for every question here.
 */
const retrieve = createFixtureRetriever({ repos: GITHUB_REPO_FIXTURES })

/**
 * Every question below was checked against {@link retrieve} before it was
 * written down `[measured, 2026-09-04]`: each returns passages above the
 * production floor, and the ones that must choose between candidates have both
 * candidates in reach. `scorers.test.ts` runs that precondition for the
 * datasets it imports; these cases are declared inline, so the check was made
 * by hand and is recorded here rather than left to a paid run to discover.
 * Re-check it when the fixture corpus or the chunkers change.
 */

/**
 * Technologies the fixture corpus marks as anything BELOW `daily`.
 *
 * @remarks Read off `fixtures/site-content.ts`, which carries exactly the ten
 * `/tech` rows that have a proficiency at all. These four are the ones a
 * correct answer must not put first.
 */
const NON_DAILY_FIXTURE_TECH = ['Vitest', 'PostgreSQL', 'Prisma', 'SQLite']

/** The three daily drivers #165 names, all `daily` in the fixture corpus. */
const HEADLINE_DAILY_TECH = ['Next.js', 'React', 'TypeScript']

/**
 * Did the answer LEAD with daily drivers, or merely contain some?
 *
 * @remarks `containsExpectedFact` cannot see this failure, and that is the
 * whole reason for a second scorer. The measured #165 answer contained real
 * `/tech` technologies and cited `/tech` correctly; what was wrong was the
 * ORDER — Expo and Vite ahead of the stack Brandon works in every day. An
 * answer that buries "React" in a closing aside after four exploratory tools
 * scores well on facts and is still the defect.
 *
 * Positional, therefore: every daily driver named must appear before the first
 * non-daily technology does. Fractional over the daily names present, so
 * "named two of three, both leading" beats "named one, trailing".
 *
 * A daily driver the answer never mentions is not counted against it here —
 * `containsExpectedFact` is what demands presence, and one scorer measuring
 * two properties is the thing this pair exists to avoid.
 */
const leadsWithDailyDrivers = createGuardedScorer<string, string, string>({
  name: 'leads-with-daily-drivers',
  description:
    'Fraction of the daily-driver technologies named that appear before any lower-proficiency one.',
  scorer: ({ output }) => {
    const haystack = output.toLowerCase()
    const firstNonDaily = NON_DAILY_FIXTURE_TECH.map((name) =>
      haystack.indexOf(name.toLowerCase()),
    )
      .filter((index) => index >= 0)
      .reduce((best, index) => Math.min(best, index), Number.MAX_SAFE_INTEGER)

    const present = HEADLINE_DAILY_TECH.map((name) =>
      haystack.indexOf(name.toLowerCase()),
    ).filter((index) => index >= 0)

    // Named none of them: nothing to rank, and `containsExpectedFact` is
    // already scoring that as the miss it is.
    if (!present.length) return 0

    const leading = present.filter((index) => index < firstNonDaily)
    return leading.length / present.length
  },
})

/**
 * #165 — "What tech does Brandon use?" leads with the daily drivers.
 *
 * @remarks The phrasing is deliberate and is the half of #165 that #167
 * corrected: the ticket was filed against "What tech do you use?", and that
 * question is addressed to **Corvus**. This block asks the Brandon-addressed
 * form; the Corvus-addressed form is the block below it, and the two must not
 * be answered the same way.
 *
 * `citesTechListNotRepo` is here rather than a bare citation scorer because
 * the repository document is in the context window: an answer that drifted to
 * citing `bp-portfolio` for what BRANDON uses would otherwise pass.
 */
evalite('Corvus subjects · what BRANDON uses, daily drivers first', {
  data: async () => [
    {
      input: 'What tech does Brandon use?',
      expected:
        'Brandon\'s daily drivers include "Next.js", "React" and "TypeScript"; the full list, with a proficiency on each, is on his tech page at "/tech".',
    },
    {
      input: "What's Brandon's stack these days?",
      expected:
        'The technologies Brandon works in daily are "TypeScript", "React" and "Next.js", from the "/tech" page — which also lists tools he is only proficient or familiar with, further down.',
    },
    {
      input:
        'What technologies does Brandon use, and which are his daily drivers?',
      expected:
        'His daily drivers include "TypeScript", "React" and "Next.js", per "/tech" — other entries there are marked proficient rather than daily.',
    },
  ],
  task: (input) => askCorvusGrounded(input, { retrieve }),
  // The pair: `containsExpectedFact` says the right names were there,
  // `leadsWithDailyDrivers` says they were where a ranking would put them.
  // #165's measured failure scored well on the first and badly on the second.
  scorers: [containsExpectedFact, leadsWithDailyDrivers, citesTechListNotRepo],
})
