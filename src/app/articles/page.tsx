import { type Metadata } from 'next'

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import { NotFoundState } from '@/components/cms/NotFoundState'
import { SimpleLayout } from '@/components/SimpleLayout'
import { getSearchArticles } from '@/lib/articles'
import { buildPageMetadata } from '@/lib/cms/pageMetadata'
import { getCmsPageByPath } from '@/lib/cms/pagesRepo'
import { getCmsSiteSettings } from '@/lib/cms/siteSettingsRepo'

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
  const articles = await getSearchArticles()

  return (
    <SimpleLayout
      title="Writing on mindset, software design, leadership, and product execution."
      intro="Browse by category or search by topic. These are practical notes from real projects, engineering leadership, and continuous learning."
    >
      {articles.length === 0 ? (
        <NotFoundState
          title="No published articles"
          description="No CMS article records are currently publish-safe."
        />
      ) : (
        <ArticlesExplorer articles={articles} />
      )}
    </SimpleLayout>
  )
}
