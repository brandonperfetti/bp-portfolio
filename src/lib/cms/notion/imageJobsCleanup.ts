import type {
  NotionPage,
  NotionQueryResponse,
} from '@/lib/cms/notion/contracts'

import { notionRequest, notionUpdatePage } from '@/lib/cms/notion/client'
import { getOptionalNotionImageJobsDataSourceId } from '@/lib/cms/notion/config'
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

  const errors: Array<{ pageId: string; message: string }> = []
  const nowMs = Date.now()
  const fallbackCutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000
  const allowFallbackAge =
    normalize(process.env.CMS_IMAGE_JOBS_CLEANUP_ALLOW_FALLBACK_AGE ?? '') ===
    'true'

  let scanned = 0
  let nextCursor: string | null = null
  let archived = 0
  let eligible = 0
  let preservedWinner = 0
  let skippedRecent = 0
  let skippedMissingRetention = 0

  // Page through rows and stop fetching once we archive `limit` entries.
  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'ascending' }],
    }
    if (nextCursor) {
      body.start_cursor = nextCursor
    }

    const response = await notionRequest<NotionQueryResponse>(
      `/data_sources/${dataSourceId}/query`,
      {
        method: 'POST',
        body,
      },
    )

    for (const page of response.results) {
      if (archived >= limit) {
        break
      }
      scanned += 1
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

    if (archived >= limit) {
      break
    }
    nextCursor = response.has_more ? response.next_cursor : null
  } while (nextCursor)

  return {
    ok: errors.length === 0,
    enabled: true,
    retentionDays,
    scanned,
    eligible,
    archived,
    preservedWinner,
    skippedRecent,
    skippedMissingRetention,
    errors,
  }
}
