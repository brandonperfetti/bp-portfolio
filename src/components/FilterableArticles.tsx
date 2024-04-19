'use client'
import { AppContext } from '@/app/providers'
import { ArticleWithSlug } from '@/lib/articles'
import { filterArticles } from '@/lib/filterArticles'
import { useSearchParams } from 'next/navigation'
import { useContext } from 'react'
import { ArticleCard } from './ArticleCard'

interface FilterableArticlesProps {
  articles: ArticleWithSlug[]
}

export function FilterableArticles({ articles }: FilterableArticlesProps) {
  const searchParams = useSearchParams()
  const category = searchParams.get('category') || ''
  // console.log('Category:', category)
  let { previousPathname } = useContext(AppContext)

  const filteredArticles = filterArticles(articles, category)
  // console.log('Filtered Articles:', filteredArticles.length)

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
