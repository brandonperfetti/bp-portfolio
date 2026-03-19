import { type Metadata } from 'next'
import { Suspense } from 'react'

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import { NotFoundState } from '@/components/cms/NotFoundState'
import { SimpleLayout } from '@/components/SimpleLayout'
import { getSearchArticles } from '@/lib/articles'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'
import { toSafeJsonLd } from '@/lib/seo/jsonLd'
import { getSiteUrl } from '@/lib/site'

const defaultArticlesMeta: Metadata = {
  title: 'Articles',
  description:
    'All of my long-form thoughts on programming, leadership, product design, and more, collected in chronological order.',
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCmsSiteSettings()
  const page = await getCmsPageByPath('/articles')

  return buildPageMetadata({
    page,
    settings,
    fallbackTitle: String(defaultArticlesMeta.title),
    fallbackDescription: String(defaultArticlesMeta.description),
    path: '/articles',
  })
}

export default async function ArticlesIndex() {
  const siteUrl = getSiteUrl()
  const [settings, page, articles] = await Promise.all([
    getCmsSiteSettings(),
    getCmsPageByPath('/articles'),
    getSearchArticles(),
  ])
  const canonicalSiteUrl = settings.canonicalUrl || siteUrl
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page?.title || 'Articles',
    description: page?.subtitle || defaultArticlesMeta.description,
    url: `${canonicalSiteUrl}/articles`,
    isPartOf: {
      '@type': 'WebSite',
      url: canonicalSiteUrl,
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
        item: `${canonicalSiteUrl}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Articles',
        item: `${canonicalSiteUrl}/articles`,
      },
    ],
  }
  const hasArticles = articles.length > 0

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
      {hasArticles
        ? (() => {
            const itemListSchema = {
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              itemListElement: articles.slice(0, 50).map((article, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: `${canonicalSiteUrl}/articles/${article.slug}`,
                name: article.title,
              })),
            }

            return (
              <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                  __html: toSafeJsonLd(itemListSchema),
                }}
              />
            )
          })()
        : null}
      <SimpleLayout
        title={
          page?.title ||
          'Writing on mindset, software design, leadership, and product execution.'
        }
        intro={
          page?.subtitle ||
          'Browse by category or search by topic. These are practical notes from real projects, engineering leadership, and continuous learning.'
        }
      >
        {!hasArticles ? (
          <NotFoundState
            title="No published articles"
            description="No CMS article records are currently publish-safe."
          />
        ) : (
          <Suspense
            fallback={
              <div className="text-sm text-zinc-500">Loading articles...</div>
            }
          >
            <ArticlesExplorer articles={articles} />
          </Suspense>
        )}
      </SimpleLayout>
    </>
  )
}
