import { describe, expect, it } from 'vitest'

import { CMS_TAGS } from '@/lib/cms/cache'

/**
 * Tag-vocabulary invariant (fresh-eyes review 2026-08, finding M3).
 *
 * `CMS_TAGS` values must be the LITERAL tag strings the repo modules cache
 * under — a parallel namespace here once left the search index unpurged by
 * edits and made the manual revalidate endpoint's defaults a no-op. If a
 * repo's tag changes, change it here in the same commit (and vice versa);
 * this test exists to force that conversation.
 */
describe('CMS_TAGS vocabulary', () => {
  it('matches the literal tags the repos cache under', () => {
    expect(CMS_TAGS).toEqual({
      articles: 'posts', // src/lib/content/posts.ts, CmsPostBlocks
      authors: 'authors', // src/lib/cms/authorsRepo.ts
      projects: 'projects', // src/lib/cms/projectsRepo.ts
      tech: 'tech-stack', // src/lib/cms/techRepo.ts
      uses: 'uses', // src/lib/cms/usesRepo.ts
      workHistory: 'work-history', // src/lib/cms/workHistoryRepo.ts
      pages: 'pages', // src/lib/cms/pagesRepo.ts, CmsPageBlocks
      redirects: 'redirects', // src/lib/cms/redirectsRepo.ts
      settings: 'global_site-settings', // src/lib/cms/siteSettingsRepo.ts
      navigation: 'global_navigation', // src/lib/cms/navigationRepo.ts
      identity: 'global_identity', // src/lib/cms/identityRepo.ts
      consent: 'global_cookie-consent', // src/lib/cms/consentRepo.ts
    })
  })

  it('has no dead footer tag (#104): the footer global carries no cached reader', () => {
    // src/components/Footer.tsx renders the static nav fallback and nothing
    // reads the `footer` global via a cached reader, so no tag caches under
    // `global_footer`. The dead `revalidateGlobal('footer')` hook was removed
    // in src/globals/Footer.ts; if the footer is ever wired to a cached reader,
    // add `footer: 'global_footer'` here and restore the hook.
    expect('footer' in CMS_TAGS).toBe(false)
  })

  it('redirects reader subscribes to the tag revalidateRedirects purges', () => {
    // src/hooks/revalidateRedirects.ts purges the literal 'redirects'; the
    // #120 reader (src/lib/cms/redirectsRepo.ts) caches under
    // CMS_TAGS.redirects. Equal strings are what makes an auto-created or
    // hand-edited redirect resolve on the next request instead of after the
    // cmsContent TTL.
    expect(CMS_TAGS.redirects).toBe('redirects')
  })

  it('search cache subscribes to the tag the Posts hooks actually purge', () => {
    // revalidatePost purges 'posts'; /api/search caches under
    // CMS_TAGS.articles. These being equal is what makes publishes reach
    // the command palette without waiting out the 1800s TTL.
    expect(CMS_TAGS.articles).toBe('posts')
  })
})
