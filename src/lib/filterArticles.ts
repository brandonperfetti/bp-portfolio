import { ArticleWithSlug } from './articles';

export default function filterArticles(articles: ArticleWithSlug[], category: string | string[] | undefined): ArticleWithSlug[] {
  if (!category) return articles;  // Return all articles if no category is specified

  // Normalize and filter articles based on category
  const normalizedCategory = typeof category === 'string' ? category.toLowerCase().replace(/\s+/g, '') : '';
  return articles.filter(article =>
    article.category?.title.toLowerCase().replace(/\s+/g, '') === normalizedCategory
  );
}