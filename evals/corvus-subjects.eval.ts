import { evalite } from 'evalite'

import { askCorvusGrounded } from './corvus-helpers'
import { createCitationScorers } from './citation-scorers'
import { createGuardedScorer } from './empty-output'
import { GITHUB_REPO_FIXTURES } from './fixtures/github-repos'
import { createFixtureRetriever } from './fixtures/retriever'
import { containsExpectedFact } from './scorers'
import { withAboutCorvusSnippet } from '../src/lib/ai/aboutCorvus'
import { markSiteSubject } from '../src/lib/ai/retrieval'

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

const { citesKnownSourceUrl, citesRepoNotTechList, citesTechListNotRepo } =
  createCitationScorers()

/**
 * Both corpora, at the production floor.
 *
 * @remarks Same reasoning as the wave-5 blocks in `site-facts.eval.ts`: a
 * disambiguation whose context window holds one candidate is not a test.
 * `/tech` and the `bp-portfolio` repository document have to be able to
 * compete for every question here.
 */
const fixtureRetrieve = createFixtureRetriever({ repos: GITHUB_REPO_FIXTURES })

/**
 * The fixture corpus, plus the about-Corvus passage on Corvus-addressed turns.
 *
 * @remarks Composed from the PRODUCTION `withAboutCorvusSnippet`, not a copy
 * of its rule. That passage is code-owned rather than embedded (#167 design
 * (i)), so it does not live in the fixture corpus and cannot be retrieved from
 * it — but it is genuinely in the context window in production, and a block
 * measuring "does Corvus answer about itself" against a context that lacks it
 * would be measuring something else. Wrapping the real function also means the
 * addressee rule cannot drift between the eval and the route.
 *
 * `markSiteSubject` is composed for the same reason and matters most for the
 * site block: it is what makes the subject rule fire on a site-shaped question
 * whose top-k contains no repository, which is the turn #167 was filed about.
 * Both wrappers are the production functions, in production order.
 */
const retrieve = (query: string) =>
  markSiteSubject(query, withAboutCorvusSnippet(query, fixtureRetrieve(query)))

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

/**
 * Stacks Corvus has been measured inventing for this site.
 *
 * @remarks Not a general "wrong technology" list — these five are what the
 * production answers actually said. `[measured, 2026-09-02, #147]` Remix,
 * TanStack, Fly.io, Netlify and DigitalOcean; `[measured, 2026-09-04, #167]`
 * Remix, TanStack, Netlify and Fly.io again, for "built on". Naming the
 * specific fabrications keeps the scorer a regression test rather than a
 * vocabulary filter that would flag an answer legitimately discussing Remix.
 */
const FABRICATED_SITE_STACK = [
  'Remix',
  'Netlify',
  'Fly.io',
  'DigitalOcean',
  'TanStack',
]

/**
 * Did the answer avoid the stack this site has been measured inventing?
 *
 * @remarks Binary, unlike the other scorers here, and deliberately: naming any
 * one of these as part of this site's stack is the whole defect, and a
 * fractional score would report "only one fabrication" as partial credit.
 *
 * It reads the answer's OWN words for the site's stack, so it is scoped to the
 * blocks that ask about this site. On a Brandon-subject or general question
 * these names are legitimate and this scorer is not applied.
 */
const neverNamesTheFabricatedStack = createGuardedScorer<
  string,
  string,
  string
>({
  name: 'never-names-the-fabricated-stack',
  description:
    "0 when the answer names any technology from #147/#167's measured wrong stack for this site.",
  scorer: ({ output }) => {
    const haystack = output.toLowerCase()
    return FABRICATED_SITE_STACK.some((name) =>
      haystack.includes(name.toLowerCase()),
    )
      ? 0
      : 1
  },
})

/**
 * #167 — "you" means Corvus.
 *
 * @remarks The measured failure, verbatim as the first case: "What tech do you
 * use?" on production 2026-09-04 answered with Brandon's toolkit (Node.js,
 * Vercel, Supabase, Vite, TanStack).
 *
 * The adversarial half is in the retrieval, not the wording. Measured
 * 2026-09-04: "What tech do you use?" pulls Brandon's TypeScript, React,
 * Next.js and Tailwind chunks into the same context window at the same score
 * as the About Corvus passage, and "What are you built with?" pulls in both
 * repository documents. So the wrong answer is right there to be given, which
 * is what makes the block a test of the routing rule rather than of the
 * corpus.
 */
evalite('Corvus subjects · "you" means CORVUS', {
  data: async () => [
    {
      input: 'What tech do you use?',
      expected:
        'I run on the "Vercel AI SDK" with retrieval over this site\'s content — passages embedded and stored in "pgvector" — and I render replies with "streamdown". More is on my page at "/corvus". That is my own stack, not the list of technologies Brandon works with.',
    },
    {
      input: 'What are you built with?',
      expected:
        'Corvus is built on the "Vercel AI SDK", with "pgvector" retrieval over this site\'s pages and Brandon\'s public repositories, and "streamdown" for rendering — see "/corvus".',
    },
    {
      input: 'What are you made with?',
      expected:
        'I am the assistant on this site: the "Vercel AI SDK" for the chat, "pgvector" for retrieval, "streamdown" for rendering. See "/corvus".',
    },
    {
      input: 'What model do you run on, and what can you answer?',
      expected:
        'My chat model is env-selected — "gpt-5-mini" by default — and I answer questions about Brandon and about how this site is built, always with a link to the source. See "/corvus".',
    },
  ],
  task: (input) => askCorvusGrounded(input, { retrieve }),
  // `citesKnownSourceUrl` matters here beyond citation hygiene: `/corvus` is a
  // real route, so an answer that cited `/tech` instead would be citing a real
  // page for a claim it does not support — the #147 failure shape, one subject
  // over.
  scorers: [containsExpectedFact, citesKnownSourceUrl],
})

/**
 * #167 — "this site" survives being asked about in six different ways.
 *
 * @remarks One case per phrasing, because #167's second measured failure was
 * purely a phrasing miss: the #147 rule named "run on", the visitor said
 * "built on", and the answer came back Remix, TanStack, Netlify, Fly.io.
 *
 * The last two cases are the sharpest. `[measured, 2026-09-04]` "What powers
 * this site?" and "What is under the hood on this site?" retrieve the
 * `Brandon Perfetti's Portfolio` PROJECT entry tied with the repository
 * passage and listed AHEAD of it — so the wrong source is not merely present,
 * it is first. Retrieval cannot separate them at this corpus size; the prompt
 * rule is the only thing that can.
 */
evalite('Corvus subjects · what THIS SITE is built on, however you ask', {
  data: async () => [
    {
      input: 'What tech was this site built on?',
      expected:
        'This site is built with "Next.js" and "Payload" CMS on "Supabase" Postgres, per the brandonperfetti/bp-portfolio repository — not Remix or Netlify.',
    },
    {
      input: 'What does this site run on?',
      expected:
        'It runs on "Next.js" 16 with "Payload" CMS, "Supabase" Postgres and "Vercel" hosting, documented in the brandonperfetti/bp-portfolio repository.',
    },
    {
      input: 'What is this site built with?',
      expected:
        'The brandonperfetti/bp-portfolio repository says "Next.js", "Payload" and "Supabase" Postgres.',
    },
    {
      input: 'What powers this site?',
      expected:
        '"Next.js" and "Payload" CMS over "Supabase" Postgres, from the brandonperfetti/bp-portfolio repository — the Projects page entry is a description of the site, not the source for its stack.',
    },
    {
      input: 'What is under the hood on this site?',
      expected:
        'Under the hood: "Next.js", "Payload" CMS, "Supabase" Postgres, "Clerk" auth, hosted on "Vercel" — per the brandonperfetti/bp-portfolio repository.',
    },
  ],
  task: (input) => askCorvusGrounded(input, { retrieve }),
  // Three, and each catches a different failure: the facts, the source, and
  // the specific inventions this question has produced twice.
  scorers: [
    containsExpectedFact,
    citesRepoNotTechList,
    neverNamesTheFabricatedStack,
  ],
})
