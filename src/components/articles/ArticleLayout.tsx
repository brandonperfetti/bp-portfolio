import { ArticleLayout as BaseArticleLayout } from '@/components/ArticleLayout'

interface Article {
  title: string
  description: string
  date: string
}

export default function ArticleLayout({
  article,
  children,
}: {
  article: Article
  children: React.ReactNode
}) {
  return (
    <BaseArticleLayout article={article as any}>{children}</BaseArticleLayout>
  )
}
