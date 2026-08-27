import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * Cache-tag invariant for the `'use cache'` reader layer (#76 B1).
 *
 * Every migrated repo function must call `cacheTag(<the CMS_TAGS string>)` +
 * `cacheLife('cmsContent')` at the top of its `'use cache'` body — the tag
 * string is what keeps the Payload `revalidateTag(tag, 'max')` hooks purging
 * the right cache, so an admin edit still goes live in seconds. This pins each
 * function's tag to the exact `CMS_TAGS` value: if a repo's tag drifts from the
 * vocabulary, this test fails (and so would revalidation, silently, in prod).
 *
 * `cacheTag`/`cacheLife` are recorded (not executed) because there is no Next
 * request/cache scope under Vitest. `cacheTag` runs before any DB access in the
 * converted functions, so the tag is captured even though `getPayload` is a
 * fixture. The `tech-signals` tag + `techSignals` profile are pinned separately
 * in githubSignals.test.ts (its scan fn is module-private); the `/api/search`
 * route's `'use cache'` tags `CMS_TAGS.articles` too (also module-private —
 * verified by source read).
 */
const { rec } = vi.hoisted(() => ({
  rec: { tags: [] as string[], profiles: [] as unknown[] },
}))

vi.mock('next/cache', () => ({
  cacheTag: (...tags: string[]) => {
    rec.tags.push(...tags)
  },
  cacheLife: (profile: unknown) => {
    rec.profiles.push(profile)
  },
}))

// Payload Local API fixture: empty collection reads and empty globals. The repo
// mappers all tolerate empty results (they fall back to defaults or null), so
// each function runs its cacheTag/cacheLife prologue and returns without a DB.
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => ({
    find: vi.fn(async () => ({ docs: [] })),
    findGlobal: vi.fn(async () => ({})),
  })),
}))

import { getCmsAuthors } from '@/lib/cms/authorsRepo'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import { getPageLayoutBySlug, getPostLayoutBySlug } from '@/lib/cms/layoutsRepo'
import { getCmsNavigation } from '@/lib/cms/navigationRepo'
import { getCmsPageByPath, getPublishedPageSlugs } from '@/lib/cms/pagesRepo'
import { getCmsProjects } from '@/lib/cms/projectsRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getCmsTech } from '@/lib/cms/techRepo'
import { getCmsUses } from '@/lib/cms/usesRepo'
import { getCmsWorkHistory } from '@/lib/cms/workHistoryRepo'
import {
  getPublishedPostSlugs,
  getPublishedPostSummaries,
  getPublishedPosts,
} from '@/lib/content/posts'

const cases: Array<{
  name: string
  tag: string
  call: () => Promise<unknown>
}> = [
  {
    name: 'getCmsSiteSettings',
    tag: CMS_TAGS.settings,
    call: getCmsSiteSettings,
  },
  { name: 'getCmsIdentity', tag: CMS_TAGS.identity, call: getCmsIdentity },
  {
    name: 'getCmsNavigation',
    tag: CMS_TAGS.navigation,
    call: getCmsNavigation,
  },
  { name: 'getCmsProjects', tag: CMS_TAGS.projects, call: getCmsProjects },
  { name: 'getCmsTech', tag: CMS_TAGS.tech, call: getCmsTech },
  { name: 'getCmsUses', tag: CMS_TAGS.uses, call: getCmsUses },
  {
    name: 'getCmsWorkHistory',
    tag: CMS_TAGS.workHistory,
    call: getCmsWorkHistory,
  },
  { name: 'getCmsAuthors', tag: CMS_TAGS.authors, call: getCmsAuthors },
  {
    name: 'getCmsPageByPath',
    tag: CMS_TAGS.pages,
    call: () => getCmsPageByPath('/x'),
  },
  {
    name: 'getPublishedPageSlugs',
    tag: CMS_TAGS.pages,
    call: getPublishedPageSlugs,
  },
  {
    name: 'getPageLayoutBySlug',
    tag: CMS_TAGS.pages,
    call: () => getPageLayoutBySlug('x'),
  },
  {
    name: 'getPostLayoutBySlug',
    tag: CMS_TAGS.articles,
    call: () => getPostLayoutBySlug('x'),
  },
  {
    name: 'getPublishedPostSummaries',
    tag: CMS_TAGS.articles,
    call: getPublishedPostSummaries,
  },
  {
    name: 'getPublishedPosts',
    tag: CMS_TAGS.articles,
    call: getPublishedPosts,
  },
  {
    name: 'getPublishedPostSlugs',
    tag: CMS_TAGS.articles,
    call: getPublishedPostSlugs,
  },
]

describe('CMS repo cacheTag / cacheLife wiring', () => {
  beforeEach(() => {
    rec.tags = []
    rec.profiles = []
  })

  for (const { name, tag, call } of cases) {
    it(`${name} caches under '${tag}' with the cmsContent profile`, async () => {
      await call().catch(() => {})
      expect(rec.tags).toContain(tag)
      expect(rec.profiles).toContain('cmsContent')
    })
  }
})
