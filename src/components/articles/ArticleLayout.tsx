import {
  ArticleLayout as BaseArticleLayout,
  type ArticleLayoutArticle,
} from '@/components/ArticleLayout'

export default function ArticleLayout({
  article,
  children,
}: {
  article: ArticleLayoutArticle
  children: React.ReactNode
}) {
  return <BaseArticleLayout article={article}>{children}</BaseArticleLayout>
}
