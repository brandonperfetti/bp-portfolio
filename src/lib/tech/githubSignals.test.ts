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
 * `unstable_cache` is replaced with a recording pass-through: the registry
 * captures the callback and its options so the tests can assert *where* a
 * value is produced (inside the cache scope = cached for 6h) as well as what
 * it is. Real cache storage isn't exercised — that's Next's job.
 */
const { cacheRegistry } = vi.hoisted(() => ({
  cacheRegistry: {
    entries: [] as Array<{
      keys: string[]
      options: { revalidate?: number; tags?: string[] }
      run: () => Promise<unknown>
      invocations: number
    }>,
  },
}))

vi.mock('next/cache', () => ({
  unstable_cache: (
    fn: () => Promise<unknown>,
    keys: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => {
    const entry = { keys, options, run: fn, invocations: 0 }
    cacheRegistry.entries.push(entry)
    return async () => {
      entry.invocations += 1
      return fn()
    }
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
    for (const entry of cacheRegistry.entries) {
      entry.invocations = 0
    }
    vi.stubEnv('GITHUB_OWNER', 'brandonperfetti')
    vi.stubEnv('GITHUB_TOKEN', 'token')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('registers the scan under a 6h revalidate and the tech-signals tag', () => {
    expect(cacheRegistry.entries).toHaveLength(1)
    expect(cacheRegistry.entries[0].keys).toEqual(['github-tech-signals'])
    expect(cacheRegistry.entries[0].options).toMatchObject({
      revalidate: 6 * 60 * 60,
      tags: ['tech-signals'],
    })
  })

  it('skips the scan entirely in draft mode', async () => {
    // Draft mode opts the request out of the data cache, so running the scan
    // here would mean a full live scan on every admin preview request.
    draftModeState.isEnabled = true
    collectMock.mockResolvedValue(scanResult())

    await expect(getTechSignalsIndex()).resolves.toBeNull()
    expect(collectMock).not.toHaveBeenCalled()
    expect(cacheRegistry.entries[0].invocations).toBe(0)
  })

  it('returns the normalized index outside draft mode', async () => {
    collectMock.mockResolvedValue(scanResult())

    const index = await getTechSignalsIndex()

    expect(collectMock).toHaveBeenCalledTimes(1)
    expect(cacheRegistry.entries[0].invocations).toBe(1)
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
  })

  it('degrades to null when the scan rejects', async () => {
    collectMock.mockRejectedValue(new Error('rate limited'))

    await expect(getTechSignalsIndex()).resolves.toBeNull()
  })

  it('caps a stalled scan and caches the badge-less result', async () => {
    vi.useFakeTimers()
    // A scan that never settles (wedged/rate-limited GitHub).
    collectMock.mockReturnValue(new Promise(() => {}))

    // Invoke the callback that was handed to unstable_cache: resolving to null
    // *inside* the cache scope is what makes the timeout cacheable for 6h
    // instead of charging every visitor the full cap.
    const pending = cacheRegistry.entries[0].run()
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

    const pending = cacheRegistry.entries[0].run()
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(pending).resolves.toBeNull()

    fail(new Error('too late'))
    await vi.advanceTimersByTimeAsync(0)
    await Promise.resolve()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
