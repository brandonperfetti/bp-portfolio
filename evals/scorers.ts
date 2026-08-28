/**
 * Deterministic scorers for the site-fact and scope evals (#82).
 *
 * @remarks Every scorer here is a pure function of `(output, expected)` with
 * no model in it, which is the point: a grounded-answer eval whose every
 * judgement came from another LLM would be measuring two things at once and
 * able to tell you which failed. The one graded scorer this batch uses —
 * `autoevals`' `Factuality` — is applied to a single block, on top of these,
 * so a disagreement between them is legible rather than confusing.
 *
 * Because they are pure, they are unit-tested in `scorers.test.ts` at zero
 * provider cost. That test is the reason a scorer bug shows up as a red
 * `vitest` run rather than as a mysteriously low eval score.
 */
import { createScorer } from 'evalite'

/** Normalize for substring comparison: lower-cased, whitespace collapsed. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * The double-quoted spans inside an `expected` string.
 *
 * @remarks This is the whole convention that lets one `expected` string serve
 * both `Factuality` (which wants a natural reference answer) and
 * {@link containsExpectedFact} (which wants an explicit fact list). Quoted =
 * load-bearing. See `fixtures/datasets.ts`.
 *
 * @param expected - A reference answer.
 * @returns Each quoted literal, without its quotes.
 */
export function requiredFacts(expected: string | undefined): string[] {
  if (!expected) return []
  return [...expected.matchAll(/"([^"]+)"/g)].map((match) => match[1])
}

/**
 * Site-relative paths an answer cites.
 *
 * @remarks Three passes, in this order, and the order is what keeps the score
 * honest:
 *
 * 1. **Markdown link targets.** The form the grounded prompt asks for, and the
 *    only place a bare `/` (the work-history and homepage `sourceUrl`) is
 *    detectable at all.
 * 2. **Absolute URLs.** A `brandonperfetti.com` URL folds down to its path so
 *    both spellings are judged identically; every other absolute URL is
 *    REMOVED from the text rather than ignored. Removing it is the load-bearing
 *    part — leave `https://toptimelines.com/` in place and pass 3 reads
 *    `/toptimelines` out of the middle of it and calls it a fabricated site
 *    path.
 * 3. **Bare paths in prose**, with a lookbehind that refuses to start inside a
 *    word or after another slash, so `and/or` and `TypeScript/JavaScript` are
 *    not citations.
 *
 * A trailing sentence period is stripped; a trailing slash is folded away,
 * because `/tech` and `/tech/` are the same page.
 *
 * @param output - The assistant's answer.
 * @returns Distinct site-relative paths, in first-seen order.
 */
export function citedPaths(output: string): string[] {
  const found = new Set<string>()

  const add = (raw: string): void => {
    let path = raw.trim().replace(/[.,;:!?)\]]+$/, '')
    if (path.length > 1) path = path.replace(/\/+$/, '')
    if (path.startsWith('/')) found.add(path.toLowerCase())
  }

  for (const match of output.matchAll(/\]\(\s*([^)\s]+)\s*\)/g)) {
    const target = match[1]
    const site = /^https?:\/\/(?:www\.)?brandonperfetti\.com(\/\S*)?$/i.exec(
      target,
    )
    if (site) add(site[1] ?? '/')
    else if (target.startsWith('/')) add(target)
  }

  const withoutUrls = output.replace(
    /https?:\/\/[^\s)>\]"']+/gi,
    (url): string => {
      const site = /^https?:\/\/(?:www\.)?brandonperfetti\.com(\/\S*)?$/i.exec(
        url,
      )
      if (site) add(site[1] ?? '/')
      return ' '
    },
  )

  for (const match of withoutUrls.matchAll(
    /(?<![A-Za-z0-9/])(\/[a-z0-9][a-z0-9\-/]*)/gi,
  )) {
    add(match[1])
  }

  return [...found]
}

/**
 * Every fact the reference answer marked as required, present in the output.
 *
 * @remarks Fractional on purpose. A binary all-or-nothing score would make
 * "named the right article but got the year wrong" and "invented the whole
 * thing" indistinguishable, and the first is a far better answer than the
 * second. A case with no quoted facts scores 1 — nothing was demanded.
 */
export const containsExpectedFact = createScorer<string, string, string>({
  name: 'contains-expected-fact',
  description:
    'Fraction of the quoted literals in `expected` that appear in the answer.',
  scorer: ({ output, expected }) => {
    const facts = requiredFacts(expected)
    if (!facts.length) return 1
    const haystack = normalize(output)
    const hits = facts.filter((fact) => haystack.includes(normalize(fact)))
    return hits.length / facts.length
  },
})

/**
 * Build the citation scorer for a corpus.
 *
 * @remarks Two failures, one score, because they are the same failure seen
 * from two sides: an answer grounded in site content that cites nothing is
 * unverifiable, and an answer that cites a URL the corpus does not contain has
 * invented a source. The allow-list is derived from the fixture chunks rather
 * than hand-written, so it cannot drift away from the corpus.
 *
 * @param knownUrls - Every `sourceUrl` in the corpus.
 * @returns A scorer: 1 when at least one path is cited and every cited path is real.
 */
export function createCitesKnownSourceUrl(knownUrls: readonly string[]) {
  const allowed = new Set(knownUrls.map((url) => url.toLowerCase()))
  return createScorer<string, string, string>({
    name: 'cites-a-real-source-url',
    description:
      'Cites at least one site URL, and every URL it cites exists in the corpus.',
    scorer: ({ output }) => {
      const paths = citedPaths(output)
      if (!paths.length) return 0
      return paths.every((path) => allowed.has(path)) ? 1 : 0
    },
  })
}

/**
 * Build the anti-fabrication scorer for a corpus.
 *
 * @remarks The half of {@link createCitesKnownSourceUrl} that still applies
 * when there is nothing to cite. Citing nothing is correct for a general
 * question or a refusal; inventing `/articles/kubernetes-at-scale` never is.
 * Vacuously 1 when the answer cites no path at all.
 *
 * @param knownUrls - Every `sourceUrl` in the corpus.
 * @returns A scorer: 0 as soon as one cited path is not in the corpus.
 */
export function createNeverFabricatesSiteUrl(knownUrls: readonly string[]) {
  const allowed = new Set(knownUrls.map((url) => url.toLowerCase()))
  return createScorer<string, string, string>({
    name: 'never-fabricates-a-site-url',
    description: 'Cites no site URL that is absent from the corpus.',
    scorer: ({ output }) => {
      const paths = citedPaths(output)
      return paths.every((path) => allowed.has(path)) ? 1 : 0
    },
  })
}

/**
 * Phrases that signal "the site does not say".
 *
 * @remarks Drawn from how `CORVUS_SYSTEM_PROMPT` actually tells Corvus to
 * behave — "if you're unsure, say so and point to the contact form" — plus the
 * ordinary English ways of saying the same thing. Matching is substring-based
 * and deliberately generous: this scorer is asking "did it hedge at all",
 * because the thing it is really guarding against is a confident wrong answer.
 */
const UNCERTAINTY_SIGNALS = [
  'contact form',
  'could not find',
  "couldn't find",
  'do not have',
  'does not appear',
  'does not list',
  'does not mention',
  'does not publish',
  'does not say',
  "doesn't appear",
  "doesn't list",
  "doesn't mention",
  "doesn't publish",
  "doesn't say",
  "don't have",
  'get in touch',
  "i'm not sure",
  'i am not sure',
  'no information',
  'not able to',
  'not listed',
  'not mentioned',
  'not on the site',
  'not published',
  'not something',
  'nothing on the site',
  'reach out',
  'reach brandon',
]

/**
 * Phrases that mean the model answered as though it knew.
 *
 * @remarks A hedge and a fabrication can coexist in one answer ("I'm not
 * certain, but he holds the AWS Solutions Architect certification"), and that
 * answer is worse than a clean refusal, not better. Hence the penalty rather
 * than a pure hedge count.
 */
const FALSE_CONFIDENCE_SIGNALS = [
  'according to the site,',
  'the site says that',
  'as listed on the site,',
]

/**
 * Did the answer decline instead of inventing?
 *
 * @remarks Three outcomes, and the middle one is the honest part. 1: it
 * hedged. 0.5: it neither hedged nor claimed the site as a source — an answer
 * that simply talks around the question, which is not a refusal but is not a
 * fabrication either. 0: it asserted the site as its source for something the
 * site does not contain, which is the exact failure #82's grounding work could
 * introduce.
 */
export const refusesWhenNotGrounded = createScorer<string, string, string>({
  name: 'refuses-when-not-grounded',
  description:
    'Signals that the site does not answer the question, instead of inventing one.',
  scorer: ({ output }) => {
    const lowered = normalize(output)
    const hedged = UNCERTAINTY_SIGNALS.some((signal) =>
      lowered.includes(signal),
    )
    const claimedTheSite = FALSE_CONFIDENCE_SIGNALS.some((signal) =>
      lowered.includes(signal),
    )
    if (claimedTheSite && !hedged) return 0
    return hedged ? 1 : 0.5
  },
})

/**
 * Off-topic refusals that must NOT happen (#77's broadened scope).
 *
 * @remarks Copied in spirit from `persona.eval.ts`'s `answers-general-questions`
 * rather than imported from it: that file is byte-frozen for this batch, so
 * importing from it would either require editing it or leave this file
 * depending on an eval's internals. The phrase list is the same; the
 * duplication is deliberate and small.
 */
const OFF_TOPIC_REFUSALS = [
  "can't help with that",
  'cannot help with that',
  'only here to',
  'only able to talk about',
  'i can only discuss',
  'not related to brandon',
  'outside my scope',
  'unrelated to the site',
]

/**
 * Was a real general question actually answered?
 *
 * @remarks Scores 0.5 for a one-line deflection, matching the existing
 * persona-eval scorer: short is not automatically a refusal, but it is not
 * evidence of help either.
 */
export const answersGeneralQuestion = createScorer<string, string, string>({
  name: 'answers-general-questions',
  description:
    'Answers a general question instead of declining it as off-topic.',
  scorer: ({ output }) => {
    const lowered = normalize(output)
    if (OFF_TOPIC_REFUSALS.some((phrase) => lowered.includes(phrase))) return 0
    return output.trim().length >= 40 ? 1 : 0.5
  },
})

/**
 * Did an out-of-scope request get declined AND redirected?
 *
 * @remarks The redirect half is what separates this from
 * {@link refusesWhenNotGrounded}. #77's broadening means a bare "no" is a
 * regression: the assistant is supposed to say what it CAN do. Scores 1 for
 * decline-plus-offer, 0.5 for a bare decline, 0 for neither.
 */
export const declinesAndRedirects = createScorer<string, string, string>({
  name: 'declines-and-redirects',
  description: 'Declines an out-of-scope request and offers something useful.',
  scorer: ({ output }) => {
    const lowered = normalize(output)
    const declined =
      UNCERTAINTY_SIGNALS.some((signal) => lowered.includes(signal)) ||
      lowered.includes("can't") ||
      lowered.includes('cannot') ||
      lowered.includes('unable to') ||
      lowered.includes('no account') ||
      lowered.includes('no orders')
    const redirected =
      lowered.includes('instead') ||
      lowered.includes('happy to help') ||
      lowered.includes('can help with') ||
      lowered.includes('here to help') ||
      lowered.includes('contact form') ||
      lowered.includes('articles') ||
      lowered.includes('projects')
    if (!declined) return 0
    return redirected ? 1 : 0.5
  },
})
