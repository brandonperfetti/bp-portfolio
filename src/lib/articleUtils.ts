import type { ArticleWithSlug } from '@/lib/articles'

/**
 * Removes duplicate article entries by slug while preserving original order.
 */
export function dedupeArticlesBySlug(
  articles: ArticleWithSlug[],
): ArticleWithSlug[] {
  const seen = new Set<string>()
  const deduped: ArticleWithSlug[] = []

  for (const article of articles) {
    if (!article.slug || seen.has(article.slug)) {
      if (!article.slug) {
        console.warn('[articles] skipping item with missing slug', {
          title: article.title,
          article,
        })
      }
      continue
    }
    seen.add(article.slug)
    deduped.push(article)
  }

  return deduped
}
