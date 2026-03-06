import {
  notionCreatePage,
  notionGetDataSource,
  notionRequest,
  notionUpdatePage,
  parseDataSourceId,
} from '@/lib/cms/notion/client'
import type {
  NotionPage,
  NotionProperty,
  NotionQueryResponse,
} from '@/lib/cms/notion/contracts'
import { getProperty, propertyToDate } from '@/lib/cms/notion/property'

type ErrorLogPayload = {
  workflow: string
  endpoint?: string
  error: string
  sourcePageId?: string
  details?: unknown
}

type ErrorLogSchema = {
  dataSourceId: string
  propertyTypesByName: Map<string, string>
  titlePropertyName: string
}

let schemaCache: { value: ErrorLogSchema; fetchedAt: number } | null = null
const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000
const MAX_TEXT_LENGTH = 1900

function truncate(value: string) {
  return value.length > MAX_TEXT_LENGTH
    ? `${value.slice(0, MAX_TEXT_LENGTH - 1)}…`
    : value
}

function getOptionalErrorLogDataSourceId() {
  const raw = process.env.NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE?.trim()
  if (!raw) {
    return null
  }
  return parseDataSourceId(raw, 'NOTION_CMS_AUTOMATION_ERRORS_DATA_SOURCE')
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findPropertyName(
  schema: ErrorLogSchema,
  aliases: string[],
): string | null {
  const names = Array.from(schema.propertyTypesByName.keys())
  for (const alias of aliases) {
    const key = normalized(alias)
    const found = names.find((name) => normalized(name) === key)
    if (found) {
      return found
    }
  }
  return null
}

async function loadSchema(dataSourceId: string): Promise<ErrorLogSchema> {
  if (
    schemaCache &&
    schemaCache.value.dataSourceId === dataSourceId &&
    Date.now() - schemaCache.fetchedAt < SCHEMA_CACHE_TTL_MS
  ) {
    return schemaCache.value
  }

  const response = (await notionGetDataSource(dataSourceId)) as {
    properties?: Record<string, NotionProperty>
  }

  const propertyTypesByName = new Map<string, string>()
  let titlePropertyName = 'Name'
  for (const [name, spec] of Object.entries(response.properties ?? {})) {
    const type = spec?.type ?? ''
    propertyTypesByName.set(name, type)
    if (type === 'title') {
      titlePropertyName = name
    }
  }

  const schema: ErrorLogSchema = {
    dataSourceId,
    propertyTypesByName,
    titlePropertyName,
  }
  schemaCache = { value: schema, fetchedAt: Date.now() }
  return schema
}

function textPropertyValue(type: string, value: string) {
  const content = truncate(value)
  if (type === 'rich_text' || type === 'text') {
    return {
      rich_text: [
        {
          type: 'text',
          text: { content },
        },
      ],
    }
  }
  if (type === 'title') {
    return {
      title: [
        {
          type: 'text',
          text: { content },
        },
      ],
    }
  }
  if (type === 'url') {
    return { url: content || null }
  }
  return null
}

function setTextProperty(
  schema: ErrorLogSchema,
  properties: Record<string, unknown>,
  aliases: string[],
  value: string,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName) {
    return
  }
  const type = schema.propertyTypesByName.get(propertyName) ?? ''
  const encoded = textPropertyValue(type, value)
  if (!encoded) {
    return
  }
  properties[propertyName] = encoded
}

function setDateProperty(
  schema: ErrorLogSchema,
  properties: Record<string, unknown>,
  aliases: string[],
  iso: string,
) {
  const propertyName = findPropertyName(schema, aliases)
  if (!propertyName) {
    return
  }
  const type = schema.propertyTypesByName.get(propertyName) ?? ''
  if (type !== 'date') {
    return
  }
  properties[propertyName] = { date: { start: iso } }
}

function setSeverityProperty(
  schema: ErrorLogSchema,
  properties: Record<string, unknown>,
  severity: 'Error' | 'Warning',
) {
  const propertyName = findPropertyName(schema, ['Severity', 'Level', 'Status'])
  if (!propertyName) {
    return
  }
  const type = schema.propertyTypesByName.get(propertyName) ?? ''
  if (type === 'select') {
    properties[propertyName] = { select: { name: severity } }
  } else if (type === 'status') {
    properties[propertyName] = { status: { name: severity } }
  }
}

export async function logAutomationErrorToNotion(
  payload: ErrorLogPayload,
): Promise<void> {
  const dataSourceId = getOptionalErrorLogDataSourceId()
  if (!dataSourceId) {
    return
  }

  const schema = await loadSchema(dataSourceId)
  const timestamp = new Date().toISOString()
  const title = `${payload.workflow} • ${timestamp}`
  const properties: Record<string, unknown> = {
    [schema.titlePropertyName]: textPropertyValue('title', title),
  }

  setSeverityProperty(schema, properties, 'Error')
  setDateProperty(
    schema,
    properties,
    ['Occurred At', 'Timestamp', 'Date'],
    timestamp,
  )
  setTextProperty(
    schema,
    properties,
    ['Workflow', 'Pipeline', 'Job'],
    payload.workflow,
  )
  setTextProperty(
    schema,
    properties,
    ['Endpoint', 'Route', 'API Route'],
    payload.endpoint ?? '',
  )
  setTextProperty(
    schema,
    properties,
    ['Error', 'Message', 'Details'],
    payload.error,
  )
  setTextProperty(
    schema,
    properties,
    ['Source Page ID', 'Page ID', 'Entity ID'],
    payload.sourcePageId ?? '',
  )

  if (payload.details !== undefined) {
    const serialized = truncate(
      typeof payload.details === 'string'
        ? payload.details
        : JSON.stringify(payload.details),
    )
    setTextProperty(
      schema,
      properties,
      ['Raw Payload', 'Context', 'Debug Payload', 'Error Context'],
      serialized,
    )
  }

  await notionCreatePage({
    parent: { data_source_id: dataSourceId },
    properties,
  })
}

type AutomationErrorRetentionResult = {
  ok: boolean
  enabled: boolean
  scanned: number
  eligible: number
  archived: number
  cutoffIso: string
  errors: Array<{ pageId: string; message: string }>
}

function toOccurredAt(page: {
  properties: Record<string, NotionProperty>
  created_time?: string
}): string {
  return (
    propertyToDate(getProperty(page.properties, ['Occurred At'])) ||
    page.created_time ||
    ''
  )
}

export async function pruneAutomationErrorLogs(options?: {
  retentionDays?: number
  limit?: number
}): Promise<AutomationErrorRetentionResult> {
  const dataSourceId = getOptionalErrorLogDataSourceId()
  if (!dataSourceId) {
    return {
      ok: true,
      enabled: false,
      scanned: 0,
      eligible: 0,
      archived: 0,
      cutoffIso: new Date().toISOString(),
      errors: [],
    }
  }

  const retentionDays =
    typeof options?.retentionDays === 'number' &&
    Number.isFinite(options.retentionDays) &&
    options.retentionDays > 0
      ? Math.floor(options.retentionDays)
      : 30
  const limit =
    typeof options?.limit === 'number' &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : 100

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
  const eligible: NotionPage[] = []
  let scanned = 0
  let nextCursor: string | null = null

  // Query incrementally and stop when we have enough archive candidates.
  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
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
      scanned += 1
      if (page.archived || page.in_trash) {
        continue
      }

      const occurredAt = toOccurredAt(
        page as {
          properties: Record<string, NotionProperty>
          created_time?: string
        },
      )
      if (!occurredAt) {
        continue
      }

      const ms = Date.parse(occurredAt)
      if (!Number.isFinite(ms) || ms >= cutoff.getTime()) {
        continue
      }

      eligible.push(page)
      if (eligible.length >= limit) {
        break
      }
    }

    if (eligible.length >= limit) {
      break
    }
    nextCursor = response.has_more ? response.next_cursor : null
  } while (nextCursor)

  let archived = 0
  const errors: Array<{ pageId: string; message: string }> = []
  for (const page of eligible) {
    try {
      await notionUpdatePage(page.id, { archived: true })
      archived += 1
    } catch (error) {
      errors.push({
        pageId: page.id,
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    scanned,
    eligible: eligible.length,
    archived,
    cutoffIso: cutoff.toISOString(),
    errors,
  }
}
