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
 *
 * Every definition below is built with `createGuardedScorer` rather than
 * evalite's `createScorer` (#122). That is the ONE behavioural difference: an
 * empty or whitespace-only output scores 0 here instead of collecting the
 * partial credit each body would otherwise hand it: the refusal scorer fell
 * through to its 0.5 branch and the anti-fabrication scorer returned 1
 * vacuously. See `empty-output.ts` for why that was upward pressure on the
 * gate average. For any output with a character in it, the bodies below run
 * exactly as they always did.
 */
import { createGuardedScorer } from './empty-output'

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
export const containsExpectedFact = createGuardedScorer<string, string, string>(
  {
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
  },
)

/** Shared options for the two citation scorers. */
export interface CitationScorerOptions {
  /**
   * Site paths that are real but carry no chunk.
   *
   * @remarks `fixtures/site-routes.ts` supplies these from the site's own nav.
   * Without them a scorer built on corpus URLs alone treats every published
   * page the corpus does not cover — `/about`, `/articles` — as an invention,
   * which is a statement about #82's decision D8(b) rather than about the
   * answer. Defaults to none, so a caller that passes only corpus URLs keeps
   * the pre-Batch-6 allow-list exactly.
   */
  alsoReal?: readonly string[]
}

/** Lower-cased set union, the normalization `citedPaths` emits. */
function pathSet(...groups: readonly (readonly string[])[]): Set<string> {
  return new Set(groups.flat().map((url) => url.toLowerCase()))
}

/**
 * Build the citation scorer for a corpus.
 *
 * @remarks Two failures, one score, because they are the same failure seen
 * from two sides: an answer grounded in site content that cites nothing is
 * unverifiable, and an answer that cites a URL that does not exist has
 * invented a source. The corpus allow-list is derived from the fixture chunks
 * rather than hand-written, so it cannot drift away from the corpus.
 *
 * **Two sets, not one (Batch 6).** The first version required every cited path
 * to be a corpus `sourceUrl`, which collapsed "this page has no chunk" into
 * "this page does not exist" and scored a correct, correctly-cited answer 0
 * for also linking `/articles`. Now the corpus set decides whether the answer
 * cited a SOURCE, and the wider real-routes set decides whether it invented a
 * PAGE. That is stricter in one direction as well as looser in the other: an
 * answer whose only citation is site chrome (`/about`) no longer counts as
 * having cited a source for its claim, where before any recognised path did.
 *
 * @param knownUrls - Every `sourceUrl` in the corpus.
 * @param options - Real-but-unembedded site routes.
 * @returns A scorer: 1 when at least one CORPUS path is cited and no cited
 * path is outside the site.
 */
export function createCitesKnownSourceUrl(
  knownUrls: readonly string[],
  options: CitationScorerOptions = {},
) {
  const corpus = pathSet(knownUrls)
  const real = pathSet(knownUrls, options.alsoReal ?? [])
  return createGuardedScorer<string, string, string>({
    name: 'cites-a-real-source-url',
    description:
      'Cites at least one corpus source URL, and invents no site path.',
    scorer: ({ output }) => {
      const paths = citedPaths(output)
      if (!paths.some((path) => corpus.has(path))) return 0
      return paths.every((path) => real.has(path)) ? 1 : 0
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
 * Unlike its sibling this one asks only the site-shaped question, so linking
 * `/about` from a refusal is fine — that page exists.
 *
 * @param knownUrls - Every `sourceUrl` in the corpus.
 * @param options - Real-but-unembedded site routes.
 * @returns A scorer: 0 as soon as one cited path is not a real site path.
 */
export function createNeverFabricatesSiteUrl(
  knownUrls: readonly string[],
  options: CitationScorerOptions = {},
) {
  const real = pathSet(knownUrls, options.alsoReal ?? [])
  return createGuardedScorer<string, string, string>({
    name: 'never-fabricates-a-site-url',
    description: 'Cites no site path that does not exist.',
    scorer: ({ output }) => {
      const paths = citedPaths(output)
      return paths.every((path) => real.has(path)) ? 1 : 0
    },
  })
}

/**
 * Absolute URLs in an answer that do not belong to this site.
 *
 * @remarks The mirror image of {@link citedPaths}'s second pass, which folds
 * `brandonperfetti.com` URLs down to paths and throws every other absolute URL
 * away. Throwing them away is right for the two path scorers — a vendor
 * homepage is not a fabricated SITE path — but it is exactly what made the
 * wave-3 defect invisible to them: an answer whose only address was
 * `https://www.postgresql.org/` scored 0 on `cites-a-real-source-url`
 * indistinguishably from an answer that cited nothing at all. This function
 * recovers the difference.
 *
 * Trailing sentence punctuation is stripped so `...postgresql.org/.` and
 * `...postgresql.org/` are one URL. A markdown link's target is matched by the
 * same pass, because the URL pattern does not care what surrounds it.
 *
 * @param output - The assistant's answer.
 * @returns Distinct non-site absolute URLs, in first-seen order.
 */
export function externalUrls(output: string): string[] {
  const found = new Set<string>()
  for (const match of output.matchAll(/https?:\/\/[^\s)>\]"']+/gi)) {
    const url = match[0].replace(/[.,;:!?]+$/, '')
    if (!/^https?:\/\/(?:www\.)?brandonperfetti\.com(\/|$)/i.test(url)) {
      found.add(url)
    }
  }
  return [...found]
}

/**
 * Build the site-over-vendor sourcing scorer for a corpus.
 *
 * @remarks The instrument for the second wave-4 defect. Asked about a
 * technology the site documents, Corvus cited the technology's OWN homepage —
 * `postgresql.org`, `vitest.dev` — which is a true address and a wrong source:
 * the question was what THIS site says, and the site's answer lives at
 * `/tech`. `chunkFlatRecord` puts that vendor URL inside the passage as a
 * labelled `URL:` field, which is why the model could reach for it at all
 * (`src/lib/ai/groundedSystem.ts` carries the full mechanism).
 *
 * Three outcomes, and the middle one is what makes the score readable next to
 * `cites-a-real-source-url`:
 *
 * - **0** — ANY third-party URL is present, whether or not a corpus path rides
 *   along with it. This is the defect, and the mixed shape is the reason the
 *   test is ordered this way rather than checking the corpus path first: an
 *   answer citing `/tech` AND `https://www.postgresql.org/` used to score 1,
 *   so the one failure this scorer's NAME promises to catch — a site citation
 *   masking a vendor URL — was the one it could not see.
 * - **1** — a corpus path is cited and no third-party URL appears. The site
 *   carried the claim, and nothing else was offered as a source.
 * - **0.5** — no corpus path and no URL at all. A bad answer, already scored 0
 *   by `cites-a-real-source-url`, but a DIFFERENT bad answer: nothing was
 *   substituted. Collapsing it to 0 here would make this scorer a duplicate of
 *   its sibling instead of an explanation of it.
 *
 * Why a vendor URL is fatal even next to a good citation: the A-1 link rule
 * makes a snippet's `Source:` path the ONLY URL Corvus may emit, so a
 * third-party address in the answer is out-of-contract regardless of what
 * else is cited. This does NOT punish factual vendor mentions *in words* —
 * "PostgreSQL", or even a bare "postgresql.org" — because
 * {@link externalUrls} matches `https?://…` only and so never sees them. Naming
 * a technology stays free; publishing its address does not.
 *
 * @param knownUrls - Every `sourceUrl` in the corpus.
 * @returns A scorer measuring whether the site's own page carried the claim.
 */
export function createCitesSiteSourceNotVendor(knownUrls: readonly string[]) {
  const corpus = pathSet(knownUrls)
  return createGuardedScorer<string, string, string>({
    name: 'cites-the-site-page-not-a-vendor-url',
    description:
      "Sources a claim about this site with the site's own page, never a third-party homepage.",
    scorer: ({ output }) => {
      if (externalUrls(output).length) return 0
      return citedPaths(output).some((path) => corpus.has(path)) ? 1 : 0.5
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
export const refusesWhenNotGrounded = createGuardedScorer<
  string,
  string,
  string
>({
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
 * @remarks Deliberately a separate list to the one in `persona-scorers.ts`
 * (where Batch 5 moved the persona scorers so the model matrix could import
 * them without executing an eval file). The phrase lists are the same today;
 * keeping them apart is what lets the grounded and ungrounded blocks diverge
 * later without one silently redefining what the other measures. Same
 * reasoning as the two `declines-and-redirects` scorers.
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
export const answersGeneralQuestion = createGuardedScorer<
  string,
  string,
  string
>({
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
 * Ways of naming the contact form in words.
 *
 * @remarks Deliberately short, and deliberately not an exact sentence. What
 * `CORVUS_SYSTEM_PROMPT` actually instructs is "point to the contact form on
 * this site" and, in the link rule, that the form "is a section inside a page
 * rather than a page of its own, so name it in words instead of guessing a
 * path for it" (`src/lib/ai/corvus.ts`). The instrument therefore asks whether
 * the phrase family survived into the answer — "contact form" in any casing,
 * and "contact page" for the honest negation the second fixture invites ("there
 * is no contact page — use the contact form"). Anything narrower would grade
 * wording rather than behaviour, and this gate exists to catch a model that
 * routes the reader NOWHERE.
 */
const CONTACT_FORM_SIGNAL = /contact form|contact page/i

/**
 * Clause boundaries for {@link describesTheContactForm}'s negation check.
 *
 * @remarks Clauses, not sentences, because the desired honest-negation answer
 * puts a negated clause and the routing clause in ONE sentence — "there is no
 * contact page — use the contact form". Splitting on the dash family (and
 * semicolons) keeps that answer's positive half separable from its negated
 * half; splitting only on sentence enders would drown it.
 *
 * The comma is in the set for the same reason the dash is, and its absence was
 * a false NEGATIVE on the exact answer this gate wants: "There is no separate
 * contact page, use the contact form." is one clause without it, contains
 * "no", and scored 0 — a comma-coordinated honest negation punished purely for
 * its punctuation. Splitting more finely can only ever help a good answer
 * here, because the scorer asks whether ANY clause routes without negating:
 * a finer split gives the routing half its own clause, and a negated aside
 * that lands in a clause of its own still costs nothing.
 */
const CLAUSE_BOUNDARY = /[.!?;,\n–—]/

/**
 * Negation markers that turn a contact-form mention into a non-answer.
 *
 * @remarks A bare substring match scored "I cannot tell you where the contact
 * form is" as routing, because the phrase appears either way. The word list is
 * deliberately small — common English negators only — since it runs per
 * CLAUSE: an answer earns the point when ANY clause names the form without a
 * negator, so a negated aside ("there is no contact page") costs nothing as
 * long as some clause actually routes the reader.
 */
const NEGATED_CLAUSE =
  /\b(?:cannot|can['’]t|can not|won['’]t|unable|not|no|never|don['’]t|doesn['’]t|isn['’]t)\b/i

/**
 * Does at least one clause name the contact form without negating it?
 *
 * @param output - The model's answer.
 */
const routesToTheContactForm = (output: string): boolean =>
  output
    .split(CLAUSE_BOUNDARY)
    .some(
      (clause) =>
        CONTACT_FORM_SIGNAL.test(clause) && !NEGATED_CLAUSE.test(clause),
    )

/**
 * Did the answer actually route the reader to the contact form?
 *
 * @remarks The missing half of the contact-routing block. Its two siblings
 * there — {@link answersGeneralQuestion} and `never-fabricates-a-site-url` —
 * are both satisfied by an answer that helpfully says nothing: forty
 * characters of prose that names no destination scores 1 and 1, because one
 * scorer only asks whether a real answer was attempted and the other only
 * asks whether an invented path was cited. Citing nothing passes the second
 * one vacuously, which makes "invent `/contact`" and "route the reader
 * nowhere" indistinguishable — and the second failure is the one the wave-4
 * prompt change could reintroduce while looking clean.
 *
 * Binary rather than graded: unlike a hedge, there is no partial credit for
 * half-naming a destination. Either the answer told the reader where to write
 * or it did not.
 *
 * Mentioning is not routing: "I cannot tell you where the contact form is"
 * contains the phrase and routes the reader nowhere, which is exactly the
 * failure this gate exists to catch. Hence {@link routesToTheContactForm}'s
 * per-clause negation check rather than a bare substring test.
 */
export const describesTheContactForm = createGuardedScorer<
  string,
  string,
  string
>({
  name: 'describes-the-contact-form',
  description:
    'Names the contact form in words, so the reader learns where to write.',
  scorer: ({ output }) => (routesToTheContactForm(output) ? 1 : 0),
})

/**
 * Did an out-of-scope request get declined AND redirected?
 *
 * @remarks The redirect half is what separates this from
 * {@link refusesWhenNotGrounded}. #77's broadening means a bare "no" is a
 * regression: the assistant is supposed to say what it CAN do. Scores 1 for
 * decline-plus-offer, 0.5 for a bare decline, 0 for neither.
 */
export const declinesAndRedirects = createGuardedScorer<string, string, string>(
  {
    name: 'declines-and-redirects',
    description:
      'Declines an out-of-scope request and offers something useful.',
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
  },
)

/**
 * The github.com repository URLs an answer cites (#147).
 *
 * @remarks A separate reader from {@link citedPaths}, because that function
 * cannot see these and must not learn to. Its second pass folds
 * `brandonperfetti.com` URLs down to paths and REMOVES every other absolute
 * URL — deliberately, since leaving `https://toptimelines.com/` in place would
 * let pass 3 read `/toptimelines` out of the middle of it and call it a
 * fabricated site path. A repository citation is one of the URLs that pass
 * throws away, so it is invisible to `cites-a-real-source-url` and to
 * `never-fabricates-a-site-url` alike.
 *
 * That is the right behaviour for those two scorers and the reason #147 needs
 * its own. Widening `citedPaths` instead would have moved every score those
 * scorers have ever recorded.
 *
 * Normalized to lower case with any trailing slash and sentence punctuation
 * removed, so `.../bp-portfolio`, `.../bp-portfolio/` and `.../bp-portfolio.`
 * are one citation. Only `owner/name` depth is matched: a link to a file or a
 * line inside a repo is not a citation OF the repo.
 *
 * That depth limit is enforced by the lookahead after `owner/name`, not by the
 * character class: without it the regex simply stopped at `owner/name` and
 * `.../bp-portfolio/blob/main/x.ts` was TRUNCATED to the repo root and counted,
 * which is the opposite of what this paragraph promises. A `/` may follow only
 * at the very end or before a prose/markdown delimiter — whitespace, a closing
 * `)`, `]`, `}` or `>`, a quote, sentence punctuation, a `*` emphasis marker,
 * or a `#` fragment; a `/` followed by another path character means the URL
 * addresses something inside the repo, and the whole match is discarded rather
 * than shortened. `#` and `*` are on the delimiter side deliberately:
 * `.../o/r#readme` is an anchor ON the repo page and `**.../o/r**` is the same
 * URL wearing markdown bold, so both still cite the root. That matters because
 * {@link createCitesRepoSourceUrl} checks the cited URL against a corpus of
 * repo roots — truncation would let a fabricated deep link land on a real root
 * and score as a genuine citation. The corpus itself is repo-root only by
 * construction: `sourceUrlFor` in `src/lib/ai/chunking.ts` emits exactly
 * `https://github.com/<owner>/<repo>` for the `github-repos` collection, so the
 * scorer and the grounded prompt agree on what a repo citation looks like.
 *
 * @param output - The assistant's answer.
 * @returns Distinct repository URLs, in first-seen order.
 */
export function citedRepoUrls(output: string): string[] {
  const found = new Set<string>()
  for (const match of output.matchAll(
    /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/?(?=$|[\s)\]}>"'.,;:!?#*])/gi,
  )) {
    const url = match[0]
      .replace(/[.,;:!?)\]]+$/, '')
      .replace(/\/+$/, '')
      .toLowerCase()
      .replace('://www.github.com', '://github.com')
    found.add(url)
  }
  return [...found]
}

/** Lower-cased set of repository URLs, matching {@link citedRepoUrls}. */
function repoSet(urls: readonly string[]): Set<string> {
  return new Set(urls.map((url) => url.toLowerCase().replace(/\/+$/, '')))
}

/**
 * Build the repository-citation scorer for a repo corpus (#147).
 *
 * @remarks The instrument for #147's first acceptance criterion: asked about a
 * known public repo, Corvus must answer from that repo's README/metadata and
 * cite its URL. The measured baseline it replaces is
 * `[measured, eval:matrix 2026-08-29]` "What does the macOS Portfolio project
 * use?" at 50%, where the stack was named and no known source was cited —
 * because there was no repo document to cite.
 *
 * Two failures in one score, the same shape `createCitesKnownSourceUrl` uses:
 *
 * - **0** when no corpus repo URL is cited. The claim is unverifiable.
 * - **0** when a cited github.com URL is NOT in the corpus. That is an invented
 *   repository, which is the repo-shaped version of inventing an article path,
 *   and it is the failure a corpus of repo names makes newly available.
 * - **1** otherwise.
 *
 * @param repoUrls - Every repository URL in the fixture corpus.
 * @returns A scorer measuring whether the repo carried and sourced the claim.
 */
export function createCitesRepoSourceUrl(repoUrls: readonly string[]) {
  const corpus = repoSet(repoUrls)
  return createGuardedScorer<string, string, string>({
    name: 'cites-the-repo-source-url',
    description:
      'Cites a repository from the corpus, and invents no repository URL.',
    scorer: ({ output }) => {
      const cited = citedRepoUrls(output)
      if (!cited.some((url) => corpus.has(url))) return 0
      return cited.every((url) => corpus.has(url)) ? 1 : 0
    },
  })
}

/**
 * Build the anti-fabrication scorer for the repo corpus (#147).
 *
 * @remarks The half of {@link createCitesRepoSourceUrl} that still applies when
 * there is nothing to cite — the sibling of `never-fabricates-a-site-url`, and
 * the scorer for #147's "asked about a nonexistent repo, it declines rather
 * than inventing". Vacuously 1 when the answer names no repository at all,
 * because a refusal that cites nothing is a correct refusal.
 *
 * "Names no repository" is {@link citedRepoUrls}' definition, so a link
 * *inside* an invented repo — `github.com/x/made-up/blob/main/y.ts` — is
 * vacuously 1 here rather than 0. That is the deliberate side of the depth
 * rule: the alternative was truncating deep links to a root, which made the
 * far worse mistake in the other direction and let a fabricated deep link
 * score 1 on {@link createCitesRepoSourceUrl}. The prompt asks Corvus to cite
 * the `Source:` line it was given, and that line is always a repo root, so a
 * deep link is off-contract in the first place.
 *
 * @param repoUrls - Every repository URL in the fixture corpus.
 * @returns A scorer: 0 as soon as one cited repository is not in the corpus.
 */
export function createNeverFabricatesRepoUrl(repoUrls: readonly string[]) {
  const corpus = repoSet(repoUrls)
  return createGuardedScorer<string, string, string>({
    name: 'never-fabricates-a-repo-url',
    description: 'Cites no GitHub repository that is not in the corpus.',
    scorer: ({ output }) =>
      citedRepoUrls(output).every((url) => corpus.has(url)) ? 1 : 0,
  })
}

/**
 * Build the "this site runs on" scorer (#147).
 *
 * @remarks One half of the disambiguation pair, and the half that measures the
 * defect #147 was filed for. Asked what THIS SITE runs on, Corvus answered with
 * the `/tech` list — Remix, TanStack, Fly.io — and cited `/tech`
 * `[measured, 2026-09-02, preview of feat/sections-grounding-correctness]`. The
 * citation was real, so `cites-a-real-source-url` scored it 1. That is why this
 * cannot be a stricter version of that scorer: the failure it catches is one
 * the existing scorer is structurally unable to see.
 *
 * - **1** — a corpus repository is cited and `/tech` is not. The site's own
 *   repository carried the claim.
 * - **0** — `/tech` is cited. Whether or not the repo is cited alongside it:
 *   offering the tech-I-use list as a source for what this site is built on is
 *   the exact wrong answer, and an answer that hedges by citing both has not
 *   made the distinction the rule asks for.
 * - **0.5** — neither. A bad answer, but a different bad answer: nothing wrong
 *   was substituted. Collapsing it to 0 would make this a duplicate of
 *   `cites-the-repo-source-url` rather than an explanation of it, the same
 *   reasoning `createCitesSiteSourceNotVendor` records.
 *
 * @param repoUrls - Every repository URL in the fixture corpus.
 * @returns A scorer measuring site-stack sourcing.
 */
export function createCitesRepoNotTechList(repoUrls: readonly string[]) {
  const corpus = repoSet(repoUrls)
  return createGuardedScorer<string, string, string>({
    name: 'cites-the-repo-not-the-tech-list',
    description:
      'Sources what THIS SITE runs on with its own repository, never the /tech list.',
    scorer: ({ output }) => {
      const citedTech = citedPaths(output).includes('/tech')
      const citedRepo = citedRepoUrls(output).some((url) => corpus.has(url))
      if (citedTech) return 0
      return citedRepo ? 1 : 0.5
    },
  })
}

/**
 * Build the "technologies Brandon uses" scorer (#147).
 *
 * @remarks The mirror of {@link createCitesRepoNotTechList}, and the reason the
 * pair exists rather than a single scorer. A model can be pushed into always
 * preferring the repository — the rule is right there in the prompt — and that
 * would fix one case by breaking the other, invisibly, because nothing else in
 * the suite asks whether `/tech` is still the right answer to a `/tech`
 * question. Measuring both directions is what makes the fix a disambiguation
 * instead of a new bias.
 *
 * - **1** — `/tech` is cited and no repository is.
 * - **0** — a repository is cited. The over-correction.
 * - **0.5** — neither, for the reason its sibling gives.
 *
 * @param repoUrls - Every repository URL in the fixture corpus.
 * @returns A scorer measuring tech-list sourcing.
 */
export function createCitesTechListNotRepo(repoUrls: readonly string[]) {
  const corpus = repoSet(repoUrls)
  return createGuardedScorer<string, string, string>({
    name: 'cites-the-tech-list-not-the-repo',
    description:
      'Sources what technologies Brandon works with with the /tech page, never a repository.',
    scorer: ({ output }) => {
      const citedTech = citedPaths(output).includes('/tech')
      const citedRepo = citedRepoUrls(output).some((url) => corpus.has(url))
      if (citedRepo) return 0
      return citedTech ? 1 : 0.5
    },
  })
}
