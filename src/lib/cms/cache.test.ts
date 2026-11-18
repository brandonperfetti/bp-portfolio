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
      footer: 'global_footer', // src/lib/cms/footerRepo.ts
    })
  })

  it('has a footer tag again, now that the footer global has a cached reader (#363)', () => {
    // #104 removed a `revalidateGlobal('footer')` hook that purged a tag no
    // reader subscribed to, and pinned here that no such tag existed. #363
    // wired the footer to `getCmsFooterLinks`, which caches under this tag,
    // and restored the hook: `revalidateGlobal(slug)` purges `global_<slug>`,
    // so the value must stay exactly this. Reader and hook are compared
    // against each other in cacheTags.test.ts and Footer.test.ts.
    expect(CMS_TAGS.footer).toBe('global_footer')
  })

  it('redirects reader subscribes to the tag revalidateRedirects purges', () => {
    // Both sides now read this constant: src/hooks/revalidateRedirects.ts
    // purges CMS_TAGS.redirects (#133) and the #120 reader
    // (src/lib/cms/redirectsRepo.ts) caches under it. This test pins the VALUE
    // — the literal tag string those two share — which is what makes an
    // auto-created or hand-edited redirect resolve on the next request instead
    // of after the cmsContent TTL. That the two sides genuinely reference the
    // same constant is pinned in cacheTags.test.ts, which can see both.
    expect(CMS_TAGS.redirects).toBe('redirects')
  })

  it('search cache subscribes to the tag the Posts hooks actually purge', () => {
    // revalidatePost purges 'posts'; /api/search caches under
    // CMS_TAGS.articles. These being equal is what makes publishes reach
    // the command palette without waiting out the 1800s TTL.
    expect(CMS_TAGS.articles).toBe('posts')
  })
})
