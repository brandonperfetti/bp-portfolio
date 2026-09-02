import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CORVUS_GITHUB_USER_AGENT,
  DEFAULT_GITHUB_OWNER,
  fetchPublicRepoListing,
  fetchRepoLanguages,
  fetchRepoReadme,
  hydrateRepo,
  repoDenylist,
  resolveRepoSyncConfig,
  shouldIndexRepo,
} from '@/lib/ai/githubReposFetch'

/**
 * The one module in #147 that talks to api.github.com.
 *
 * @remarks Driven entirely through a stubbed `fetch` against RECORDED response
 * shapes, and that is not only a test-speed choice: the lane this was built in
 * has no egress to api.github.com (the proxy denies it), so the live call is
 * **unmeasured**. What these assertions can and do prove is everything that
 * does not require the real service — which endpoint is asked for, that a 404
 * on a README is an ordinary answer while a 403 is not, that a private or
 * forked entry never becomes a document — and those are the properties a
 * regression would actually break.
 *
 * The fixture bodies below are hand-written to the documented shape of the
 * GitHub REST responses, field for field, not captured from a live call. Said
 * plainly here so nobody reads them as a capture record.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const listEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 42,
  name: 'bp-portfolio',
  full_name: 'brandonperfetti/bp-portfolio',
  private: false,
  fork: false,
  archived: false,
  description: 'Source code for my personal site.',
  homepage: 'https://brandonperfetti.com',
  topics: ['nextjs', 'payload'],
  language: 'TypeScript',
  languages_url:
    'https://api.github.com/repos/brandonperfetti/bp-portfolio/languages',
  pushed_at: '2026-08-30T12:00:00Z',
  created_at: '2025-01-04T09:00:00Z',
  ...overrides,
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('resolveRepoSyncConfig', () => {
  it('defaults to the portfolio owner and requires a token', () => {
    vi.stubEnv('GITHUB_TOKEN', 'tok')
    vi.stubEnv('CORVUS_GITHUB_OWNER', '')
    vi.stubEnv('GITHUB_OWNER', '')
    expect(resolveRepoSyncConfig()).toEqual({
      ok: true,
      owner: DEFAULT_GITHUB_OWNER,
      token: 'tok',
    })
  })

  it('refuses with the env name when no token is set', () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    const result = resolveRepoSyncConfig()
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain('GITHUB_TOKEN')
  })

  it('prefers CORVUS_GITHUB_OWNER over the tech-scan’s GITHUB_OWNER', () => {
    // Two jobs, two token lifecycles: pointing the sync elsewhere must not
    // move the tech-signal scan with it.
    vi.stubEnv('GITHUB_TOKEN', 'tok')
    vi.stubEnv('GITHUB_OWNER', 'someone-else')
    vi.stubEnv('CORVUS_GITHUB_OWNER', 'brandonperfetti')
    expect(resolveRepoSyncConfig()).toMatchObject({ owner: 'brandonperfetti' })
  })
})

describe('fetchPublicRepoListing', () => {
  it('asks /users/{owner}/repos — the endpoint that cannot return a private repo', () => {
    // The never-leak decision on the fetch side. `/user/repos` would be a
    // superset filtered by a query parameter; this endpoint has no spelling
    // that returns a private repository, whatever the token is.
    const fetchMock = vi.fn(async () => json([listEntry()]))
    vi.stubGlobal('fetch', fetchMock)

    return fetchPublicRepoListing('brandonperfetti', 'tok').then(() => {
      const [url] = fetchMock.mock.calls[0] as unknown as [string]
      expect(url).toContain('/users/brandonperfetti/repos')
      expect(url).not.toContain('/user/repos')
    })
  })

  it('identifies itself as the sync, not as the tech-signal scan', async () => {
    const fetchMock = vi.fn(async () => json([listEntry()]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchPublicRepoListing('brandonperfetti', 'tok')

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ]
    expect(init.headers['User-Agent']).toBe(CORVUS_GITHUB_USER_AGENT)
  })

  it('reports a short page as a COMPLETE listing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json([listEntry()])),
    )
    const listing = await fetchPublicRepoListing('brandonperfetti', 'tok')
    expect(listing.entries).toHaveLength(1)
    expect(listing.complete).toBe(true)
  })

  it('walks to the next page when a page comes back full', async () => {
    const full = Array.from({ length: 100 }, (_, index) =>
      listEntry({ id: index + 1, name: `repo-${index}` }),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(full))
      .mockResolvedValueOnce(json([listEntry({ id: 999, name: 'last' })]))
    vi.stubGlobal('fetch', fetchMock)

    const listing = await fetchPublicRepoListing('brandonperfetti', 'tok')
    expect(listing.entries).toHaveLength(101)
    expect(listing.complete).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('propagates a listing failure instead of returning a partial read', async () => {
    // Load-bearing: a caught error here would hand the sweep a short list and
    // let it delete everything the failed pages would have named.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'Bad credentials' }, 401)),
    )
    await expect(
      fetchPublicRepoListing('brandonperfetti', 'tok'),
    ).rejects.toMatchObject({ status: 401 })
  })
})

describe('shouldIndexRepo', () => {
  const none = new Set<string>()

  it('accepts an ordinary public repo', () => {
    expect(shouldIndexRepo(listEntry(), none)).toBe(true)
  })

  it('rejects a private entry even if the listing somehow returned one', () => {
    expect(shouldIndexRepo(listEntry({ private: true }), none)).toBe(false)
  })

  it('rejects a fork — its README is somebody else’s project text', () => {
    expect(shouldIndexRepo(listEntry({ fork: true }), none)).toBe(false)
  })

  it('accepts an archived repo, which is still Brandon’s work', () => {
    expect(shouldIndexRepo(listEntry({ archived: true }), none)).toBe(true)
  })

  it('honours the denylist by short name or full name', () => {
    expect(shouldIndexRepo(listEntry(), new Set(['bp-portfolio']))).toBe(false)
    expect(
      shouldIndexRepo(listEntry(), new Set(['brandonperfetti/bp-portfolio'])),
    ).toBe(false)
  })

  it('rejects an entry missing the fields a document needs', () => {
    expect(shouldIndexRepo(listEntry({ id: undefined }), none)).toBe(false)
    expect(shouldIndexRepo(listEntry({ name: undefined }), none)).toBe(false)
  })
})

describe('repoDenylist', () => {
  it('is empty when unset and lower-cases what it parses', () => {
    vi.stubEnv('CORVUS_GITHUB_SYNC_DENYLIST', '')
    expect(repoDenylist().size).toBe(0)

    vi.stubEnv('CORVUS_GITHUB_SYNC_DENYLIST', ' Foo , BAR ')
    expect([...repoDenylist()]).toEqual(['foo', 'bar'])
  })
})

describe('fetchRepoReadme', () => {
  it('decodes the base64 body GitHub returns', async () => {
    const markdown = '# Title\n\nBody.'
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          encoding: 'base64',
          content: Buffer.from(markdown, 'utf8').toString('base64'),
        }),
      ),
    )
    await expect(fetchRepoReadme('o/r', 'tok')).resolves.toBe(markdown)
  })

  it('treats a 404 as “no README”, which is an ordinary answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'Not Found' }, 404)),
    )
    await expect(fetchRepoReadme('o/r', 'tok')).resolves.toBeNull()
  })

  it('does NOT treat a 403 as “no README”', async () => {
    // A rate limit recorded as an empty README would delete the README half of
    // the existing document on this very sync. It has to be a failure.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ message: 'rate limited' }, 403)),
    )
    await expect(fetchRepoReadme('o/r', 'tok')).rejects.toMatchObject({
      status: 403,
    })
  })

  it('is null for the oversized-file encoding GitHub falls back to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ encoding: 'none', content: '' })),
    )
    await expect(fetchRepoReadme('o/r', 'tok')).resolves.toBeNull()
  })
})

describe('fetchRepoLanguages', () => {
  it('returns the byte map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ TypeScript: 10, CSS: 2 })),
    )
    await expect(
      fetchRepoLanguages('https://api.github.com/x/languages', 'tok'),
    ).resolves.toEqual({ TypeScript: 10, CSS: 2 })
  })

  it('is empty when the listing entry carried no languages_url', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchRepoLanguages(undefined, 'tok')).resolves.toEqual({})
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('hydrateRepo', () => {
  it('assembles the document source from the listing plus two lookups', async () => {
    const markdown = '# bp-portfolio\n\nNext.js 16 and Payload.'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/readme')
          ? json({
              encoding: 'base64',
              content: Buffer.from(markdown, 'utf8').toString('base64'),
            })
          : json({ TypeScript: 900, CSS: 10 }),
      ),
    )

    const repo = await hydrateRepo(listEntry(), 'tok')

    expect(repo).toMatchObject({
      id: 42,
      fullName: 'brandonperfetti/bp-portfolio',
      isPrivate: false,
      isFork: false,
      isArchived: false,
      topics: ['nextjs', 'payload'],
      language: 'TypeScript',
      languages: { TypeScript: 900, CSS: 10 },
      pushedAt: '2026-08-30T12:00:00Z',
      readme: markdown,
    })
  })

  it('normalises an empty homepage to null rather than an empty string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/readme')
          ? json({ message: 'Not Found' }, 404)
          : json({}),
      ),
    )
    const repo = await hydrateRepo(listEntry({ homepage: '   ' }), 'tok')
    expect(repo.homepage).toBeNull()
    expect(repo.readme).toBeNull()
  })
})
