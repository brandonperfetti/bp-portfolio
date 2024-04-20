'use client'
import { filterArticles } from '@/lib'
import { ArticleWithSlug } from '@/lib/articles'
import { useSearchParams } from 'next/navigation'
import ArticleCard from './ArticleCard'

interface FilterableArticlesProps {
  articles: ArticleWithSlug[]
}

export default function FilterableArticles({
  articles,
}: FilterableArticlesProps) {
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || ''
  const filteredArticles = filterArticles(articles, category)
  return (
    <div>
      <h2 className="text-3xl font-semibold text-slate-900 dark:text-white">
        {category.length > 0 ? category + ' Articles' : null}
      </h2>
      <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {filteredArticles.map((article: ArticleWithSlug) => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  )
}
