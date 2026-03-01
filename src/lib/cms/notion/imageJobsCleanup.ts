import type { NotionPage, NotionProperty } from '@/lib/cms/notion/contracts'

import { notionUpdatePage } from '@/lib/cms/notion/client'
import { getOptionalNotionImageJobsDataSourceId } from '@/lib/cms/notion/config'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import {
  getProperty,
  propertyToBoolean,
  propertyToDate,
  propertyToText,
} from '@/lib/cms/notion/property'

export type ImageJobsCleanupResult = {
  ok: boolean
  enabled: boolean
  retentionDays: number
  scanned: number
  eligible: number
  archived: number
  preservedWinner: number
  skippedRecent: number
  skippedMissingRetention: number
  errors: Array<{ pageId: string; message: string }>
}

const STATUS_COMPLETED = new Set([
  'complete',
  'completed',
  'done',
  'succeeded',
  'success',
])

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

function findPropertyName(
  properties: Record<string, NotionProperty>,
  aliases: string[],
) {
  const normalizeName = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const lookup = new Map(
    Object.keys(properties).map((name) => [normalizeName(name), name]),
  )
  for (const alias of aliases) {
    const key = lookup.get(normalizeName(alias))
    if (key) {
      return key
    }
  }
  return null
}

function isWinner(page: NotionPage) {
  return (
    propertyToBoolean(
      getProperty(page.properties, [
        'Winner',
        'Winning Cover',
        'Selected Winner',
        'Is Winner',
      ]),
    ) ?? false
  )
}

function isCompleted(page: NotionPage) {
  const status = normalize(
    propertyToText(getProperty(page.properties, ['Status', 'State'])),
  )
  return STATUS_COMPLETED.has(status)
}

function resolveRetentionTimestamp(page: NotionPage) {
  const explicit = propertyToDate(
    getProperty(page.properties, [
      'Retention Until',
      'Cleanup After',
      'Archive After',
    ]),
  )
  if (explicit) {
    const ms = Date.parse(explicit)
    if (!Number.isNaN(ms)) {
      return ms
    }
  }

  return Number.NaN
}

function buildArchivedMetadataProperties(page: NotionPage) {
  const properties: Record<string, unknown> = {}
  const cleanupStateName = findPropertyName(page.properties, ['Cleanup State'])
  if (cleanupStateName) {
    const type = page.properties[cleanupStateName]?.type
    if (type === 'status') {
      properties[cleanupStateName] = { status: { name: 'Archived' } }
    } else if (type === 'select') {
      properties[cleanupStateName] = { select: { name: 'Archived' } }
    }
  }

  const cleanupNotesName = findPropertyName(page.properties, ['Cleanup Notes'])
  if (cleanupNotesName) {
    const type = page.properties[cleanupNotesName]?.type
    const content =
      'Archived by cron cleanup after retention policy window elapsed.'
    if (type === 'rich_text') {
      properties[cleanupNotesName] = {
        rich_text: [{ type: 'text', text: { content } }],
      }
    } else if (type === 'title') {
      properties[cleanupNotesName] = {
        title: [{ type: 'text', text: { content } }],
      }
    }
  }

  return properties
}

export async function pruneImageJobs(options?: {
  retentionDays?: number
  limit?: number
}): Promise<ImageJobsCleanupResult> {
  const dataSourceId = getOptionalNotionImageJobsDataSourceId()
  const retentionDays = parsePositiveInt(
    String(options?.retentionDays ?? process.env.CMS_IMAGE_JOBS_RETENTION_DAYS),
    30,
  )
  const limit = parsePositiveInt(
    String(options?.limit ?? process.env.CMS_IMAGE_JOBS_CLEANUP_LIMIT),
    100,
  )

  if (!dataSourceId) {
    return {
      ok: true,
      enabled: false,
      retentionDays,
      scanned: 0,
      eligible: 0,
      archived: 0,
      preservedWinner: 0,
      skippedRecent: 0,
      skippedMissingRetention: 0,
      errors: [],
    }
  }

  const rows = await queryAllDataSourcePages(dataSourceId, {})
  const errors: Array<{ pageId: string; message: string }> = []
  const nowMs = Date.now()
  const fallbackCutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000
  const allowFallbackAge =
    normalize(process.env.CMS_IMAGE_JOBS_CLEANUP_ALLOW_FALLBACK_AGE ?? '') ===
    'true'

  let archived = 0
  let eligible = 0
  let preservedWinner = 0
  let skippedRecent = 0
  let skippedMissingRetention = 0

  for (const page of rows) {
    if (archived >= limit) {
      break
    }
    if (page.archived || page.in_trash) {
      continue
    }
    if (isWinner(page)) {
      preservedWinner += 1
      continue
    }
    if (!isCompleted(page)) {
      continue
    }

    eligible += 1
    const retentionMs = resolveRetentionTimestamp(page)

    let isExpired = false
    if (!Number.isNaN(retentionMs)) {
      isExpired = retentionMs <= nowMs
    } else if (allowFallbackAge) {
      const ageMs = Date.parse(page.last_edited_time ?? '')
      if (!Number.isNaN(ageMs)) {
        isExpired = ageMs <= fallbackCutoffMs
      }
    } else {
      skippedMissingRetention += 1
      continue
    }

    if (!isExpired) {
      skippedRecent += 1
      continue
    }

    try {
      const metadataProperties = buildArchivedMetadataProperties(page)
      if (Object.keys(metadataProperties).length > 0) {
        await notionUpdatePage(page.id, { properties: metadataProperties })
      }
      await notionUpdatePage(page.id, { in_trash: true })
      archived += 1
    } catch (error) {
      errors.push({
        pageId: page.id,
        message:
          error instanceof Error
            ? error.message
            : 'Unknown image-job cleanup error',
      })
    }
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    retentionDays,
    scanned: rows.length,
    eligible,
    archived,
    preservedWinner,
    skippedRecent,
    skippedMissingRetention,
    errors,
  }
}
