import { type Metadata } from 'next'
import { Suspense } from 'react'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'

import { NotFoundState } from '@/components/cms/NotFoundState'
import { ShareButton } from '@/components/cms/ShareButton'
import { SimpleLayout } from '@/components/SimpleLayout'
import { UsesSections } from '@/components/uses/UsesSections'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getCmsUses } from '@/lib/cms/usesRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'

const defaultUsesMeta: Metadata = {
  title: 'Uses',
  description: 'Software, hardware, and tools I use to plan, build, and ship.',
}

/**
 * Static placeholder while the `?page`-aware uses list hydrates.
 *
 * @returns The prerendered fallback for the `UsesSections` Suspense boundary.
 */
function UsesSectionsFallback() {
  return (
    <div className="text-sm text-zinc-500 dark:text-zinc-400">
      Loading uses...
    </div>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/uses')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultUsesMeta.title),
    fallbackDescription: String(defaultUsesMeta.description),
    path: '/uses',
  })
}

export default async function Uses() {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/uses')
  const cmsUses = await getCmsUses()
  const title = page?.title || String(defaultUsesMeta.title)
  const intro = page?.subtitle || String(defaultUsesMeta.description)
  const sections = cmsUses ?? []

  const normalizedSiteUrl = (settings.canonicalUrl || getSiteUrl()).replace(
    /\/+$/,
    '',
  )
  // Reader Share control, right-aligned below the hero. Resolved server-side
  // (global ± per-page targets); the per-page `disableSharing` kill switch
  // collapses it to [], which hides the button. `ShareButton` — the sole
  // client boundary — receives only serializable props.
  const shareTargetIds = resolvePageShareTargetIds(
    page ?? {},
    settings.shareTargets,
  )
  const shareTitle = page?.seoTitle || String(defaultUsesMeta.title)

  // Structured data mirroring /articles and /projects (the pattern this page
  // was missing): CollectionPage + BreadcrumbList always, ItemList when there
  // is content. Uses entries have no detail routes, so list items are
  // name-only ListItems, flattened across the CMS sections in display order.
  const flatItems = sections.flatMap((section) => section.items)
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description: intro,
    url: `${normalizedSiteUrl}/uses`,
    isPartOf: {
      '@type': 'WebSite',
      url: normalizedSiteUrl,
      name: settings.siteName,
    },
  }
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
        name: 'Uses',
        item: `${normalizedSiteUrl}/uses`,
      },
    ],
  }
  const itemListSchema = flatItems.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: flatItems.slice(0, 50).map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
        })),
      }
    : null

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(collectionSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toSafeJsonLd(breadcrumbSchema) }}
      />
      {itemListSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toSafeJsonLd(itemListSchema) }}
        />
      ) : null}
      <SimpleLayout
        title={title}
        intro={intro}
        actions={
          shareTargetIds.length > 0 ? (
            <ShareButton
              url={`${normalizedSiteUrl}/uses`}
              title={shareTitle}
              targetIds={shareTargetIds}
            />
          ) : undefined
        }
      >
        <div className="space-y-20">
          {sections.length ? (
            // `UsesSections` is the sole client boundary here: it reads the
            // shared `?page` param (#88) with `useSearchParams`, so it renders
            // under `<Suspense>` and this route stays statically rendered — no
            // server-side `searchParams` read is introduced.
            <Suspense fallback={<UsesSectionsFallback />}>
              <UsesSections sections={sections} />
            </Suspense>
          ) : (
            <NotFoundState
              title="Uses list coming soon"
              description="I'm putting together the gear, apps, and tools I use day to day. Check back shortly."
            />
          )}
        </div>
        <CmsPageBlocks slug="uses" />
      </SimpleLayout>
    </>
  )
}
