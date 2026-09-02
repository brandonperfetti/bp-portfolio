// @vitest-environment node
import type { Evalite } from 'evalite'
import { describe, expect, it } from 'vitest'

import {
  ADJACENT_CONTEXT_CASES,
  CONTACT_ROUTING_CASES,
  GENERAL_CASES,
  OFF_SITE_CASES,
  SCOPE_GROUNDED_CASES,
  SITE_FACT_CASES,
  TECH_SOURCING_CASES,
  UNGROUNDED_CASES,
} from './fixtures/datasets'
import { SITE_FIXTURE_DOCS } from './fixtures/site-content'
import { SITE_CHROME_URLS } from './fixtures/site-routes'
import {
  coverage,
  createFixtureRetriever,
  fixtureChunks,
  fixtureSourceUrls,
  terms,
} from './fixtures/retriever'
import {
  answersGeneralQuestion,
  citedPaths,
  containsExpectedFact,
  createCitesKnownSourceUrl,
  createCitesSiteSourceNotVendor,
  createNeverFabricatesSiteUrl,
  declinesAndRedirects,
  describesTheContactForm,
  externalUrls,
  refusesWhenNotGrounded,
  requiredFacts,
} from './scorers'

/**
 * Zero-cost coverage for everything the site-fact and scope evals depend on
 * that is NOT a model (#82 Batch 4).
 *
 * @remarks Two jobs, and the second is the one that earns this file's keep.
 *
 * 1. **Scorer logic.** Every deterministic scorer is a pure function, so a
 *    scorer bug should surface as a red `vitest` run, not as a mysteriously
 *    low score in a paid eval.
 * 2. **The evals' retrieval PRECONDITIONS.** Each grounded case asserts that
 *    the fixture retriever actually returns a chunk containing the literals
 *    that case's `expected` demands, and each ungrounded case asserts that it
 *    returns nothing. Without this, a fixture edit or a stop-word tweak could
 *    silently stop a question retrieving its answer, and the only symptom
 *    would be Corvus appearing to have got worse.
 *
 * Nothing here touches a provider, a database, or the network. These run from
 * the eval root (`vitest run --root evals`), not in the repo's `unit` project,
 * whose include globs cover `src/` and `scripts/` only.
 */

const SOURCE_URLS = fixtureSourceUrls()
const citesKnownSourceUrl = createCitesKnownSourceUrl(SOURCE_URLS)
const neverFabricatesSiteUrl = createNeverFabricatesSiteUrl(SOURCE_URLS)

/**
 * The scorers as the eval files actually build them (#82 Batch 6).
 *
 * @remarks The pair above is deliberately kept corpus-only: it pins the
 * behaviour the eval files had before this batch, so the two describe blocks
 * below read as a before/after of one decision rather than as a rewrite.
 */
const CITATION_OPTIONS = { alsoReal: SITE_CHROME_URLS }
const citesKnownSourceUrlOnSite = createCitesKnownSourceUrl(
  SOURCE_URLS,
  CITATION_OPTIONS,
)
const neverFabricatesSiteUrlOnSite = createNeverFabricatesSiteUrl(
  SOURCE_URLS,
  CITATION_OPTIONS,
)
const citesSiteSourceNotVendor = createCitesSiteSourceNotVendor(SOURCE_URLS)

/**
 * Call a scorer the way evalite does.
 *
 * @remarks `createScorer` returns the callable, not an object with a `.scorer`
 * property — it wraps the raw function so the result is always
 * `{name, description, score}`.
 *
 * @param scorer - A scorer built by `createScorer`.
 * @param output - The answer under test.
 * @param expected - The reference answer, when the scorer uses one.
 * @param input - The question; unused by every scorer here, but part of the shape.
 * @returns The numeric score.
 */
async function score(
  scorer: Evalite.Scorer<string, string, string>,
  output: string,
  expected?: string,
  input = 'q',
): Promise<number> {
  const result = await scorer({ input, output, expected })
  return result.score as number
}

describe('fixture corpus', () => {
  it('chunks every captured document through the real chunker', () => {
    const chunks = fixtureChunks()
    expect(chunks.length).toBe(SITE_FIXTURE_DOCS.length)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0)
      expect(chunk.visibility).toBe('public')
    }
  })

  it('derives the citation allow-list from the chunks', () => {
    // Hand-listing these would let the allow-list drift from the corpus.
    expect(SOURCE_URLS).toEqual([
      '/',
      '/articles/from-neon-to-supabase',
      '/articles/from-notion-to-payload',
      '/articles/from-sendgrid-to-resend',
      '/articles/runbooks-to-agent-skills',
      '/articles/the-nextjs-stack-i-reuse',
      '/projects',
      '/tech',
      '/uses',
    ])
  })

  it('contains only published, public documents', () => {
    // The fixtures ship in a PUBLIC repo. A draft or gated record must never
    // be added here, and this is the assertion that says so out loud.
    for (const { collection, doc } of SITE_FIXTURE_DOCS) {
      if (collection !== 'posts') continue
      expect(doc._status).toBe('published')
      expect((doc.access as { visibility?: string }).visibility).toBe('public')
    }
  })
})

describe('fixture retriever', () => {
  it('drops stop words and short tokens', () => {
    expect(terms('What company does Brandon work for?')).toEqual([
      'company',
      'work',
    ])
  })

  it('scores coverage of the query, not overlap of the two term sets', () => {
    // A long chunk must not be penalised for saying more than was asked.
    expect(coverage('postgresql proficiency', 'Proficiency: proficient')).toBe(
      0.5,
    )
    expect(coverage('postgresql', 'Technology: PostgreSQL')).toBe(1)
    expect(coverage('kubernetes', 'Technology: PostgreSQL')).toBe(0)
  })

  it('matches on a shared prefix once both terms are long enough', () => {
    expect(coverage('monitors', 'Dual 27-inch LG UltraFine monitor')).toBe(1)
    // Three-character terms are exact-match only, or "PM" would fuse with
    // "Prisma" and every short label would start matching everything.
    expect(coverage('pms', 'Technology: Prisma')).toBe(0)
  })

  it('returns nothing when the corpus does not cover the query', () => {
    expect(createFixtureRetriever()('shoe size')).toEqual([])
  })

  it('returns the nearest chunks anyway when the floor is switched off', () => {
    // The point of the floorless retriever: a vector index has no notion of
    // "no match", so this is the shape of the real hazard.
    const snippets = createFixtureRetriever({ floor: 0 })('shoe size')
    expect(snippets.length).toBe(5)
  })
})

describe('eval retrieval preconditions', () => {
  /** Title + content + sourceUrl of everything a question retrieves. */
  const retrievedBlob = (
    retrieve: (query: string) => Array<{
      title: string | null
      content: string
      sourceUrl: string | null
    }>,
    query: string,
  ): string =>
    retrieve(query)
      .map((s) => `${s.title ?? ''}\n${s.content}\n${s.sourceUrl ?? ''}`)
      .join('\n')
      .toLowerCase()

  it.each([
    ...SITE_FACT_CASES,
    ...SCOPE_GROUNDED_CASES,
    ...TECH_SOURCING_CASES,
  ])('retrieves every required fact for: $input', ({ input, expected }) => {
    const blob = retrievedBlob(createFixtureRetriever(), input)
    expect(blob.length).toBeGreaterThan(0)
    for (const fact of requiredFacts(expected)) {
      expect(blob, `"${fact}" must be retrievable`).toContain(
        fact.toLowerCase(),
      )
    }
  })

  it.each(UNGROUNDED_CASES)(
    'retrieves nothing for the ungrounded case: $input',
    ({ input }) => {
      // If this ever starts retrieving, the block stops testing the ungrounded
      // path and quietly becomes a third grounded block.
      expect(createFixtureRetriever()(input)).toEqual([])
    },
  )

  it.each(ADJACENT_CONTEXT_CASES)(
    'hands over real but unhelpful context for: $input',
    ({ input }) => {
      expect(createFixtureRetriever()(input)).toEqual([])
      expect(createFixtureRetriever({ floor: 0 })(input).length).toBe(5)
    },
  )

  it.each([...GENERAL_CASES, ...OFF_SITE_CASES])(
    'retrieves nothing for the non-site case: $input',
    ({ input }) => {
      expect(createFixtureRetriever()(input)).toEqual([])
    },
  )

  it.each(CONTACT_ROUTING_CASES)(
    'retrieves nothing for the contact case: $input',
    ({ input }) => {
      // The block's whole premise: the contact defect lives in
      // CORVUS_SYSTEM_PROMPT, so these cases must reach Corvus with the
      // untouched persona prompt. If one starts retrieving, the block quietly
      // becomes a test of the grounded path instead.
      expect(createFixtureRetriever()(input)).toEqual([])
    },
  )
})

describe('requiredFacts', () => {
  it('reads the quoted spans out of an expected answer', () => {
    expect(requiredFacts('He works at "Brytecore" since "2024".')).toEqual([
      'Brytecore',
      '2024',
    ])
  })

  it('is empty for an unquoted or absent expectation', () => {
    expect(requiredFacts('no quoted spans here')).toEqual([])
    expect(requiredFacts(undefined)).toEqual([])
  })
})

describe('citedPaths', () => {
  it('reads markdown link targets, including the bare root', () => {
    expect(
      citedPaths('See [his work history](/) and [articles](/articles).'),
    ).toEqual(['/', '/articles'])
  })

  it('folds an absolute site URL down to its path', () => {
    expect(
      citedPaths('https://brandonperfetti.com/articles/from-neon-to-supabase'),
    ).toEqual(['/articles/from-neon-to-supabase'])
  })

  it('does not read a path out of a third-party URL', () => {
    // The regression this guards: `/toptimelines` read out of the middle of
    // https://toptimelines.com/ and scored as an invented site path.
    expect(citedPaths('It lives at https://toptimelines.com/.')).toEqual([])
  })

  it('does not treat a slash inside a word as a citation', () => {
    expect(citedPaths('Use TypeScript/JavaScript and/or Zod.')).toEqual([])
  })

  it('strips trailing punctuation and a trailing slash', () => {
    expect(citedPaths('Look at /tech/, or /uses.')).toEqual(['/tech', '/uses'])
  })
})

describe('contains-expected-fact', () => {
  it('is the fraction of quoted facts present', async () => {
    const expected = 'He is a "Senior Frontend Engineer" at "Brytecore".'
    expect(
      await score(
        containsExpectedFact,
        'Senior Frontend Engineer at Brytecore',
        expected,
      ),
    ).toBe(1)
    expect(
      await score(
        containsExpectedFact,
        'He is a Senior Frontend Engineer.',
        expected,
      ),
    ).toBe(0.5)
    expect(await score(containsExpectedFact, 'No idea.', expected)).toBe(0)
  })

  it('ignores case and whitespace shape', async () => {
    expect(
      await score(
        containsExpectedFact,
        'senior   frontend\nengineer',
        'a "Senior Frontend Engineer"',
      ),
    ).toBe(1)
  })

  it('demands nothing when the expectation quotes nothing', async () => {
    expect(await score(containsExpectedFact, 'anything', 'no quotes')).toBe(1)
  })
})

describe('cites-a-real-source-url', () => {
  it('passes an answer that cites a corpus URL', async () => {
    expect(
      await score(
        citesKnownSourceUrl,
        'See [the article](/articles/from-neon-to-supabase).',
      ),
    ).toBe(1)
  })

  it('fails an answer that cites nothing', async () => {
    expect(await score(citesKnownSourceUrl, 'He moved to Supabase.')).toBe(0)
  })

  it('fails an invented article path', async () => {
    expect(
      await score(citesKnownSourceUrl, 'See /articles/kubernetes-at-scale.'),
    ).toBe(0)
  })

  it('fails when one of several cited paths is invented', async () => {
    expect(
      await score(citesKnownSourceUrl, 'See /tech and /articles/made-up.'),
    ).toBe(0)
  })
})

describe('cites-a-real-source-url · real site routes (#82 Batch 6)', () => {
  it('lists only paths the site actually routes', () => {
    // Derived from HEADER_NAV_LINKS, so this fails if the nav loses a page.
    expect(SITE_CHROME_URLS).toContain('/about')
    expect(SITE_CHROME_URLS).toContain('/articles')
    // The persona prompt says "point to the contact form", but the form is a
    // page-builder block, not a route. Citing /contact stays a fabrication.
    expect(SITE_CHROME_URLS).not.toContain('/contact')
  })

  it('no longer fails a correct citation for also linking the index page', async () => {
    const answer =
      'That is [the Supabase migration piece](/articles/from-neon-to-supabase); the rest are on [Articles](/articles).'

    // The regression this batch fixes: one real page with no chunk behind it
    // dragged an otherwise perfect answer to zero.
    expect(await score(citesKnownSourceUrl, answer)).toBe(0)
    expect(await score(citesKnownSourceUrlOnSite, answer)).toBe(1)
  })

  it('still fails an answer whose only citation is site chrome', async () => {
    // Stricter than the old scorer in this direction: /about is real, but it
    // is not a source for the fact the answer just stated.
    expect(
      await score(
        citesKnownSourceUrlOnSite,
        'He is a Senior Frontend Engineer — see [About](/about).',
      ),
    ).toBe(0)
  })

  it('still fails an invented article path alongside a real one', async () => {
    expect(
      await score(
        citesKnownSourceUrlOnSite,
        'See /tech and /articles/kubernetes-at-scale.',
      ),
    ).toBe(0)
  })

  it('accepts chrome in a refusal without weakening the fabrication check', async () => {
    expect(
      await score(
        neverFabricatesSiteUrlOnSite,
        "The site doesn't say, but /about has the background.",
      ),
    ).toBe(1)
    expect(
      await score(
        neverFabricatesSiteUrlOnSite,
        "The site doesn't say, but /certifications has the background.",
      ),
    ).toBe(0)
  })
})

describe('never-fabricates-a-site-url', () => {
  it('is vacuously satisfied when nothing is cited', async () => {
    expect(await score(neverFabricatesSiteUrl, 'A queue decouples work.')).toBe(
      1,
    )
  })

  it('fails an invented path even in a refusal', async () => {
    expect(
      await score(
        neverFabricatesSiteUrl,
        "I'm not sure, but see /articles/aws-certifications.",
      ),
    ).toBe(0)
  })
})

describe('refuses-when-not-grounded', () => {
  it('rewards a hedge', async () => {
    expect(
      await score(
        refusesWhenNotGrounded,
        "The site doesn't list any certifications — the contact form is the best route.",
      ),
    ).toBe(1)
  })

  it('gives half credit to an answer that neither hedges nor claims the site', async () => {
    expect(
      await score(refusesWhenNotGrounded, 'Certifications are a mixed signal.'),
    ).toBe(0.5)
  })

  it('fails an answer that claims the site as its source', async () => {
    expect(
      await score(
        refusesWhenNotGrounded,
        'According to the site, he holds the AWS Solutions Architect certification.',
      ),
    ).toBe(0)
  })

  it('still rewards a hedged answer that also mentions the site', async () => {
    // A hedge plus a citation is a good answer, not a false-confidence one.
    expect(
      await score(
        refusesWhenNotGrounded,
        "The site says that he works at Brytecore, but it doesn't say anything about certifications.",
      ),
    ).toBe(1)
  })
})

describe('answers-general-questions', () => {
  it('fails an off-topic refusal', async () => {
    expect(
      await score(
        answersGeneralQuestion,
        "I can only discuss Brandon's work, so I can't help with that.",
      ),
    ).toBe(0)
  })

  it('half-credits a one-line deflection', async () => {
    expect(await score(answersGeneralQuestion, 'Depends.')).toBe(0.5)
  })

  it('passes a substantive answer', async () => {
    expect(
      await score(
        answersGeneralQuestion,
        'Reach for a queue when the work is triggered by an event rather than a clock, and when retries matter.',
      ),
    ).toBe(1)
  })
})

describe('declines-and-redirects', () => {
  it('rewards decline plus an offer', async () => {
    expect(
      await score(
        declinesAndRedirects,
        "There are no orders here — I'm happy to help with the articles instead.",
      ),
    ).toBe(1)
  })

  it('half-credits a bare decline', async () => {
    expect(await score(declinesAndRedirects, 'I cannot do that.')).toBe(0.5)
  })

  it('fails an answer that plays along', async () => {
    expect(
      await score(
        declinesAndRedirects,
        'Your package is out for delivery and should arrive by 5pm.',
      ),
    ).toBe(0)
  })
})

describe('describes-the-contact-form (#82 wave 4)', () => {
  const helpfulButRouteless =
    'Brandon is easy to reach and generally replies quickly, so just send a note whenever something looks worth talking about.'

  it('fails a helpful answer that names no destination', async () => {
    // The gap this scorer fills. Long enough to score 1 on
    // `answers-general-questions`, and citing nothing at all, so
    // `never-fabricates-a-site-url` passes it vacuously — yet the reader is
    // told nothing about where to write.
    expect(await score(describesTheContactForm, helpfulButRouteless)).toBe(0)
    expect(await score(answersGeneralQuestion, helpfulButRouteless)).toBe(1)
    expect(await score(neverFabricatesSiteUrlOnSite, helpfulButRouteless)).toBe(
      1,
    )
  })

  it('passes an answer that describes the contact form', async () => {
    expect(
      await score(
        describesTheContactForm,
        'Scroll to the contact form near the bottom of the page and send him a message there.',
      ),
    ).toBe(1)
  })

  it('passes the honest negation the second fixture invites', async () => {
    // "What is the URL of the contact page?" has no URL for an answer. Saying
    // so and naming the form is the behaviour the prompt asks for.
    expect(
      await score(
        describesTheContactForm,
        'There is no separate contact page — the contact form is a section inside a page.',
      ),
    ).toBe(1)
  })

  it('does not care how the phrase is cased', async () => {
    expect(
      await score(describesTheContactForm, 'Use the Contact Form on the site.'),
    ).toBe(1)
  })

  it('fails a negative mention that routes the reader nowhere', async () => {
    // Mentioning is not routing. A bare substring test scored this 1 because
    // the phrase appears; the reader still has no destination.
    expect(
      await score(
        describesTheContactForm,
        'I cannot tell you where the contact form is.',
      ),
    ).toBe(0)
  })

  it('fails a denial phrased across one clause', async () => {
    expect(
      await score(
        describesTheContactForm,
        "There isn't a contact form on this site.",
      ),
    ).toBe(0)
  })

  it('still passes when a negated aside precedes the routing clause', async () => {
    // The clause-level check must not overcorrect: an answer that opens with a
    // negation and then routes is the desired honest shape, not a failure.
    expect(
      await score(
        describesTheContactForm,
        "He doesn't publish an email address. Use the contact form to reach him.",
      ),
    ).toBe(1)
  })

  it('passes the honest negation when a comma coordinates the clauses', async () => {
    // Regression: without `,` in CLAUSE_BOUNDARY this was ONE clause, it
    // contains "no", and the desired answer scored 0 purely on punctuation.
    expect(
      await score(
        describesTheContactForm,
        'There is no separate contact page, use the contact form.',
      ),
    ).toBe(1)
  })

  it('passes a doubly comma-separated negation-then-routing answer', async () => {
    expect(
      await score(
        describesTheContactForm,
        "No, that page doesn't exist, but the contact form is at the bottom.",
      ),
    ).toBe(1)
  })

  it('scores an empty answer 0 through the #122 guard', async () => {
    expect(await score(describesTheContactForm, '   ')).toBe(0)
  })
})

describe('externalUrls', () => {
  it('finds a third-party address and strips sentence punctuation', () => {
    expect(externalUrls('See https://www.postgresql.org/.')).toEqual([
      'https://www.postgresql.org/',
    ])
  })

  it('ignores this site, in either spelling', () => {
    expect(
      externalUrls(
        'https://brandonperfetti.com/tech and https://www.brandonperfetti.com/uses',
      ),
    ).toEqual([])
  })

  it('reads a markdown link target', () => {
    expect(
      externalUrls('[Vitest](https://vitest.dev/) is the runner.'),
    ).toEqual(['https://vitest.dev/'])
  })

  it('finds nothing in an answer with no absolute URL', () => {
    expect(externalUrls('The tech page lists it at /tech.')).toEqual([])
  })
})

describe('cites-the-site-page-not-a-vendor-url (#82 wave 4)', () => {
  it('fails the measured defect: the vendor homepage as the source', async () => {
    // Wave 3's failure, verbatim in shape. Every word is true and the source
    // is wrong: the question was what THIS site says.
    expect(
      await score(
        citesSiteSourceNotVendor,
        'PostgreSQL is listed at proficient — see https://www.postgresql.org/.',
      ),
    ).toBe(0)
  })

  it('passes when the site page carries the claim', async () => {
    expect(
      await score(
        citesSiteSourceNotVendor,
        'The [tech page](/tech) lists PostgreSQL at proficient.',
      ),
    ).toBe(1)
  })

  it('fails the mixed shape: a site citation masking a vendor URL', async () => {
    // The failure this scorer's NAME promises to catch, and the one it could
    // not see while the corpus-path test ran first. Under the A-1 link rule a
    // snippet `Source:` path is the only URL Corvus may emit, so the vendor
    // address is out-of-contract even with `/tech` cited alongside it.
    expect(
      await score(
        citesSiteSourceNotVendor,
        'The [tech page](/tech) lists PostgreSQL at proficient; the project itself lives at https://www.postgresql.org/.',
      ),
    ).toBe(0)
  })

  it('still passes a factual vendor mention made in words', async () => {
    // Naming the technology — even writing its bare domain — is helpful and
    // is not a link. `externalUrls` matches `https?://…` only, so nothing here
    // registers as a competing source and the site keeps the credit.
    expect(
      await score(
        citesSiteSourceNotVendor,
        'The [tech page](/tech) lists PostgreSQL at proficient; the project lives at postgresql.org.',
      ),
    ).toBe(1)
  })

  it('half-credits an answer that cites nothing at all', async () => {
    // A different bad answer: unverifiable, but nothing was substituted for
    // the source. `cites-a-real-source-url` already scores this 0; collapsing
    // it here too would make this scorer a duplicate rather than an
    // explanation.
    expect(
      await score(
        citesSiteSourceNotVendor,
        'PostgreSQL is listed at proficient.',
      ),
    ).toBe(0.5)
  })

  it('separates the two failures its sibling cannot tell apart', async () => {
    const vendorOnly =
      'PostgreSQL is listed at proficient — see https://www.postgresql.org/.'
    const nothing = 'PostgreSQL is listed at proficient.'

    // The gap this scorer exists to fill: identical on the old instrument.
    expect(await score(citesKnownSourceUrlOnSite, vendorOnly)).toBe(0)
    expect(await score(citesKnownSourceUrlOnSite, nothing)).toBe(0)
    // Distinguished on the new one.
    expect(await score(citesSiteSourceNotVendor, vendorOnly)).toBe(0)
    expect(await score(citesSiteSourceNotVendor, nothing)).toBe(0.5)
  })

  it('scores an empty answer 0 through the #122 guard', async () => {
    expect(await score(citesSiteSourceNotVendor, '   ')).toBe(0)
  })
})

describe('never-fabricates-a-site-url · the /contact guess (#82 wave 4)', () => {
  it('fails an answer that links a contact page the site does not route', async () => {
    // The first wave-4 defect as the scorer sees it. `/contact` has no route
    // file and is deliberately absent from SITE_CHROME_URLS.
    expect(
      await score(
        neverFabricatesSiteUrlOnSite,
        'Use the [contact form](/contact) to reach Brandon.',
      ),
    ).toBe(0)
  })

  it('passes an answer that names the contact form without a link', async () => {
    expect(
      await score(
        neverFabricatesSiteUrlOnSite,
        'There is no separate contact page — scroll to the contact form and send a message.',
      ),
    ).toBe(1)
  })

  it('passes an answer that redirects to a page that does exist', async () => {
    expect(
      await score(
        neverFabricatesSiteUrlOnSite,
        'The contact form is a section on the site; [About](/about) has more on Brandon.',
      ),
    ).toBe(1)
  })
})
