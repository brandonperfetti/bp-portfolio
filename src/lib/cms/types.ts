import type { OgImageMode } from '@/lib/og/types'
import type { ShareTargetId } from '@/lib/share/shareTargets'

/**
 * Content provider marker. Only `'local'` (Payload) exists — the Notion
 * runtime arm was removed with the v4 rebuild and must not return
 * (CLAUDE.md invariant: never reintroduce Notion runtime code).
 */
export type CmsProvider = 'local'

export interface CmsAuthor {
  name: string
  href?: string
  role?: string
  image?: string
  /**
   * Public profile URLs for the author, surfaced as the schema.org
   * `author.sameAs` array in Article JSON-LD.
   */
  sameAs?: string[]
}

export interface CmsAuthorProfile extends CmsAuthor {
  id: string
  slug: string
  bio?: string
  email?: string
  primary?: boolean
  order?: number
}

export interface CmsCategory {
  title: string
  href?: string
}

/**
 * One topic (Payload `categories` row) as an article page needs it: enough to
 * render a chip **and** to decide where that chip points (#151).
 *
 * @remarks Deliberately a second, richer population sitting *alongside*
 * `CmsArticleSummary.topics` rather than replacing it. `ArticlesExplorer`
 * filters against a flat, deduped pool that merges topic titles and tag names
 * into one `string[]`; widening that pool to objects would ripple into the
 * filter matcher, the chip counting and their tests for no gain, since a
 * filter chip is a state toggle that never needs an href. Two populations,
 * two jobs — see the TSDoc on `ArticleMeta` and `ArticlesExplorer`.
 */
export interface CmsTopic {
  /** The topic's display title — the chip's visible text. */
  title: string
  /** The topic's own slug (`categories.slug`), for keying and future routes. */
  slug?: string
  /**
   * The root-relative path (no leading slash) of the topic's section home,
   * present only when `sectionPage` is set **and** that page is published.
   *
   * An unset, unpublished or deleted `sectionPage` leaves this `undefined`,
   * which is what makes the fallback to the filtered `/articles` view the
   * default rather than a special case.
   */
  sectionPath?: string
}

export interface CmsArticleSummary {
  slug: string
  /**
   * The stored, root-relative path of a **placed** article (#153) — `undefined`
   * for the unplaced default, which is served at `/articles/<slug>`.
   *
   * Carried on the summary rather than resolved per consumer because every
   * article-URL surface on the site (cards, RSS, llms.txt, `/api/search`, the
   * sitemap, the `ItemList` JSON-LD) receives only a summary, and each one
   * resolves its href through `publicPathFor`. Without this field they would
   * all resolve a placed article to `/articles/<slug>` and emit a URL that
   * immediately 308s.
   */
  path?: string
  title: string
  description: string
  seoTitle?: string
  seoDescription?: string
  date: string
  updatedAt?: string
  image?: string
  readingTimeMinutes?: number
  author: CmsAuthor | string
  category?: CmsCategory
  canonicalUrl?: string
  keywords?: string[]
  topics?: string[]
  /**
   * The same topics as {@link CmsArticleSummary.topics}, in the same order,
   * carrying where each chip links (#151). See {@link CmsTopic} for why this
   * sits alongside the flat list instead of replacing it.
   */
  topicLinks?: CmsTopic[]
  tech?: string[]
  noindex?: boolean
  searchIndexText?: string
  sourceArticlePageId?: string
  sourceType: CmsProvider
  /** How this article's social image resolves — `auto` follows the global
   * generated-OG toggle, `bespoke` forces its own cover, `generated` forces a
   * generated card. Absent → `auto`. */
  ogImageMode?: OgImageMode
}

export interface CmsRichText {
  plainText: string
  href?: string
  annotations?: {
    bold?: boolean
    italic?: boolean
    strikethrough?: boolean
    underline?: boolean
    code?: boolean
  }
}

export interface CmsArticleBlock {
  id: string
  type: string
  richText?: CmsRichText[]
  language?: string
  caption?: CmsRichText[]
  url?: string
  checked?: boolean
  children?: CmsArticleBlock[]
}

export interface CmsArticleDetail extends CmsArticleSummary {
  searchText: string
  bodyBlocks: CmsArticleBlock[]
  excerpt?: string
  /** When true, this article offers no share affordance regardless of the
   * global share set (per-post kill switch). */
  disableSharing?: boolean
  /** Share-target ids layered on top of the global set for this article. */
  shareTargetsAdd?: string[]
  /** Share-target ids subtracted from the global set for this article. */
  shareTargetsRemove?: string[]
}

export interface CmsLinkItem {
  href: string
  label: string
}

export interface CmsEntityItem {
  slug: string
  name: string
  description: string
  logo?: string
  link?: CmsLinkItem
  category?: string
  /** Self-assessed proficiency tier (tech-stack rows only). */
  proficiency?: string
  /** `owner/name` GitHub repo hint for live signal matching. */
  githubRepo?: string
  order?: number
  updatedAt?: string
}

export interface CmsUseSection {
  title: string
  items: CmsEntityItem[]
}

export interface CmsSiteSettings {
  siteName: string
  siteTitle: string
  siteDescription: string
  canonicalUrl: string
  openGraphImage?: string
  twitterCard?: 'summary' | 'summary_large_image'
  keywords?: string[]
  /** Whether the article "Copy page" action is shown. */
  copyPageEnabled: boolean
  /** Resolved label for the article "Copy page" action (empty → "Copy page"). */
  copyPageLabel: string
  /** Globally enabled share-target ids — the base set every shareable entry
   * starts from before per-entry add/remove is applied. */
  shareTargets: string[]
  /** Global master switch for dynamic generated OG title-cards (T7). When off,
   * `auto`-mode entries never generate a card regardless of cover state. */
  generatedOgEnabled: boolean
}

export interface CmsNavigationItem {
  href: string
  label: string
  order: number
  showInNav: boolean
}

export interface CmsWorkHistoryItem {
  company: string
  title: string
  logo?: string
  start: string
  end: string | { label: string; dateTime: string }
  order?: number
  current?: boolean
}

export interface CmsPageContent {
  pageId: string
  routeKey: string
  slug: string
  /**
   * The page's computed hierarchy path, without a leading slash (`about`,
   * `work/brytecore`). Present for every migrated row; `undefined` only for a
   * projection built before the #148 backfill, where `slug` is the same string.
   * Read it through `publicPathFor`, never directly.
   */
  path?: string
  title: string
  subtitle?: string
  seoTitle?: string
  seoDescription?: string
  heroImage?: string
  ogImage?: string
  /** How this page's social image resolves (see {@link CmsArticleSummary.ogImageMode}). */
  ogImageMode?: OgImageMode
  updatedAt?: string
  bodyBlocks?: CmsArticleBlock[]
  /** When true, this page offers no share affordance regardless of the global
   * share set (per-page kill switch). */
  disableSharing?: boolean | null
  /** Share-target ids layered on top of the global set for this page. */
  shareTargetsAdd?: ShareTargetId[] | null
  /** Share-target ids subtracted from the global set for this page. */
  shareTargetsRemove?: ShareTargetId[] | null
}
