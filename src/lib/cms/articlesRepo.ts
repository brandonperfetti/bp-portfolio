import { cacheLife, cacheTag } from 'next/cache'
import { getPayload } from 'payload'

import configPromise from '@payload-config'
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
  PUBLISHED_POST_SUMMARY_SELECT,
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

/**
 * Lowercased topic title → the root-relative path of its **published** section
 * home (#151).
 *
 * @remarks Keyed on the lowercased title, not the id, because that is the key
 * both consumers already hold: `toSummary` reads titles out of the populated
 * relationship, and every comparison in the filter layer is already
 * case-insensitive.
 */
export type TopicSectionPaths = ReadonlyMap<string, string>

/** Nothing to link — the state before any topic has been given a home. */
const NO_SECTION_PATHS: TopicSectionPaths = new Map()

/**
 * Resolve every topic that has a published section home, as one small map.
 *
 * @returns Lowercased topic title → section-home path (no leading slash).
 *
 * @remarks **Two reads rather than one populated read, deliberately.** Payload
 * would populate `categories.sectionPage` at the default depth, but `Pages`
 * declares `defaultPopulate: { title, slug }` — a populated page carries no
 * `path` and no `_status`, which are exactly the two facts this needs: a
 * nested home is `/work/leadership`, which a slug alone cannot name, and an
 * unpublished home must fall back rather than link at a 404. Widening Pages'
 * `defaultPopulate` would instead push a page projection into every populated
 * relationship on the site, including the post-summary cache entry #76 Phase 0
 * exists to keep small. So: ids from `categories` at depth 0, then one indexed
 * `id IN (…)` read of the pages that are actually referenced.
 *
 * Both reads are trivially bounded — one row per topic, and at most that many
 * pages — and they run once per cache generation, not once per article.
 *
 * Cached under **both** `posts` and `pages`: a topic edit purges `posts` (the
 * Categories hooks below this file already do), and publishing or unpublishing
 * a section home purges `pages` (`revalidatePage`). Missing the second tag
 * would leave a chip pointing at a page that has since been unpublished —
 * which is precisely the failure the fallback exists to prevent.
 *
 * `'use cache: remote'` so a tag purge reaches every serverless instance, not
 * only the one that ran the hook (#118).
 */
export async function getTopicSectionPaths(): Promise<TopicSectionPaths> {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheTag(CMS_TAGS.pages)
  cacheLife('cmsContent')

  const payload = await getPayload({ config: configPromise })
  const { docs: topics } = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 500,
    overrideAccess: false,
    pagination: false,
    select: { title: true, sectionPage: true },
  })

  const titlesByPageId = new Map<number, string[]>()
  for (const topic of topics) {
    const pageId = topic.sectionPage
    const title = typeof topic.title === 'string' ? topic.title.trim() : ''
    if (typeof pageId !== 'number' || !title) continue
    titlesByPageId.set(pageId, [...(titlesByPageId.get(pageId) ?? []), title])
  }
  if (titlesByPageId.size === 0) return NO_SECTION_PATHS

  const ids = [...titlesByPageId.keys()]
  const { docs: pages } = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: ids.length,
    overrideAccess: false,
    pagination: false,
    select: { path: true },
    // A draft or unpublished home is not a destination. Left out of the map
    // entirely rather than flagged, so every consumer's "no path" branch is the
    // one fallback path (AC 3).
    where: { id: { in: ids }, _status: { equals: 'published' } },
  })

  const sectionPaths = new Map<string, string>()
  for (const page of pages) {
    // No fallback to `slug` here, unlike `publicPathFor`. That fallback exists
    // to cover a page row read before M1's backfill; this read cannot see one,
    // because M1 gave every page a path and `computePagePath` writes one on
    // every save that has a slug. What it CAN see is the one row that genuinely
    // has no path — a page saved with no slug at all — and that page has no
    // public URL to send a reader to. Skipping it lands the topic on the
    // filtered view, which is the same safe degradation an unpublished home
    // gets, rather than inventing `/` + an empty slug.
    if (typeof page.path !== 'string' || !page.path) continue
    for (const title of titlesByPageId.get(page.id) ?? []) {
      sectionPaths.set(title.toLowerCase(), page.path)
    }
  }
  return sectionPaths
}

/**
 * How a {@link PostRollupBlock} orders the articles it rolls up (#152).
 *
 * @remarks Mirrors the block's `sort` select. Kept as its own union rather than
 * read off the generated block type so the reader can be unit-tested (and
 * called) without importing `payload-types`.
 */
export type PostRollupSort = 'newest' | 'oldest' | 'title'

/** Payload `sort` expression for each {@link PostRollupSort} value. */
const ROLLUP_SORT_EXPRESSIONS: Record<PostRollupSort, string> = {
  newest: '-publishedAt',
  oldest: 'publishedAt',
  title: 'title',
}

/**
 * How many articles one rollup may ask for — the block's `max`, restated here
 * because a reader must not trust a stored number it did not validate.
 */
const POST_ROLLUP_MAX_LIMIT = 12

const rollupLimit = (limit: number): number =>
  Math.min(Math.max(Math.trunc(limit) || 1, 1), POST_ROLLUP_MAX_LIMIT)

/**
 * Shared body of the two rollup readers: one summary-projected, published-only
 * `posts` read under a caller-supplied `where`.
 *
 * @remarks Not itself a cache scope — the exported readers are, so each source
 * keeps its own cache key. Uses {@link PUBLISHED_POST_SUMMARY_SELECT}, the same
 * projection `getPublishedPostSummaries` uses, so a rollup entry can never grow
 * with article body size (#76 Phase 0).
 */
async function findRollupPosts(
  where: Record<string, unknown>,
  sort: PostRollupSort,
  limit: number,
): Promise<CmsArticleSummary[]> {
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: rollupLimit(limit),
    overrideAccess: false,
    pagination: false,
    select: PUBLISHED_POST_SUMMARY_SELECT,
    sort: ROLLUP_SORT_EXPRESSIONS[sort] ?? ROLLUP_SORT_EXPRESSIONS.newest,
    where: { ...where, _status: { equals: 'published' } },
  })
  return (docs as PublishedPostSummary[])
    .filter((post) => Boolean(post.slug))
    .map((post) => toSummary(post))
}

/**
 * Published articles carrying one topic, for the `by-category` rollup (#152).
 *
 * @param categoryId - The `categories` row id the block points at.
 * @param sort - Display order.
 * @param limit - How many to return (clamped to the block's 1–12 range).
 *
 * @remarks A scoped read rather than a filter over
 * {@link getPublishedPostSummaries}: the whole-corpus list is cached at 1000
 * rows and would have to be fetched, deserialized and scanned to render six
 * cards, and — more to the point — the category relation is only reliably
 * populated on the *projected* read this issues, at `depth: 1`.
 *
 * Cached under the `posts` tag alone. A category rename or a change to which
 * posts carry it both purge `posts` (the Categories `afterChange` hook and the
 * Posts hook respectively), so no `pages` tag is owed here — unlike
 * {@link getTopicSectionPaths}, which reads `pages` rows.
 *
 * `'use cache: remote'` so a tag purge reaches every serverless instance, not
 * only the one that ran the hook (#118). Bounded at 12 summary rows, so the
 * entry is orders of magnitude under the 2 MB Runtime Cache item ceiling.
 */
export async function getPostRollupByCategory(
  categoryId: number,
  sort: PostRollupSort = 'newest',
  limit = 6,
): Promise<CmsArticleSummary[]> {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  return findRollupPosts({ categories: { in: [categoryId] } }, sort, limit)
}

/**
 * Published articles placed under one page, for the `by-placement` rollup
 * (#152 × #153).
 *
 * @param pageId - The `pages` row id an article's `parent` must equal.
 * @param sort - Display order.
 * @param limit - How many to return (clamped to the block's 1–12 range).
 *
 * @remarks `parent` is the placement field Posts gained in #153 (verified
 * against `src/collections/Posts/index.ts` at this tip — a `hasMany: false`
 * relationship to `pages`, stored as `posts.parent_id`), so this is one indexed
 * equality read. It returns nothing on a corpus where no article has been
 * placed, which is every corpus until an editor places one — the empty state
 * the block renders as `null`.
 *
 * Cached like {@link getPostRollupByCategory}: `posts` tag, remote tier. A
 * placement change is a post edit, so the `posts` purge covers it; the *page*
 * being pointed at is identified here only by id, and this read exposes nothing
 * about the page itself, so it owes no `pages` tag.
 */
export async function getPostRollupByPlacement(
  pageId: number,
  sort: PostRollupSort = 'newest',
  limit = 6,
): Promise<CmsArticleSummary[]> {
  'use cache: remote'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  return findRollupPosts({ parent: { equals: pageId } }, sort, limit)
}

/**
 * Where a topic chip links (#151) — re-exported so the server side has one
 * import site for the topic vocabulary. It lives in `@/lib/cms/topics` because
 * it is pure and `ArticleMeta` (which has browser-mode stories) must be able
 * to reach it without importing the Payload Local API; see that module.
 *
 * The async half of the question — *which* topics have a published home — is
 * answered once per cache generation by {@link getTopicSectionPaths} and baked
 * into the summary, so a chip needs no lookup at render time.
 */
export { resolveTopicHref } from '@/lib/cms/topics'

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
 * @param post - The post, summary-projected or full.
 * @param sectionPaths - Supplied ONLY by the article-detail path, which is the
 * one surface that renders linked topic chips. Omitted everywhere else, and
 * omitting it omits `topicLinks` from the result entirely rather than emitting
 * a row of hrefless entries: the list surfaces (`/articles` cards, RSS,
 * llms.txt, the sitemap, `/api/search`) all drop the field on the way out, and
 * their payloads are exactly what #76 Phase 0 shrank to stay under the 2 MB
 * cache-item ceiling.
 *
 * @remarks Reads only the {@link PublishedPostSummary} list fields — never the
 * Lexical `content` — so it is safe to feed both the summary-projected list
 * read ({@link getPublishedPostSummaries}) and the full-body posts (from
 * {@link getPublishedPosts}, used by the search index). A full `Post` is a
 * superset of `PublishedPostSummary`, so both callers type-check.
 */
const toSummary = (
  post: PublishedPostSummary,
  sectionPaths?: TopicSectionPaths,
): CmsArticleSummary => {
  const topics = termTitles(post.categories)
  const tech = termTitles(post.tags)
  const topicSlugs = new Map(
    (post.categories ?? [])
      .map((t) =>
        typeof t === 'object' && t !== null && typeof t.title === 'string'
          ? ([t.title, t.slug ?? undefined] as const)
          : null,
      )
      .filter((pair): pair is readonly [string, string | undefined] =>
        Boolean(pair),
      ),
  )
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
    // The same topics, in the same order, plus where each chip points (#151).
    // Built here rather than in the component so the async "which topics have
    // a published home" question is answered once per cache generation.
    ...(sectionPaths
      ? {
          topicLinks: topics.map((title) => ({
            title,
            slug: topicSlugs.get(title),
            sectionPath: sectionPaths.get(title.toLowerCase()),
          })),
        }
      : {}),
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
  // NOT `.map(toSummary)`: `Array.prototype.map` passes the index as the second
  // argument, which is the section-path map — a silent way to hand this
  // function a `Map` it never meant to build.
  //
  // And it does not build one: the list surfaces this feeds never render a
  // linked topic chip, so resolving topic homes here would be two reads and a
  // wider cache entry for a field every consumer drops (#76 Phase 0).
  return posts.filter((p) => Boolean(p.slug)).map((post) => toSummary(post))
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
  // The article page is the one surface that renders linked topic chips, so
  // this is the read that matters most for #151.
  const summary = toSummary(post, await getTopicSectionPaths())
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
      // No section paths: `getSearchArticles`' public allowlist drops
      // `topicLinks`, and this read's payload is the largest on the site.
      ...toSummary(post),
      searchText: canAccess(false, post)
        ? flattenBlockText(lexicalToBlocks(post.content))
        : post.excerpt || '',
    }))
}
