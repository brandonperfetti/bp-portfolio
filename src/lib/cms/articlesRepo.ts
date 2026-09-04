import { cacheLife, cacheTag } from 'next/cache'

import { flattenBlockText } from '@/lib/content/flattenBlockText'
import { CMS_TAGS } from '@/lib/cms/cache'
import { isFuturePublicationDate } from '@/lib/date'
import type {
  CmsArticleDetail,
  CmsArticleSummary,
  CmsAuthor,
  CmsProvider,
} from '@/lib/cms/types'
import {
  getGatedPostContent,
  getPostByPath,
  getPostBySlug,
  getPublishedPostSummaries,
  getPublishedPosts,
  type PublishedPostSummary,
} from '@/lib/content/posts'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'
import { canAccess } from '@/access/canAccess'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import {
  resolveShareTargetIds,
  type ShareTargetId,
} from '@/lib/share/shareTargets'
import type { Author, Post } from '@/payload-types'

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
  /** True when the publish date is still in the future — resolved inside a
   * `'use cache'` scope (#76 B3) so `generateMetadata` reads a flag instead of
   * calling `Date.now()` at the metadata layer (which blocks prerender). */
  isScheduledFuture?: boolean
  sourceType: CmsProvider
}

/**
 * Whether an article's publish date is still in the future, resolved inside a
 * `'use cache'` scope (#76 B3).
 *
 * @remarks `isFuturePublicationDate` reads `Date.now()`, which `cacheComponents`
 * rejects during prerender. Wrapping the call here freezes it at cache
 * generation and refreshes it on the `cmsContent` cadence (≈ the pre-migration
 * hourly-ISR behavior) — the error's own `[cache]` remedy — so the future-dated
 * publish gate stays load-bearing without blocking the static build. Purged with
 * the article cache on any publish/edit.
 *
 * `'use cache: remote'` so a `posts` tag purge reaches every serverless
 * instance, not only the one that ran the hook (#118).
 * @param date - The article's publish date (ISO string).
 * @returns True when the date is still in the future at cache-generation time.
 */
async function isArticleScheduledFuture(date: string): Promise<boolean> {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  return isFuturePublicationDate(date)
}

const termTitles = (terms: Post['categories'] | Post['tags']): string[] =>
  (terms ?? [])
    .map((t) => (typeof t === 'object' && t !== null ? t.title : null))
    .filter((t): t is string => Boolean(t))

/** Site-owner byline preserved verbatim when a post has no author relation. */
const SITE_OWNER_FALLBACK = 'Brandon Perfetti'

const authorHref = (author: Author): string | undefined =>
  // The site owner routes to /about (matches ArticleMeta's owner heuristic);
  // guest authors have no dedicated route yet, so they render without a link.
  author.name?.trim().toLowerCase() === 'brandon perfetti'
    ? '/about'
    : undefined

/**
 * Resolve a post's byline. Prefers the populated `authors` relation — a public
 * collection, so anonymous depth-2 reads carry the full name/role/avatar/
 * socials — and returns a rich {@link CmsAuthor}. When no relation is
 * populated it degrades to the `{id,name}` mirror or the site-owner string,
 * keeping migrated posts' bylines byte-identical.
 */
const buildAuthor = (post: PublishedPostSummary): CmsAuthor | string => {
  const rel = post.authors?.[0]
  const author = rel && typeof rel === 'object' ? (rel as Author) : undefined
  if (!author) {
    return post.populatedAuthors?.[0]?.name || SITE_OWNER_FALLBACK
  }
  const sameAs = (author.socials ?? [])
    .map((social) => social?.url?.trim())
    .filter((url): url is string => Boolean(url))
  return {
    name: author.name,
    role: author.role || undefined,
    image: mediaUrl(author.avatar) || undefined,
    href: authorHref(author),
    sameAs: sameAs.length > 0 ? sameAs : undefined,
  }
}

/**
 * Map a post to the v3 summary shape.
 *
 * @remarks Reads only the {@link PublishedPostSummary} list fields — never the
 * Lexical `content` — so it is safe to feed both the summary-projected list
 * read ({@link getPublishedPostSummaries}) and the full-body posts (from
 * {@link getPublishedPosts}, used by the search index). A full `Post` is a
 * superset of `PublishedPostSummary`, so both callers type-check.
 */
const toSummary = (post: PublishedPostSummary): CmsArticleSummary => {
  const topics = termTitles(post.categories)
  const tech = termTitles(post.tags)
  return {
    slug: post.slug || '',
    // Placement (#153): present only when the post has been placed under a
    // section page, so `publicPathFor` answers `/articles/<slug>` for the
    // unplaced default and `/<path>` for the rest.
    path: post.path || undefined,
    title: post.title,
    description: post.excerpt || post.meta?.description || '',
    seoTitle: post.meta?.title || undefined,
    seoDescription: post.meta?.description || undefined,
    date: post.publishedAt || post.createdAt,
    updatedAt: post.updatedAt,
    image: mediaUrl(post.heroImage) || mediaUrl(post.meta?.image ?? null),
    author: buildAuthor(post),
    category: topics[0] ? { title: topics[0] } : undefined,
    keywords: [...topics, ...tech],
    topics,
    tech,
    sourceType: 'local',
    ogImageMode: post.ogImageMode ?? undefined,
  }
}

/**
 * All published articles as v3-shaped summaries, newest first.
 *
 * @remarks Reads the summary-projected list ({@link getPublishedPostSummaries})
 * — a `select`-narrowed query that never serializes the Lexical `content` into
 * the `posts` cache entry (#76 Phase 0). The search index keeps the separate
 * full-body path.
 */
export async function getAllCmsArticleSummaries(): Promise<
  CmsArticleSummary[]
> {
  const posts = await getPublishedPostSummaries()
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
  return toDetail(await getPostBySlug(slug), viewer)
}

/**
 * One **placed** published article by its stored path (#153), gated identically
 * to {@link getCmsArticleBySlug}.
 *
 * @remarks The `[...segments]` catch-all's reader. An unplaced post has no
 * `path`, so it can never be reached here — `/articles/[slug]` stays its only
 * URL, which is the whole v3 invariant.
 */
export async function getCmsArticleByPath(
  path: string,
  viewer?: { isAuthenticated: boolean },
): Promise<CmsArticleDetailResult | null> {
  return toDetail(await getPostByPath(path), viewer)
}

/**
 * Map a resolved post to the detail shape, applying the §12 gate.
 *
 * @remarks Shared by the slug reader and the path reader so a placed article
 * and an unplaced one can never differ in what they withhold from an anonymous
 * viewer — the gating rule has exactly one implementation, reached by both
 * URLs.
 */
async function toDetail(
  post: Awaited<ReturnType<typeof getPostBySlug>>,
  viewer?: { isAuthenticated: boolean },
): Promise<CmsArticleDetailResult | null> {
  if (!post) return null
  const allowed = canAccess(viewer?.isAuthenticated ?? false, post)
  // Gated posts come back without `content` (field-level access hides it
  // from unauthenticated Payload reads). Once the app-layer gate passes,
  // refetch the body through the single trusted path.
  let content = post.content
  if (allowed && !content) {
    content = (await getGatedPostContent(post.id)) ?? content
  }
  const bodyBlocks = allowed && content ? lexicalToBlocks(content) : []
  const summary = toSummary(post)
  return {
    ...summary,
    bodyBlocks,
    excerpt: post.excerpt || undefined,
    searchText: allowed ? flattenBlockText(bodyBlocks) : '',
    gated: !allowed,
    // Resolved inside a `'use cache'` scope so `generateMetadata` reads this
    // flag rather than calling `Date.now()` at the metadata layer (#76 B3).
    isScheduledFuture: await isArticleScheduledFuture(summary.date),
    disableSharing: post.disableSharing ?? false,
    shareTargetsAdd: post.shareTargetsAdd ?? [],
    shareTargetsRemove: post.shareTargetsRemove ?? [],
  }
}

/**
 * Resolve the ordered share-target ids to offer for one article.
 *
 * @remarks Pure and server-side: it applies the per-article kill switch
 * (`disableSharing`) before layering the article's add/remove picks onto the
 * global set via {@link resolveShareTargetIds}. Extracted here so the article
 * page's Share-visibility rule is unit-testable without rendering the RSC, and
 * so the resolution stays off the server→client boundary — the page hands the
 * resulting plain `string[]` to the client `ShareButton`.
 * @param article - The article's per-entry share configuration.
 * @param globalShareTargets - The site-wide enabled ids (SiteSettings default).
 * @returns The effective {@link ShareTargetId} set, empty when sharing is off.
 */
export function resolveArticleShareTargetIds(
  article: Pick<
    CmsArticleDetail,
    'disableSharing' | 'shareTargetsAdd' | 'shareTargetsRemove'
  >,
  globalShareTargets: readonly string[],
): ShareTargetId[] {
  if (article.disableSharing) return []
  return resolveShareTargetIds(
    globalShareTargets,
    article.shareTargetsAdd,
    article.shareTargetsRemove,
  )
}

/**
 * Summaries enriched with flattened body text for the search index.
 *
 * @remarks The index is served to ANONYMOUS clients via `/api/search`, so
 * gated posts contribute only their excerpt — never the flattened body.
 * Skipping this mirror of the {@link getCmsArticleBySlug} gate leaked full
 * gated bodies through search (fresh-eyes review 2026-08, finding B1). This
 * path keeps the full-body {@link getPublishedPosts} fetch — the list surfaces'
 * summary projection ({@link getPublishedPostSummaries}) drops `content`, which
 * `searchText` still needs (#76 Phase 0 decision, Brandon 2026-08-24).
 */
export async function getCmsSearchArticles(): Promise<
  Array<CmsArticleSummary & { searchText: string }>
> {
  const posts = await getPublishedPosts()
  return posts
    .filter((p) => Boolean(p.slug))
    .map((post) => ({
      ...toSummary(post),
      searchText: canAccess(false, post)
        ? flattenBlockText(lexicalToBlocks(post.content))
        : post.excerpt || '',
    }))
}
