import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #194: the Node and Edge entrypoints must obey
 * `getSentryInitDecision('server')` — not their own reading of the env.
 *
 * `@sentry/nextjs` is mocked wholesale so these assertions are about THIS
 * repo's gating and nothing about the SDK. Each case re-imports the module
 * under test after `vi.resetModules()`, because both config files do their
 * work at module scope (that is the Next.js contract for them).
 */

const init = vi.fn<(options: Record<string, unknown>) => void>()

vi.mock('@sentry/nextjs', () => ({
  init: (options: Record<string, unknown>) => init(options),
  consoleLoggingIntegration: () => ({ name: 'Console' }),
  captureRequestError: () => undefined,
  captureRouterTransitionStart: () => undefined,
}))

/** The local `next dev` env shape — no Vercel signals, no DSN by default. */
function stubLocalDev({
  dsn = '',
  spotlight = '',
}: { dsn?: string; spotlight?: string } = {}) {
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
  vi.stubEnv('SENTRY_ENVIRONMENT', '')
  vi.stubEnv('VERCEL_ENV', '')
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn)
  vi.stubEnv('SENTRY_DSN', '')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', spotlight)
  vi.stubEnv('SENTRY_SPOTLIGHT', '')
}

/** A real production deploy with a DSN configured. */
function stubProduction(dsn: string) {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
  vi.stubEnv('SENTRY_ENVIRONMENT', '')
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', dsn)
  vi.stubEnv('SENTRY_DSN', '')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
  vi.stubEnv('SENTRY_SPOTLIGHT', '')
}

const DSN = 'https://public@o1.ingest.sentry.io/1'

beforeEach(() => {
  vi.resetModules()
  init.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sentry.server.config (#194)', () => {
  it('local dev with Spotlight on: inits with spotlight and NO dsn', async () => {
    stubLocalDev({ spotlight: '1' })
    await import('./sentry.server.config')

    expect(init).toHaveBeenCalledTimes(1)
    const options = init.mock.calls[0]![0]
    expect(options.spotlight).toBe(true)
    // The `dsn` KEY is absent, not present-holding-undefined: "no DSN" is
    // literal in the options object the SDK receives.
    expect(options).not.toHaveProperty('dsn')
    expect(options.environment).toBe('development')
  })

  it('local dev with Spotlight off: never calls Sentry.init', async () => {
    stubLocalDev()
    await import('./sentry.server.config')
    expect(init).not.toHaveBeenCalled()
  })

  it('#194 THE FENCE: a local DSN never reaches Sentry.init, and the ignore is announced by variable NAME', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubLocalDev({ dsn: DSN, spotlight: '1' })
    await import('./sentry.server.config')

    const options = init.mock.calls[0]![0]
    expect(options).not.toHaveProperty('dsn')
    expect(options.spotlight).toBe(true)

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]![0])
    expect(message).toContain('NEXT_PUBLIC_SENTRY_DSN')
    // Repo is public: the warning names variables, never values.
    expect(message).not.toContain(DSN)
    expect(message).not.toContain('ingest.sentry.io')
  })

  it('production is unchanged: inits with the DSN and spotlight false', async () => {
    stubProduction(DSN)
    await import('./sentry.server.config')

    const options = init.mock.calls[0]![0]
    expect(options.dsn).toBe(DSN)
    expect(options.spotlight).toBe(false)
    expect(options.environment).toBe('production')
  })
})

describe('sentry.edge.config (#194)', () => {
  it('production is unchanged: inits with the DSN', async () => {
    stubProduction(DSN)
    await import('./sentry.edge.config')

    const options = init.mock.calls[0]![0]
    expect(options.dsn).toBe(DSN)
    // @sentry/vercel-edge has no `spotlight` option — the edge entrypoint
    // must not invent one.
    expect(options).not.toHaveProperty('spotlight')
  })

  it("local dev with Spotlight on: does NOT init — the 'edge' decision row, not a call-site check", async () => {
    stubLocalDev({ spotlight: '1' })
    await import('./sentry.edge.config')
    expect(init).not.toHaveBeenCalled()
  })

  it('#194 THE FENCE: a local DSN never reaches the edge Sentry.init either', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubLocalDev({ dsn: DSN, spotlight: '1' })
    await import('./sentry.edge.config')
    expect(init).not.toHaveBeenCalled()
  })
})
