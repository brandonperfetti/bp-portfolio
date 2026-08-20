import { type Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'

import { ShareButton } from '@/components/cms/ShareButton'
import { RenderRhythmPage } from '@/heros/RenderRhythmPage'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsIdentity } from '@/lib/cms/identityRepo'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import { getCmsPageByPath, getPageBySlugDraftAware } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { buildPersonSchema } from '@/lib/seo/structuredData'
import { getSiteUrl } from '@/lib/site'

/** Pages collection slug that renders at `/about`. */
const ABOUT_SLUG = 'about'

const defaultAboutMeta = {
  title: 'About',
  description:
    'Brandon Perfetti is a product and project leader plus software engineer based in Orange County, California.',
}

/** Request-deduped wrapper over the repo's draft-aware page query. */
const queryAboutPage = cache(getPageBySlugDraftAware)

/**
 * The About page (`/about`, the #44 flip). Renders the Payload `about`
 * document through the shared page-builder seam ({@link RenderRhythmPage}) —
 * the same renderer the `/` home flip (#42) and the `[slug]` catch-all use — so
 * the fully admin-composed About layout renders here identically to any builder
 * page. Its H1 lives in an in-column `heading` block, so the doc's hero is
 * `type: blank` (renders no `<header>`); About must not draw a shader hero.
 *
 * @remarks About keeps its dedicated route (not `/[slug]`) because `/about`
 * carries page-specific AboutPage + Person + Breadcrumb JSON-LD that the
 * generic builder route does not emit. Its slug already equals its path, so —
 * unlike Home's `/home` → `/` — no redirect is needed: the static `about`
 * segment always shadows the `[slug]` catch-all, and `about` stays in
 * `RESERVED_PAGE_SLUGS` so `/about` is served exactly once (see `pagesRepo.ts`).
 *
 * Draft-aware: published visitors see the published doc; the admin draft
 * preview (`/about?draft=true`) sees the newest draft, via the same
 * `getPageBySlugDraftAware` gate the `[slug]` route uses.
 */
export default async function About() {
  const settings = await getCmsSiteSettings()
  const baseUrl = settings.canonicalUrl || getSiteUrl()
  const normalizedSiteUrl = baseUrl.replace(/\/+$/, '')

  const page = await queryAboutPage(ABOUT_SLUG)
  if (!page) {
    // The about doc is a seeded, required document; a missing one is a broken
    // deploy, not a content state. Surface it loudly rather than rendering a
    // blank `/about`. The orchestrator composes/publishes this doc before the
    // production merge, so this branch never fires in normal operation.
    notFound()
  }

  const aboutPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: page.title || defaultAboutMeta.title,
    description: page.subtitle || defaultAboutMeta.description,
    url: `${normalizedSiteUrl}/about`,
    isPartOf: {
      '@type': 'WebSite',
      name: settings.siteName,
      url: normalizedSiteUrl,
    },
  }
  const personSchema = buildPersonSchema(
    normalizedSiteUrl,
    await getCmsIdentity(),
  )
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${normalizedSiteUrl}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'About',
        item: `${normalizedSiteUrl}/about`,
      },
    ],
  }

  // Page actions row (top-right, above the hero). Share only when the resolved
  // (global ± per-page) target set is non-empty; the per-page `disableSharing`
  // kill switch collapses it to []. Resolved server-side; `ShareButton` — the
  // sole client boundary — receives only serializable props.
  const shareTargetIds = resolvePageShareTargetIds(page, settings.shareTargets)
  const pageTitle = page.meta?.title || page.title

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(aboutPageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(personSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(breadcrumbSchema) }}
      />
      <RenderRhythmPage
        page={page}
        actions={
          shareTargetIds.length > 0 ? (
            <ShareButton
              url={`${normalizedSiteUrl}/about`}
              title={pageTitle}
              targetIds={shareTargetIds}
            />
          ) : undefined
        }
      />
    </>
  )
}

/**
 * Metadata for `/about`, built from the `about` document (title, description,
 * social image) with hard-coded fallbacks so `/about` renders correct metadata
 * before the doc is ever saved.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/about')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: defaultAboutMeta.title,
    fallbackDescription: defaultAboutMeta.description,
    path: '/about',
  })
}
