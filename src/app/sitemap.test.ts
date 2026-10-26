import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // One shared log, so a test can pin the order `connection()` and the two
  // data reads run in.
  const calls: string[] = []
  return {
    calls,
    connection: vi.fn(async () => {
      calls.push('connection')
    }),
    getAllArticles: vi.fn(async (): Promise<unknown[]> => []),
    getPublishedPagePaths: vi.fn(async () => ['now']),
    getSiteUrl: vi.fn(),
  }
})

vi.mock('@/lib/articles', () => ({
  getAllArticles: mocks.getAllArticles,
}))

vi.mock('@/lib/cms/pagesRepo', () => ({
  getPublishedPagePaths: mocks.getPublishedPagePaths,
}))

vi.mock('@/lib/site', () => ({
  getSiteUrl: mocks.getSiteUrl,
}))

// #209 fallback (b): the route awaits `connection()` so it runs per request.
// Stubbed so the route runs under jsdom; the call is recorded for the
// ordering test.
vi.mock('next/server', () => ({
  connection: mocks.connection,
}))

afterEach(() => {
  vi.useRealTimers()
})

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
 * Freshness without a redeploy (#209, fallback (b)).
 * `[measured, staging 2026-09-27 and prod 2026-09-28, #209 comments]` the
 * route's cached response was the stale layer: after a publish, the edge kept
 * serving a `HIT` with no function invocation, so the `'use cache: remote'`
 * assembly beneath it was never reached. The fix makes the route
 * request-time: it awaits `connection()` before any read and keeps no cache
 * scope of its own. The inner `:remote` reads (`getPublishedPagePaths`,
 * `getPublishedPostSummaries`) stay cached and tag-purged by the hooks.
 *
 * The route-mode tests are the fix-sensitive ones. The emission tests cover
 * both cases the ticket names (a parent page with its children, a newly
 * published article) and the per-request publish gate. The data reads are
 * mocked, so the emission tests say nothing about the platform's edge cache.
 * That is #209's production check.
 */
describe('sitemap route mode and emission (#209)', () => {
  it('awaits connection() before either data read', async () => {
    mocks.calls.length = 0
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockImplementation(async () => {
      mocks.calls.push('getAllArticles')
      return []
    })
    mocks.getPublishedPagePaths.mockImplementation(async () => {
      mocks.calls.push('getPublishedPagePaths')
      return []
    })

    await sitemap()

    expect(mocks.calls[0]).toBe('connection')
    expect([...mocks.calls].sort()).toEqual([
      'connection',
      'getAllArticles',
      'getPublishedPagePaths',
    ])
  })

  it('starts no data read until the request arrives (prerender stops at connection())', async () => {
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getAllArticles.mockClear()
    mocks.getPublishedPagePaths.mockClear()
    // During a prerender `connection()` never resolves. Model that, and the
    // route must not have read anything.
    let arrive: () => void = () => {}
    mocks.connection.mockImplementationOnce(
      () => new Promise<void>((resolve) => (arrive = resolve)),
    )

    const pending = sitemap()
    await Promise.resolve()
    expect(mocks.getAllArticles).not.toHaveBeenCalled()
    expect(mocks.getPublishedPagePaths).not.toHaveBeenCalled()

    arrive()
    await pending
    expect(mocks.getAllArticles).toHaveBeenCalledTimes(1)
    expect(mocks.getPublishedPagePaths).toHaveBeenCalledTimes(1)
  })

  it('keeps no cache scope of its own (the inner reads hold the only cache)', () => {
    const source = readFileSync(join(__dirname, 'sitemap.ts'), 'utf8')
    // Code lines only (comment lines dropped), so the docblock's prose about
    // the removed scope never counts.
    const code = source
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => !line.startsWith('*') && !line.startsWith('//'))

    expect(
      code.filter((line) => /^'use cache(?:: ?\w+)?'$/.test(line)),
    ).toEqual([])
    expect(code.some((line) => /\bcache(Tag|Life)\(/.test(line))).toBe(false)
    expect(code).toContain('await connection()')
  })

  it('emits a newly published article alongside the existing ones (article case)', async () => {
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

  it('emits a published parent page alongside its children (parent/child page case)', async () => {
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

  it('excludes a future-dated article before its date and includes it at and after it', async () => {
    const publishAt = '2026-07-01T12:00:00.000Z'
    const url = 'https://example.com/articles/scheduled'
    mocks.getSiteUrl.mockReturnValue('https://example.com')
    mocks.getPublishedPagePaths.mockResolvedValue([])
    // The same cached summaries on every request: only the clock moves, so
    // the article joins without a purge.
    mocks.getAllArticles.mockResolvedValue([
      { slug: 'scheduled', date: publishAt, noindex: false },
    ])
    vi.useFakeTimers()

    vi.setSystemTime(new Date(new Date(publishAt).getTime() - 1))
    expect((await sitemap()).map((entry) => entry.url)).not.toContain(url)

    vi.setSystemTime(new Date(publishAt))
    expect((await sitemap()).map((entry) => entry.url)).toContain(url)

    vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'))
    expect((await sitemap()).map((entry) => entry.url)).toContain(url)
  })
})
