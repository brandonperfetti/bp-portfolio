import { type Metadata } from 'next'
import { Suspense } from 'react'

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import { SimpleLayout } from '@/components/SimpleLayout'
import { getAllArticles } from '@/lib/articles'

export const metadata: Metadata = {
  title: 'Articles',
  description:
    'All of my long-form thoughts on programming, leadership, product design, and more, collected in chronological order.',
}

export default async function ArticlesIndex() {
  const articles = await getAllArticles()

  return (
    <SimpleLayout
      title="Writing on mindset, software design, leadership, and product execution."
      intro="Browse by category or search by topic. These are practical notes from real projects, engineering leadership, and continuous learning."
    >
      <Suspense
        fallback={
          <div className="text-sm text-zinc-500">Loading articles...</div>
        }
      >
        <ArticlesExplorer articles={articles} />
      </Suspense>
    </SimpleLayout>
  )
}
