import { flattenBlockText } from '@/lib/content/flattenBlockText'
import type { CmsArticleDetail, CmsArticleSummary } from '@/lib/cms/types'
import { getPostBySlug, getPublishedPosts } from '@/lib/content/posts'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import { canAccess } from '@/access/canAccess'
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
  /** True when the body was withheld because the viewer lacks access (§12). */
  gated?: boolean
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

/**
 * One published article (or admin draft preview) with converted body blocks.
 *
 * @remarks Gating (§12) is enforced HERE, at the data layer: when the post is
 * gated and the viewer is not authenticated, `bodyBlocks` is empty and
 * `gated: true` — the full body never enters the RSC payload for anonymous
 * visitors. Callers render a teaser + sign-in prompt off the `gated` flag.
 */
export async function getCmsArticleBySlug(
  slug: string,
  viewer?: { isAuthenticated: boolean },
): Promise<CmsArticleDetailResult | null> {
  const post = await getPostBySlug(slug)
  if (!post) return null
  const allowed = canAccess(viewer?.isAuthenticated ?? false, post)
  const bodyBlocks = allowed ? lexicalToBlocks(post.content) : []
  return {
    ...toSummary(post),
    bodyBlocks,
    excerpt: post.excerpt || undefined,
    searchText: allowed ? flattenBlockText(bodyBlocks) : '',
    gated: !allowed,
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
