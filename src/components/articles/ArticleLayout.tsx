import {
  ArticleLayout as BaseArticleLayout,
  type ArticleLayoutArticle,
} from '@/components/ArticleLayout'

/**
 * Thin re-export wrapper kept so article pages/MDX can default-import the
 * layout from `components/articles` without knowing where the shared
 * implementation lives — all behavior is in `@/components/ArticleLayout`.
 */
export default function ArticleLayout({
  article,
  children,
}: {
  article: ArticleLayoutArticle
  children: React.ReactNode
}) {
  return <BaseArticleLayout article={article}>{children}</BaseArticleLayout>
}
