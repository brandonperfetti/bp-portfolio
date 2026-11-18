import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
import {
  type ConsentConfig,
  DEFAULT_CONSENT_CONFIG,
} from '@/components/consent/consent-content'
import { resolveConsentConfig } from '@/components/consent/resolve-consent-config'
import { CMS_TAGS } from '@/lib/cms/cache'
import type { CookieConsent } from '@/payload-types'

/**
 * Cookie-consent copy + category/feature model from the Payload
 * `cookie-consent` global, cached under `global_cookie-consent` and revalidated
 * by its afterChange hook.
 *
 * @remarks
 * Mirrors {@link getCmsSiteSettings} (`'use cache'` + `cacheTag` +
 * `cacheLife('cmsContent')` + `findGlobal`), plus the `pages` tag explained
 * below. The merge over
 * {@link DEFAULT_CONSENT_CONFIG} lives in the pure, unit-tested
 * {@link resolveConsentConfig}, so an empty/unseeded global renders today's copy
 * and UX verbatim (the Phase 0 "boots with only a database" invariant). Any read
 * failure — e.g. the `cookie-consent` table not yet migrated in a fresh
 * environment — falls back to the full defaults rather than throwing, keeping the
 * site behavior-preserving until the migration lands. `depth: 1` resolves the
 * optional privacy-policy page relation.
 *
 * `overrideAccess: false` (#262): the Local API defaults it to `true`, and
 * that default travels into relationship population. This reader runs with no
 * user, so with access enforced a privacy-policy relation to a page that was
 * never published stays an id and the dialog shows no link; left at the
 * default it was populated anyway, and every visitor got a link to the draft
 * page's path (a 404 that also disclosed its slug). Pinned by
 * `globalReaders.access.test.ts` and, against a real Payload, by
 * `evals/consent-privacy-page-access-integration.test.ts`.
 *
 * Also tagged `pages` (#262): whether the privacy-policy relation populates
 * depends on that page's publish state, and publishing or unpublishing a page
 * purges `pages`, not this global's tag. Without the second tag a relation set
 * while the page was a draft stayed cached as "no link" after the publish, for
 * up to the `cmsContent` lifetime. The cost is that a page publish, unpublish
 * or delete makes this one global read run again on its next request.
 *
 * `'use cache: remote'` so a `global_cookie-consent` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 */
export const getCmsConsentConfig = async (): Promise<ConsentConfig> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.consent, CMS_TAGS.pages)
  cacheLife('cmsContent')

  let global: CookieConsent | null = null
  try {
    const payload = await getPayload({ config: configPromise })
    global = await payload.findGlobal({
      slug: 'cookie-consent',
      depth: 1,
      overrideAccess: false,
    })
  } catch {
    return DEFAULT_CONSENT_CONFIG
  }

  return resolveConsentConfig(global)
}
