export type CmsProvider = 'local' | 'notion'

export interface CmsAuthor {
  name: string
  href?: string
  role?: string
  image?: string
}

export interface CmsAuthorProfile extends CmsAuthor {
  id: string
  slug: string
  bio?: string
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
  date: string
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
  title: string
  subtitle?: string
  seoTitle?: string
  seoDescription?: string
  heroImage?: string
  ogImage?: string
  homeImages?: string[]
  updatedAt?: string
  bodyBlocks?: CmsArticleBlock[]
}
