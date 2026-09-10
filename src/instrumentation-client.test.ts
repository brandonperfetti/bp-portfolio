import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SENTRY_SESSION_ID_STORAGE_KEY } from '@/lib/observability/sessionId'

/**
 * #213 / #168: what the browser entrypoint hands to `Sentry.setUser`, and
 * when it hands it over at all. `@sentry/nextjs` is mocked wholesale — the
 * subject is this repo's wiring, not the SDK.
 */

const init = vi.fn<(options: Record<string, unknown>) => void>()
const setUser = vi.fn<(user: unknown) => void>()

vi.mock('@sentry/nextjs', () => ({
  init: (options: Record<string, unknown>) => init(options),
  setUser: (user: unknown) => setUser(user),
  consoleLoggingIntegration: () => ({ name: 'Console' }),
  captureRouterTransitionStart: () => undefined,
}))

const DSN = 'https://public@o1.ingest.sentry.io/1'
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Deployed shape, so `decision.init` is true via a DSN. */
function stubProduction() {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
  vi.stubEnv('SENTRY_ENVIRONMENT', '')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
  vi.stubEnv('SENTRY_DSN', '')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
  vi.stubEnv('SENTRY_SPOTLIGHT', '')
}

function stubUserAgent(value: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(value)
}

beforeEach(() => {
  vi.resetModules()
  init.mockClear()
  setUser.mockClear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('instrumentation-client: distinct-session id (#213)', () => {
  it('sets a v4-UUID user id and NOTHING else — no email, username or ip_address (#168)', async () => {
    stubProduction()
    stubUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140')
    await import('./instrumentation-client')

    expect(setUser).toHaveBeenCalledTimes(1)
    const user = setUser.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(user)).toEqual(['id'])
    expect(user.id).toMatch(UUID_V4)
    // The #168 fence, stated as an assertion rather than a comment.
    for (const field of [
      'email',
      'username',
      'ip_address',
      'segment',
      'name',
    ]) {
      expect(user).not.toHaveProperty(field)
    }
  })

  it('persists the id in sessionStorage so two errors from one tab are one session', async () => {
    stubProduction()
    stubUserAgent('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140')
    await import('./instrumentation-client')
    const first = (setUser.mock.calls[0]![0] as { id: string }).id
    expect(sessionStorage.getItem(SENTRY_SESSION_ID_STORAGE_KEY)).toBe(first)

    // A second page load in the same tab re-runs this module; the id must
    // not be reminted.
    vi.resetModules()
    setUser.mockClear()
    await import('./instrumentation-client')
    expect((setUser.mock.calls[0]![0] as { id: string }).id).toBe(first)
  })

  it('never sets a user when Sentry does not initialise — a Spotlight-less local run writes nothing to a developer’s storage', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
    vi.stubEnv('SENTRY_SPOTLIGHT', '')
    await import('./instrumentation-client')

    expect(init).not.toHaveBeenCalled()
    expect(setUser).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(SENTRY_SESSION_ID_STORAGE_KEY)).toBeNull()
  })

  it('a bot user-agent mints no id at all, so a dropped event cannot inflate the session count (#98)', async () => {
    // `beforeSend` already returns null for these, and a dropped event
    // never reaches Sentry — so it is never counted. Gating the id on the
    // same check makes that structural rather than incidental: a crawler
    // leaves nothing behind in storage either.
    stubProduction()
    stubUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')
    await import('./instrumentation-client')

    expect(init).toHaveBeenCalledTimes(1)
    expect(setUser).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(SENTRY_SESSION_ID_STORAGE_KEY)).toBeNull()

    // And the event itself is still dropped, unchanged by #213.
    const beforeSend = init.mock.calls[0]![0].beforeSend as (
      event: unknown,
    ) => unknown
    expect(beforeSend({})).toBeNull()
  })
})
