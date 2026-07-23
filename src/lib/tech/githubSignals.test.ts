import { describe, expect, it } from 'vitest'

import type { CmsEntityItem } from '@/lib/cms/types'
import {
  buildSignalsBySlug,
  matchTechSignal,
  type TechSignalsIndex,
  type TechSignalSummary,
} from './githubSignals'

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
