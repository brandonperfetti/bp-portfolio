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
 * Mirrors {@link getCmsSiteSettings} exactly (`'use cache'` + `cacheTag` +
 * `cacheLife('cmsContent')` + `findGlobal`). The merge over
 * {@link DEFAULT_CONSENT_CONFIG} lives in the pure, unit-tested
 * {@link resolveConsentConfig}, so an empty/unseeded global renders today's copy
 * and UX verbatim (the Phase 0 "boots with only a database" invariant). Any read
 * failure — e.g. the `cookie-consent` table not yet migrated in a fresh
 * environment — falls back to the full defaults rather than throwing, keeping the
 * site behavior-preserving until the migration lands. `depth: 1` resolves the
 * optional privacy-policy page relation.
 *
 * `'use cache: remote'` so a `global_cookie-consent` tag purge reaches every
 * serverless instance, not only the one that ran the hook (#118).
 */
export const getCmsConsentConfig = async (): Promise<ConsentConfig> => {
  'use cache: remote'
  cacheTag(CMS_TAGS.consent)
  cacheLife('cmsContent')

  let global: CookieConsent | null = null
  try {
    const payload = await getPayload({ config: configPromise })
    global = await payload.findGlobal({ slug: 'cookie-consent', depth: 1 })
  } catch {
    return DEFAULT_CONSENT_CONFIG
  }

  return resolveConsentConfig(global)
}
