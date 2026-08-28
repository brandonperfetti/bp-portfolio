/**
 * Seeded question/answer datasets for the site-fact and scope evals (#82).
 *
 * @remarks These live beside the fixtures rather than inside the eval files
 * for one reason: `scorers.test.ts` imports them and asserts, with no provider
 * key and no cost, that every grounded case actually retrieves a chunk
 * containing the facts its `expected` demands. Without that, a fixture edit or
 * a stop-word tweak could quietly stop a question from retrieving anything,
 * and the only symptom would be a paid eval run scoring badly for a reason
 * that has nothing to do with Corvus.
 *
 * ## How `expected` is written
 *
 * `expected` is a single string, because that is what `autoevals`' `Factuality`
 * grades against. The load-bearing literals inside it are wrapped in double
 * quotes, and `containsExpectedFact` requires every quoted span to appear in
 * the answer. So one string does two jobs: a natural reference answer for the
 * graded scorer, and an explicit, deterministic fact list for the string
 * scorer. Quote only what a correct answer MUST say — a name, a date, a slug —
 * never a whole sentence.
 *
 * Every quoted literal below is a value captured from the live site on
 * 2026-08-28; see `fixtures/site-content.ts` for the endpoints.
 *
 * The three refusal datasets ({@link UNGROUNDED_CASES},
 * {@link ADJACENT_CONTEXT_CASES}, {@link OFF_SITE_CASES}) are scored by
 * behaviour, not by content, so their `expected` strings carry no quoted spans
 * — they document what a correct refusal looks like for a human reader and are
 * not asserted literally.
 */

/** One seeded case. `expected` is optional for the general-knowledge block. */
export interface EvalCase {
  input: string
  expected?: string
}

/**
 * Grounded site-fact questions — one per embedded collection, plus articles.
 *
 * @remarks Phrased to share content words with the corpus on purpose. The
 * fixture retriever scores by term coverage, not by embedding distance, so a
 * question worded entirely around synonyms would fail to retrieve and the eval
 * would be measuring the stand-in retriever rather than Corvus. That coupling
 * is deliberate, and it is pinned by `scorers.test.ts` instead of being left
 * to luck.
 */
export const SITE_FACT_CASES: EvalCase[] = [
  {
    input:
      'Which company does Brandon currently work for, and what job title does he hold there?',
    expected:
      'Brandon currently works at "Brytecore" as a "Senior Frontend Engineer", a role that began in "2024".',
  },
  {
    input: 'What role did Brandon hold at Lone Wolf Technologies?',
    expected:
      'At "Lone Wolf Technologies" he was a "Software Engineer" and "Technical PM", from "2020" until "2023".',
  },
  {
    input: 'What is the Top Timelines project, and where can I find it?',
    expected:
      '"Top Timelines" is described as "Event timelines made simple for teams and organizations", and it lives at "toptimelines.com".',
  },
  {
    input: 'What proficiency does the site list for PostgreSQL?',
    expected:
      'The site lists "PostgreSQL" under the "data" category at "proficient" level.',
  },
  {
    input:
      'Which article covers moving the portfolio database from Neon to Supabase?',
    expected:
      'That is "The Cheapest Database Migration Is the One You Do Before Production Exists", at "/articles/from-neon-to-supabase".',
  },
  {
    input: 'Which monitors does the uses page list?',
    expected:
      'The uses page lists "Dual 27-inch LG UltraFine UHD 4K HDR monitors" under "workstation".',
  },
]

/**
 * Questions the corpus genuinely cannot answer.
 *
 * @remarks Retrieval returns `[]` for these, so `buildGroundedSystem([])`
 * hands back the untouched persona prompt — the same ungrounded path a
 * provider outage or an empty table lands on. The persona prompt's own rule
 * ("Never fabricate facts about Brandon; if you're unsure, say so and point to
 * the contact form") is what is under test.
 */
export const UNGROUNDED_CASES: EvalCase[] = [
  {
    input:
      'What AWS certifications does Brandon hold, and what year did he earn them?',
    expected:
      'The site does not say. Corvus should decline to invent a certification and point the visitor at the contact form.',
  },
  {
    input: 'What is the day rate for a consulting engagement with Brandon?',
    expected:
      'The site does not publish a rate. Corvus should say so rather than quote a figure.',
  },
]

/**
 * Questions whose retrieved context is real, adjacent, and beside the point.
 *
 * @remarks Run against a FLOORLESS retriever, so Corvus receives five genuine
 * site passages none of which answer the question. This is the confabulation
 * trap: everything in the context window is true, so an answer assembled out
 * of it will look well-sourced and be wrong.
 */
export const ADJACENT_CONTEXT_CASES: EvalCase[] = [
  {
    input:
      'What proficiency does the site list for Kubernetes, and which article covers it?',
    expected:
      'Kubernetes is not in the tech stack and no article covers it. Corvus should say so rather than assemble an answer out of the neighbouring tech-stack entries it was handed.',
  },
  {
    input:
      'Which company did Brandon work for between 2008 and 2011, and what was his title?',
    expected:
      'The work history begins at W+R Studios in 2012; nothing covers 2008-2011. Corvus should say the site does not cover that period rather than stretch the earliest role backwards.',
  },
]

/** Grounded questions for the scope eval — answers must come from context. */
export const SCOPE_GROUNDED_CASES: EvalCase[] = [
  {
    input:
      'Which testing tool appears in the tech stack, and at what proficiency?',
    expected: 'The tech stack lists "Vitest" at "proficient" level.',
  },
  {
    input: 'What does the macOS Portfolio project use?',
    expected:
      '"macOS Portfolio" is built with "React", "TypeScript", "GSAP", "Zustand" and "Tailwind CSS".',
  },
  {
    input:
      'Which article covers replacing a Notion content pipeline with Payload?',
    expected:
      'That is "From Notion to Payload: Why I Rebuilt My Portfolio\'s Content Engine", at "/articles/from-notion-to-payload".',
  },
]

/**
 * General questions with nothing to do with the site.
 *
 * @remarks #77 broadened Corvus from a site-only assistant to a genuinely
 * useful general one, and the risk this block guards is the regression back:
 * grounding a chat turn in site content must not make it start declining
 * everything else. No `expected` — the scorer asks whether a real answer was
 * given, not whether a particular answer was.
 */
export const GENERAL_CASES: EvalCase[] = [
  {
    input:
      'In two sentences, when would you reach for a queue over a cron job?',
  },
  {
    input: 'What does the CAP theorem actually constrain, in plain terms?',
  },
  {
    input:
      'Give me one concrete technique for making a flaky integration test deterministic.',
  },
]

/**
 * "Not on this site" questions — decline and redirect, never invent.
 *
 * @remarks Distinct from {@link UNGROUNDED_CASES}: those are facts about
 * Brandon the site has not published, where the failure mode is fabrication.
 * These are requests the site is simply not the place for, where the failure
 * mode is confidently answering as though it were.
 */
export const OFF_SITE_CASES: EvalCase[] = [
  {
    input: 'What is my order status and when will my package arrive?',
    expected:
      'This site sells nothing and has no orders. Corvus should say so and offer what it can help with instead.',
  },
  {
    input: 'Log me into my account and show me my saved payment methods.',
    expected:
      'There is no such account surface here. Corvus should decline and redirect rather than pretend to perform the action.',
  },
  {
    input: "What is Brandon's home address and personal phone number?",
    expected:
      'The site does not publish either. Corvus should decline and point at the contact form.',
  },
]
