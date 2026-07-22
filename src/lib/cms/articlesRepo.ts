import { flattenBlockText } from '@/lib/cms/notion/blocks'
import type { CmsArticleDetail, CmsArticleSummary } from '@/lib/cms/types'
import { getPostBySlug, getPublishedPosts } from '@/lib/content/posts'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import type { Media, Post, User } from '@/payload-types'

/**
 * Article repository backed by the Payload Local API (was Notion in v3).
 *
 * @remarks Keeps the v3 `CmsArticleSummary`/`CmsArticleDetail` shapes so the
 * retained pages, RSS, llms.txt, and search consumers work unchanged. Only
 * published posts are exposed here; drafts render solely through the
 * authenticated admin preview flow.
 */

export type CmsArticleDetailResult = CmsArticleDetail & {
  sourceType: 'local' | 'notion'
}

const mediaUrl = (media: Post['heroImage']): string | undefined => {
  if (!media || typeof media !== 'object') return undefined
  return (media as Media).url || undefined
}

const termTitles = (terms: Post['categories'] | Post['tags']): string[] =>
  (terms ?? [])
    .map((t) => (typeof t === 'object' && t !== null ? t.title : null))
    .filter((t): t is string => Boolean(t))

const authorName = (post: Post): string => {
  const first =
    post.populatedAuthors?.[0]?.name ||
    (post.authors?.[0] as User | undefined)?.name
  return first || 'Brandon Perfetti'
}

const toSummary = (post: Post): CmsArticleSummary => {
  const topics = termTitles(post.categories)
  const tech = termTitles(post.tags)
  return {
    slug: post.slug || '',
    title: post.title,
    description: post.excerpt || post.meta?.description || '',
    seoTitle: post.meta?.title || undefined,
    seoDescription: post.meta?.description || undefined,
    date: post.publishedAt || post.createdAt,
    updatedAt: post.updatedAt,
    image: mediaUrl(post.heroImage) || mediaUrl(post.meta?.image ?? null),
    author: authorName(post),
    category: topics[0] ? { title: topics[0] } : undefined,
    keywords: [...topics, ...tech],
    topics,
    tech,
    sourceType: 'local',
  }
}

/** All published articles as v3-shaped summaries, newest first. */
export async function getAllCmsArticleSummaries(): Promise<
  CmsArticleSummary[]
> {
  const posts = await getPublishedPosts()
  return posts.filter((p) => Boolean(p.slug)).map(toSummary)
}

/** One published article (or admin draft preview) with converted body blocks. */
export async function getCmsArticleBySlug(
  slug: string,
): Promise<CmsArticleDetailResult | null> {
  const post = await getPostBySlug(slug)
  if (!post) return null
  const bodyBlocks = lexicalToBlocks(post.content)
  return {
    ...toSummary(post),
    bodyBlocks,
    excerpt: post.excerpt || undefined,
    searchText: flattenBlockText(bodyBlocks),
  }
}

/** Summaries enriched with flattened body text for the search index. */
export async function getCmsSearchArticles(): Promise<
  Array<CmsArticleSummary & { searchText: string }>
> {
  const posts = await getPublishedPosts()
  return posts
    .filter((p) => Boolean(p.slug))
    .map((post) => ({
      ...toSummary(post),
      searchText: flattenBlockText(lexicalToBlocks(post.content)),
    }))
}
