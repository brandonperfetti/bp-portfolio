import { type Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { RenderRhythmPage } from '@/heros/RenderRhythmPage'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import { getCmsPageByPath, getPageBySlugDraftAware } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { buildPersonSchema, buildWebsiteSchema } from '@/lib/seo/structuredData'
import { getSiteUrl } from '@/lib/site'

/** Pages collection slug that renders at `/`. */
const HOME_SLUG = 'home'

const defaultHomeMeta = {
  title: 'Home',
  description:
    'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.',
}

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryHomePage = cache(getPageBySlugDraftAware)

/**
 * The site home (`/`). Renders the Payload `home` document through the shared
 * page-builder seam ({@link RenderRhythmPage}) — the same renderer the `[slug]`
 * catch-all uses — so the fully admin-composed home layout renders here
 * identically to any builder page, honoring the home doc's `homeParity` rhythm.
 *
 * @remarks Home keeps its dedicated route (not `/[slug]`) for two reasons: the
 * site Header renders its tall home variant only at pathname `/`
 * (`isHomePage = usePathname() === '/'`), and `/` carries site-level WebSite +
 * Person JSON-LD that the generic builder route does not emit.
 *
 * Draft-aware: published visitors see the published doc; the admin draft
 * preview (`/?draft=true`) sees the newest draft, via the same
 * `getPageBySlugDraftAware` gate the `[slug]` route uses.
 */
export default async function Home() {
  const siteUrl = getSiteUrl()
  const settings = await getCmsSiteSettings()
  const canonicalSiteUrl = (settings.canonicalUrl || siteUrl).replace(
    /\/+$/,
    '',
  )

  const page = await queryHomePage(HOME_SLUG)
  if (!page) {
    // The home doc is a seeded, required document; a missing one is a broken
    // deploy, not a content state. Surface it loudly rather than rendering a
    // blank `/`. The orchestrator composes/publishes this doc before the
    // production merge, so this branch never fires in normal operation.
    notFound()
  }

  const websiteSchema = buildWebsiteSchema(
    settings.siteName,
    settings.siteDescription,
    canonicalSiteUrl,
  )
  const personSchema = buildPersonSchema(
    canonicalSiteUrl,
    await getCmsIdentity(),
  )

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(personSchema) }}
      />
      <RenderRhythmPage page={page} />
    </>
  )
}

/**
 * Metadata for `/`, built from the `home` document (title, description, social
 * image) with hard-coded fallbacks so `/` renders correctly before the doc is
 * ever saved.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: defaultHomeMeta.title,
    fallbackDescription: defaultHomeMeta.description,
    path: '/',
  })
}
