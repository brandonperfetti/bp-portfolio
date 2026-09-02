import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * Cache-tag invariant for the `'use cache'` reader layer (#76 B1).
 *
 * Every migrated repo function must call `cacheTag(<the CMS_TAGS string>)` +
 * `cacheLife('cmsContent')` at the top of its `'use cache'` body — the tag
 * string is what keeps the Payload `revalidateTag(tag, { expire: 0 })` hooks
 * purging the right cache, so an admin edit goes live in seconds. This pins each
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
  rec: {
    tags: [] as string[],
    profiles: [] as unknown[],
    purged: [] as string[],
  },
}))

vi.mock('next/cache', () => ({
  cacheTag: (...tags: string[]) => {
    rec.tags.push(...tags)
  },
  cacheLife: (profile: unknown) => {
    rec.profiles.push(profile)
  },
  // The write side of the same vocabulary: the revalidation hooks purge with
  // `revalidateTag`. Recording it here is what lets a test compare a purge
  // against the tag its reader actually subscribed to (#133).
  revalidateTag: (tag: string) => {
    rec.purged.push(tag)
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

import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { getCmsAuthors } from '@/lib/cms/authorsRepo'
import { getCmsConsentConfig } from '@/lib/cms/consentRepo'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import { getPageLayoutBySlug, getPostLayoutBySlug } from '@/lib/cms/layoutsRepo'
import { getCmsNavigation } from '@/lib/cms/navigationRepo'
import { getCmsPageByPath, getPublishedPagePaths } from '@/lib/cms/pagesRepo'
import { getCmsProjects } from '@/lib/cms/projectsRepo'
import { getCmsRedirects } from '@/lib/cms/redirectsRepo'
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
  { name: 'getCmsRedirects', tag: CMS_TAGS.redirects, call: getCmsRedirects },
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
    name: 'getPublishedPagePaths',
    tag: CMS_TAGS.pages,
    call: getPublishedPagePaths,
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
  {
    name: 'getCmsConsentConfig',
    tag: CMS_TAGS.consent,
    call: getCmsConsentConfig,
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

// Vitest runs with the repo root as its working directory (vitest.config.ts).
// Declared here because both source-scanning blocks below read from it.
const REPO_ROOT = process.cwd()

/**
 * Purge ↔ reader pairing for redirects (#133).
 *
 * The block above pins the READ side: `getCmsRedirects` caches under
 * `CMS_TAGS.redirects`. A tag only does work when the WRITE side names the same
 * string, so these two tests pin the pair itself:
 *
 * 1. a runtime comparison — whatever `revalidateRedirects` purges must be
 *    exactly what `getCmsRedirects` subscribed to in the same run. A hook that
 *    purges some other string fails here rather than in production, where the
 *    only symptom is an edited redirect resolving to its old destination until
 *    the `cmsContent` TTL lapses;
 * 2. a source pin — the hook must take that string FROM `CMS_TAGS`, not from a
 *    literal that happens to match today. This is the drift the issue is
 *    about: a literal in the hook survives a rename of `CMS_TAGS.redirects`
 *    unchanged, leaving the purge aimed at a tag nothing caches under (the
 *    #104 orphaned-purge pattern), and test 1 cannot see it because both sides
 *    still read `'redirects'`.
 *
 * The `{ expire: 0 }` profile is deliberately NOT asserted here — that is
 * #118's invariant and `src/hooks/revalidateRedirects.test.ts` owns it.
 */
describe('redirects purge ↔ reader tag pairing (#133)', () => {
  it('purges exactly the tag getCmsRedirects caches under', async () => {
    rec.tags = []
    rec.purged = []

    await getCmsRedirects().catch(() => {})
    const readerTags = [...rec.tags]

    revalidateRedirects({
      doc: { id: '1' },
      req: { payload: { logger: { info: vi.fn() } } },
    } as never)

    expect(readerTags).toEqual([CMS_TAGS.redirects])
    expect(rec.purged).toEqual(readerTags)
  })

  it('takes that tag from CMS_TAGS rather than a matching literal', () => {
    // Code lines only — the file's TSDoc quotes `revalidateTag(tag, …)` in
    // prose and a naive whole-file scan would pin the comment instead.
    const firstArguments = readFileSync(
      join(REPO_ROOT, 'src/hooks/revalidateRedirects.ts'),
      'utf8',
    )
      .split('\n')
      .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/.test(line))
      .flatMap((line) => {
        const call = /\brevalidateTag\(\s*([^,)]+)/.exec(line)
        return call ? [call[1].trim()] : []
      })

    expect(firstArguments).toEqual(['CMS_TAGS.redirects'])
  })
})

/**
 * Directive-kind invariant (#118).
 *
 * The tag vocabulary above says WHICH cache entry a purge targets. This block
 * pins WHICH CACHE TIER that entry lives in, which is what decides whether the
 * purge is even capable of reaching it:
 *
 * - plain `'use cache'` resolves to the built-in handler — a per-process
 *   in-memory LRU whose tag state is a module-level `Map`, so
 *   `revalidateTag(tag, { expire: 0 })` issued in the Payload admin's lambda
 *   purges that one instance and no other. That is the #118 root cause.
 * - `'use cache: remote'` resolves to the platform's shared handler (Vercel
 *   Runtime Cache), which every instance in the region reads and writes, so
 *   the same purge reaches the entry a different instance is serving from.
 *
 * Two reads deliberately stay on the in-memory tier because their payloads sit
 * at or over the Runtime Cache's 2 MB per-item ceiling — see the TSDoc at each
 * site for the measured sizes. Recording them here is the point: a future edit
 * cannot silently drop a repo back onto the broken tier, and cannot quietly
 * promote an oversized read onto a tier that would reject its writes.
 *
 * Source-scan rather than runtime, because the directive is erased by the time
 * the function runs, and because three of the converted scopes
 * (`getPublishedPostBySlug`, `getPublishedPageBySlug`, `isArticleScheduledFuture`)
 * are module-private and unreachable from a test import.
 */
const SRC_ROOT = join(REPO_ROOT, 'src')

/** `'use cache'` / `'use cache: remote'` on a line of its own — never in prose. */
const DIRECTIVE = /^\s*'use cache(?:: ?(\w+))?'$/
const DECLARATION = /(?:const|function)\s+([A-Za-z0-9_]+)/

type DirectiveKind = 'default' | 'remote'

function scanUseCacheDirectives(): Record<string, DirectiveKind> {
  const found: Record<string, DirectiveKind> = {}
  const entries = readdirSync(SRC_ROOT, {
    recursive: true,
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!/\.tsx?$/.test(entry.name)) continue
    if (/\.(test|stories)\.tsx?$/.test(entry.name)) continue

    const absolute = join(entry.parentPath, entry.name)
    const relative = absolute.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
    const lines = readFileSync(absolute, 'utf8').split('\n')

    lines.forEach((line, index) => {
      const directive = DIRECTIVE.exec(line)
      if (!directive) return
      let owner = '<unknown>'
      for (let i = index - 1; i >= 0; i--) {
        const declaration = DECLARATION.exec(lines[i])
        if (declaration) {
          owner = declaration[1]
          break
        }
      }
      found[`${relative}#${owner}`] = (directive[1] ??
        'default') as DirectiveKind
    })
  }

  return found
}

/**
 * Every `'use cache'` scope in `src/`, and the tier it must live on. Adding a
 * cached read means adding a line here — deliberately, with the 2 MB Runtime
 * Cache item ceiling in mind.
 */
const EXPECTED_DIRECTIVE_KINDS: Record<string, DirectiveKind> = {
  // The CMS reader layer: small, tag-purged, must cross instances (#118).
  'src/lib/cms/articlesRepo.ts#isArticleScheduledFuture': 'remote',
  'src/lib/cms/authorsRepo.ts#getCmsAuthors': 'remote',
  'src/lib/cms/consentRepo.ts#getCmsConsentConfig': 'remote',
  'src/lib/cms/identityRepo.ts#getCmsIdentity': 'remote',
  'src/lib/cms/layoutsRepo.ts#getPageLayoutBySlug': 'remote',
  'src/lib/cms/layoutsRepo.ts#getPostLayoutBySlug': 'remote',
  'src/lib/cms/navigationRepo.ts#getCmsNavigation': 'remote',
  'src/lib/cms/pagesRepo.ts#getCmsPageByPath': 'remote',
  'src/lib/cms/pagesRepo.ts#getPublishedPageByPath': 'remote',
  'src/lib/cms/pagesRepo.ts#getPublishedPagePaths': 'remote',
  'src/lib/cms/projectsRepo.ts#getCmsProjects': 'remote',
  'src/lib/cms/redirectsRepo.ts#getCmsRedirects': 'remote',
  'src/lib/cms/siteSettingsRepo.ts#getCmsSiteSettings': 'remote',
  'src/lib/cms/techRepo.ts#getCmsTech': 'remote',
  'src/lib/cms/usesRepo.ts#getCmsUses': 'remote',
  'src/lib/cms/workHistoryRepo.ts#getCmsWorkHistory': 'remote',
  'src/lib/content/posts.ts#getPublishedPostBySlug': 'remote',
  'src/lib/content/posts.ts#getPublishedPostSlugs': 'remote',
  'src/lib/content/posts.ts#getPublishedPostSummaries': 'remote',

  // Documented exceptions — oversized payloads that the 2 MB Runtime Cache
  // item ceiling excludes. They keep the in-memory tier and its instance-local
  // purge; shrinking the search-index read is what would let them convert.
  'src/lib/articles.ts#getSearchArticles': 'default',
  'src/lib/content/posts.ts#getPublishedPosts': 'default',
  'src/app/api/search/route.ts#getPersistedSearchPayload': 'default',

  // Not CMS reads: no admin purge exists for either, so TTL is already their
  // only freshness driver and the shared tier would buy nothing.
  'src/app/sitemap.ts#getSitemapData': 'default',
  'src/lib/tech/githubSignals.ts#getCachedTechSignalsIndex': 'default',
}

describe("'use cache' directive kind (#118)", () => {
  it('pins every cached scope to its intended cache tier', () => {
    expect(scanUseCacheDirectives()).toEqual(EXPECTED_DIRECTIVE_KINDS)
  })

  it('keeps every CMS repo read on the shared remote tier', () => {
    const onDefaultTier = Object.entries(scanUseCacheDirectives())
      .filter(([key]) => key.startsWith('src/lib/cms/'))
      .filter(([, kind]) => kind !== 'remote')

    expect(onDefaultTier).toEqual([])
  })
})
