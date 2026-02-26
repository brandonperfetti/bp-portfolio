import type { NotionPage } from '@/lib/cms/notion/contracts'
import type {
  CmsArticleSummary,
  CmsAuthorProfile,
  CmsEntityItem,
  CmsNavigationItem,
  CmsPageContent,
  CmsSiteSettings,
  CmsWorkHistoryItem,
} from '@/lib/cms/types'

import {
  getProperty,
  propertyToBoolean,
  propertyToDate,
  propertyToFileUrl,
  propertyToFileUrls,
  propertyToMultiSelect,
  propertyToNumber,
  propertyToRelationIds,
  propertyToText,
} from '@/lib/cms/notion/property'
import { getSiteUrl } from '@/lib/site'

export const DEFAULT_CMS_AUTHOR = {
  name: 'Brandon Perfetti',
  href: 'https://brandonperfetti.com/about',
  role: 'Technical PM + Software Engineer',
  image:
    'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1683142617/bp-spotlight/images/avatar_jeycju.jpg',
} as const

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function normalizeLinkLabel(rawLabel: string, linkHref: string) {
  const trimmed = rawLabel.trim()
  const markdownMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
  if (markdownMatch) {
    return markdownMatch[1].trim()
  }

  return trimmed || linkHref.replace(/^https?:\/\//, '')
}

function toYearLabel(dateValue: string) {
  return dateValue.slice(0, 4)
}

export function mapNotionArticleSummary(
  page: NotionPage,
): CmsArticleSummary | null {
  const title = propertyToText(getProperty(page.properties, ['Title', 'Name']))
  const slugRaw = propertyToText(getProperty(page.properties, ['Slug']))
  const slug = toSlug(slugRaw || title)
  const description = propertyToText(
    getProperty(page.properties, ['Meta Description', 'Description']),
  )
  const date = propertyToDate(
    getProperty(page.properties, ['Publish Date', 'Published Date']),
  )
  const status = propertyToText(getProperty(page.properties, ['Status']))
  const syncState = propertyToText(getProperty(page.properties, ['Sync State']))
  const topics = propertyToMultiSelect(
    getProperty(page.properties, ['Topics/Tags', 'Topics', 'Tags']),
  )
  const tech = propertyToMultiSelect(
    getProperty(page.properties, ['Tech', 'Tech Stack', 'Technologies']),
  )

  const pageCoverUrl =
    page.cover?.type === 'external'
      ? (page.cover.external?.url ?? '')
      : page.cover?.type === 'file'
        ? (page.cover.file?.url ?? '')
        : ''

  const imageUrl =
    propertyToText(
      getProperty(page.properties, [
        'Cover Image URL',
        'Hero Image URL',
        'Image URL',
        'OG Image URL',
      ]),
    ) ||
    propertyToFileUrl(
      getProperty(page.properties, [
        'Cover Image',
        'Hero Image',
        'Image',
        'OG Image',
      ]),
    ) ||
    pageCoverUrl

  const sourceArticleIds = propertyToRelationIds(
    getProperty(page.properties, ['Source Article']),
  )
  const searchIndexText = propertyToText(
    getProperty(page.properties, [
      'Search Index',
      'Search Text',
      'Body Search Text',
      'Searchable Text',
    ]),
  )

  const readingTimeMinutes = propertyToNumber(
    getProperty(page.properties, ['Reading Time Minutes', 'Reading Time']),
  )

  if (
    !title ||
    !slug ||
    !description ||
    !date ||
    !imageUrl ||
    !sourceArticleIds.length ||
    topics.length === 0
  ) {
    return null
  }

  const publishSafeStatus = new Set(['ready to publish', 'published'])
  const publishSafeSyncState = syncState
    ? syncState.toLowerCase() === 'synced'
    : true
  if (!publishSafeStatus.has(status.toLowerCase()) || !publishSafeSyncState) {
    return null
  }

  const canonicalFromCms = propertyToText(
    getProperty(page.properties, ['Canonical URL']),
  )

  return {
    slug,
    title,
    description,
    date,
    image: imageUrl,
    readingTimeMinutes,
    author: DEFAULT_CMS_AUTHOR,
    category: {
      title:
        topics[0] ||
        propertyToText(
          getProperty(page.properties, ['Category', 'Content Type']),
        ) ||
        'Article',
    },
    canonicalUrl: canonicalFromCms || `${getSiteUrl()}/articles/${slug}`,
    keywords: propertyToMultiSelect(getProperty(page.properties, ['Keywords'])),
    topics,
    tech,
    noindex:
      propertyToBoolean(getProperty(page.properties, ['Noindex'])) ?? false,
    searchIndexText: searchIndexText || undefined,
    sourceArticlePageId: sourceArticleIds[0],
    sourceType: 'notion',
  }
}

export function mapNotionAuthorProfile(
  page: NotionPage,
): CmsAuthorProfile | null {
  const status = propertyToText(getProperty(page.properties, ['Status']))
  const isPublished = status.toLowerCase() === 'published' || status === ''
  if (!isPublished) {
    return null
  }

  const name = propertyToText(getProperty(page.properties, ['Name', 'Title']))
  if (!name) {
    return null
  }

  const slug = toSlug(
    propertyToText(getProperty(page.properties, ['Slug'])) || name,
  )
  const role = propertyToText(getProperty(page.properties, ['Role', 'Title']))
  const href = propertyToText(
    getProperty(page.properties, ['Profile URL', 'Website', 'URL', 'Href']),
  )
  const image =
    propertyToText(getProperty(page.properties, ['Avatar URL', 'Image URL'])) ||
    propertyToFileUrl(getProperty(page.properties, ['Avatar', 'Image']))
  const bio = propertyToText(
    getProperty(page.properties, ['Bio Short', 'Bio', 'Summary']),
  )
  const primary =
    propertyToBoolean(
      getProperty(page.properties, ['Primary', 'Is Default', 'Default']),
    ) ?? false
  const order =
    propertyToNumber(getProperty(page.properties, ['Sort Order', 'Order'])) ??
    Number.MAX_SAFE_INTEGER

  return {
    id: page.id,
    name,
    slug,
    role: role || undefined,
    href: href || undefined,
    image: image || undefined,
    bio: bio || undefined,
    primary,
    order,
  }
}

export function mapNotionEntity(page: NotionPage): CmsEntityItem | null {
  const name = propertyToText(
    getProperty(page.properties, ['Name', 'Title', 'Item']),
  )
  const slug = toSlug(
    propertyToText(getProperty(page.properties, ['Slug'])) || name,
  )
  const description = propertyToText(
    getProperty(page.properties, ['Description', 'Summary']),
  )
  const status = propertyToText(getProperty(page.properties, ['Status']))
  const publishSafe = status.toLowerCase() === 'published' || status === ''

  if (!name || !description || !publishSafe) {
    return null
  }

  const linkHref =
    propertyToText(
      getProperty(page.properties, [
        'Reference URL',
        'Project URL',
        'Item URL',
        'Link URL',
        'URL',
        'Website',
      ]),
    ) || propertyToText(getProperty(page.properties, ['Href']))

  const linkLabel =
    propertyToText(
      getProperty(page.properties, [
        'Reference Label',
        'Display Link',
        'Link Label',
      ]),
    ) || linkHref.replace(/^https?:\/\//, '')

  const logo =
    propertyToText(getProperty(page.properties, ['Logo URL'])) ||
    propertyToFileUrl(getProperty(page.properties, ['Logo']))

  return {
    slug,
    name,
    description,
    logo: logo || undefined,
    link: linkHref
      ? {
          href: linkHref,
          label: normalizeLinkLabel(linkLabel, linkHref),
        }
      : undefined,
    category:
      propertyToText(getProperty(page.properties, ['Category', 'Section'])) ||
      undefined,
    order:
      propertyToNumber(getProperty(page.properties, ['Sort Order', 'Order'])) ??
      Number.MAX_SAFE_INTEGER,
    updatedAt: page.last_edited_time,
  }
}

export function mapNotionWorkHistory(
  page: NotionPage,
): CmsWorkHistoryItem | null {
  const status = propertyToText(getProperty(page.properties, ['Status']))
  const publishSafe = status.toLowerCase() === 'published' || status === ''

  if (!publishSafe) {
    return null
  }

  const company = propertyToText(
    getProperty(page.properties, ['Company', 'Name', 'Employer']),
  )
  const title = propertyToText(
    getProperty(page.properties, ['Role Title', 'Title', 'Role']),
  )
  const startDate = propertyToDate(
    getProperty(page.properties, ['Start Date', 'Start']),
  )
  const endDate = propertyToDate(
    getProperty(page.properties, ['End Date', 'End']),
  )
  const current = propertyToBoolean(
    getProperty(page.properties, ['Current', 'Is Current']),
  )

  if (!company || !title || !startDate) {
    return null
  }

  const logo =
    propertyToText(getProperty(page.properties, ['Logo URL'])) ||
    propertyToFileUrl(getProperty(page.properties, ['Logo'])) ||
    undefined

  const isCurrent = current ?? !endDate
  const end = isCurrent
    ? {
        label: 'Present',
        dateTime: new Date().getFullYear().toString(),
      }
    : toYearLabel(endDate || startDate)

  return {
    company,
    title,
    logo,
    start: toYearLabel(startDate),
    end,
    current: isCurrent,
    order:
      propertyToNumber(getProperty(page.properties, ['Sort Order', 'Order'])) ??
      Number.MAX_SAFE_INTEGER,
  }
}

function normalizeRouteKey(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed === '/') {
    return '/'
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '')
}

export function mapNotionPageContent(page: NotionPage): CmsPageContent | null {
  const status = propertyToText(getProperty(page.properties, ['Status']))
  const publishSafeStatuses = new Set(['published', 'approved', ''])
  if (!publishSafeStatuses.has(status.toLowerCase())) {
    return null
  }

  const routeKeyRaw = propertyToText(
    getProperty(page.properties, ['Route Key', 'Route', 'Path']),
  )
  const routeKey = normalizeRouteKey(routeKeyRaw)

  const slugRaw = propertyToText(getProperty(page.properties, ['Slug', 'Name']))
  const slug = toSlug(slugRaw || routeKey.replace(/^\//, '') || page.id)

  const title = propertyToText(
    getProperty(page.properties, ['Title', 'Page Title', 'Name']),
  )
  if (!routeKey || !title) {
    return null
  }

  const featuredImage1 = getProperty(page.properties, [
    'Featured Image 1',
    'Home Image 1',
  ])
  const featuredImage2 = getProperty(page.properties, [
    'Featured Image 2',
    'Home Image 2',
  ])
  const featuredImage3 = getProperty(page.properties, [
    'Featured Image 3',
    'Home Image 3',
  ])
  const featuredImage4 = getProperty(page.properties, [
    'Featured Image 4',
    'Home Image 4',
  ])
  const featuredImage5 = getProperty(page.properties, [
    'Featured Image 5',
    'Home Image 5',
  ])
  const heroImageProperty = getProperty(page.properties, [
    'Hero Image',
    'Hero Image URL',
  ])
  const ogImageProperty = getProperty(page.properties, [
    'OG Image',
    'Open Graph Image',
    'OG Image URL',
    'Open Graph Image URL',
  ])

  const homeImages = [
    propertyToText(featuredImage1) || propertyToFileUrl(featuredImage1),
    propertyToText(featuredImage2) || propertyToFileUrl(featuredImage2),
    propertyToText(featuredImage3) || propertyToFileUrl(featuredImage3),
    propertyToText(featuredImage4) || propertyToFileUrl(featuredImage4),
    propertyToText(featuredImage5) || propertyToFileUrl(featuredImage5),
    ...propertyToFileUrls(
      getProperty(page.properties, ['Gallery Images', 'Home Images']),
    ),
  ].filter(Boolean)

  return {
    pageId: page.id,
    routeKey,
    slug,
    title,
    subtitle:
      propertyToText(getProperty(page.properties, ['Subtitle', 'Summary'])) ||
      undefined,
    seoTitle:
      propertyToText(getProperty(page.properties, ['SEO Title'])) || undefined,
    seoDescription:
      propertyToText(
        getProperty(page.properties, ['SEO Description', 'Meta Description']),
      ) || undefined,
    heroImage:
      propertyToText(heroImageProperty) ||
      propertyToFileUrl(heroImageProperty) ||
      undefined,
    ogImage:
      propertyToText(ogImageProperty) ||
      propertyToFileUrl(ogImageProperty) ||
      undefined,
    homeImages: homeImages.length > 0 ? homeImages : undefined,
    updatedAt: page.last_edited_time,
  }
}

export function mapNavigationItem(page: NotionPage): CmsNavigationItem | null {
  const status = propertyToText(getProperty(page.properties, ['Status']))
  if (status && status.toLowerCase() !== 'published') {
    return null
  }

  const showInNav =
    propertyToBoolean(
      getProperty(page.properties, ['Show In Nav', 'Visible']),
    ) ?? true

  if (!showInNav) {
    return null
  }

  const href = propertyToText(
    getProperty(page.properties, ['Path', 'Href', 'Route']),
  )
  const label = propertyToText(
    getProperty(page.properties, ['Label', 'Name', 'Title']),
  )

  if (!href || !label) {
    return null
  }

  return {
    href,
    label,
    order:
      propertyToNumber(
        getProperty(page.properties, ['Nav Order', 'Sort Order']),
      ) ?? 1000,
    showInNav,
  }
}

export function mapSiteSettings(page: NotionPage): CmsSiteSettings | null {
  const status = propertyToText(getProperty(page.properties, ['Status']))
  if (status && status.toLowerCase() !== 'published') {
    return null
  }

  const siteName =
    propertyToText(getProperty(page.properties, ['Site Name', 'Name'])) ||
    'Brandon Perfetti'
  const siteTitle =
    propertyToText(
      getProperty(page.properties, ['Site Title', 'Default Title']),
    ) || 'Brandon Perfetti - Product & Project Manager and Software Engineer'
  const siteDescription =
    propertyToText(
      getProperty(page.properties, ['Site Description', 'Description']),
    ) ||
    'I’m Brandon, a product and project manager plus software engineer based in Orange County, California.'

  const canonicalUrl =
    propertyToText(
      getProperty(page.properties, ['Canonical URL', 'Site URL']),
    ) || getSiteUrl()

  const openGraphImage =
    propertyToText(
      getProperty(page.properties, ['Open Graph Image URL', 'OG Image URL']),
    ) ||
    propertyToFileUrl(
      getProperty(page.properties, ['Open Graph Image', 'OG Image']),
    ) ||
    undefined

  const twitterCardRaw = propertyToText(
    getProperty(page.properties, ['Twitter Card', 'Twitter']),
  ).toLowerCase()

  const twitterCard =
    twitterCardRaw === 'summary' || twitterCardRaw === 'summary_large_image'
      ? twitterCardRaw
      : 'summary_large_image'

  return {
    siteName,
    siteTitle,
    siteDescription,
    canonicalUrl,
    openGraphImage,
    twitterCard,
    keywords: propertyToMultiSelect(getProperty(page.properties, ['Keywords'])),
  }
}
