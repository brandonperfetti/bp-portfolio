import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getClientSentryDsn,
  getSentryEnvironment,
  getSentryInitDecision,
  getServerSentryDsn,
  getTracesSampleRate,
  isFilteredUserAgent,
  isLocalDevelopmentEnvironment,
  isNoisyTransaction,
  isSpotlightRequested,
  isSuppressedSentryLogMessage,
  sentryDropBotEvent,
  sentryDropNoisyLog,
  SENTRY_CONSOLE_LOG_LEVELS,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  sentryTracesSampler,
  warnIfDevDsnIgnored,
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

  it('falls back to the default on a whitespace-only override (Number("  ") is 0 — must not silently disable tracing)', () => {
    vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', '   ')
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

  it('falls back to VERCEL_ENV (server-shaped preview deploy) when neither env var is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('preview')
  })

  it('#134: on a browser-shaped preview env (no VERCEL_ENV, NODE_ENV=production), NEXT_PUBLIC_VERCEL_ENV tags it preview — not production', () => {
    // The exact shape of the browser bundle on a Vercel Preview deploy:
    // NEXT_PUBLIC_SENTRY_ENVIRONMENT is configured for Production and
    // Staging only, the server-only vars inline as undefined, and NODE_ENV
    // is baked to 'production' on every built deploy. Before #134 this
    // resolved to 'production' and preview browser errors landed in the
    // production feed.
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('preview')
  })

  it('#134: NODE_ENV is not an environment name — with no deployment signal it resolves to development, never the build mode', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'test')
    expect(getSentryEnvironment()).toBe('development')

    // …and a built deploy with no deployment signal must not inherit
    // NODE_ENV=production either.
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('development')
  })

  it('regression guard: on a client-bundle-shaped env (only NEXT_PUBLIC_* survives), the explicit override still wins over NEXT_PUBLIC_VERCEL_ENV', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'staging')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    expect(getSentryEnvironment()).toBe('staging')
  })

  it('#134: reads NEXT_PUBLIC_* via literal static member access so Next can inline it into the browser bundle', async () => {
    // process.env[name] / destructuring are NOT inlined by Next — a
    // computed read would silently be undefined client-side, which is the
    // whole failure mode this fix closes. Guard the access SHAPE, not just
    // the behaviour.
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const source = await readFile(
      resolve(process.cwd(), 'src/lib/observability/sentryConfig.ts'),
      'utf8',
    )
    // Comments are stripped first: the TSDoc deliberately *names* the
    // non-inlinable `process.env[name]` shape as the thing to avoid.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(code).toContain('process.env.NEXT_PUBLIC_VERCEL_ENV')
    expect(code).not.toMatch(/process\.env\[/)

    // NODE_ENV must stay out of the ENVIRONMENT chain (that conflation is
    // the #134 defect) — but #194 reads it legitimately elsewhere in this
    // module as the build-mode half of `isLocalDevelopmentEnvironment`.
    // Scope the guard to `getSentryEnvironment`'s own body rather than the
    // whole file, so it keeps testing what it was written to test.
    const environmentFn = code.slice(
      code.indexOf('export function getSentryEnvironment'),
    )
    const environmentBody = environmentFn.slice(0, environmentFn.indexOf('\n}'))
    expect(environmentBody).toContain('process.env.NEXT_PUBLIC_VERCEL_ENV')
    expect(environmentBody).not.toMatch(/process\.env\.NODE_ENV/)
  })
})

/**
 * #194: the send gate is no longer "DSN present" but "DSN present OR
 * Spotlight enabled in development". These cases are the contract — every
 * `Sentry.init` call site in the repo reads this one function, so the
 * matrix below is the whole behaviour.
 *
 * Every case stubs the full env shape rather than relying on ambient
 * values: `NODE_ENV` is `test` under Vitest, so a case that forgot to stub
 * it would silently test the wrong row.
 */
describe('getSentryInitDecision (#194)', () => {
  const DSN = 'https://public@o1.ingest.sentry.io/1'

  /** A developer's laptop: `next dev`, no Vercel signals. */
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

  it('local dev + Spotlight on + no DSN: inits WITHOUT a DSN and forwards to Spotlight', () => {
    stubLocalDev({ spotlight: '1' })
    expect(getSentryInitDecision('client')).toEqual({
      init: true,
      dsn: undefined,
      spotlight: true,
      dsnIgnoredInDevelopment: false,
    })
    expect(getSentryInitDecision('server')).toEqual({
      init: true,
      dsn: undefined,
      spotlight: true,
      dsnIgnoredInDevelopment: false,
    })
  })

  it('local dev + Spotlight OFF: no init at all — a contributor without the sidecar gets the pre-#194 quiet boot', () => {
    stubLocalDev()
    expect(getSentryInitDecision('client')).toMatchObject({
      init: false,
      spotlight: false,
    })
    expect(getSentryInitDecision('server')).toMatchObject({
      init: false,
      spotlight: false,
    })
  })

  it('#194 THE FENCE: a DSN configured locally is IGNORED — the shared project cannot receive a laptop event, Spotlight on or off', () => {
    // The inverted third acceptance criterion of #194: this exact env
    // shape (DSN set, no VERCEL_ENV, no NEXT_PUBLIC_VERCEL_ENV) used to be
    // the ONE that sent, and it is the one BP-PORTFOLIO-F/G came from.
    stubLocalDev({ dsn: DSN, spotlight: '1' })
    expect(getSentryInitDecision('client')).toEqual({
      init: true,
      dsn: undefined,
      spotlight: true,
      dsnIgnoredInDevelopment: true,
    })
    expect(getSentryInitDecision('server')).toEqual({
      init: true,
      dsn: undefined,
      spotlight: true,
      dsnIgnoredInDevelopment: true,
    })

    stubLocalDev({ dsn: DSN })
    expect(getSentryInitDecision('client')).toEqual({
      init: false,
      dsn: undefined,
      spotlight: false,
      dsnIgnoredInDevelopment: true,
    })
  })

  it('#194: the server DSN fallback is fenced too — SENTRY_DSN alone cannot send from a laptop', () => {
    stubLocalDev({ spotlight: '1' })
    vi.stubEnv('SENTRY_DSN', 'https://server@o1.ingest.sentry.io/2')
    expect(getSentryInitDecision('server')).toMatchObject({
      dsn: undefined,
      dsnIgnoredInDevelopment: true,
    })
  })

  it('production is byte-identical to pre-#194: DSN present → init with that DSN, Spotlight never on', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
    vi.stubEnv('SENTRY_SPOTLIGHT', '')
    expect(getSentryInitDecision('client')).toEqual({
      init: true,
      dsn: DSN,
      spotlight: false,
      dsnIgnoredInDevelopment: false,
    })
  })

  it('production with SENTRY_SPOTLIGHT accidentally set: still DSN-only — a sidecar forwarder can never arm on a deploy', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '1')
    vi.stubEnv('SENTRY_SPOTLIGHT', '1')
    expect(getSentryInitDecision('server')).toEqual({
      init: true,
      dsn: DSN,
      spotlight: false,
      dsnIgnoredInDevelopment: false,
    })
  })

  it('vercel-staging and preview are unchanged: DSN present → init with that DSN, no Spotlight', () => {
    for (const shape of [
      { NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'staging', NEXT_PUBLIC_VERCEL_ENV: '' },
      { NEXT_PUBLIC_SENTRY_ENVIRONMENT: '', NEXT_PUBLIC_VERCEL_ENV: 'preview' },
    ]) {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv(
        'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
        shape.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
      )
      vi.stubEnv('SENTRY_ENVIRONMENT', '')
      vi.stubEnv('VERCEL_ENV', '')
      vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', shape.NEXT_PUBLIC_VERCEL_ENV)
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
      vi.stubEnv('SENTRY_DSN', '')
      vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
      vi.stubEnv('SENTRY_SPOTLIGHT', '')
      expect(getSentryInitDecision('client')).toEqual({
        init: true,
        dsn: DSN,
        spotlight: false,
        dsnIgnoredInDevelopment: false,
      })
    }
  })

  it('a deployed environment TAGGED development still sends: the deployment-target half alone must not fence a real deploy', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'development')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
    vi.stubEnv('SENTRY_SPOTLIGHT', '')
    expect(getSentryInitDecision('client')).toMatchObject({
      init: true,
      dsn: DSN,
      spotlight: false,
    })
  })

  it('CI (NODE_ENV=test, no DSN, no deployment signal): no init and no Spotlight, even if the switch leaks in', () => {
    vi.stubEnv('CI', 'true')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    vi.stubEnv('SENTRY_DSN', '')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '1')
    vi.stubEnv('SENTRY_SPOTLIGHT', '1')
    expect(getSentryInitDecision('client')).toEqual({
      init: false,
      dsn: undefined,
      spotlight: false,
      dsnIgnoredInDevelopment: false,
    })
    expect(getSentryInitDecision('server')).toEqual({
      init: false,
      dsn: undefined,
      spotlight: false,
      dsnIgnoredInDevelopment: false,
    })
  })

  it('never carries a DSN into an init it also marks Spotlight-only', () => {
    stubLocalDev({ dsn: DSN, spotlight: '1' })
    const decision = getSentryInitDecision('server')
    expect(decision.spotlight && decision.dsn).toBeFalsy()
  })

  describe("the 'edge' runtime row", () => {
    // @sentry/vercel-edge 10.70.0 ships no `spotlight` option and no
    // Spotlight integration, so an edge decision can never be
    // Spotlight-only. The rule lives in the decision (not at the call
    // site) precisely so it is provable here alongside every other row.
    it('local + Spotlight on + no DSN: does NOT init — there is nowhere to send', () => {
      stubLocalDev({ spotlight: '1' })
      expect(getSentryInitDecision('edge')).toEqual({
        init: false,
        dsn: undefined,
        spotlight: false,
        dsnIgnoredInDevelopment: false,
      })
    })

    it('#194 THE FENCE holds on edge too: local + DSN + Spotlight on → no init, DSN ignored', () => {
      stubLocalDev({ dsn: DSN, spotlight: '1' })
      expect(getSentryInitDecision('edge')).toEqual({
        init: false,
        dsn: undefined,
        spotlight: false,
        dsnIgnoredInDevelopment: true,
      })
    })

    it('production + DSN: inits with the DSN, exactly like the server runtime', () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
      vi.stubEnv('SENTRY_ENVIRONMENT', '')
      vi.stubEnv('VERCEL_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
      vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', DSN)
      vi.stubEnv('SENTRY_DSN', '')
      vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '1')
      vi.stubEnv('SENTRY_SPOTLIGHT', '1')
      expect(getSentryInitDecision('edge')).toEqual({
        init: true,
        dsn: DSN,
        spotlight: false,
        dsnIgnoredInDevelopment: false,
      })
      expect(getSentryInitDecision('edge')).toEqual(
        getSentryInitDecision('server'),
      )
    })
  })
})

describe('warnIfDevDsnIgnored (#194)', () => {
  const base = {
    init: true,
    dsn: undefined,
    spotlight: true,
  } as const

  it('warns once, naming the variables and never a value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnIfDevDsnIgnored({ ...base, dsnIgnoredInDevelopment: true })

    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]![0])
    expect(message).toContain('NEXT_PUBLIC_SENTRY_DSN')
    expect(message).toContain('SENTRY_DSN')
    expect(message).toContain('NEXT_PUBLIC_SENTRY_SPOTLIGHT')
    // The repo is public. This string is the one place a DSN value could
    // plausibly be interpolated by a well-meaning future edit.
    expect(message).not.toMatch(/https?:\/\/\S+@/)
    warn.mockRestore()
  })

  it('says nothing when no DSN is being ignored — the common case must be silent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnIfDevDsnIgnored({ ...base, dsnIgnoredInDevelopment: false })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('isLocalDevelopmentEnvironment (#194)', () => {
  it('requires BOTH halves — build mode and the absence of a deployment signal', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('SENTRY_ENVIRONMENT', '')
    vi.stubEnv('VERCEL_ENV', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')

    vi.stubEnv('NODE_ENV', 'development')
    expect(isLocalDevelopmentEnvironment()).toBe(true)

    // Build mode without the deployment half: `vercel dev`-style local
    // preview, or a deploy explicitly tagged something else.
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(isLocalDevelopmentEnvironment()).toBe(false)

    // Deployment half without the build mode: Vitest / CI.
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    vi.stubEnv('NODE_ENV', 'test')
    expect(isLocalDevelopmentEnvironment()).toBe(false)
  })
})

describe('isSpotlightRequested (#194)', () => {
  it('is off when neither variable is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
    vi.stubEnv('SENTRY_SPOTLIGHT', '')
    expect(isSpotlightRequested()).toBe(false)
  })

  it('reads the NEXT_PUBLIC_ twin first so ONE variable arms both runtimes that can reach a sidecar (browser + Node)', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '1')
    vi.stubEnv('SENTRY_SPOTLIGHT', '')
    expect(isSpotlightRequested()).toBe(true)
  })

  it("falls back to the SDK's own SENTRY_SPOTLIGHT so setting that alone is not silently ignored server-side", () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
    vi.stubEnv('SENTRY_SPOTLIGHT', '1')
    expect(isSpotlightRequested()).toBe(true)
  })

  it('treats explicit off values as off, so commenting the line out is not the only way to disable it', () => {
    vi.stubEnv('SENTRY_SPOTLIGHT', '')
    for (const value of ['0', 'false', 'FALSE', 'off', 'no', '  ']) {
      vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', value)
      expect(isSpotlightRequested()).toBe(false)
    }
  })

  it('accepts a sidecar URL as the value — the Node SDK reads SENTRY_SPOTLIGHT as a URL when it is not a boolean', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_SPOTLIGHT', '')
    vi.stubEnv('SENTRY_SPOTLIGHT', 'http://localhost:9000/stream')
    expect(isSpotlightRequested()).toBe(true)
  })
})

describe('#194: the Spotlight package never reaches application code', () => {
  it('is a devDependency only, and nothing under src/ imports it', async () => {
    // The Spotlight desktop app / sidecar / MCP server is a TOOL Brandon
    // runs, not a library this app links against: the browser and Node
    // Sentry SDKs carry their own `spotlight` option, so `Sentry.init` is
    // the entire integration. Assert that directly — a stray
    // `import '@spotlightjs/spotlight'` in a client file would drag a
    // node:http sidecar server into the browser bundle.
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const pkg = JSON.parse(
      await readFile(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.devDependencies?.['@spotlightjs/spotlight']).toBeTruthy()
    expect(pkg.dependencies?.['@spotlightjs/spotlight']).toBeUndefined()

    const { readdir } = await import('node:fs/promises')
    const srcRoot = resolve(process.cwd(), 'src')
    const IMPORTS =
      /(?:from|import|require)\s*\(?\s*['"]@spotlightjs\/spotlight/
    const importers: string[] = []
    const mentions: string[] = []
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
          continue
        }
        if (!/\.(ts|tsx|js|mjs)$/.test(entry.name)) continue
        const contents = await readFile(full, 'utf8')
        const relative = full.slice(srcRoot.length + 1)
        if (contents.includes('@spotlightjs/spotlight')) mentions.push(relative)
        // Test and story files are excluded from the IMPORT check on
        // purpose — they are never bundled for a visitor, and this file's
        // own positive control below is a literal that would match.
        if (/\.(test|stories)\.[jt]sx?$/.test(entry.name)) continue
        if (IMPORTS.test(contents)) importers.push(relative)
      }
    }
    await walk(srcRoot)

    expect(importers).toEqual([])
    // Positive control for the scan itself: the docblocks in this file and
    // in `instrumentation-client.ts` NAME the package, so an empty mention
    // list would mean the walk found nothing and the assertion above is
    // vacuously true.
    expect(mentions.length).toBeGreaterThan(0)
    expect(IMPORTS.test("import * as S from '@spotlightjs/spotlight'")).toBe(
      true,
    )
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

  it('does not flag routes that merely CONTAIN a noisy pattern (segment-boundary match)', () => {
    expect(isNoisyTransaction('/articles/admin-guide')).toBe(false)
    expect(isNoisyTransaction('/api/users/metrics')).toBe(false)
    expect(isNoisyTransaction('/administrivia')).toBe(false)
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

describe('SENTRY_CONSOLE_LOG_LEVELS', () => {
  it('forwards only warn and error to Sentry Logs — not the noisier log/info/debug/trace/assert defaults', () => {
    expect(SENTRY_CONSOLE_LOG_LEVELS).toEqual(['warn', 'error'])
    expect(SENTRY_CONSOLE_LOG_LEVELS).not.toContain('log')
    expect(SENTRY_CONSOLE_LOG_LEVELS).not.toContain('info')
    expect(SENTRY_CONSOLE_LOG_LEVELS).not.toContain('debug')
  })
})

describe('isSuppressedSentryLogMessage', () => {
  it('suppresses the benign Node vm experimental warning (#95)', () => {
    expect(
      isSuppressedSentryLogMessage(
        '(node:4) ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER is an experimental feature',
      ),
    ).toBe(true)
  })

  it('suppresses the transient Turnstile 300031 baseline warning (#94)', () => {
    expect(
      isSuppressedSentryLogMessage('[Cloudflare Turnstile] Error: 300031.'),
    ).toBe(true)
  })

  it('suppresses the post-deploy image-optimizer cold-start burst (#99)', () => {
    expect(
      isSuppressedSentryLogMessage(
        "Error: Cannot find module './.next/server/pages/_next/image.js'",
      ),
    ).toBe(true)
  })

  it('does not suppress an ordinary warn/error message that is real signal', () => {
    expect(
      isSuppressedSentryLogMessage('Failed to load article: 500 from CMS'),
    ).toBe(false)
    // A different Turnstile error code is NOT the benign baseline — keep it.
    expect(
      isSuppressedSentryLogMessage('[Cloudflare Turnstile] Error: 110200.'),
    ).toBe(false)
  })

  /**
   * The #99 entry is deliberately the optimizer's exact module path, not
   * `MODULE_NOT_FOUND` and not `Cannot find module`. A broad match there would
   * silence every genuine missing-module crash in the app — the loudest signal
   * this project has that a deploy shipped broken — so these are the cases
   * that would regress if someone widened the pattern.
   */
  it('still surfaces other missing-module errors after the #99 entry', () => {
    expect(
      isSuppressedSentryLogMessage(
        "Error: Cannot find module '@/lib/observability/sentryConfig'",
      ),
    ).toBe(false)
    expect(
      isSuppressedSentryLogMessage(
        'Error [ERR_MODULE_NOT_FOUND]: Cannot find package "payload"',
      ),
    ).toBe(false)
    // A different Next server chunk failing to resolve is a real deploy
    // problem, not the image optimizer warming up.
    expect(
      isSuppressedSentryLogMessage(
        "Cannot find module './.next/server/pages/_document.js'",
      ),
    ).toBe(false)
  })

  it('never suppresses an empty message', () => {
    expect(isSuppressedSentryLogMessage('')).toBe(false)
  })
})

describe('SENTRY_DENY_URLS', () => {
  it('drops events sourced in the Vercel Toolbar `_next-live` bundle (BP-4, #95)', () => {
    const url = 'app:///_next-live/feedback/feedback.js'
    expect(SENTRY_DENY_URLS.some((pattern) => pattern.test(url))).toBe(true)
  })

  it('leaves ordinary app bundle frames alone', () => {
    const url = 'app:///_next/static/chunks/main-app.js'
    expect(SENTRY_DENY_URLS.some((pattern) => pattern.test(url))).toBe(false)
  })
})

describe('SENTRY_IGNORE_ERRORS', () => {
  const matches = (message: string) =>
    SENTRY_IGNORE_ERRORS.some((pattern) =>
      typeof pattern === 'string'
        ? message.includes(pattern)
        : pattern.test(message),
    )

  it('matches the Vercel Toolbar InvalidNodeTypeError message (BP-4, #95)', () => {
    expect(
      matches(
        "InvalidNodeTypeError: Failed to execute 'selectNode' on 'Range': the given Node has no parent.",
      ),
    ).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(matches('TypeError: Cannot read properties of undefined')).toBe(
      false,
    )
  })
})

describe('isFilteredUserAgent', () => {
  it('filters self-identifying crawlers and monitors (#98)', () => {
    expect(
      isFilteredUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)'),
    ).toBe(true)
    expect(
      isFilteredUserAgent(
        'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
      ),
    ).toBe(true)
    expect(isFilteredUserAgent('Pingdom.com_bot_version_1.4')).toBe(true)
    expect(
      isFilteredUserAgent('facebookexternalhit/1.1 (+http://www.facebook.com)'),
    ).toBe(true)
  })

  it('filters headless browsers and raw HTTP clients', () => {
    expect(
      isFilteredUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(true)
    expect(isFilteredUserAgent('curl/8.4.0')).toBe(true)
    expect(isFilteredUserAgent('python-requests/2.31.0')).toBe(true)
    expect(isFilteredUserAgent('okhttp/4.12.0')).toBe(true)
  })

  it('does NOT filter real desktop/mobile browser user-agents', () => {
    expect(
      isFilteredUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe(false)
    expect(
      isFilteredUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false)
  })

  it('does not treat an empty or absent user-agent as a bot', () => {
    expect(isFilteredUserAgent('')).toBe(false)
    expect(isFilteredUserAgent(undefined)).toBe(false)
    expect(isFilteredUserAgent(null)).toBe(false)
  })
})

describe('sentryDropBotEvent (shared server/edge beforeSend)', () => {
  it('drops an error event whose request User-Agent is a bot', () => {
    expect(
      sentryDropBotEvent({
        request: { headers: { 'user-agent': 'Googlebot/2.1' } },
      }),
    ).toBeNull()
  })

  it('also matches the capitalized `User-Agent` header key', () => {
    expect(
      sentryDropBotEvent({
        request: { headers: { 'User-Agent': 'curl/8.4.0' } },
      }),
    ).toBeNull()
  })

  it('returns the event unchanged for a real browser User-Agent', () => {
    const event = {
      request: {
        headers: {
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
    }
    expect(sentryDropBotEvent(event)).toBe(event)
  })

  it('returns the event unchanged when there is no request/headers/UA', () => {
    const event = {}
    expect(sentryDropBotEvent(event)).toBe(event)
  })
})

describe('sentryDropNoisyLog (shared beforeSendLog)', () => {
  it('drops a known-benign-message log', () => {
    expect(
      sentryDropNoisyLog({ message: '[Cloudflare Turnstile] Error: 300031.' }),
    ).toBeNull()
    expect(
      sentryDropNoisyLog({
        message: 'ExperimentalWarning: vm.USE_MAIN_CONTEXT_DEFAULT_LOADER',
      }),
    ).toBeNull()
  })

  it('returns a real-signal log unchanged', () => {
    const log = { message: 'Failed to load article: 500 from CMS' }
    expect(sentryDropNoisyLog(log)).toBe(log)
  })

  it('returns a message-less log unchanged', () => {
    const log = {}
    expect(sentryDropNoisyLog(log)).toBe(log)
  })
})
