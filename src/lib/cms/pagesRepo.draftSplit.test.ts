import { beforeEach, describe, expect, it, vi } from 'vitest'

// #76 B2 draft-split: getPageBySlugDraftAware selects a cached published read
// (draft:false → static prerender) vs an uncached draft read (draft:true),
// keyed on draftMode(). Payload + the `'use cache'` primitives are stubbed so
// the selector's branch + the find args are asserted against fixtures.
const find = vi.fn()
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))
vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))
const { draftState } = vi.hoisted(() => ({ draftState: { isEnabled: false } }))
vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: draftState.isEnabled }),
}))

import {
  getPageByPathDraftAware,
  getPageBySlugDraftAware,
  getPublishedPagePaths,
  isReservedPagePath,
  pathSegments,
} from '@/lib/cms/pagesRepo'

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [] })
  draftState.isEnabled = false
})

describe('getPageBySlugDraftAware draft-split (#76 B2)', () => {
  it('published visitors + the build take the cached published read (draft:false)', async () => {
    draftState.isEnabled = false
    await getPageBySlugDraftAware('about')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        draft: false,
        overrideAccess: false,
        where: { path: { equals: 'about' } },
      }),
    )
  })

  it('admin draft preview takes the uncached draft read (draft:true, overrideAccess:true)', async () => {
    draftState.isEnabled = true
    await getPageBySlugDraftAware('about')
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        draft: true,
        overrideAccess: true,
        where: { path: { equals: 'about' } },
      }),
    )
  })

  it('resolves a nested page on the full path, in ONE indexed equality read', async () => {
    // Never a per-request ancestor walk: at depth 3 that would be three
    // sequential round trips on a route that is supposed to prerender.
    await getPageByPathDraftAware('work/brytecore')
    expect(find).toHaveBeenCalledTimes(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        draft: false,
        where: { path: { equals: 'work/brytecore' } },
      }),
    )
  })

  it('returns the first matching doc, or null when none match', async () => {
    find.mockResolvedValue({ docs: [{ id: 7, slug: 'about' }] })
    await expect(getPageBySlugDraftAware('about')).resolves.toMatchObject({
      id: 7,
    })
    find.mockResolvedValue({ docs: [] })
    await expect(getPageBySlugDraftAware('about')).resolves.toBeNull()
  })
})

describe('getPublishedPagePaths (#148)', () => {
  it('selects paths, excludes the root and reserved single-segment paths, keeps their children', async () => {
    find.mockResolvedValue({
      docs: [
        { path: 'home', slug: 'home' },
        { path: 'about', slug: 'about' },
        { path: 'tech', slug: 'tech' },
        { path: 'tech/ai', slug: 'ai' },
        { path: 'work', slug: 'work' },
        { path: 'work/brytecore', slug: 'brytecore' },
        { path: null, slug: 'pre-migration' },
      ],
    })

    await expect(getPublishedPagePaths()).resolves.toEqual([
      'tech/ai',
      'work',
      'work/brytecore',
      'pre-migration',
    ])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'pages',
        select: { path: true, slug: true },
        where: { _status: { equals: 'published' } },
      }),
    )
  })
})

describe('isReservedPagePath (#148)', () => {
  it('reserves a one-segment dedicated route and nothing beneath it', () => {
    expect(isReservedPagePath(['tech'])).toBe(true)
    expect(isReservedPagePath(['about'])).toBe(true)
    expect(isReservedPagePath(['tech', 'ai'])).toBe(false)
    expect(isReservedPagePath(['work', 'brytecore'])).toBe(false)
    expect(isReservedPagePath(['colophon'])).toBe(false)
    expect(isReservedPagePath([])).toBe(false)
  })
})

describe('pathSegments', () => {
  it('drops the empty strings a leading or trailing slash produces', () => {
    expect(pathSegments('/tech/ai')).toEqual(['tech', 'ai'])
    expect(pathSegments('tech/ai/')).toEqual(['tech', 'ai'])
    expect(pathSegments('/')).toEqual([])
  })
})
