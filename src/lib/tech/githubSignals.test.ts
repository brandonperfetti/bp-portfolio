import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { collectGithubTechSignals } from '@/lib/integrations/github/techSignals'
import type { CmsEntityItem } from '@/lib/cms/types'
import {
  buildSignalsBySlug,
  getTechSignalsIndex,
  matchTechSignal,
  type TechSignalsIndex,
  type TechSignalSummary,
} from './githubSignals'

/**
 * `'use cache'` (#76 B1) replaced the `unstable_cache` wrapper: the scan fn now
 * calls `cacheTag`/`cacheLife` at the top of its own body. These recorders let
 * the tests assert *where* a value is produced (each `cacheTag` call = one entry
 * into the cache scope) and *how* it is tagged/profiled. Real cache storage
 * isn't exercised — that's Next's job. The 6h revalidate now lives in the
 * `techSignals` cacheLife profile in next.config.mjs, not here.
 */
const { cacheScope } = vi.hoisted(() => ({
  cacheScope: { entries: 0, tags: [] as string[], profiles: [] as unknown[] },
}))

vi.mock('next/cache', () => ({
  cacheTag: (...tags: string[]) => {
    cacheScope.entries += 1
    cacheScope.tags.push(...tags)
  },
  cacheLife: (profile: unknown) => {
    cacheScope.profiles.push(profile)
  },
}))

const { draftModeState } = vi.hoisted(() => ({
  draftModeState: { isEnabled: false },
}))

vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: draftModeState.isEnabled }),
}))

// Keep `coerceTechKey` real — the matching tests below exercise the actual
// canonicalizer; only the network-bound scan is faked.
vi.mock('@/lib/integrations/github/techSignals', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/integrations/github/techSignals')
  >()),
  collectGithubTechSignals: vi.fn(),
}))

const collectMock = vi.mocked(collectGithubTechSignals)

const summary = (
  key: string,
  overrides: Partial<TechSignalSummary> = {},
): TechSignalSummary => ({
  key,
  score: 10,
  repoCount: 3,
  reasons: ['package'],
  intensity: 0.5,
  ...overrides,
})

const index: TechSignalsIndex = {
  ok: true,
  owner: 'brandonperfetti',
  scannedRepos: 12,
  generatedAt: '2026-07-23T00:00:00.000Z',
  byKey: {
    nextjs: summary('nextjs', { score: 40, intensity: 1 }),
    tailwindcss: summary('tailwindcss'),
    playwright: summary('playwright'),
    'bp-portfolio': summary('bp-portfolio', { score: 4, intensity: 0.1 }),
  },
}

const item = (overrides: Partial<CmsEntityItem>): CmsEntityItem => ({
  slug: 'x',
  name: 'X',
  description: '',
  ...overrides,
})

describe('matchTechSignal', () => {
  it('matches display names through alias canonicalization', () => {
    expect(matchTechSignal(index, item({ name: 'Next.js' }))?.key).toBe(
      'nextjs',
    )
    expect(matchTechSignal(index, item({ name: 'Tailwind CSS' }))?.key).toBe(
      'tailwindcss',
    )
  })

  it('falls back to the githubRepo short name when the name misses', () => {
    const matched = matchTechSignal(
      index,
      item({
        name: 'My Portfolio',
        githubRepo: 'brandonperfetti/bp-portfolio',
      }),
    )
    expect(matched?.key).toBe('bp-portfolio')
  })

  it('returns null without an index or without evidence', () => {
    expect(matchTechSignal(null, item({ name: 'Next.js' }))).toBeNull()
    expect(matchTechSignal(index, item({ name: 'COBOL' }))).toBeNull()
  })

  it('collapses slashes/dots in display names (shadcn/ui → shadcn-ui)', () => {
    const withShadcn: TechSignalsIndex = {
      ...index,
      byKey: { ...index.byKey, 'shadcn-ui': summary('shadcn-ui') },
    }
    expect(matchTechSignal(withShadcn, item({ name: 'shadcn/ui' }))?.key).toBe(
      'shadcn-ui',
    )
  })

  it('resolves scoped-package prefix aliases to the best-scoring key', () => {
    const withTl: TechSignalsIndex = {
      ...index,
      byKey: {
        ...index.byKey,
        '@testing-library/react': summary('@testing-library/react', {
          score: 12,
          repoCount: 4,
        }),
        '@testing-library/jest-dom': summary('@testing-library/jest-dom', {
          score: 9,
        }),
      },
    }
    const matched = matchTechSignal(withTl, item({ name: 'Testing Library' }))
    expect(matched?.key).toBe('@testing-library/react')
    expect(matched?.repoCount).toBe(4)
  })
})

describe('buildSignalsBySlug', () => {
  it('keys summaries by item slug for matched items only', () => {
    const items = [
      item({ slug: 'next', name: 'Next.js' }),
      item({ slug: 'cobol', name: 'COBOL' }),
      item({ slug: 'pw', name: 'Playwright' }),
    ]
    const bySlug = buildSignalsBySlug(index, items)
    expect(Object.keys(bySlug).sort()).toEqual(['next', 'pw'])
    expect(bySlug.next.score).toBe(40)
  })

  it('returns an empty map when the scan is unconfigured', () => {
    expect(buildSignalsBySlug(null, [item({ name: 'Next.js' })])).toEqual({})
  })
})

const scanResult = (
  overrides: Partial<Awaited<ReturnType<typeof collectGithubTechSignals>>> = {},
): Awaited<ReturnType<typeof collectGithubTechSignals>> => ({
  ok: true,
  owner: 'brandonperfetti',
  scannedRepos: 12,
  signals: [
    { key: 'nextjs', score: 40, repos: new Set(['a', 'b']), reasons: ['pkg'] },
    { key: 'zod', score: 10, repos: new Set(['a']), reasons: ['pkg'] },
  ],
  errors: [],
  ...overrides,
})

describe('getTechSignalsIndex', () => {
  beforeEach(() => {
    draftModeState.isEnabled = false
    collectMock.mockReset()
    cacheScope.entries = 0
    cacheScope.tags = []
    cacheScope.profiles = []
    vi.stubEnv('GITHUB_OWNER', 'brandonperfetti')
    vi.stubEnv('GITHUB_TOKEN', 'token')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('caches the scan under the tech-signals tag and techSignals profile', async () => {
    collectMock.mockResolvedValue(scanResult())

    await getTechSignalsIndex()

    // The scan fn enters its `'use cache'` scope tagged `tech-signals` (no admin
    // hook purges it — the TTL is the only freshness driver) under the
    // `techSignals` cacheLife profile, whose 6h revalidate lives in next.config.
    expect(cacheScope.tags).toContain('tech-signals')
    expect(cacheScope.profiles).toContain('techSignals')
  })

  it('skips the scan entirely in draft mode', async () => {
    // Draft mode opts the request out of the data cache, so running the scan
    // here would mean a full live scan on every admin preview request.
    draftModeState.isEnabled = true
    collectMock.mockResolvedValue(scanResult())

    await expect(getTechSignalsIndex()).resolves.toBeNull()
    expect(collectMock).not.toHaveBeenCalled()
    expect(cacheScope.entries).toBe(0)
  })

  it('returns the normalized index outside draft mode', async () => {
    collectMock.mockResolvedValue(scanResult())

    const index = await getTechSignalsIndex()

    expect(collectMock).toHaveBeenCalledTimes(1)
    expect(cacheScope.entries).toBe(1)
    expect(index?.scannedRepos).toBe(12)
    expect(index?.byKey.nextjs).toMatchObject({
      repoCount: 2,
      score: 40,
      intensity: 1,
    })
    // Intensity is normalized against the strongest signal in the scan.
    expect(index?.byKey.zod.intensity).toBeCloseTo(0.25)
  })

  it('returns null without running the scan when unconfigured', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')

    await expect(getTechSignalsIndex()).resolves.toBeNull()
    expect(collectMock).not.toHaveBeenCalled()
    // The unconfigured short-circuit lives in the request-scoped wrapper,
    // *before* the cache scope, so a tokenless deployment (CI's production
    // build) renders /tech from fallback without even entering the cache scope.
    expect(cacheScope.entries).toBe(0)
  })

  it('does not enter the cache scope when GITHUB_OWNER is missing', async () => {
    vi.stubEnv('GITHUB_OWNER', '')

    await expect(getTechSignalsIndex()).resolves.toBeNull()
    expect(collectMock).not.toHaveBeenCalled()
    expect(cacheScope.entries).toBe(0)
  })

  it('degrades to null when the scan rejects', async () => {
    collectMock.mockRejectedValue(new Error('rate limited'))

    await expect(getTechSignalsIndex()).resolves.toBeNull()
  })

  it('caps a stalled scan and caches the badge-less result', async () => {
    vi.useFakeTimers()
    // A scan that never settles (wedged/rate-limited GitHub).
    collectMock.mockReturnValue(new Promise(() => {}))

    // Enter the cache scope via the public wrapper (config gate passes in
    // beforeEach): resolving to null *inside* the scope is what makes the
    // timeout cacheable for 6h instead of charging every visitor the full cap.
    const pending = getTechSignalsIndex()
    await vi.advanceTimersByTimeAsync(30_000)

    await expect(pending).resolves.toBeNull()
  })

  it('does not leave the timer pending once the scan wins the race', async () => {
    vi.useFakeTimers()
    collectMock.mockResolvedValue(scanResult())

    await expect(getTechSignalsIndex()).resolves.not.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('swallows a scan rejection that lands after the timeout', async () => {
    vi.useFakeTimers()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    let fail: (error: Error) => void = () => {}
    collectMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject
      }),
    )

    const pending = getTechSignalsIndex()
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(pending).resolves.toBeNull()

    fail(new Error('too late'))
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
