import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GITHUB_DEFAULT_USER_AGENT,
  GITHUB_MAX_RETRIES,
  GITHUB_RETRYABLE_STATUSES,
  GithubHttpError,
  fetchGithubJson,
} from './request'

/**
 * The request layer both GitHub callers share (#147).
 *
 * @remarks It had no test of its own while it lived inside `techSignals.ts`:
 * that file's test drives `collectGithubTechSignals` end to end and only ever
 * exercised the happy path plus one listing failure. The retry policy — which
 * statuses back off and which fail immediately — was therefore untested, and
 * it is the part a second caller is most able to break, because "retry a 404"
 * looks harmless right up until a sync of forty repos makes 160 requests
 * instead of 40 and gets the token rate-limited.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchGithubJson', () => {
  it('sends the API version, the bearer token and a User-Agent', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchGithubJson('https://api.github.com/rate_limit', 'tok')

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ]
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(init.headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    expect(init.headers['User-Agent']).toBe(GITHUB_DEFAULT_USER_AGENT)
    expect(init.headers.Accept).toBe('application/vnd.github+json')
  })

  it('lets a caller name itself, so a rate-limit trace can tell them apart', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchGithubJson('https://api.github.com/rate_limit', 'tok', {
      userAgent: 'bp-portfolio-corvus-sync',
    })

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { headers: Record<string, string> },
    ]
    expect(init.headers['User-Agent']).toBe('bp-portfolio-corvus-sync')
  })

  it('retries a 429 and returns the eventual success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ message: 'slow down' }, 429))
      .mockResolvedValueOnce(json({ name: 'bp-portfolio' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchGithubJson<{ name: string }>('https://api.github.com/x', 'tok'),
    ).resolves.toEqual({ name: 'bp-portfolio' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a 404 — a missing repo is permanent for this run', async () => {
    // The property that matters to the sync: a repo whose README is absent
    // 404s once and is handled, rather than costing four requests per repo.
    const fetchMock = vi.fn(async () => json({ message: 'Not Found' }, 404))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchGithubJson('https://api.github.com/x', 'tok'),
    ).rejects.toBeInstanceOf(GithubHttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(GITHUB_RETRYABLE_STATUSES.has(404)).toBe(false)
  })

  it('does not retry a 401, so a bad token fails once and loudly', async () => {
    const fetchMock = vi.fn(async () => json({ message: 'Bad creds' }, 401))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchGithubJson('https://api.github.com/x', 'tok'),
    ).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after the bounded number of attempts', async () => {
    const fetchMock = vi.fn(async () => json({ message: 'oops' }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchGithubJson('https://api.github.com/x', 'tok'),
    ).rejects.toMatchObject({ status: 503 })
    // The first attempt plus the retries — bounded, so a sustained outage
    // cannot spin a scheduled run for its whole timeout.
    expect(fetchMock).toHaveBeenCalledTimes(GITHUB_MAX_RETRIES + 1)
  })
})
