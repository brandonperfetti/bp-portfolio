import type { NotionPage } from '@/lib/cms/notion/contracts'

import { notionCreatePage, notionGetDataSource, notionUpdatePage } from '@/lib/cms/notion/client'
import { getOptionalNotionWebhookEventsDataSourceId } from '@/lib/cms/notion/config'
import { queryAllDataSourcePages } from '@/lib/cms/notion/pagination'
import { getProperty, propertyToBoolean, propertyToDate, propertyToNumber, propertyToText } from '@/lib/cms/notion/property'

type LedgerState = 'processing' | 'completed' | 'failed'

type LedgerSchema = {
  dataSourceId: string
  titlePropertyName: string
  propertyTypesByName: Map<string, string>
}

export type WebhookEventClaim =
  | { action: 'disabled' }
  | { action: 'skip_duplicate'; reason: string }
  | { action: 'skip_processed'; reason: string }
  | { action: 'claimed'; ledgerPageId: string }

export type WebhookLedgerWatchdogResult = {
  ok: boolean
  enabled: boolean
  scanned: number
  staleFound: number
  markedFailed: number
  errors: Array<{ ledgerPageId: string; message: string }>
}

type CachedLedgerSchema = {
  schema: LedgerSchema
  fetchedAt: number
}

const DEFAULT_SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000
const schemaCache = new Map<string, CachedLedgerSchema>()

function resolveSchemaCacheTtlMs() {
  const raw = process.env.NOTION_LEDGER_SCHEMA_CACHE_TTL_MS
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return DEFAULT_SCHEMA_CACHE_TTL_MS
}

function getSchemaCacheEntry(dataSourceId: string): LedgerSchema | null {
  const cached = schemaCache.get(dataSourceId)
  if (!cached) {
    return null
  }

  const ttlMs = resolveSchemaCacheTtlMs()
  if (Date.now() - cached.fetchedAt > ttlMs) {
    schemaCache.delete(dataSourceId)
    return null
  }

  return cached.schema
}

function setSchemaCacheEntry(dataSourceId: string, schema: LedgerSchema) {
  schemaCache.set(dataSourceId, { schema, fetchedAt: Date.now() })
}

export function invalidateSchemaCache(dataSourceId: string) {
  schemaCache.delete(dataSourceId)
}

export function clearSchemaCache() {
  schemaCache.clear()
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

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function getEventIdFromPage(page: NotionPage) {
  const named =
    propertyToText(
      getProperty(page.properties, ['Event ID', 'Event Id', 'Webhook Event ID', 'Name', 'Title']),
    ) || ''
  if (named.trim()) {
    return named.trim()
  }

  for (const property of Object.values(page.properties)) {
    if (property.type === 'title') {
      const title = propertyToText(property)
      if (title.trim()) {
        return title.trim()
      }
    }
  }

  return ''
}

function getEventState(page: NotionPage): LedgerState | '' {
  const status = normalize(propertyToText(getProperty(page.properties, ['State', 'Status'])))
  if (status === 'processing' || status === 'completed' || status === 'failed') {
    return status
  }
  return ''
}

function getReceivedAt(page: NotionPage): string {
  return propertyToDate(getProperty(page.properties, ['Received At'])) || ''
}

function isRecentlyProcessing(page: NotionPage, now: Date): boolean {
  const state = getEventState(page)
  if (state !== 'processing') {
    return false
  }

  const receivedAt = getReceivedAt(page)
  if (!receivedAt) {
    return true
  }

  const ms = Date.parse(receivedAt)
  if (Number.isNaN(ms)) {
    return true
  }

  return now.getTime() - ms < 5 * 60 * 1000
}

function pickCanonicalMatch(matches: NotionPage[]) {
  return matches.slice().sort((a, b) => {
    const aReceived = getReceivedAt(a)
    const bReceived = getReceivedAt(b)

    const aMs = aReceived ? Date.parse(aReceived) : Number.NaN
    const bMs = bReceived ? Date.parse(bReceived) : Number.NaN

    const aSafe = Number.isNaN(aMs) ? Number.MAX_SAFE_INTEGER : aMs
    const bSafe = Number.isNaN(bMs) ? Number.MAX_SAFE_INTEGER : bMs

    if (aSafe !== bSafe) {
      return aSafe - bSafe
    }

    return a.id.localeCompare(b.id)
  })[0]
}

async function ensureLedgerSchema(dataSourceId: string): Promise<LedgerSchema> {
  const cached = getSchemaCacheEntry(dataSourceId)
  if (cached) {
    return cached
  }

  const dataSource = (await notionGetDataSource(dataSourceId)) as {
    properties?: Record<string, { type?: string }>
  }

  const properties = dataSource.properties ?? {}
  const propertyTypesByName = new Map<string, string>()
  let titlePropertyName = 'Name'

  for (const [name, spec] of Object.entries(properties)) {
    const type = spec?.type ?? ''
    propertyTypesByName.set(name, type)
    if (type === 'title') {
      titlePropertyName = name
    }
  }

  const schema: LedgerSchema = {
    dataSourceId,
    titlePropertyName,
    propertyTypesByName,
  }
  setSchemaCacheEntry(dataSourceId, schema)

  return schema
}

function setTextProperty(
  schema: LedgerSchema,
  properties: Record<string, unknown>,
  names: string[],
  value: string,
) {
  for (const name of names) {
    const type = schema.propertyTypesByName.get(name)
    if (!type) {
      continue
    }
    if (type === 'rich_text') {
      properties[name] = toRichText(value)
      return
    }
    if (type === 'title') {
      properties[name] = toTitle(value)
      return
    }
    if (type === 'url') {
      properties[name] = { url: value || null }
      return
    }
  }
}

function setDateProperty(
  schema: LedgerSchema,
  properties: Record<string, unknown>,
  names: string[],
  iso: string,
) {
  for (const name of names) {
    const type = schema.propertyTypesByName.get(name)
    if (type === 'date') {
      properties[name] = { date: { start: iso } }
      return
    }
  }
}

function setCheckboxProperty(
  schema: LedgerSchema,
  properties: Record<string, unknown>,
  names: string[],
  value: boolean,
) {
  for (const name of names) {
    const type = schema.propertyTypesByName.get(name)
    if (type === 'checkbox') {
      properties[name] = { checkbox: value }
      return
    }
  }
}

function setNumberProperty(
  schema: LedgerSchema,
  properties: Record<string, unknown>,
  names: string[],
  value: number,
) {
  for (const name of names) {
    const type = schema.propertyTypesByName.get(name)
    if (type === 'number') {
      properties[name] = { number: value }
      return
    }
  }
}

function setStateProperty(
  schema: LedgerSchema,
  properties: Record<string, unknown>,
  value: LedgerState,
) {
  for (const name of ['State', 'Status']) {
    const type = schema.propertyTypesByName.get(name)
    if (type === 'rich_text') {
      properties[name] = toRichText(value)
      return
    }
    if (type === 'title') {
      properties[name] = toTitle(value)
      return
    }
    if (type === 'status') {
      properties[name] = { status: { name: value } }
      return
    }
    if (type === 'select') {
      properties[name] = { select: { name: value } }
      return
    }
  }
}

function buildClaimProperties(
  schema: LedgerSchema,
  input: {
    eventId: string
    eventType: string
    entityId?: string
    attempts: number
  },
): Record<string, unknown> {
  const nowIso = new Date().toISOString()
  const properties: Record<string, unknown> = {
    [schema.titlePropertyName]: toTitle(input.eventId),
  }

  setTextProperty(schema, properties, ['Event ID', 'Event Id', 'Webhook Event ID'], input.eventId)
  setTextProperty(schema, properties, ['Event Type'], input.eventType)
  setTextProperty(schema, properties, ['Entity ID'], input.entityId ?? '')
  setDateProperty(schema, properties, ['Received At'], nowIso)
  setStateProperty(schema, properties, 'processing')
  setCheckboxProperty(schema, properties, ['Processed'], false)
  setNumberProperty(schema, properties, ['Attempts'], input.attempts)

  return properties
}

function buildCompleteProperties(schema: LedgerSchema): Record<string, unknown> {
  const nowIso = new Date().toISOString()
  const properties: Record<string, unknown> = {}
  setStateProperty(schema, properties, 'completed')
  setCheckboxProperty(schema, properties, ['Processed'], true)
  setDateProperty(schema, properties, ['Processed At'], nowIso)
  setTextProperty(schema, properties, ['Last Error', 'Error'], '')
  return properties
}

function buildFailedProperties(schema: LedgerSchema, message: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  setStateProperty(schema, properties, 'failed')
  setCheckboxProperty(schema, properties, ['Processed'], false)
  setTextProperty(schema, properties, ['Last Error', 'Error'], message)
  return properties
}

function buildEventIdFilters(
  schema: LedgerSchema,
  eventId: string,
): Array<Record<string, unknown>> {
  const filters: Array<Record<string, unknown>> = []
  const seen = new Set<string>()

  const candidates = [
    'Event ID',
    'Event Id',
    'Webhook Event ID',
    schema.titlePropertyName,
  ]

  for (const name of candidates) {
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)

    const type = schema.propertyTypesByName.get(name)
    if (type === 'rich_text') {
      filters.push({ property: name, rich_text: { equals: eventId } })
      continue
    }
    if (type === 'title') {
      filters.push({ property: name, title: { equals: eventId } })
    }
  }

  return filters
}

async function listMatchingEventRows(
  dataSourceId: string,
  eventId: string,
  schema: LedgerSchema,
) {
  const filters = buildEventIdFilters(schema, eventId)
  if (filters.length) {
    try {
      const rows = await queryAllDataSourcePages(dataSourceId, {
        filter: filters.length === 1 ? filters[0] : { or: filters },
      })
      return rows.filter((row) => getEventIdFromPage(row) === eventId)
    } catch (error) {
      console.warn(
        '[cms:notion:webhook] falling back to full event ledger scan',
        {
          dataSourceId,
          eventId,
          error: error instanceof Error ? error.message : String(error),
        },
      )
    }
  }

  const rows = await queryAllDataSourcePages(dataSourceId, {})
  return rows.filter((row) => getEventIdFromPage(row) === eventId)
}

export async function claimWebhookEvent(input: {
  eventId?: string
  eventType: string
  entityId?: string
}): Promise<WebhookEventClaim> {
  const eventId = input.eventId?.trim()
  if (!eventId) {
    return { action: 'claimed', ledgerPageId: '' }
  }

  const dataSourceId = getOptionalNotionWebhookEventsDataSourceId()
  if (!dataSourceId) {
    return { action: 'disabled' }
  }

  const schema = await ensureLedgerSchema(dataSourceId)
  const now = new Date()

  const matches = await listMatchingEventRows(dataSourceId, eventId, schema)
  if (matches.length > 0) {
    const canonical = pickCanonicalMatch(matches)

    const processed =
      propertyToBoolean(getProperty(canonical.properties, ['Processed'])) ??
      false
    if (processed || getEventState(canonical) === 'completed') {
      return { action: 'skip_processed', reason: 'Event already completed' }
    }

    if (isRecentlyProcessing(canonical, now)) {
      return { action: 'skip_duplicate', reason: 'Event currently processing' }
    }

    const attempts = propertyToNumber(getProperty(canonical.properties, ['Attempts'])) ?? 0
    await notionUpdatePage(canonical.id, {
      properties: buildClaimProperties(schema, {
        eventId,
        eventType: input.eventType,
        entityId: input.entityId,
        attempts: attempts + 1,
      }),
    })

    return { action: 'claimed', ledgerPageId: canonical.id }
  }

  const created = (await notionCreatePage({
    parent: { data_source_id: dataSourceId },
    properties: buildClaimProperties(schema, {
      eventId,
      eventType: input.eventType,
      entityId: input.entityId,
      attempts: 1,
    }),
  })) as { id: string }

  return { action: 'claimed', ledgerPageId: created.id }
}

export async function completeWebhookEventClaim(ledgerPageId: string) {
  const dataSourceId = getOptionalNotionWebhookEventsDataSourceId()
  if (!dataSourceId || !ledgerPageId) {
    return
  }

  const schema = await ensureLedgerSchema(dataSourceId)
  await notionUpdatePage(ledgerPageId, {
    properties: buildCompleteProperties(schema),
  })
}

export async function failWebhookEventClaim(ledgerPageId: string, error: string) {
  const dataSourceId = getOptionalNotionWebhookEventsDataSourceId()
  if (!dataSourceId || !ledgerPageId) {
    return
  }

  const schema = await ensureLedgerSchema(dataSourceId)
  await notionUpdatePage(ledgerPageId, {
    properties: buildFailedProperties(schema, error.slice(0, 2000)),
  })
}

export async function runWebhookLedgerWatchdog(options?: {
  staleMinutes?: number
  limit?: number
}): Promise<WebhookLedgerWatchdogResult> {
  const dataSourceId = getOptionalNotionWebhookEventsDataSourceId()
  if (!dataSourceId) {
    return {
      ok: true,
      enabled: false,
      scanned: 0,
      staleFound: 0,
      markedFailed: 0,
      errors: [],
    }
  }

  const staleMinutes =
    typeof options?.staleMinutes === 'number' && options.staleMinutes > 0
      ? options.staleMinutes
      : 15
  const limit = typeof options?.limit === 'number' && options.limit > 0 ? options.limit : 100
  const staleMs = staleMinutes * 60 * 1000
  const now = Date.now()
  const errors: Array<{ ledgerPageId: string; message: string }> = []

  const rows = await queryAllDataSourcePages(dataSourceId, {})
  const staleRows = rows
    .filter((row) => {
      const state = getEventState(row)
      if (state !== 'processing') {
        return false
      }
      const processed = propertyToBoolean(getProperty(row.properties, ['Processed'])) ?? false
      if (processed) {
        return false
      }
      const receivedAt = getReceivedAt(row)
      if (!receivedAt) {
        return true
      }
      const receivedMs = Date.parse(receivedAt)
      if (Number.isNaN(receivedMs)) {
        return true
      }
      return now - receivedMs >= staleMs
    })
    .sort((a, b) => {
      const aMs = Date.parse(getReceivedAt(a) || '')
      const bMs = Date.parse(getReceivedAt(b) || '')
      const aSafe = Number.isNaN(aMs) ? 0 : aMs
      const bSafe = Number.isNaN(bMs) ? 0 : bMs
      return aSafe - bSafe
    })
    .slice(0, limit)

  let markedFailed = 0
  for (const row of staleRows) {
    try {
      await failWebhookEventClaim(
        row.id,
        `Watchdog timeout: state remained processing for >= ${staleMinutes} minutes`,
      )
      markedFailed += 1
    } catch (error) {
      errors.push({
        ledgerPageId: row.id,
        message: error instanceof Error ? error.message : 'Unknown watchdog error',
      })
    }
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    scanned: rows.length,
    staleFound: staleRows.length,
    markedFailed,
    errors,
  }
}
