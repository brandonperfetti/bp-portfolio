import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAllCmsArticleSummaries,
  getCmsArticleBySlug,
  getCmsSearchArticles,
  resolveArticleShareTargetIds,
} from '@/lib/cms/articlesRepo'
import { SHARE_TARGET_IDS } from '@/lib/share/vocabulary'
import type { Post } from '@/payload-types'

// The repo's data access goes through lib/content/posts (Payload Local API +
// unstable_cache + draftMode) — mocked here so the mapping, publish-safety,
// and gating logic run against fixtures. canAccess / lexicalToBlocks /
// flattenBlockText are real: the tests cover the actual pipeline.
//
// Two published-list reads exist since #76 Phase 0: getPublishedPostSummaries
// (select-narrowed, no body) feeds the list surfaces; getPublishedPosts (full
// body) feeds the search index. They are mocked separately.
const getPublishedPosts = vi.fn()
const getPublishedPostSummaries = vi.fn()
const getPostBySlug = vi.fn()
const getGatedPostContent = vi.fn()
vi.mock('@/lib/content/posts', () => ({
  getPublishedPosts: (...args: unknown[]) => getPublishedPosts(...args),
  getPublishedPostSummaries: (...args: unknown[]) =>
    getPublishedPostSummaries(...args),
  getPostBySlug: (...args: unknown[]) => getPostBySlug(...args),
  getGatedPostContent: (...args: unknown[]) => getGatedPostContent(...args),
}))
// #76 B3: getCmsArticleBySlug resolves `isScheduledFuture` inside a `'use cache'`
// scope; stub the primitives so the mapping runs under jsdom.
vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const lexical = (text: string) => ({
  root: {
    type: 'root',
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [{ type: 'text', text, version: 1 }],
      },
    ],
  },
})

const makePost = (overrides: Partial<Post> = {}): Post =>
  ({
    id: 1,
    title: 'Testing React without tears',
    slug: 'testing-react-without-tears',
    content: lexical('Full article body text.'),
    excerpt: 'A testing strategy that sticks.',
    _status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    publishedAt: '2026-01-05T00:00:00.000Z',
    ...overrides,
  }) as Post

beforeEach(() => {
  getPublishedPosts.mockReset()
  getPublishedPostSummaries.mockReset()
  getPostBySlug.mockReset()
})

describe('getAllCmsArticleSummaries', () => {
  it('maps posts to the v3 summary shape with the slug preserved verbatim', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({
        categories: [{ id: 1, title: 'Engineering' } as never],
        tags: [{ id: 2, title: 'React' } as never, 3 as never],
        heroImage: {
          id: 4,
          url: 'https://examplestore.public.blob.vercel-storage.com/hero.jpg',
        } as never,
        populatedAuthors: [{ id: '1', name: 'Brandon Perfetti' }],
        meta: { title: 'SEO title', description: 'SEO description' },
      }),
    ])

    const [summary] = await getAllCmsArticleSummaries()

    // URL contract: the stored slug IS the public /articles/[slug] segment.
    expect(summary.slug).toBe('testing-react-without-tears')
    expect(summary.title).toBe('Testing React without tears')
    expect(summary.description).toBe('A testing strategy that sticks.')
    expect(summary.seoTitle).toBe('SEO title')
    expect(summary.date).toBe('2026-01-05T00:00:00.000Z')
    expect(summary.image).toBe(
      'https://examplestore.public.blob.vercel-storage.com/hero.jpg',
    )
    expect(summary.author).toBe('Brandon Perfetti')
    expect(summary.category).toEqual({ title: 'Engineering' })
    expect(summary.topics).toEqual(['Engineering'])
    // Depth-0 relationship IDs (bare numbers) are filtered, not stringified.
    expect(summary.tech).toEqual(['React'])
    expect(summary.keywords).toEqual(['Engineering', 'React'])
    expect(summary.sourceType).toBe('local')
  })

  it('falls back to createdAt and meta description when publish fields are empty', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({
        publishedAt: null,
        excerpt: null,
        meta: { description: 'Meta only' },
      }),
    ])

    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.date).toBe('2026-01-01T00:00:00.000Z')
    expect(summary.description).toBe('Meta only')
  })

  it('drops posts without a slug instead of emitting broken URLs', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost(),
      makePost({ id: 2, slug: null }),
    ])

    const summaries = await getAllCmsArticleSummaries()
    expect(summaries).toHaveLength(1)
  })

  it('reads the summary projection, not the full-body posts (#76 Phase 0)', async () => {
    // The list surfaces must read the select-narrowed summary query so the
    // `posts` cache entry never serializes the Lexical body. Guards against a
    // regression that re-points the list read at the full-body fetch.
    getPublishedPostSummaries.mockResolvedValue([makePost()])

    await getAllCmsArticleSummaries()

    expect(getPublishedPostSummaries).toHaveBeenCalledTimes(1)
    expect(getPublishedPosts).not.toHaveBeenCalled()
  })
})

describe('getCmsArticleBySlug', () => {
  it('returns null for unknown slugs', async () => {
    getPostBySlug.mockResolvedValue(null)
    await expect(getCmsArticleBySlug('nope')).resolves.toBeNull()
  })

  it('serves public posts to anonymous viewers with a converted body', async () => {
    getPostBySlug.mockResolvedValue(makePost())

    const article = await getCmsArticleBySlug('testing-react-without-tears', {
      isAuthenticated: false,
    })

    expect(article?.gated).toBe(false)
    expect(article?.bodyBlocks.length).toBeGreaterThan(0)
    expect(article?.bodyBlocks[0]?.richText?.[0]?.plainText).toBe(
      'Full article body text.',
    )
    // flattenBlockText normalizes to lowercase for the search index.
    expect(article?.searchText).toContain('full article body text.')
  })

  it('withholds the body of gated posts from anonymous viewers (§12)', async () => {
    getPostBySlug.mockResolvedValue(
      makePost({ access: { visibility: 'gated' } }),
    )

    const article = await getCmsArticleBySlug('testing-react-without-tears', {
      isAuthenticated: false,
    })

    // The full body must never enter the anonymous RSC payload.
    expect(article?.gated).toBe(true)
    expect(article?.bodyBlocks).toEqual([])
    expect(article?.searchText).toBe('')
    // Teaser metadata still renders the card/prompt.
    expect(article?.title).toBe('Testing React without tears')
    expect(article?.excerpt).toBe('A testing strategy that sticks.')
  })

  it('serves gated posts to authenticated viewers', async () => {
    getPostBySlug.mockResolvedValue(
      makePost({ access: { visibility: 'gated' } }),
    )

    const article = await getCmsArticleBySlug('testing-react-without-tears', {
      isAuthenticated: true,
    })

    expect(article?.gated).toBe(false)
    expect(article?.bodyBlocks.length).toBeGreaterThan(0)
  })

  it('maps the per-article share fields onto the detail', async () => {
    getPostBySlug.mockResolvedValue(
      makePost({
        disableSharing: true,
        shareTargetsAdd: ['reddit'],
        shareTargetsRemove: ['x'],
      }),
    )

    const article = await getCmsArticleBySlug('testing-react-without-tears')

    expect(article?.disableSharing).toBe(true)
    expect(article?.shareTargetsAdd).toEqual(['reddit'])
    expect(article?.shareTargetsRemove).toEqual(['x'])
  })

  it('defaults the share fields (off / empty) when the post omits them', async () => {
    getPostBySlug.mockResolvedValue(makePost())

    const article = await getCmsArticleBySlug('testing-react-without-tears')

    expect(article?.disableSharing).toBe(false)
    expect(article?.shareTargetsAdd).toEqual([])
    expect(article?.shareTargetsRemove).toEqual([])
  })
})

describe('resolveArticleShareTargetIds', () => {
  it('returns the global set unchanged when no per-article picks apply', () => {
    expect(resolveArticleShareTargetIds({}, [...SHARE_TARGET_IDS])).toEqual([
      ...SHARE_TARGET_IDS,
    ])
  })

  it('hides every target when the article disables sharing', () => {
    expect(
      resolveArticleShareTargetIds(
        {
          disableSharing: true,
          shareTargetsAdd: ['reddit'],
        },
        [...SHARE_TARGET_IDS],
      ),
    ).toEqual([])
  })

  it('honors add/remove and imposes canonical order', () => {
    // Global has just linkedin; add x + reddit, remove linkedin. The result is
    // ordered by the pinned vocabulary (x before reddit), not by input order.
    expect(
      resolveArticleShareTargetIds(
        {
          shareTargetsAdd: ['reddit', 'x'],
          shareTargetsRemove: ['linkedin'],
        },
        ['linkedin'],
      ),
    ).toEqual(['x', 'reddit'])
  })

  it('drops unknown ids from the resolved set', () => {
    expect(
      resolveArticleShareTargetIds({ shareTargetsAdd: ['not-a-target'] }, [
        'x',
      ]),
    ).toEqual(['x'])
  })
})

describe('byline resolution (buildAuthor)', () => {
  it('builds a rich author from the populated authors relation', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({
        authors: [
          {
            id: 7,
            name: 'Ada Lovelace',
            role: 'Guest Author',
            avatar: {
              id: 9,
              url: 'https://examplestore.public.blob.vercel-storage.com/ada.jpg',
            },
            // Blank/whitespace social URLs are dropped, not rendered.
            socials: [
              { url: 'https://github.com/ada' },
              { url: '  ' },
              { url: 'https://x.com/ada' },
            ],
          } as never,
        ],
      }),
    ])

    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.author).toEqual({
      name: 'Ada Lovelace',
      role: 'Guest Author',
      image: 'https://examplestore.public.blob.vercel-storage.com/ada.jpg',
      href: undefined,
      sameAs: ['https://github.com/ada', 'https://x.com/ada'],
    })
  })

  it('routes the site-owner byline to /about', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({ authors: [{ id: 1, name: 'Brandon Perfetti' } as never] }),
    ])

    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.author).toMatchObject({
      name: 'Brandon Perfetti',
      href: '/about',
    })
  })

  it('omits sameAs when the author has no socials', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({ authors: [{ id: 2, name: 'No Links' } as never] }),
    ])

    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.author).toEqual({
      name: 'No Links',
      role: undefined,
      image: undefined,
      href: undefined,
      sameAs: undefined,
    })
  })

  it('keeps the site-owner string when no author relation is populated', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({ authors: undefined, populatedAuthors: undefined }),
    ])

    const [summary] = await getAllCmsArticleSummaries()
    // Byte-identical to the pre-#25 fallback — migrated posts are unaffected.
    expect(summary.author).toBe('Brandon Perfetti')
  })

  it('uses the populatedAuthors {id,name} mirror when the relation is unpopulated', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({
        authors: undefined,
        populatedAuthors: [{ id: '3', name: 'Mirror Only' }],
      }),
    ])

    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.author).toBe('Mirror Only')
  })
})

describe('getCmsSearchArticles', () => {
  it('enriches summaries with flattened body text for the search index', async () => {
    getPublishedPosts.mockResolvedValue([makePost()])

    const [article] = await getCmsSearchArticles()
    expect(article.searchText).toContain('full article body text.')
    expect(article.slug).toBe('testing-react-without-tears')
  })

  it('never indexes gated bodies — gated posts contribute excerpt only (B1 regression)', async () => {
    // The index is served to anonymous clients via /api/search; a gated
    // post's flattened body leaking here defeats the §12 gating model.
    getPublishedPosts.mockResolvedValue([
      makePost({
        access: { visibility: 'gated' },
        excerpt: 'A public teaser.',
      }),
    ])

    const [article] = await getCmsSearchArticles()
    expect(article.searchText).toBe('A public teaser.')
    expect(article.searchText).not.toContain('full article body text.')
  })

  it('reads the full-body posts, not the summary projection (#76 Phase 0)', async () => {
    // searchText needs the flattened Lexical body, so the search index keeps
    // its own un-narrowed fetch. Guards the split from collapsing back.
    getPublishedPosts.mockResolvedValue([makePost()])

    await getCmsSearchArticles()

    expect(getPublishedPosts).toHaveBeenCalledTimes(1)
    expect(getPublishedPostSummaries).not.toHaveBeenCalled()
  })
})

describe('list payload size guard (#76 Phase 0)', () => {
  // The list surfaces (/, /articles) serialize the summary payload into the RSC
  // stream and the `posts` cache entry. Before Phase 0, getPublishedPosts
  // cached the full Post[] incl. Lexical `content` — measured 2,352,427 bytes,
  // over Next's 2 MB data-cache per-item ceiling (issue #76 comment). The
  // summary shape must stay well under 1 MB even at the 1000-post query ceiling,
  // and must never carry the body. Fixtures carry a large `content` on purpose:
  // proving the mapper (toSummary) drops it even when handed a full doc.
  const BODY_SENTINEL = 'BODY_SENTINEL_SHOULD_NEVER_APPEAR_IN_LIST_PAYLOAD'
  const bigBody = lexical(`${BODY_SENTINEL} ${'lorem ipsum '.repeat(600)}`)

  const makeRealisticPost = (i: number): Post =>
    makePost({
      id: i,
      slug: `article-number-${i}-a-fairly-long-descriptive-slug`,
      title: `Article ${i}: A Reasonably Long Human-Readable Title Here`,
      excerpt:
        'A representative excerpt about the length these cards actually ' +
        'render on the articles index, give or take a clause or two.',
      content: bigBody as never,
      publishedAt: '2026-01-05T00:00:00.000Z',
      categories: [{ id: 1, title: 'Engineering' } as never],
      tags: [
        { id: 2, title: 'React' } as never,
        { id: 3, title: 'TypeScript' } as never,
      ],
      heroImage: {
        id: 4,
        url: 'https://examplestore.public.blob.vercel-storage.com/covers/hero.jpg',
      } as never,
      populatedAuthors: [{ id: '1', name: 'Brandon Perfetti' }],
      meta: {
        title: `Article ${i} — SEO title variant`,
        description: 'An SEO description roughly the length used in practice.',
      },
    })

  it('keeps the serialized list payload under 1 MB at the 1000-post ceiling', async () => {
    const posts = Array.from({ length: 1000 }, (_, i) => makeRealisticPost(i))
    getPublishedPostSummaries.mockResolvedValue(posts)

    const summaries = await getAllCmsArticleSummaries()
    const bytes = Buffer.byteLength(JSON.stringify(summaries), 'utf8')

    // Emitted so `pnpm test` reports the measured worst-case size.
    console.log(`[#76 Phase 0] list payload, 1000 posts: ${bytes} bytes`)

    expect(summaries).toHaveLength(1000)
    expect(bytes).toBeLessThan(1_000_000)
  })

  it('never serializes the Lexical body into the list payload', async () => {
    getPublishedPostSummaries.mockResolvedValue([makeRealisticPost(1)])

    const summaries = await getAllCmsArticleSummaries()

    expect(JSON.stringify(summaries)).not.toContain(BODY_SENTINEL)
  })
})

describe('getCmsArticleBySlug isScheduledFuture (#76 B3)', () => {
  // `isScheduledFuture` is resolved inside a `'use cache'` scope from Date.now();
  // freeze the clock so the gate is deterministic (mirrors how the cache freezes
  // it at generation time).
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flags a future-dated publish as scheduled', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    getPostBySlug.mockResolvedValue(
      makePost({ publishedAt: '2026-12-01T00:00:00.000Z' }),
    )

    const article = await getCmsArticleBySlug('testing-react-without-tears')

    expect(article?.isScheduledFuture).toBe(true)
  })

  it('does not flag a past-dated publish', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'))
    getPostBySlug.mockResolvedValue(
      makePost({ publishedAt: '2025-01-01T00:00:00.000Z' }),
    )

    const article = await getCmsArticleBySlug('testing-react-without-tears')

    expect(article?.isScheduledFuture).toBe(false)
  })
})

/**
 * Placement on the summary shape (#153). Every article-URL surface on the site
 * receives a summary and resolves its href through `publicPathFor`, so `path`
 * has to survive the mapper or all of them silently link at `/articles/<slug>`.
 */
describe('placement on the article summary (#153)', () => {
  it('carries a placed article’s path onto the summary', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({ slug: 'brytecore', path: 'work/brytecore' }),
    ])
    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.path).toBe('work/brytecore')
  })

  it('leaves an unplaced article’s path undefined, never an empty string', async () => {
    getPublishedPostSummaries.mockResolvedValue([
      makePost({ slug: 'plain', path: null }),
    ])
    const [summary] = await getAllCmsArticleSummaries()
    expect(summary.path).toBeUndefined()
  })
})
