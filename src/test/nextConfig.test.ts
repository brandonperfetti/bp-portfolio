// @vitest-environment node
import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config.mjs'

/**
 * Guards on the shipped `next.config.mjs` (#119).
 *
 * @remarks
 * The assertions run against the FINAL exported object — the one Next actually
 * consumes, after `withPayload` (and, when a DSN is configured,
 * `withSentryConfig`) have wrapped it. That matters: a plugin that dropped an
 * unrecognized top-level key would silently undo the fix, and a test against
 * the pre-wrap literal would not notice. No dev server is started here.
 */
describe('next.config.mjs', () => {
  it('allows 127.0.0.1 as a dev origin', () => {
    // Playwright drives the app at `http://127.0.0.1:6001` (#285)
    // (`playwright.config.ts`, `use.baseURL`), and Next's built-in dev
    // allowlist covers only `localhost` / `**.localhost`. Without this entry
    // the dev server 403s its own `/_next` and `/__nextjs` endpoints for that
    // host.
    expect(nextConfig.allowedDevOrigins).toContain('127.0.0.1')
  })

  it('sets an explicit Partial Prefetching policy for Cache Components (#436)', () => {
    // Unset behaves like `false` but logs a warning on every build under
    // `cacheComponents`; the choice and its migration work are recorded in
    // docs/ARCHITECTURE.md § Link prefetching. Flipping it is a decision,
    // not a cleanup, so this pins the value rather than only "defined".
    expect(nextConfig.cacheComponents).toBe(true)
    expect(nextConfig.partialPrefetching).toBe(false)
  })

  it('keeps allowedDevOrigins a list of bare hostnames', () => {
    // Next compares the parsed `hostname` of the request Origin against these
    // entries, so a scheme or port here would never match anything.
    expect(Array.isArray(nextConfig.allowedDevOrigins)).toBe(true)
    for (const origin of nextConfig.allowedDevOrigins as string[]) {
      expect(typeof origin).toBe('string')
      expect(origin).not.toMatch(/:\/\//)
      expect(origin).not.toMatch(/:\d+$/)
      expect(origin.trim()).toBe(origin)
    }
  })
})
