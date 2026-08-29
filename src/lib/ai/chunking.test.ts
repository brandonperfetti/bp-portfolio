import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  CHUNK_OVERLAP_TOKENS,
  CORVUS_EMBEDDED_COLLECTIONS,
  MAX_CHUNK_TOKENS,
  chunkDocument,
  chunkFlatRecord,
  chunkPost,
  estimateTokens,
  hashChunkContent,
  isEmbeddable,
  sourceUrlFor,
  takeTailTokens,
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

  it('returns null for a post with no slug rather than a broken link', () => {
    expect(sourceUrlFor('posts', null)).toBeNull()
    expect(sourceUrlFor('posts')).toBeNull()
  })

  it('maps each flat collection to the index page that renders it', () => {
    expect(sourceUrlFor('projects')).toBe('/projects')
    expect(sourceUrlFor('uses')).toBe('/uses')
    expect(sourceUrlFor('tech-stack')).toBe('/tech')
    expect(sourceUrlFor('work-history')).toBe('/')
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
