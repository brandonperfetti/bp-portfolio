import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Every "list everything" CMS read asks Payload for every row (#256).
 *
 * `limit: N` still caps a Payload `find` even with `pagination: false`; an
 * effective limit of `0` is the only unlimited form (`docs/PAYLOAD.md` § Local
 * API gotchas). A positive number on one of these reads is a ceiling that cuts
 * the list short with no error and no log: for `getPublishedPostSummaries` that
 * is the sitemap's article half. #220 fixed the same trap in
 * `getPublishedPagePaths`, pinned in `pagesRepo.draftSplit.test.ts`.
 *
 * Each case calls the real reader against a recording `find` fixture and pins
 * the collection's first read to `limit: 0` with `pagination: false`
 * (`pagination: false` also drops the `count(*)` a paginated read runs, which no
 * caller here reads).
 */
const { find } = vi.hoisted(() => ({ find: vi.fn() }))

vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({ find })),
}))
vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))
vi.mock('next/headers', () => ({
  draftMode: async () => ({ isEnabled: false }),
}))

import { getTopicSectionPaths } from '@/lib/cms/articlesRepo'
import { getCmsAuthors } from '@/lib/cms/authorsRepo'
import { getCmsProjects } from '@/lib/cms/projectsRepo'
import {
  getCmsRedirects,
  REDIRECT_SCALE_THRESHOLD,
} from '@/lib/cms/redirectsRepo'
import { getCmsTech } from '@/lib/cms/techRepo'
import { getCmsUses } from '@/lib/cms/usesRepo'
import { getCmsWorkHistory } from '@/lib/cms/workHistoryRepo'
import {
  getPublishedPostPaths,
  getPublishedPostSlugs,
  getPublishedPostSummaries,
  getPublishedPosts,
} from '@/lib/content/posts'

beforeEach(() => {
  find.mockReset()
  find.mockResolvedValue({ docs: [] })
})

const LIST_READS: ReadonlyArray<
  [name: string, collection: string, read: () => Promise<unknown>]
> = [
  [
    'getPublishedPostSummaries (sitemap articles)',
    'posts',
    getPublishedPostSummaries,
  ],
  ['getPublishedPosts (search index)', 'posts', getPublishedPosts],
  ['getPublishedPostSlugs', 'posts', getPublishedPostSlugs],
  ['getPublishedPostPaths', 'posts', getPublishedPostPaths],
  ['getTopicSectionPaths', 'categories', getTopicSectionPaths],
  ['getCmsRedirects', 'redirects', getCmsRedirects],
  ['getCmsAuthors', 'authors', getCmsAuthors],
  ['getCmsProjects', 'projects', getCmsProjects],
  ['getCmsTech', 'tech-stack', getCmsTech],
  ['getCmsUses', 'uses', getCmsUses],
  ['getCmsWorkHistory', 'work-history', getCmsWorkHistory],
]

describe('list-everything CMS reads are unbounded (#256)', () => {
  it.each(LIST_READS)(
    '%s reads every %s row — limit 0, never a numeric cap',
    async (_name, collection, read) => {
      await read()

      expect(find).toHaveBeenCalled()
      expect(find.mock.calls[0]![0]).toEqual(
        expect.objectContaining({ collection, limit: 0, pagination: false }),
      )
    },
  )

  it('hands the sitemap every published post past the old 1000 ceiling', async () => {
    // The fixture honours the cap the way the adapter does: a positive limit
    // slices, 0 returns everything. Under the old `limit: 1000` this returned
    // 1000 of 1001.
    const corpus = Array.from({ length: 1001 }, (_, i) => ({
      id: i + 1,
      slug: `post-${i + 1}`,
    }))
    find.mockImplementation(async ({ limit }: { limit: number }) => ({
      docs: limit > 0 ? corpus.slice(0, limit) : corpus,
    }))

    await expect(getPublishedPostSummaries()).resolves.toHaveLength(1001)
  })
})

describe('redirect table scale threshold (#256)', () => {
  const urlRows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      from: `/old-${i + 1}`,
      to: { type: 'custom', url: `/new-${i + 1}` },
      type: '301',
    }))

  it('keeps every row past the threshold and warns that a keyed lookup is due', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      find.mockResolvedValue({ docs: urlRows(REDIRECT_SCALE_THRESHOLD + 1) })

      const redirects = await getCmsRedirects()

      expect(redirects).toHaveLength(REDIRECT_SCALE_THRESHOLD + 1)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[redirects]'),
        {
          rows: REDIRECT_SCALE_THRESHOLD + 1,
          threshold: REDIRECT_SCALE_THRESHOLD,
        },
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('stays quiet at the threshold', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      find.mockResolvedValue({ docs: urlRows(REDIRECT_SCALE_THRESHOLD) })

      await expect(getCmsRedirects()).resolves.toHaveLength(
        REDIRECT_SCALE_THRESHOLD,
      )
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
