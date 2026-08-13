import { type Metadata } from 'next'
import { CmsPageBlocks } from '@/components/cms/CmsPageBlocks'

import { EntityGrid } from '@/components/cms/EntityGrid'
import { NotFoundState } from '@/components/cms/NotFoundState'
import { SimpleLayout } from '@/components/SimpleLayout'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsProjects } from '@/lib/cms/projectsRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'

const defaultProjectsMeta: Metadata = {
  title: 'Projects',
  description:
    'Selected products, platforms, and client builds I have shipped or led.',
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/projects')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultProjectsMeta.title),
    fallbackDescription: String(defaultProjectsMeta.description),
    path: '/projects',
  })
}

export default async function Projects() {
  const [settings, page, cmsProjects] = await Promise.all([
    getCmsSiteSettings(),
    getCmsPageByPath('/projects'),
    getCmsProjects(),
  ])
  const siteUrl = settings.canonicalUrl || getSiteUrl()
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')
  const items = cmsProjects ?? []
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page?.title || 'Projects',
    description: page?.subtitle || defaultProjectsMeta.description,
    url: `${normalizedSiteUrl}/projects`,
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
        name: 'Projects',
        item: `${normalizedSiteUrl}/projects`,
      },
    ],
  }
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: items.slice(0, 50).map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: item.link?.href || `${normalizedSiteUrl}/projects`,
    })),
  }

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
      {items.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toSafeJsonLd(itemListSchema) }}
        />
      ) : null}
      <SimpleLayout
        title={
          page?.title ||
          'Selected projects across product, engineering, and consulting work.'
        }
        intro={
          page?.subtitle ||
          'A practical mix of platform builds, client delivery, and product experiments.'
        }
      >
        {items.length ? (
          <EntityGrid items={items} />
        ) : (
          <NotFoundState
            title="Projects coming soon"
            description="I'm assembling a selection of products and builds to feature here. Check back shortly."
          />
        )}
        <CmsPageBlocks slug="projects" />
      </SimpleLayout>
    </>
  )
}
