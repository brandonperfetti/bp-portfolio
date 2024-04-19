import { FilterableArticles } from '@/components/FilterableArticles'
import { SimpleLayout } from '@/components/SimpleLayout'
import { getAllArticles } from '@/lib/articles'
import { Metadata } from 'next'

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
      <FilterableArticles articles={articles} />
    </SimpleLayout>
  )
}
