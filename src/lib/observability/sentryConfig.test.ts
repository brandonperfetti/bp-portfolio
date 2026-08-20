import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getClientSentryDsn,
  getSentryEnvironment,
  getServerSentryDsn,
  getTracesSampleRate,
  isNoisyTransaction,
  sentryTracesSampler,
} from '@/lib/observability/sentryConfig'

/**
 * The load-bearing acceptance criterion for #73: with no DSN configured,
 * every `Sentry.init` call site in this repo must no-op. These tests stub
 * env per-case (never relying on ambient process.env) so they prove the
 * gating on both a DSN-less clone (CI/local) and a machine that happens to
 * have Sentry vars exported in its shell.
 */

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getClientSentryDsn', () => {
  it('returns undefined when NEXT_PUBLIC_SENTRY_DSN is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    expect(getClientSentryDsn()).toBeUndefined()
  })

  it('returns the DSN when configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o1.ingest.sentry.io/1')
    expect(getClientSentryDsn()).toBe('https://public@o1.ingest.sentry.io/1')
  })
})

describe('getServerSentryDsn', () => {
  it('returns undefined when neither SENTRY_DSN nor the public DSN is set', () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    expect(getServerSentryDsn()).toBeUndefined()
  })

  it('prefers SENTRY_DSN over the public client DSN', () => {
    vi.stubEnv('SENTRY_DSN', 'https://server@o1.ingest.sentry.io/2')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o1.ingest.sentry.io/1')
    expect(getServerSentryDsn()).toBe('https://server@o1.ingest.sentry.io/2')
  })

  it('falls back to the public client DSN when SENTRY_DSN is unset', () => {
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o1.ingest.sentry.io/1')
    expect(getServerSentryDsn()).toBe('https://public@o1.ingest.sentry.io/1')
  })
})

describe('getTracesSampleRate', () => {
  it('defaults to a conservative 0.1 when unset', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '')
    expect(getTracesSampleRate()).toBe(0.1)
  })

  it('honors a valid override', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.25')
    expect(getTracesSampleRate()).toBe(0.25)
  })

  it('falls back to the default on an out-of-range override', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '5')
    expect(getTracesSampleRate()).toBe(0.1)
  })

  it('falls back to the default on an unparsable override', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', 'not-a-number')
    expect(getTracesSampleRate()).toBe(0.1)
  })
})

describe('getSentryEnvironment', () => {
  it('prefers the public NEXT_PUBLIC_SENTRY_ENVIRONMENT above everything else (the client-bundle-safe var)', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('SENTRY_ENVIRONMENT', 'preview')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('staging')
  })

  it('falls back to SENTRY_ENVIRONMENT when the public var is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('staging')
  })

  it('falls back to VERCEL_ENV when neither env var is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('preview')
  })

  it('falls back to NODE_ENV, then a hardcoded default', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'test')
    expect(getSentryEnvironment()).toBe('test')
  })

  it('regression guard: on a client-bundle-shaped env (only NEXT_PUBLIC_* survives), the public var — not NODE_ENV — wins', () => {
    // Simulates the browser bundle: SENTRY_ENVIRONMENT/VERCEL_ENV are
    // inlined as undefined client-side (never NEXT_PUBLIC_-prefixed), and
    // NODE_ENV is baked to 'production' on every built deploy — without
    // preferring the public var first, staging/preview client events
    // would silently get tagged 'production'.
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('staging')
  })
})

describe('isNoisyTransaction', () => {
  it('flags the Payload admin UI and its polling endpoints', () => {
    expect(isNoisyTransaction('/admin')).toBe(true)
    expect(isNoisyTransaction('/admin/collections/pages')).toBe(true)
    expect(isNoisyTransaction('/api/access')).toBe(true)
    expect(isNoisyTransaction('/api/preferences/theme')).toBe(true)
    expect(isNoisyTransaction('/api/users/me')).toBe(true)
    expect(isNoisyTransaction('/api/health')).toBe(true)
  })

  it('does not flag ordinary frontend/API routes', () => {
    expect(isNoisyTransaction('/articles/some-post')).toBe(false)
    expect(isNoisyTransaction('/api/ai/chat')).toBe(false)
  })

  it('treats a missing name as not noisy', () => {
    expect(isNoisyTransaction(undefined)).toBe(false)
  })
})

describe('sentryTracesSampler', () => {
  it('drops noisy transactions entirely', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.5')
    expect(sentryTracesSampler({ name: '/admin/collections/pages' })).toBe(0)
  })

  it('applies the configured sample rate to everything else', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '0.5')
    expect(sentryTracesSampler({ name: '/articles/some-post' })).toBe(0.5)
  })
})
