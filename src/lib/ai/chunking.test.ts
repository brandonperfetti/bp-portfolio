import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { TechStack } from '@/collections/TechStack'
import {
  CHUNK_OVERLAP_TOKENS,
  CORVUS_EMBEDDED_COLLECTIONS,
  CORVUS_TECH_STACK_SUMMARY_COLLECTION,
  DAILY_DRIVER_PROFICIENCY,
  TARGET_CHUNK_TOKENS,
  TECH_PROFICIENCY_LABELS,
  TECH_STACK_SUMMARY_DOC_ID,
  type TechProficiency,
  MAX_CHUNK_TOKENS,
  chunkDocument,
  chunkTechStackSummary,
  chunkFlatRecord,
  chunkPost,
  estimateTokens,
  hashChunkContent,
  isEmbeddable,
  sourceUrlFor,
  takeTailTokens,
  techProficiencyLabel,
  visibilityOf,
} from '@/lib/ai/chunking'

/**
 * Chunking is the only part of the embedding pipeline that is pure, so it is
 * the part that can be pinned exactly — boundaries, overlap, the title prefix,
 * hashing, `source_url` derivation, and the visibility default that the whole
 * gating story rests on.
 */

/** Build a Lexical `content` value with one paragraph per supplied string. */
const lexical = (paragraphs: string[]) => ({
  root: {
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [{ type: 'text', text }],
    })),
  },
})

const words = (count: number, token = 'alpha') =>
  Array.from({ length: count }, () => token).join(' ')

describe('estimateTokens', () => {
  it('approximates four characters per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(400))).toBe(100)
  })

  it('ignores surrounding whitespace', () => {
    expect(estimateTokens('   abcd   ')).toBe(1)
  })
})

describe('hashChunkContent', () => {
  it('is sha256 hex of the exact content', () => {
    expect(hashChunkContent('hello')).toBe(
      createHash('sha256').update('hello', 'utf8').digest('hex'),
    )
  })

  it('changes when a single character changes — the refresh-skip contract', () => {
    expect(hashChunkContent('hello')).not.toBe(hashChunkContent('hellp'))
  })
})

describe('sourceUrlFor', () => {
  it('derives the article path from a post slug', () => {
    expect(sourceUrlFor('posts', 'my-article')).toBe('/articles/my-article')
  })

  it('cites a PLACED post at its section path (#153)', () => {
    expect(
      sourceUrlFor('posts', { slug: 'my-article', path: 'work/my-article' }),
    ).toBe('/work/my-article')
  })

  it('cites an unplaced post at /articles whether it is handed a doc or a slug', () => {
    expect(sourceUrlFor('posts', { slug: 'my-article', path: null })).toBe(
      '/articles/my-article',
    )
    expect(sourceUrlFor('posts', { slug: 'my-article' })).toBe(
      '/articles/my-article',
    )
    expect(sourceUrlFor('posts', 'my-article')).toBe('/articles/my-article')
  })

  it('returns null for a post with no slug rather than a broken link', () => {
    expect(sourceUrlFor('posts', null)).toBeNull()
    expect(sourceUrlFor('posts')).toBeNull()
  })

  it('maps each flat collection to the index page that renders it', () => {
    expect(sourceUrlFor('projects')).toBe('/projects')
    expect(sourceUrlFor('uses')).toBe('/uses')
    expect(sourceUrlFor('tech-stack')).toBe('/tech')
  })

  /**
   * #137: a work-history row's citation is the role's Page under `/work`, not
   * the homepage — the whole reason Corvus declined work-history questions was
   * that `/` is not a citation anyone can follow to an answer.
   */
  it('cites a work-history row at its role page under /work', () => {
    expect(sourceUrlFor('work-history', 'brytecore')).toBe('/work/brytecore')
    expect(sourceUrlFor('work-history', { slug: 'brytecore' })).toBe(
      '/work/brytecore',
    )
  })

  it('keeps citing / for a work-history row seeded before slugs existed', () => {
    expect(sourceUrlFor('work-history')).toBe('/')
    expect(sourceUrlFor('work-history', null)).toBe('/')
    expect(sourceUrlFor('work-history', { slug: '   ' })).toBe('/')
  })
})

describe('visibilityOf', () => {
  it('defaults to public exactly as canAccess does', () => {
    expect(visibilityOf({})).toBe('public')
    expect(visibilityOf({ access: null })).toBe('public')
    expect(visibilityOf({ access: { visibility: 'public' } })).toBe('public')
  })

  it('reads gated as gated', () => {
    expect(visibilityOf({ access: { visibility: 'gated' } })).toBe('gated')
  })

  it('fails CLOSED on an unrecognized visibility value', () => {
    // A future access tier (e.g. 'members') must never be embedded as public
    // and leak through the anonymous filter.
    expect(visibilityOf({ access: { visibility: 'members' } })).toBe('gated')
  })
})

describe('takeTailTokens', () => {
  it('returns a word-aligned tail within roughly the token budget', () => {
    const tail = takeTailTokens(words(200), 50)
    expect(tail.startsWith('alpha')).toBe(true)
    expect(estimateTokens(tail)).toBeLessThanOrEqual(55)
  })

  it('never splits a word', () => {
    expect(takeTailTokens('one two three', 1)).toBe('three')
  })

  it('returns empty for empty input', () => {
    expect(takeTailTokens('   ', 50)).toBe('')
  })
})

describe('chunkPost', () => {
  const basePost = {
    id: 7,
    title: 'Shipping Fast',
    excerpt: 'How we ship',
    slug: 'shipping-fast',
    publishedAt: '2026-01-02T03:04:05.000Z',
    _status: 'published',
  }

  it('prefixes EVERY chunk with title and excerpt', () => {
    const chunks = chunkPost({
      ...basePost,
      content: lexical([words(300), words(300), words(300)]),
    })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.content.startsWith('Shipping Fast — How we ship')).toBe(true)
    }
  })

  it('numbers chunks from zero and carries the post metadata onto each', () => {
    const chunks = chunkPost({
      ...basePost,
      content: lexical([words(300), words(300)]),
    })

    expect(chunks.map((c) => c.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    )
    for (const chunk of chunks) {
      expect(chunk.collection).toBe('posts')
      expect(chunk.docId).toBe(7)
      expect(chunk.title).toBe('Shipping Fast')
      expect(chunk.sourceUrl).toBe('/articles/shipping-fast')
      expect(chunk.publishedAt).toBe('2026-01-02T03:04:05.000Z')
      expect(chunk.contentHash).toBe(hashChunkContent(chunk.content))
    }
  })

  it('keeps a short post in a single chunk', () => {
    const chunks = chunkPost({
      ...basePost,
      content: lexical(['a short paragraph about ravens']),
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain('a short paragraph about ravens')
  })

  it('splits on block boundaries once past the target size', () => {
    const chunks = chunkPost({
      ...basePost,
      content: lexical([words(300), words(300), words(300), words(300)]),
    })

    expect(chunks.length).toBeGreaterThan(1)
  })

  it('overlaps consecutive chunks so a boundary sentence is in both', () => {
    // Distinct per-block vocabularies make the overlap visible: whatever ends
    // chunk N must reappear at the head of chunk N+1's body.
    const chunks = chunkPost({
      ...basePost,
      content: lexical([
        `${words(200, 'aaaaaaaa')} sentinelone`,
        `${words(200, 'bbbbbbbb')} sentineltwo`,
        `${words(200, 'cccccccc')} sentinelthree`,
      ]),
    })

    expect(chunks.length).toBeGreaterThan(1)
    const overlapped = chunks
      .slice(1)
      .some((chunk) => /sentinel(one|two)/.test(chunk.content))
    expect(overlapped).toBe(true)
  })

  it('never lets a chunk exceed the hard ceiling for normal-sized blocks', () => {
    const chunks = chunkPost({
      ...basePost,
      content: lexical(Array.from({ length: 12 }, () => words(120))),
    })

    for (const chunk of chunks) {
      expect(estimateTokens(chunk.content)).toBeLessThanOrEqual(
        MAX_CHUNK_TOKENS +
          CHUNK_OVERLAP_TOKENS +
          estimateTokens('Shipping Fast — How we ship'),
      )
    }
  })

  it('keeps an oversized single block whole rather than cutting mid-block', () => {
    const chunks = chunkPost({
      ...basePost,
      content: lexical([words(4000)]),
    })

    expect(chunks).toHaveLength(1)
  })

  it('still yields one prefix-only chunk for a post with an empty body', () => {
    const chunks = chunkPost({
      ...basePost,
      content: { root: { children: [] } },
    })

    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Shipping Fast — How we ship')
  })

  it('carries a gated post visibility onto every chunk', () => {
    const chunks = chunkPost({
      ...basePost,
      access: { visibility: 'gated' },
      content: lexical([words(300), words(300)]),
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.visibility === 'gated')).toBe(true)
  })

  it('defaults an access-less post to public', () => {
    const chunks = chunkPost({ ...basePost, content: lexical(['hello']) })
    expect(chunks[0].visibility).toBe('public')
  })
})

describe('chunkFlatRecord', () => {
  it('renders a work-history entry as a labelled record with a period', () => {
    const [chunk] = chunkFlatRecord('work-history', {
      id: 3,
      company: 'Acme',
      title: 'Technical PM',
      description: 'Led the platform team.',
      startDate: '2021-03-01T00:00:00.000Z',
      endDate: '2023-06-01T00:00:00.000Z',
    })

    expect(chunk.content).toBe(
      [
        'Company: Acme',
        'Title: Technical PM',
        'Period: 2021-03-01 – 2023-06-01',
        'Description: Led the platform team.',
      ].join('\n'),
    )
    expect(chunk.title).toBe('Acme — Technical PM')
    expect(chunk.sourceUrl).toBe('/')
    expect(chunk.chunkIndex).toBe(0)
  })

  /**
   * The chunker has to hand the row's slug to `sourceUrlFor` for #137 to reach
   * a stored chunk at all — a correct `sourceUrlFor` that nothing calls with a
   * slug leaves every embedded row still citing `/`.
   */
  it('carries the role slug into a work-history chunk’s sourceUrl (#137)', () => {
    const [chunk] = chunkFlatRecord('work-history', {
      id: 3,
      slug: 'brytecore',
      company: 'Brytecore',
      title: 'Senior Frontend Engineer',
      startDate: '2024-09-02T00:00:00.000Z',
      current: true,
    })

    expect(chunk.sourceUrl).toBe('/work/brytecore')
  })

  it('leaves the other flat collections’ citations untouched by the slug (#137)', () => {
    const [project] = chunkFlatRecord('projects', {
      id: 9,
      slug: 'portfolio',
      title: 'Portfolio',
    })
    const [tech] = chunkFlatRecord('tech-stack', {
      id: 10,
      slug: 'typescript',
      name: 'TypeScript',
    })

    expect(project.sourceUrl).toBe('/projects')
    expect(tech.sourceUrl).toBe('/tech')
  })

  it('renders a current role as Present', () => {
    const [chunk] = chunkFlatRecord('work-history', {
      id: 4,
      company: 'Acme',
      title: 'PM',
      startDate: '2024-01-01T00:00:00.000Z',
      current: true,
    })

    expect(chunk.content).toContain('Period: 2024-01-01 – Present')
  })

  it('renders a project with its populated tech names', () => {
    const [chunk] = chunkFlatRecord('projects', {
      id: 9,
      title: 'Portfolio',
      year: 2026,
      description: 'This site.',
      link: 'https://example.test',
      tech: [{ name: 'Next.js' }, { name: 'Payload' }],
    })

    expect(chunk.content).toContain('Project: Portfolio')
    expect(chunk.content).toContain('Tech: Next.js, Payload')
    expect(chunk.sourceUrl).toBe('/projects')
  })

  /**
   * `projects.year` is `type: 'number'`, and the label helper rendered only
   * strings — so the year was silently absent from every embedded project
   * chunk and "when was that project built" had no grounding at all, with the
   * value sitting right there on the document. Note the test ABOVE already
   * passed `year: 2026` and simply never asserted on it, which is exactly how
   * the gap survived review.
   */
  it('embeds a NUMERIC field — the year reaches the chunk text', () => {
    const [chunk] = chunkFlatRecord('projects', {
      id: 9,
      title: 'Portfolio',
      year: 2026,
    })

    expect(chunk.content).toContain('Year: 2026')
  })

  it('embeds a zero year rather than treating it as an empty value', () => {
    const [chunk] = chunkFlatRecord('projects', {
      id: 9,
      title: 'Portfolio',
      year: 0,
    })

    expect(chunk.content).toContain('Year: 0')
  })

  it('drops a non-finite number rather than embedding "NaN"', () => {
    const [chunk] = chunkFlatRecord('projects', {
      id: 9,
      title: 'Portfolio',
      year: Number.NaN,
    })

    expect(chunk.content).not.toContain('Year:')
    expect(chunk.content).not.toContain('NaN')
  })

  it('still drops booleans — a labelled `true` is worse text than no line', () => {
    // Deliberate: no call site labels a boolean today, and the decision to
    // word one belongs at the call site, not silently inside `label()`.
    const [chunk] = chunkFlatRecord('projects', {
      id: 9,
      title: 'Portfolio',
      year: true as unknown as number,
    })

    expect(chunk.content).not.toContain('Year:')
  })

  it('tolerates unpopulated relationships (bare ids) without inventing text', () => {
    const [chunk] = chunkFlatRecord('projects', {
      id: 9,
      title: 'Portfolio',
      tech: [12, 13],
    })

    expect(chunk.content).not.toContain('Tech:')
  })

  it('renders tech-stack and uses records', () => {
    const [tech] = chunkFlatRecord('tech-stack', {
      id: 1,
      name: 'TypeScript',
      category: 'tooling',
      proficiency: 'daily',
      notes: 'Everywhere.',
    })
    expect(tech.content).toContain('Technology: TypeScript')
    expect(tech.title).toBe('TypeScript')
    expect(tech.sourceUrl).toBe('/tech')

    const [uses] = chunkFlatRecord('uses', {
      id: 2,
      title: 'Keyboard',
      category: 'workstation',
    })
    expect(uses.content).toContain('Uses entry: Keyboard')
    expect(uses.sourceUrl).toBe('/uses')
  })

  it('omits empty fields entirely instead of emitting bare labels', () => {
    const [chunk] = chunkFlatRecord('uses', {
      id: 2,
      title: 'Keyboard',
      category: 'workstation',
      description: '   ',
      link: '',
    })

    expect(chunk.content).toBe('Uses entry: Keyboard\nCategory: workstation')
  })

  it('returns no chunk at all for an entirely empty record', () => {
    expect(chunkFlatRecord('uses', { id: 5 })).toEqual([])
  })

  it('leaves published_at null so retrieval never date-filters them out', () => {
    const [chunk] = chunkFlatRecord('tech-stack', { id: 1, name: 'Vitest' })
    expect(chunk.publishedAt).toBeNull()
  })
})

/**
 * #165 — the chunk has to carry the ranking signal, not just store it.
 *
 * @remarks Asked "What tech do you use?" on production (2026-09-04) Corvus
 * answered TypeScript, TanStack, Vite, Vercel and Expo, omitting Next.js and
 * React. `proficiency` already held the answer; `Proficiency: daily` was just
 * a poor thing for a query vector to find, and "daily" alone reads as a
 * frequency rather than a ranking.
 */
describe('tech-stack proficiency in the chunk (#165)', () => {
  it('embeds the human label, not the raw enum value', () => {
    const [chunk] = chunkFlatRecord('tech-stack', {
      id: 1,
      name: 'Next.js',
      proficiency: 'daily',
    })

    expect(chunk.content).toContain('Proficiency: Daily driver')
    expect(chunk.content).not.toContain('Proficiency: daily')
  })

  it('leads a daily-driver chunk with a sentence, before the labels', () => {
    const [chunk] = chunkFlatRecord('tech-stack', {
      id: 1,
      name: 'Next.js',
      proficiency: 'daily',
    })

    // First, so it is what a "what does Brandon use most?" query vector meets:
    // prose about everyday use, not the head of a list of attributes.
    expect(chunk.content.startsWith('Next.js is one of')).toBe(true)
    expect(chunk.content).toContain('daily drivers')
    expect(chunk.content.indexOf('daily drivers')).toBeLessThan(
      chunk.content.indexOf('Technology: Next.js'),
    )
  })

  it.each<TechProficiency>(['proficient', 'familiar', 'exploring'])(
    'gives a %s row its label and NO lead sentence',
    (proficiency) => {
      const [chunk] = chunkFlatRecord('tech-stack', {
        id: 2,
        name: 'PostgreSQL',
        proficiency,
      })

      expect(chunk.content).toContain(
        `Proficiency: ${TECH_PROFICIENCY_LABELS[proficiency]}`,
      )
      // The lead is the discriminator. Handing it to every row would flatten
      // exactly the ranking #165 exists to expose.
      expect(chunk.content).not.toContain('daily drivers')
      expect(chunk.content.startsWith('Technology: PostgreSQL')).toBe(true)
    },
  )

  it('omits proficiency entirely when the row has none', () => {
    // ~35 rows on prod carry NULL. A bare `Proficiency:` label, or an invented
    // default, would both be claims the data does not make.
    const [chunk] = chunkFlatRecord('tech-stack', { id: 3, name: 'Deno' })

    expect(chunk.content).not.toContain('Proficiency')
    expect(chunk.content).not.toContain('daily drivers')
  })

  it('passes an unknown proficiency through rather than dropping it', () => {
    const [chunk] = chunkFlatRecord('tech-stack', {
      id: 4,
      name: 'Zig',
      proficiency: 'occasional',
    })

    expect(chunk.content).toContain('Proficiency: occasional')
  })

  it('keeps the label map in step with the collection it copies', () => {
    // The map is a copy (chunking.ts must not import Payload field config).
    // This is what stops the copy drifting: add an option to TechStack and
    // this fails until the label lands here too.
    const field = TechStack.fields.find(
      (candidate) => 'name' in candidate && candidate.name === 'proficiency',
    )
    const options = (field as { options: { label: string; value: string }[] })
      .options

    expect(Object.keys(TECH_PROFICIENCY_LABELS).sort()).toEqual(
      options.map((option) => option.value).sort(),
    )
    for (const option of options) {
      expect(techProficiencyLabel(option.value)).toBe(option.label)
    }
    // And the value the ranking rule keys on is a real option.
    expect(
      options.some((option) => option.value === DAILY_DRIVER_PROFICIENCY),
    ).toBe(true)
  })
})

describe('chunkDocument', () => {
  it('routes posts to the body chunker and flat collections to the record chunker', () => {
    const post = chunkDocument('posts', {
      id: 1,
      title: 'T',
      _status: 'published',
      content: lexical(['body text']),
    })
    expect(post[0].collection).toBe('posts')

    const project = chunkDocument('projects', { id: 2, title: 'P' })
    expect(project[0].collection).toBe('projects')
  })
})

describe('isEmbeddable', () => {
  it('embeds only published posts', () => {
    expect(isEmbeddable('posts', { _status: 'published' })).toBe(true)
    expect(isEmbeddable('posts', { _status: 'draft' })).toBe(false)
    expect(isEmbeddable('posts', {})).toBe(false)
  })

  it('always embeds the draft-free flat collections', () => {
    expect(isEmbeddable('projects', {})).toBe(true)
    expect(isEmbeddable('work-history', {})).toBe(true)
  })

  it('embeds a future-dated published post — retrieval date-filters it in SQL', () => {
    // Deliberate: no hook fires when a clock passes a timestamp, so a
    // write-time skip would leave a scheduled post permanently missing after
    // its date arrived. `published_at <= now()` in the query is the fix.
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(
      isEmbeddable('posts', { _status: 'published', publishedAt: future }),
    ).toBe(true)
  })
})

describe('CORVUS_EMBEDDED_COLLECTIONS', () => {
  it('is exactly the five collections decision D8(b) named', () => {
    expect([...CORVUS_EMBEDDED_COLLECTIONS]).toEqual([
      'posts',
      'projects',
      'uses',
      'tech-stack',
      'work-history',
    ])
  })

  it('excludes pages and the taxonomy collections', () => {
    const slugs = CORVUS_EMBEDDED_COLLECTIONS as readonly string[]
    expect(slugs).not.toContain('pages')
    expect(slugs).not.toContain('categories')
    expect(slugs).not.toContain('tags')
  })
})

/**
 * The daily-driver summary chunk (#165).
 *
 * @remarks Everything here is pure, so it is the half of #165 that can be
 * pinned exactly. What it deliberately does NOT prove is that the summary
 * chunk retrieves for a stack-shaped question — that is cosine similarity
 * against real embeddings and needs a provider key, so it is Brandon's keyed
 * run and is written up in `docs/AI.md` §Corvus.
 */
describe('chunkTechStackSummary (#165)', () => {
  /** Fourteen daily drivers, the count the production tier carried on 2026-09-09. */
  const FOURTEEN = [
    'TypeScript',
    'Node.js',
    'React',
    'Next.js',
    'GraphQL',
    'Tailwind CSS',
    'Clerk',
    'Supabase',
    'Vercel',
    'AI SDK',
    'Payload',
    'Vitest',
    'Playwright',
    'Storybook',
  ]

  const rows = (
    names: string[],
    proficiency: string = DAILY_DRIVER_PROFICIENCY,
  ) => names.map((name, index) => ({ id: index + 1, name, proficiency }))

  it('emits exactly ONE chunk, comfortably under the chunker target', () => {
    // The arithmetic behind the whole design: five retrieval slots cannot
    // carry fourteen per-row chunks (~730 estimated tokens against a window
    // of ~255), and one passage can. Compact BY CONSTRUCTION — a single line
    // of names — so no splitting logic applies and none is written.
    const { chunks } = chunkTechStackSummary(rows(FOURTEEN))

    expect(chunks).toHaveLength(1)
    expect(estimateTokens(chunks[0].content)).toBe(82)
    expect(estimateTokens(chunks[0].content)).toBeLessThan(TARGET_CHUNK_TOKENS)
  })

  it('carries the whole daily tier as one line of names', () => {
    const { chunks, daily } = chunkTechStackSummary(rows(FOURTEEN))

    expect(daily).toEqual(FOURTEEN)
    const [firstLine] = chunks[0].content.split('\n')
    for (const name of FOURTEEN) expect(firstLine).toContain(name)
  })

  it('says it is the COMPLETE tier, which is the double-counting mitigation', () => {
    // With the summary and two or three per-row daily chunks in the same
    // window the model sees some names twice. Saying "these are all of them"
    // makes the duplicate read as detail rather than as a second, shorter list.
    const { chunks } = chunkTechStackSummary(rows(FOURTEEN))

    expect(chunks[0].content).toContain('the complete Daily driver tier')
    expect(chunks[0].content).toContain('all 14 of them, not a sample')
  })

  it('names the Proficient tier and NEVER Familiar or Exploring', () => {
    // `TECH_PROFICIENCY_RANKING_RULE` says "never headline a Familiar or
    // Exploring entry as something he uses". A summary carrying those two
    // would hand the model exactly that material, in the passage most likely
    // to be retrieved for a stack question — the one shape here that could
    // make Corvus worse.
    const { chunks } = chunkTechStackSummary([
      ...rows(FOURTEEN),
      ...rows(['Rust'], 'familiar'),
      ...rows(['Elixir'], 'exploring'),
      ...rows(['PostgreSQL'], 'proficient'),
    ])

    expect(chunks[0].content).toContain(TECH_PROFICIENCY_LABELS.proficient)
    expect(chunks[0].content).not.toContain(TECH_PROFICIENCY_LABELS.familiar)
    expect(chunks[0].content).not.toContain(TECH_PROFICIENCY_LABELS.exploring)
    // And no non-daily technology is NAMED, whatever its tier.
    for (const name of ['Rust', 'Elixir', 'PostgreSQL']) {
      expect(chunks[0].content).not.toContain(name)
    }
  })

  it('cites /tech, the same page the per-row chunks cite', () => {
    const { chunks } = chunkTechStackSummary(rows(['Next.js']))

    expect(chunks[0].sourceUrl).toBe('/tech')
    expect(chunks[0].collection).toBe(CORVUS_TECH_STACK_SUMMARY_COLLECTION)
    expect(chunks[0].docId).toBe(TECH_STACK_SUMMARY_DOC_ID)
    expect(chunks[0].chunkIndex).toBe(0)
    expect(chunks[0].visibility).toBe('public')
    expect(chunks[0].contentHash).toBe(hashChunkContent(chunks[0].content))
  })

  it('REPORTS a row with an empty or unknown proficiency instead of guessing', () => {
    // The wave-7 learning-10 trap: production data can be missing the field a
    // shipped feature depends on with no error anywhere. A technology Brandon
    // believes is daily whose stored value is `''` drops out of the line of
    // names, and without this report the short answer reads as a retrieval
    // problem rather than a data one.
    const { chunks, daily, skipped } = chunkTechStackSummary([
      { id: 1, name: 'Next.js', proficiency: 'daily' },
      { id: 2, name: 'React', proficiency: '' },
      { id: 3, name: 'Deno', proficiency: 'occasionally' },
      { id: 4, name: '', proficiency: 'daily' },
      { id: 5, proficiency: 'daily' },
      // A PROTOTYPE key. `proficiency in TECH_PROFICIENCY_LABELS` walks the
      // chain, so this row tested true against the label map and sailed past
      // the guard — neither named in the tier nor reported, which is the exact
      // silent swallow the `skipped` channel exists to prevent.
      // `Object.hasOwn` is the whole fix, and this row is what pins it.
      { id: 6, name: 'Bun', proficiency: 'toString' },
      { id: 7, name: 'Effect', proficiency: 'constructor' },
    ])

    expect(daily).toEqual(['Next.js'])
    expect(chunks[0].content).not.toContain('React')
    expect(chunks[0].content).not.toContain('Bun')
    expect(skipped).toEqual([
      { name: 'React', proficiency: '' },
      { name: 'Deno', proficiency: 'occasionally' },
      { name: '', proficiency: 'daily' },
      { name: '', proficiency: 'daily' },
      { name: 'Bun', proficiency: 'toString' },
      { name: 'Effect', proficiency: 'constructor' },
    ])
  })

  it('emits NO chunk when the daily tier is empty, so the row can be deleted', () => {
    // An empty tier is a data state the index must reflect, not a sentence to
    // embed. `syncTechStackSummaryEmbeddings` turns `[]` into a DELETE.
    expect(chunkTechStackSummary([]).chunks).toEqual([])
    expect(
      chunkTechStackSummary(rows(['PostgreSQL'], 'proficient')).chunks,
    ).toEqual([])
  })

  it('is stable: the same rows compose the same hash', () => {
    expect(chunkTechStackSummary(rows(FOURTEEN)).chunks[0].contentHash).toBe(
      chunkTechStackSummary(rows(FOURTEEN)).chunks[0].contentHash,
    )
  })

  /**
   * #167 routing proof, test 4 — "alongside", implemented rather than intended.
   *
   * @remarks The revised ACs require BOTH "names the daily-driver tier" and "a
   * narrow single-technology question still answers from that row". The
   * per-row chunk is the only passage carrying a technology's `Category`,
   * `URL` and `Notes`, and four retrieval preconditions in
   * `evals/scorers.test.ts` assert that a narrow proficiency question lands on
   * it. Deleting those would be a regression, not a trade-off — so composing
   * the summary must not move a single byte of them.
   */
  it('does not change any per-row chunk when the summary is composed', () => {
    const docs = [
      { id: 1, name: 'Next.js', category: 'framework', proficiency: 'daily' },
      {
        id: 2,
        name: 'PostgreSQL',
        category: 'data',
        proficiency: 'proficient',
        url: 'https://www.postgresql.org/',
        notes: 'Primary datastore.',
      },
    ]
    const before = docs.map((doc) => chunkFlatRecord('tech-stack', doc)[0])

    chunkTechStackSummary(docs)

    const after = docs.map((doc) => chunkFlatRecord('tech-stack', doc)[0])
    for (const [index, chunk] of after.entries()) {
      expect(chunk.content).toBe(before[index].content)
      expect(chunk.contentHash).toBe(before[index].contentHash)
      expect(chunk.collection).toBe('tech-stack')
    }
  })
})

describe('the summary pseudo-collection (#165)', () => {
  it('cites /tech from sourceUrlFor', () => {
    expect(sourceUrlFor(CORVUS_TECH_STACK_SUMMARY_COLLECTION)).toBe('/tech')
  })

  it('is NOT in the hook registry', () => {
    // `CORVUS_EMBEDDED_COLLECTIONS` is documented as the single source of
    // truth for which collections carry a refresh HOOK, and there is no
    // Payload document here to hang one on — the same reason `github-repos`
    // stays out of it. The `tech-stack` hook re-emits the summary; the
    // backfill repairs it.
    expect(CORVUS_EMBEDDED_COLLECTIONS).not.toContain(
      CORVUS_TECH_STACK_SUMMARY_COLLECTION,
    )
  })
})
