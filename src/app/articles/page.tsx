import { ArticleCard } from '@/components/ArticleCard'
import { FilterableArticles } from '@/components/FilterableArticles'
import { SimpleLayout } from '@/components/SimpleLayout'
import { getAllArticles } from '@/lib/articles'
import { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'Articles',
  description:
    'All of my long-form thoughts on programming, leadership, product design, and more, collected in chronological order.',
}

export default async function ArticlesIndex() {
  let articles = await getAllArticles()

  return (
    <SimpleLayout
      title="Writing on mindset, software design, company building, and the tech industry."
      intro="All of my long-form thoughts on mindset, programming, leadership, product design, and more, collected in chronological order."
    >
      <Suspense fallback={<div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </div>}>
      <FilterableArticles articles={articles} />
      </Suspense>
    </SimpleLayout>
  )
}
