import { createHmac, timingSafeEqual } from 'node:crypto'

import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { CMS_TAGS } from '@/lib/cms/cache'
import {
  getNotionContentDataSourceId,
  getOptionalNotionWebhookEventsDataSourceId,
} from '@/lib/cms/notion/config'
import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import {
  claimWebhookEvent,
  completeWebhookEventClaim,
  failWebhookEventClaim,
} from '@/lib/cms/notion/webhookEventLedger'

type NotionWebhookEvent = {
  id?: string
  type?: string
  entity?: {
    id?: string
    [key: string]: unknown
  }
  data?: {
    id?: string
    [key: string]: unknown
  }
  timestamp?: string
}

type NotionWebhookPayload = {
  verification_token?: string
  events?: NotionWebhookEvent[]
} & NotionWebhookEvent

function normalizeEvents(payload: NotionWebhookPayload): NotionWebhookEvent[] {
  if (Array.isArray(payload.events)) {
    return payload.events
  }

  // Some Notion webhook deliveries are a single event object rather than an
  // envelope with `events[]`. Support both shapes.
  if (typeof payload.type === 'string') {
    return [payload]
  }

  return []
}

const EVENT_TTL_MS = 24 * 60 * 60 * 1000
// Best-effort fast-path dedupe for duplicate events in the same process instance.
// In serverless/multi-instance deployments this map is not shared, so canonical
// distributed dedupe still relies on claimWebhookEvent + ledger state in Notion.
const eventDedupe = new Map<string, number>()

function cleanupEventCache() {
  const cutoff = Date.now() - EVENT_TTL_MS
  for (const [eventId, timestamp] of eventDedupe) {
    if (timestamp < cutoff) {
      eventDedupe.delete(eventId)
    }
  }
}

function verifySignature(
  payload: string,
  signatureHeader: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const provided = signatureHeader
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, '')

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

function applyEventRevalidation(eventType: string) {
  if (eventType === 'comment.created' || eventType.startsWith('comment.')) {
    return
  }

  if (
    eventType === 'page.created' ||
    eventType === 'page.properties_updated' ||
    eventType === 'page.content_updated' ||
    eventType === 'page.deleted' ||
    eventType === 'page.undeleted' ||
    eventType === 'page.moved'
  ) {
    revalidateTag(CMS_TAGS.articles, 'max')
    revalidateTag(CMS_TAGS.projects, 'max')
    revalidateTag(CMS_TAGS.tech, 'max')
    revalidateTag(CMS_TAGS.uses, 'max')
    revalidateTag(CMS_TAGS.workHistory, 'max')
    revalidateTag(CMS_TAGS.pages, 'max')

    revalidatePath('/')
    revalidatePath('/about')
    revalidatePath('/articles')
    revalidatePath('/projects')
    revalidatePath('/tech')
    revalidatePath('/uses')
    revalidatePath('/sitemap.xml')
    revalidatePath('/feed.xml')

    return
  }

  if (eventType === 'data_source.content_updated') {
    revalidateTag(CMS_TAGS.articles, 'max')
    revalidateTag(CMS_TAGS.projects, 'max')
    revalidateTag(CMS_TAGS.tech, 'max')
    revalidateTag(CMS_TAGS.uses, 'max')
    revalidateTag(CMS_TAGS.workHistory, 'max')
    revalidateTag(CMS_TAGS.pages, 'max')
    revalidatePath('/sitemap.xml')
    revalidatePath('/feed.xml')
    return
  }

  if (eventType === 'data_source.schema_updated') {
    console.warn(
      '[cms:notion:webhook] Data source schema updated, verify mapper compatibility',
    )
    revalidateTag(CMS_TAGS.articles, 'max')
    revalidateTag(CMS_TAGS.pages, 'max')
    revalidateTag(CMS_TAGS.settings, 'max')
    revalidateTag(CMS_TAGS.navigation, 'max')
    return
  }

  if (
    eventType === 'data_source.created' ||
    eventType === 'data_source.deleted' ||
    eventType === 'data_source.moved' ||
    eventType === 'data_source.undeleted' ||
    eventType.startsWith('database.')
  ) {
    revalidateTag(CMS_TAGS.navigation, 'max')
    revalidateTag(CMS_TAGS.settings, 'max')
    return
  }
}

function shouldRunProjectionSync(eventType: string) {
  if (process.env.NOTION_ENABLE_ARTICLE_PROJECTION_SYNC === 'false') {
    return false
  }

  return (
    eventType === 'page.created' ||
    eventType === 'page.properties_updated' ||
    eventType === 'page.content_updated' ||
    eventType === 'page.deleted' ||
    eventType === 'page.undeleted' ||
    eventType === 'page.moved' ||
    eventType === 'data_source.content_updated'
  )
}

function getContentDataSourceIdSafe() {
  try {
    return getNotionContentDataSourceId()
  } catch {
    return null
  }
}

function getWebhookEventsDataSourceIdSafe() {
  try {
    return getOptionalNotionWebhookEventsDataSourceId()
  } catch {
    return null
  }
}

function getEventDataSourceId(event: NotionWebhookEvent): string | null {
  const data =
    event.data && typeof event.data === 'object'
      ? (event.data as Record<string, unknown>)
      : null
  const parent =
    data &&
    data.parent &&
    typeof data.parent === 'object' &&
    data.parent !== null
      ? (data.parent as Record<string, unknown>)
      : null

  const parentDataSourceId =
    parent && typeof parent.data_source_id === 'string'
      ? parent.data_source_id
      : null
  if (parentDataSourceId) {
    return parentDataSourceId
  }

  if (event.type === 'data_source.content_updated') {
    const entityId =
      event.entity && typeof event.entity.id === 'string'
        ? event.entity.id
        : null
    if (entityId) {
      return entityId
    }
  }

  return null
}

function shouldRunProjectionForEvent(
  eventType: string,
  eventDataSourceId: string | null,
  contentDataSourceId: string | null,
) {
  if (!shouldRunProjectionSync(eventType)) {
    return false
  }

  // Fail open if content data source is unavailable at runtime.
  if (!contentDataSourceId) {
    console.warn(
      '[cms:notion:webhook] projection fail-open: missing content data source id',
      {
        eventType,
        eventDataSourceId,
        contentDataSourceId,
      },
    )
    return true
  }

  // Some payloads omit parent data source metadata; keep behavior permissive.
  if (!eventDataSourceId) {
    console.warn(
      '[cms:notion:webhook] projection fail-open: missing event data source id',
      {
        eventType,
        eventDataSourceId,
        contentDataSourceId,
      },
    )
    return true
  }

  return eventDataSourceId === contentDataSourceId
}

export async function POST(request: Request) {
  const verificationToken =
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() || undefined
  const webhookSecret = process.env.NOTION_WEBHOOK_SECRET?.trim() || undefined
  // Fallback order is intentionally different:
  // configuredVerificationToken is for setup-token/admin checks,
  // signingSecret is for request signature verification.
  // This allows either verificationToken or webhookSecret to be configured.
  const configuredVerificationToken = verificationToken ?? webhookSecret
  const signingSecret = webhookSecret ?? verificationToken

  if (
    verificationToken &&
    webhookSecret &&
    verificationToken !== webhookSecret
  ) {
    console.warn(
      '[cms:notion:webhook] NOTION_WEBHOOK_VERIFICATION_TOKEN and NOTION_WEBHOOK_SECRET differ; this can cause 401 signature failures',
    )
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-notion-signature')

  let payload: NotionWebhookPayload
  try {
    payload = JSON.parse(rawBody || '{}') as NotionWebhookPayload
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON payload' },
      { status: 400 },
    )
  }

  if (payload.verification_token) {
    console.info('[cms:notion:webhook] setup debug', {
      hasSignatureHeader: Boolean(signature),
      hasConfiguredVerificationToken: Boolean(configuredVerificationToken),
    })

    if (!configuredVerificationToken) {
      console.info(
        '[cms:notion:webhook] received verification token; configure NOTION_WEBHOOK_VERIFICATION_TOKEN (or NOTION_WEBHOOK_SECRET)',
      )
    }

    if (
      !configuredVerificationToken ||
      payload.verification_token !== configuredVerificationToken
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid verification token' },
        { status: 401 },
      )
    }

    return NextResponse.json({
      ok: true,
      verified: true,
      reason: 'verification_token_handshake',
    })
  }

  if (!signingSecret && process.env.NODE_ENV === 'production') {
    console.error(
      '[cms:notion:webhook] NOTION_WEBHOOK_SECRET (or NOTION_WEBHOOK_VERIFICATION_TOKEN) is required in production',
    )
    return NextResponse.json(
      { ok: false, error: 'Webhook secret not configured' },
      { status: 500 },
    )
  }

  if (
    signingSecret &&
    (!signature || !verifySignature(rawBody, signature, signingSecret))
  ) {
    return NextResponse.json(
      { ok: false, error: 'Invalid signature' },
      { status: 401 },
    )
  }

  if (payload.events !== undefined && !Array.isArray(payload.events)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid events payload' },
      { status: 400 },
    )
  }

  cleanupEventCache()

  const events = normalizeEvents(payload)
  const contentDataSourceId = getContentDataSourceIdSafe()
  const webhookEventsDataSourceId = getWebhookEventsDataSourceIdSafe()

  const diagnostics = {
    receivedEvents: events.length,
    processedEvents: 0,
    skippedDuplicate: 0,
    skippedIgnored: 0,
    skippedNoEntityId: 0,
    skippedNoProjectionSync: 0,
    skippedLedgerEvent: 0,
    skippedUnrelatedDataSource: 0,
    syncAttempts: 0,
    syncSuccesses: 0,
    syncFailures: 0,
  }

  for (const event of events) {
    if (typeof event !== 'object' || event === null) {
      continue
    }
    diagnostics.processedEvents += 1

    const eventId = typeof event.id === 'string' ? event.id : undefined

    if (eventId && eventDedupe.has(eventId)) {
      diagnostics.skippedDuplicate += 1
      continue
    }

    const eventType = typeof event.type === 'string' ? event.type : 'unknown'
    const eventData =
      typeof event.data === 'object' && event.data !== null
        ? event.data
        : undefined
    const entityId =
      typeof eventData?.id === 'string' ? eventData.id : undefined
    const entityFallbackId =
      typeof event.entity?.id === 'string' ? event.entity.id : undefined
    const resolvedEntityId = entityId ?? entityFallbackId
    const eventDataSourceId = getEventDataSourceId(event)

    console.info('[cms:notion:webhook] received', {
      eventId,
      eventType,
      entityId: resolvedEntityId,
      eventDataSourceId,
      timestamp: event.timestamp,
    })

    if (
      webhookEventsDataSourceId &&
      eventDataSourceId === webhookEventsDataSourceId
    ) {
      diagnostics.skippedLedgerEvent += 1
      continue
    }

    let ledgerPageId = ''
    if (eventId) {
      try {
        const claim = await claimWebhookEvent({
          eventId,
          eventType,
          entityId: resolvedEntityId,
        })
        if (
          claim.action === 'skip_duplicate' ||
          claim.action === 'skip_processed'
        ) {
          diagnostics.skippedDuplicate += 1
          continue
        }
        if (claim.action === 'claimed') {
          ledgerPageId = claim.ledgerPageId
          eventDedupe.set(eventId, Date.now())
        }
        if (claim.action === 'ignored') {
          diagnostics.skippedIgnored += 1
          continue
        }
      } catch (error) {
        console.error('[cms:notion:webhook] event ledger claim failed', {
          eventId,
          eventType,
          entityId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    applyEventRevalidation(eventType)

    const shouldSyncThisEvent = shouldRunProjectionForEvent(
      eventType,
      eventDataSourceId,
      contentDataSourceId,
    )
    if (!shouldSyncThisEvent) {
      diagnostics.skippedNoProjectionSync += 1
      if (shouldRunProjectionSync(eventType)) {
        diagnostics.skippedUnrelatedDataSource += 1
      }
      if (ledgerPageId) {
        await completeWebhookEventClaim(ledgerPageId).catch(() => {})
      }
      continue
    }

    if (eventType.startsWith('page.') && !resolvedEntityId) {
      console.warn(
        '[cms:notion:webhook] page event missing entity id; skipping sync',
        {
          eventId,
          eventType,
        },
      )
      diagnostics.skippedNoEntityId += 1
      if (ledgerPageId) {
        await failWebhookEventClaim(
          ledgerPageId,
          'Page event missing entity id',
        ).catch(() => {})
      }
      continue
    }

    try {
      diagnostics.syncAttempts += 1
      const syncResult = await syncPortfolioArticleProjection(
        eventType === 'data_source.content_updated'
          ? undefined
          : { pageId: resolvedEntityId },
      )
      console.info('[cms:notion:webhook] projection sync', {
        eventType,
        entityId: resolvedEntityId,
        ...syncResult,
      })

      if (!syncResult.ok) {
        diagnostics.syncFailures += 1
        if (ledgerPageId) {
          await failWebhookEventClaim(
            ledgerPageId,
            syncResult.errors.map((entry) => entry.message).join('; '),
          ).catch(() => {})
        }
      } else {
        diagnostics.syncSuccesses += 1
        if (ledgerPageId) {
          await completeWebhookEventClaim(ledgerPageId).catch(() => {})
        }
      }
    } catch (error) {
      diagnostics.syncFailures += 1
      console.error('[cms:notion:webhook] projection sync failed', {
        eventType,
        entityId: resolvedEntityId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      if (ledgerPageId) {
        await failWebhookEventClaim(
          ledgerPageId,
          error instanceof Error ? error.message : 'Unknown error',
        ).catch(() => {})
      }
    }
  }

  if (events.length === 0) {
    console.info('[cms:notion:webhook] no events in payload', {
      hasVerificationToken: Boolean(payload.verification_token),
      projectionSyncEnabled:
        process.env.NOTION_ENABLE_ARTICLE_PROJECTION_SYNC !== 'false',
    })
  }

  return NextResponse.json({ ok: true, diagnostics })
}
