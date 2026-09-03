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

export interface CmsArticleSummary {
  slug: string
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
