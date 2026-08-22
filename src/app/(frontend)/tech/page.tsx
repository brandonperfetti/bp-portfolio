import { NotFoundState } from '@/components/cms/NotFoundState'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'
import { ShareButton } from '@/components/cms/ShareButton'
import { SimpleLayout } from '@/components/SimpleLayout'
import { TechExplorer } from '@/components/tech/TechExplorer'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { resolvePageShareTargetIds } from '@/lib/cms/pageShareTargets'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { getCmsTech } from '@/lib/cms/techRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'
import {
  buildSignalsBySlug,
  getTechSignalsIndex,
} from '@/lib/tech/githubSignals'
import { type Metadata } from 'next'
import { Suspense } from 'react'

const defaultTechMeta: Metadata = {
  title: 'Tech',
  description:
    'Core technologies and tools I reach for when building products.',
}

function TechExplorerFallback() {
  return (
    <div className="rounded-2xl border border-zinc-100 p-4 text-sm text-zinc-500 dark:border-zinc-700/40 dark:text-zinc-400">
      Loading technology explorer...
    </div>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/tech')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultTechMeta.title),
    fallbackDescription: String(defaultTechMeta.description),
    path: '/tech',
  })
}

export default async function TechStack() {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/tech')
  const cmsTech = await getCmsTech()
  // Live GitHub signals (cached 6h); null when GITHUB_OWNER/TOKEN are unset,
  // when the scan times out, or in draft mode (which bypasses the cache and
  // would re-run the full scan per request) — the explorer then renders
  // without activity badges instead of failing or stalling.
  const signalsIndex = await getTechSignalsIndex()
  const items = cmsTech ?? []
  const signals = buildSignalsBySlug(signalsIndex, items)

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
  const shareTitle = page?.seoTitle || String(defaultTechMeta.title)

  // Structured data mirroring /articles and /projects (the pattern this page
  // was missing): CollectionPage + BreadcrumbList always, ItemList when there
  // is content. Tech entries have no detail routes, so list items are
  // name-only ListItems.
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page?.title || String(defaultTechMeta.title),
    description: page?.subtitle || String(defaultTechMeta.description),
    url: `${normalizedSiteUrl}/tech`,
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
        name: 'Tech',
        item: `${normalizedSiteUrl}/tech`,
      },
    ],
  }
  const itemListSchema = items.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: items.slice(0, 50).map((item, index) => ({
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
        title={page?.title || 'Core technologies I reach for first.'}
        intro={
          page?.subtitle ||
          'A practical stack for product delivery, engineering execution, and long-term maintainability.'
        }
        actions={
          shareTargetIds.length > 0 ? (
            <ShareButton
              url={`${normalizedSiteUrl}/tech`}
              title={shareTitle}
              targetIds={shareTargetIds}
            />
          ) : undefined
        }
      >
        {items.length ? (
          <Suspense fallback={<TechExplorerFallback />}>
            <TechExplorer items={items} signals={signals} />
          </Suspense>
        ) : (
          <NotFoundState
            title="Tech stack coming soon"
            description="I'm curating the tools and technologies I reach for. Check back shortly."
          />
        )}
        <CmsPageBlocks slug="tech" />
      </SimpleLayout>
    </>
  )
}
