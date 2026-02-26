import type { NotionPage } from '@/lib/cms/notion/contracts'

import { flattenBlockText, getNotionBlockTree } from '@/lib/cms/notion/blocks'
import {
  notionCreatePage,
  notionGetPage,
  notionUpdatePage,
} from '@/lib/cms/notion/client'
import {
  getNotionArticlesDataSourceId,
  getNotionContentCalendarDataSourceId,
  getNotionContentDataSourceId,
  getOptionalNotionDefaultAuthorPageId,
} from '@/lib/cms/notion/config'
import { NotionHttpError } from '@/lib/cms/notion/errors'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import {
  getProperty,
  propertyToBoolean,
  propertyToDate,
  propertyToMultiSelect,
  propertyToNumber,
  propertyToRelationIds,
  propertyToText,
} from '@/lib/cms/notion/property'

type ProjectionStatus = 'Draft' | 'Ready to Publish' | 'Published'

type SourceArticle = {
  id: string
  title: string
  slug: string
  summary: string
  metaDescription: string
  coverImageUrl: string
  keywords: string[]
  topics: string[]
  tech: string[]
  publishDate: string
  liveUrl: string
  contentType: string
  sourceStatus: string
  projectionStatus: ProjectionStatus
  articleType: string
  aiCopyeditStatus: string
  logicReviewStatus: string
  tutorialValidationStatus: string
  reRevisionRequested: boolean
  hasWinningCover: boolean
  winningCoverCount?: number
  authorRelationIds: string[]
  revisionFingerprint: string
}

export type ProjectionSyncResult = {
  ok: boolean
  scanned: number
  eligible: number
  created: number
  updated: number
  archived: number
  skipped: number
  errors: Array<{ sourcePageId: string; message: string }>
}

type ReconcileSeverity = 'critical' | 'warning'

export type ProjectionReconcileFinding = {
  code:
    | 'SOURCE_PUBLISHSAFE_MISSING_TARGET'
    | 'TARGET_PUBLISHSAFE_MISSING_SOURCE'
    | 'STATUS_MISMATCH'
    | 'COVER_URL_MISMATCH'
    | 'CALENDAR_MISSING_ASSIGNED_ARTICLE'
    | 'CALENDAR_MULTI_ASSIGNED_ARTICLES'
    | 'CALENDAR_ARTICLE_MULTI_ROWS'
  severity: ReconcileSeverity
  sourcePageId?: string
  targetPageId?: string
  calendarPageId?: string
  slug?: string
  message: string
}

export type ProjectionReconcileResult = {
  ok: boolean
  checkedSource: number
  checkedTargets: number
  checkedCalendarRows: number
  findings: ProjectionReconcileFinding[]
}

export type SourcePublishGateResult = {
  ok: boolean
  sourcePageId: string
  sourceStatus?: string
  reasons: string[]
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function toTitle(content: string) {
  return {
    title: [
      {
        type: 'text',
        text: { content: content.slice(0, 2000) },
      },
    ],
  }
}

function toRichText(content: string) {
  return {
    rich_text: [
      {
        type: 'text',
        text: { content: content.slice(0, 2000) },
      },
    ],
  }
}

function sourceToProjectionStatus(sourceStatus: string): ProjectionStatus {
  const normalized = sourceStatus.trim().toLowerCase()
  if (normalized === 'published') return 'Published'
  if (normalized === 'ready to publish') return 'Ready to Publish'
  return 'Draft'
}

function mapSourcePage(page: NotionPage): SourceArticle | null {
  const title = propertyToText(getProperty(page.properties, ['Name', 'Title']))
  const slug = toSlug(
    propertyToText(getProperty(page.properties, ['Slug'])) || title,
  )
  const metaDescription = propertyToText(
    getProperty(page.properties, ['Meta Description']),
  )
  const coverImageUrl = propertyToText(
    getProperty(page.properties, ['Cover Image URL']),
  )
  const publishDate = propertyToDate(
    getProperty(page.properties, ['Published Date', 'Publish Date']),
  )
  const liveUrl = propertyToText(getProperty(page.properties, ['Live URL']))
  const keywords = propertyToMultiSelect(
    getProperty(page.properties, ['Keywords']),
  )
  const topics = propertyToMultiSelect(
    getProperty(page.properties, ['Topics/Tags', 'Topics', 'Tags']),
  )
  const tech = propertyToMultiSelect(
    getProperty(page.properties, ['Tech', 'Tech Stack', 'Technologies']),
  )
  const contentType = propertyToText(
    getProperty(page.properties, ['Content Type']),
  )
  const sourceStatus = propertyToText(
    getProperty(page.properties, ['Content Status', 'Status']),
  )
  const projectionStatus = sourceToProjectionStatus(sourceStatus)
  const articleType = propertyToText(
    getProperty(page.properties, ['Article Type', 'Mode']),
  )
  const aiCopyeditStatus = propertyToText(
    getProperty(page.properties, ['AI Copyedit Status', 'AI Copyedit']),
  )
  const logicReviewStatus = propertyToText(
    getProperty(page.properties, ['Logic Review Status', 'Logic Review']),
  )
  const tutorialValidationStatus = propertyToText(
    getProperty(page.properties, [
      'Tutorial Validation Status',
      'Tutorial Validation',
    ]),
  )
  const reRevisionRequested =
    propertyToBoolean(
      getProperty(page.properties, ['Re-Revision Requested']),
    ) ?? false
  const hasWinningCover = propertyToBoolean(
    getProperty(page.properties, ['Has Winning Cover']),
  )
  const winningCoverCount = propertyToNumber(
    getProperty(page.properties, ['Winning Cover Count']),
  )
  const authorRelationIds = propertyToRelationIds(
    getProperty(page.properties, ['Author', 'Authors']),
  )

  if (!title || !slug || contentType.toLowerCase() !== 'blog post') {
    return null
  }

  return {
    id: page.id,
    title,
    slug,
    summary: metaDescription || title,
    metaDescription,
    coverImageUrl,
    keywords,
    topics,
    tech,
    publishDate,
    liveUrl,
    contentType,
    sourceStatus,
    projectionStatus,
    articleType,
    aiCopyeditStatus,
    logicReviewStatus,
    tutorialValidationStatus,
    reRevisionRequested,
    hasWinningCover: hasWinningCover ?? false,
    winningCoverCount,
    authorRelationIds,
    revisionFingerprint: `${page.id}:${page.last_edited_time ?? ''}:${sourceStatus}:${slug}`,
  }
}

function eligibleForProjection(source: SourceArticle) {
  const status = source.sourceStatus.trim().toLowerCase()
  return (
    (status === 'ready to publish' || status === 'published') &&
    source.topics.length > 0
  )
}

function normalizeStatus(value: string) {
  return value.trim().toLowerCase()
}

function isTutorialLike(articleType: string) {
  const mode = normalizeStatus(articleType)
  return mode.includes('tutorial') || mode.includes('hybrid')
}

function validatePublishSafeRequirements(
  source: SourceArticle,
  defaultAuthorPageId: string | null,
): string[] {
  const errors: string[] = []

  if (!source.slug.trim()) {
    errors.push('Missing required Slug')
  }

  if (!source.metaDescription.trim()) {
    errors.push('Missing required Meta Description')
  }

  if (!source.coverImageUrl.trim()) {
    errors.push('Missing required Cover Image URL')
  }

  if (source.topics.length === 0) {
    errors.push('Missing required Topics/Tags')
  }

  if (!source.hasWinningCover) {
    errors.push('Has Winning Cover must be checked')
  }

  if (
    source.winningCoverCount !== undefined &&
    Number.isFinite(source.winningCoverCount) &&
    source.winningCoverCount !== 1
  ) {
    errors.push(
      `Winning Cover Count must be 1 (found ${source.winningCoverCount})`,
    )
  }

  if (normalizeStatus(source.aiCopyeditStatus) !== 'pass') {
    errors.push('AI Copyedit Status must be Pass')
  }

  if (normalizeStatus(source.logicReviewStatus) !== 'pass') {
    errors.push('Logic Review Status must be Pass')
  }

  if (isTutorialLike(source.articleType)) {
    if (normalizeStatus(source.tutorialValidationStatus) !== 'pass') {
      errors.push(
        'Tutorial Validation Status must be Pass for tutorial/hybrid articles',
      )
    }
  } else {
    const tutorialStatus = normalizeStatus(source.tutorialValidationStatus)
    if (
      tutorialStatus &&
      tutorialStatus !== 'not applicable' &&
      tutorialStatus !== 'pass'
    ) {
      errors.push(
        `Tutorial Validation Status must be Not Applicable (or Pass) for non-tutorial articles`,
      )
    }
  }

  if (source.reRevisionRequested) {
    errors.push('Re-Revision Requested must be unchecked')
  }

  if (source.authorRelationIds.length === 0 && !defaultAuthorPageId) {
    errors.push(
      'Missing required Author and NOTION_CMS_DEFAULT_AUTHOR_PAGE_ID is not configured',
    )
  }

  return errors
}

function buildProjectionProperties(
  source: SourceArticle,
  nowIso: string,
  defaultAuthorPageId: string | null,
  searchIndexText?: string,
) {
  const authorPageId = source.authorRelationIds[0] ?? defaultAuthorPageId

  return {
    Title: toTitle(source.title),
    Slug: toRichText(source.slug),
    'Source Article': {
      relation: [{ id: source.id }],
    },
    ...(authorPageId
      ? {
          Author: {
            relation: [{ id: authorPageId }],
          },
        }
      : {}),
    'Content Type': {
      select: { name: 'article' },
    },
    Summary: toRichText(source.summary),
    'Meta Description': toRichText(source.metaDescription || source.summary),
    'Cover Image URL': source.coverImageUrl
      ? { url: source.coverImageUrl }
      : { url: null },
    Keywords: {
      multi_select: source.keywords.map((name) => ({ name })),
    },
    'Topics/Tags': {
      multi_select: source.topics.map((name) => ({ name })),
    },
    Tech: {
      multi_select: source.tech.map((name) => ({ name })),
    },
    'Publish Date': source.publishDate
      ? { date: { start: source.publishDate } }
      : { date: null },
    'Canonical URL': source.liveUrl ? { url: source.liveUrl } : { url: null },
    'Live URL': source.liveUrl ? { url: source.liveUrl } : { url: null },
    Status: {
      select: { name: source.projectionStatus },
    },
    'Sync State': {
      select: { name: 'Synced' },
    },
    'Body Source Mode': {
      select: { name: 'Source Blocks (Canonical)' },
    },
    'Last Synced At': {
      date: { start: nowIso },
    },
    'Hash / Revision Fingerprint': toRichText(source.revisionFingerprint),
    ...(searchIndexText
      ? {
          'Search Index': toRichText(searchIndexText),
          'Search Text': toRichText(searchIndexText),
        }
      : {}),
  }
}

function buildArchivedProjectionProperties(nowIso: string, reason: string) {
  return {
    Status: {
      select: { name: 'Archived' },
    },
    'Sync State': {
      select: { name: 'Synced' },
    },
    'Cleanup State': {
      select: { name: 'Pending' },
    },
    'Cleanup Notes': toRichText(reason),
    'Last Synced At': {
      date: { start: nowIso },
    },
  }
}

function pickKnownProperties(
  properties: Record<string, unknown>,
  knownPropertyNames: Set<string>,
) {
  if (knownPropertyNames.size === 0) {
    return properties
  }

  return Object.fromEntries(
    Object.entries(properties).filter(([name]) => knownPropertyNames.has(name)),
  )
}

function indexTargets(pages: NotionPage[]) {
  const bySourceId = new Map<string, NotionPage>()
  const bySlug = new Map<string, NotionPage>()

  for (const page of pages) {
    const relationIds = propertyToRelationIds(
      getProperty(page.properties, ['Source Article']),
    )
    const slug = toSlug(propertyToText(getProperty(page.properties, ['Slug'])))

    if (relationIds[0] && !bySourceId.has(relationIds[0])) {
      bySourceId.set(relationIds[0], page)
    }

    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, page)
    }
  }

  return { bySourceId, bySlug }
}

async function getSourcePages(pageId?: string): Promise<NotionPage[]> {
  if (pageId) {
    try {
      const page = (await notionGetPage(pageId)) as NotionPage
      return [page]
    } catch (error) {
      const errorCode =
        error instanceof NotionHttpError &&
        error.body &&
        typeof error.body === 'object' &&
        'code' in error.body &&
        typeof (error.body as { code?: unknown }).code === 'string'
          ? (error.body as { code: string }).code
          : null

      if (
        error instanceof NotionHttpError &&
        (error.status === 404 || errorCode === 'object_not_found')
      ) {
        console.warn('[cms:notion] source page not found for projection sync', {
          pageId,
          status: error.status,
          code: errorCode,
        })
        return []
      }

      throw error
    }
  }

  const sourceDataSourceId = getNotionContentDataSourceId()
  return queryAllDataSourcePages(sourceDataSourceId, {})
}

export async function syncPortfolioArticleProjection(options?: {
  pageId?: string
}): Promise<ProjectionSyncResult> {
  const nowIso = new Date().toISOString()
  const errors: Array<{ sourcePageId: string; message: string }> = []
  let created = 0
  let updated = 0
  let archived = 0
  let skipped = 0

  const sourcePages = await getSourcePages(options?.pageId)
  const mapped = sourcePages
    .map(mapSourcePage)
    .filter((entry): entry is SourceArticle => Boolean(entry))
  const mappedById = new Map(mapped.map((source) => [source.id, source]))
  const sourceIds = new Set(sourcePages.map((page) => page.id))

  const targetDataSourceId = getNotionArticlesDataSourceId()
  const targetPages = await queryAllDataSourcePages(targetDataSourceId, {})
  const targetIndex = indexTargets(targetPages)
  const defaultAuthorPageId = getOptionalNotionDefaultAuthorPageId()
  const knownTargetPropertyNames = new Set<string>(
    targetPages[0] ? Object.keys(targetPages[0].properties) : [],
  )

  for (const source of mapped) {
    try {
      const existing =
        targetIndex.bySourceId.get(source.id) ??
        targetIndex.bySlug.get(source.slug)
      let searchIndexText: string | undefined

      if (eligibleForProjection(source)) {
        try {
          const sourceBlocks = await getNotionBlockTree(source.id)
          const flattened = flattenBlockText(sourceBlocks)
          searchIndexText = flattened ? flattened.slice(0, 2000) : undefined
        } catch (error) {
          console.warn('[cms:notion] projection search-index build degraded', {
            sourcePageId: source.id,
            slug: source.slug,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      const properties = pickKnownProperties(
        buildProjectionProperties(
          source,
          nowIso,
          defaultAuthorPageId,
          searchIndexText,
        ),
        knownTargetPropertyNames,
      )
      const publishSafe =
        source.sourceStatus.trim().toLowerCase() === 'ready to publish' ||
        source.sourceStatus.trim().toLowerCase() === 'published'

      if (publishSafe) {
        const gateErrors = validatePublishSafeRequirements(
          source,
          defaultAuthorPageId,
        )
        if (gateErrors.length > 0) {
          errors.push({
            sourcePageId: source.id,
            message: gateErrors.join('; '),
          })
          skipped += 1
          continue
        }
      }

      if (!eligibleForProjection(source) && !existing) {
        skipped += 1
        continue
      }

      if (existing) {
        await notionUpdatePage(existing.id, { properties })
        updated += 1
        continue
      }

      await notionCreatePage({
        parent: { data_source_id: targetDataSourceId },
        properties,
      })
      created += 1
    } catch (error) {
      errors.push({
        sourcePageId: source.id,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown projection sync error',
      })
    }
  }

  if (options?.pageId) {
    const sourceMissing = !sourceIds.has(options.pageId)
    const sourceMappable = mappedById.has(options.pageId)

    if (sourceMissing || !sourceMappable) {
      const existing = targetIndex.bySourceId.get(options.pageId)
      if (existing) {
        try {
          const reason = sourceMissing
            ? 'Source article no longer exists or is inaccessible; projection archived pending cleanup.'
            : 'Source article exists but is no longer eligible/mappable for projection; projection archived pending cleanup.'
          const archivedProperties = pickKnownProperties(
            buildArchivedProjectionProperties(nowIso, reason),
            knownTargetPropertyNames,
          )
          await notionUpdatePage(existing.id, {
            properties: archivedProperties,
          })
          archived += 1
        } catch (error) {
          errors.push({
            sourcePageId: options.pageId,
            message:
              error instanceof Error
                ? error.message
                : 'Unknown projection archive error for missing source page',
          })
        }
      }
    }
  } else {
    for (const target of targetPages) {
      const relationIds = propertyToRelationIds(
        getProperty(target.properties, ['Source Article']),
      )
      const sourceId = relationIds[0]

      if (!sourceId) {
        continue
      }

      const sourceExists = sourceIds.has(sourceId)
      const sourceMappable = mappedById.has(sourceId)

      if (sourceExists && sourceMappable) {
        continue
      }

      try {
        const reason = sourceExists
          ? 'Source article exists but is no longer eligible/mappable for projection; projection archived pending cleanup.'
          : 'Source article relation is orphaned (missing/deleted source); projection archived pending cleanup.'
        const archivedProperties = pickKnownProperties(
          buildArchivedProjectionProperties(nowIso, reason),
          knownTargetPropertyNames,
        )
        await notionUpdatePage(target.id, { properties: archivedProperties })
        archived += 1
      } catch (error) {
        errors.push({
          sourcePageId: sourceId,
          message:
            error instanceof Error
              ? error.message
              : 'Unknown projection archive error during full reconcile',
        })
      }
    }
  }

  return {
    ok: errors.length === 0,
    scanned: sourcePages.length,
    eligible: mapped.filter(eligibleForProjection).length,
    created,
    updated,
    archived,
    skipped,
    errors,
  }
}

export async function reconcilePortfolioArticleProjection(): Promise<ProjectionReconcileResult> {
  const findings: ProjectionReconcileFinding[] = []
  const sourceDataSourceId = getNotionContentDataSourceId()
  const targetDataSourceId = getNotionArticlesDataSourceId()
  const calendarDataSourceId = getNotionContentCalendarDataSourceId()

  const [sourcePages, targetPages, calendarPages] = await Promise.all([
    queryAllDataSourcePages(sourceDataSourceId, {}),
    queryAllDataSourcePages(targetDataSourceId, {}),
    queryAllDataSourcePages(calendarDataSourceId, {}),
  ])

  const mapped = sourcePages
    .map(mapSourcePage)
    .filter((entry): entry is SourceArticle => Boolean(entry))
  const mappedById = new Map(mapped.map((source) => [source.id, source]))
  const targetIndex = indexTargets(targetPages)

  for (const source of mapped) {
    const publishSafe =
      source.sourceStatus.trim().toLowerCase() === 'ready to publish' ||
      source.sourceStatus.trim().toLowerCase() === 'published'

    if (!publishSafe) {
      continue
    }

    const target =
      targetIndex.bySourceId.get(source.id) ??
      targetIndex.bySlug.get(source.slug)
    if (!target) {
      findings.push({
        code: 'SOURCE_PUBLISHSAFE_MISSING_TARGET',
        severity: 'critical',
        sourcePageId: source.id,
        slug: source.slug,
        message: `Publish-safe source article has no projected target for slug "${source.slug}"`,
      })
      continue
    }

    const targetStatus = propertyToText(
      getProperty(target.properties, ['Status']),
    )
    if (
      normalizeStatus(targetStatus) !== normalizeStatus(source.projectionStatus)
    ) {
      findings.push({
        code: 'STATUS_MISMATCH',
        severity: 'warning',
        sourcePageId: source.id,
        targetPageId: target.id,
        slug: source.slug,
        message: `Status mismatch for slug "${source.slug}": source=${source.projectionStatus}, target=${targetStatus || 'empty'}`,
      })
    }

    const targetCover = propertyToText(
      getProperty(target.properties, ['Cover Image URL']),
    )
    if ((targetCover || '').trim() !== (source.coverImageUrl || '').trim()) {
      findings.push({
        code: 'COVER_URL_MISMATCH',
        severity: 'warning',
        sourcePageId: source.id,
        targetPageId: target.id,
        slug: source.slug,
        message: `Cover URL mismatch for slug "${source.slug}"`,
      })
    }
  }

  for (const target of targetPages) {
    const sourceId = propertyToRelationIds(
      getProperty(target.properties, ['Source Article']),
    )[0]
    if (!sourceId) {
      continue
    }
    const source = mappedById.get(sourceId)
    const targetStatus = normalizeStatus(
      propertyToText(getProperty(target.properties, ['Status'])),
    )
    const targetIsPublishSafe =
      targetStatus === 'ready to publish' || targetStatus === 'published'
    const sourceIsPublishSafe =
      source &&
      (normalizeStatus(source.sourceStatus) === 'ready to publish' ||
        normalizeStatus(source.sourceStatus) === 'published')

    if (targetIsPublishSafe && !sourceIsPublishSafe) {
      findings.push({
        code: 'TARGET_PUBLISHSAFE_MISSING_SOURCE',
        severity: 'critical',
        targetPageId: target.id,
        sourcePageId: sourceId,
        slug: propertyToText(getProperty(target.properties, ['Slug'])),
        message:
          'Target article is publish-safe but source article is missing or not publish-safe',
      })
    }
  }

  const articleToCalendarRows = new Map<string, string[]>()
  for (const row of calendarPages) {
    const rowStatus = normalizeStatus(
      propertyToText(getProperty(row.properties, ['Status', 'Content Status'])),
    )
    const rowIsPublishSafe =
      rowStatus === 'ready to publish' || rowStatus === 'published'
    const assigned = propertyToRelationIds(
      getProperty(row.properties, ['Assigned Article', 'Article']),
    )

    if (rowIsPublishSafe && assigned.length === 0) {
      findings.push({
        code: 'CALENDAR_MISSING_ASSIGNED_ARTICLE',
        severity: 'warning',
        calendarPageId: row.id,
        message:
          'Publish-safe content calendar row is missing Assigned Article relation',
      })
    }

    if (assigned.length > 1) {
      findings.push({
        code: 'CALENDAR_MULTI_ASSIGNED_ARTICLES',
        severity: 'critical',
        calendarPageId: row.id,
        message: 'Content calendar row has multiple Assigned Article relations',
      })
    }

    for (const articleId of assigned) {
      const rows = articleToCalendarRows.get(articleId) ?? []
      rows.push(row.id)
      articleToCalendarRows.set(articleId, rows)
    }
  }

  for (const [articleId, rows] of articleToCalendarRows.entries()) {
    if (rows.length <= 1) {
      continue
    }
    findings.push({
      code: 'CALENDAR_ARTICLE_MULTI_ROWS',
      severity: 'warning',
      sourcePageId: articleId,
      message: `Single article is assigned to multiple content calendar rows (${rows.length})`,
    })
  }

  return {
    ok: !findings.some((finding) => finding.severity === 'critical'),
    checkedSource: mapped.length,
    checkedTargets: targetPages.length,
    checkedCalendarRows: calendarPages.length,
    findings,
  }
}

export async function evaluateSourceArticlePublishGate(
  sourcePageId: string,
): Promise<SourcePublishGateResult> {
  let sourcePage: NotionPage

  try {
    sourcePage = (await notionGetPage(sourcePageId)) as NotionPage
  } catch (error) {
    return {
      ok: false,
      sourcePageId,
      reasons: [
        error instanceof Error
          ? `Unable to load source page: ${error.message}`
          : 'Unable to load source page',
      ],
    }
  }

  const mapped = mapSourcePage(sourcePage)
  if (!mapped) {
    return {
      ok: false,
      sourcePageId,
      reasons: [
        'Source page is not an eligible Blog Post record for projection',
      ],
    }
  }

  const reasons = validatePublishSafeRequirements(
    mapped,
    getOptionalNotionDefaultAuthorPageId(),
  )

  return {
    ok: reasons.length === 0,
    sourcePageId,
    sourceStatus: mapped.sourceStatus,
    reasons,
  }
}
