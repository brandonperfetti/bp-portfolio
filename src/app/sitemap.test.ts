import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  getAllArticles: vi.fn(),
  getPublishedPagePaths: vi.fn(async () => ['now']),
  getSiteUrl: vi.fn(),
}))

vi.mock('@/lib/articles', () => ({
  getAllArticles: mocks.getAllArticles,
}))

vi.mock('@/lib/cms/pagesRepo', () => ({
  getPublishedPagePaths: mocks.getPublishedPagePaths,
}))

vi.mock('@/lib/site', () => ({
  getSiteUrl: mocks.getSiteUrl,
}))

// #76 B3: sitemap prepares its data inside a `'use cache'` scope; stub the
// primitives so the route runs under jsdom.
vi.mock('next/cache', () => ({
  cacheTag: mocks.cacheTag,
  cacheLife: mocks.cacheLife,
}))

import sitemap from './sitemap'

describe('sitemap', () => {
  it('excludes noindex and future-dated articles from sitemap routes', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'public-article',
        date: '2025-01-10',
        updatedAt: '2025-02-01T00:00:00.000Z',
        noindex: false,
      },
      {
        slug: 'noindex-article',
        date: '2025-01-11',
        noindex: true,
      },
      {
        slug: 'scheduled-article',
        date: '2999-01-01',
        noindex: false,
      },
    ])

    const entries = await sitemap()
    const urls = entries.map((entry) => String(entry.url))

    expect(urls).toContain('https://example.com/articles/public-article')
    expect(urls).not.toContain('https://example.com/articles/noindex-article')
    expect(urls).not.toContain('https://example.com/articles/scheduled-article')
    // #28 — the /speaking route was removed; it must not appear in the sitemap.
    expect(urls).not.toContain('https://example.com/speaking')
  })

  it('sets /articles lastModified from the newest public article freshness', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'older',
        date: '2025-01-01',
        updatedAt: '2025-01-02T00:00:00.000Z',
        noindex: false,
      },
      {
        slug: 'newer',
        date: '2025-01-05',
        updatedAt: '2025-01-06T00:00:00.000Z',
        noindex: false,
      },
    ])

    const entries = await sitemap()
    const articlesIndex = entries.find(
      (entry) => String(entry.url) === 'https://example.com/articles',
    )

    expect(articlesIndex).toBeDefined()
    expect(articlesIndex?.lastModified).toEqual(
      new Date('2025-01-06T00:00:00.000Z'),
    )

    const home = entries.find(
      (entry) => String(entry.url) === 'https://example.com',
    )
    expect(home?.lastModified).toBeUndefined()
  })

  it('sets /articles lastModified to undefined when no public articles exist', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])

    const entries = await sitemap()
    const articlesIndex = entries.find(
      (entry) => String(entry.url) === 'https://example.com/articles',
    )

    expect(articlesIndex).toBeDefined()
    expect(articlesIndex?.lastModified).toBeUndefined()
  })

  it('uses article.date when article.updatedAt is missing', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'date-only-article',
        date: '2025-03-01',
        noindex: false,
      },
    ])

    const entries = await sitemap()
    const articleEntry = entries.find(
      (entry) =>
        String(entry.url) === 'https://example.com/articles/date-only-article',
    )

    expect(articleEntry).toBeDefined()
    expect(articleEntry?.lastModified).toEqual(new Date(2025, 2, 1, 0, 0, 0, 0))
  })
})

/**
 * Page-builder URLs under hierarchy (#148): the sitemap must list a placed
 * page's real nested URL, not `/` + its slug — which would be a 404 in the
 * sitemap, the worst possible place for one.
 */
describe('sitemap page-builder URLs (#148)', () => {
  it('lists nested pages at their full path', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])
    mocks.getPublishedPagePaths.mockResolvedValue([
      'now',
      'work/brytecore',
      'tech/ai',
    ])

    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain('https://example.com/now')
    expect(urls).toContain('https://example.com/work/brytecore')
    expect(urls).toContain('https://example.com/tech/ai')
  })

  it('never emits /home as a second, redirecting URL for the root', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])
    // `getPublishedPagePaths` already filters the root out; this pins that the
    // sitemap does not reintroduce it by building URLs some other way.
    mocks.getPublishedPagePaths.mockResolvedValue(['now'])

    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).not.toContain('https://example.com/home')
    expect(urls).toContain('https://example.com')
  })
})

/**
 * Placed articles (#153): the sitemap lists an article's placed path, exactly
 * once. Listing both `/articles/<slug>` and the placed path would be the
 * duplicate-content failure the ticket exists to prevent, and listing only the
 * archive path would advertise a URL that 308s.
 */
describe('sitemap · placed articles (#153)', () => {
  it('lists a placed article at its section URL and never at /articles', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getPublishedPagePaths.mockResolvedValue([])
    mocks.getAllArticles.mockResolvedValue([
      {
        slug: 'brytecore',
        path: 'work/brytecore',
        date: '2025-01-10',
        noindex: false,
      },
      { slug: 'plain', date: '2025-01-10', noindex: false },
    ])

    const urls = (await sitemap()).map((entry) => entry.url)

    expect(urls).toContain('https://example.com/work/brytecore')
    expect(urls).toContain('https://example.com/articles/plain')
    expect(urls).not.toContain('https://example.com/articles/brytecore')
    expect(urls.filter((u) => u.includes('brytecore'))).toHaveLength(1)
  })
})

/**
 * Freshness without a redeploy (#209). `[measured, prod, 2026-09-26]`
 * production kept a page and two articles out of the sitemap for over an hour
 * after they were published, while a redeploy with no code change put them in.
 * `[inference]` the cached assembly was on the per-instance tier, so a hook's
 * purge never reached the copy that was served — the diagnosis the shared tier
 * below acts on, verified only by #209's production check.
 *
 * The fix is a property of the cache scope, not of the emit, so it is pinned
 * as one: the assembly lives on the shared `'use cache: remote'` tier and
 * carries BOTH collections' tags. A test over the emit alone would pass against
 * the broken tier, exactly as #209 predicted of the query-level test. The two
 * emission tests below cover both halves the ticket names — the article case
 * and the parent/child page case — but only as emission: `cacheTag` and
 * `cacheLife` are mocked, so they pass on either tier and say nothing about
 * freshness. The tier scan and the tag test are the fix-sensitive ones.
 */
describe('sitemap freshness (#209)', () => {
  it('caches the assembly on the shared remote tier — one scope, never plain `use cache`', () => {
    const source = readFileSync(join(__dirname, 'sitemap.ts'), 'utf8')
    // Directive lines only (a line holding nothing but the directive), so the
    // docblock's prose about the old tier never counts.
    const directives = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^'use cache(?:: ?\w+)?'$/.test(line))

    expect(directives).toEqual(["'use cache: remote'"])
  })

  it('tags the cached assembly with both posts and pages, so either hook purges it', async () => {
    mocks.cacheTag.mockClear()
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])
    mocks.getPublishedPagePaths.mockResolvedValue([])

    await sitemap()

    // The literals, not CMS_TAGS: these are the strings `revalidatePost` and
    // `revalidatePage` purge, and the coupling is what this pins.
    const tags = mocks.cacheTag.mock.calls.flat()
    expect(tags).toContain('posts')
    expect(tags).toContain('pages')
  })

  it('emits a newly listed article alongside the existing ones (article case)', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getPublishedPagePaths.mockResolvedValue([])
    mocks.getAllArticles.mockResolvedValue([
      { slug: 'older', date: '2025-01-10', noindex: false },
    ])
    const before = (await sitemap()).map((entry) => entry.url)
    expect(before).not.toContain('https://example.com/articles/just-published')

    mocks.getAllArticles.mockResolvedValue([
      { slug: 'older', date: '2025-01-10', noindex: false },
      { slug: 'just-published', date: '2025-01-11', noindex: false },
    ])
    const after = (await sitemap()).map((entry) => entry.url)

    expect(after).toContain('https://example.com/articles/just-published')
    expect(after).toContain('https://example.com/articles/older')
  })

  it('emits a parent page alongside its children once it is listed (parent/child page case)', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockResolvedValue([])
    // The production shape #209 was filed on: four children listed, the
    // section landing page missing.
    const children = [
      'work/brytecore',
      'work/freelance',
      'work/lone-wolf-technologies',
      'work/wr-studios',
    ]
    mocks.getPublishedPagePaths.mockResolvedValue(children)
    const before = (await sitemap()).map((entry) => entry.url)
    expect(before).not.toContain('https://example.com/work')

    mocks.getPublishedPagePaths.mockResolvedValue(['work', ...children])
    const after = (await sitemap()).map((entry) => entry.url)

    expect(after).toContain('https://example.com/work')
    for (const child of children) {
      expect(after).toContain(`https://example.com/${child}`)
    }
  })
})
