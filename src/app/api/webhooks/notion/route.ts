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
const PAGE_MUTATION_EVENTS = new Set([
  'page.created',
  'page.properties_updated',
  'page.content_updated',
  'page.deleted',
  'page.undeleted',
  'page.moved',
])
const CONTENT_UPDATED_EVENT = 'data_source.content_updated'
const SCHEMA_UPDATED_EVENT = 'data_source.schema_updated'
const DATA_SOURCE_NAV_EVENTS = new Set([
  'data_source.created',
  'data_source.deleted',
  'data_source.moved',
  'data_source.undeleted',
])
const FULL_SYNC_KEY = '__full_sync__'

type RevalidationPlan = {
  tags: Set<string>
  paths: Set<string>
}

type PendingSyncRequest = {
  eventType: string
  resolvedEntityId?: string
  ledgerPageId?: string
}

function isCommentEvent(eventType: string) {
  return eventType === 'comment.created' || eventType.startsWith('comment.')
}

function isPageMutationEvent(eventType: string) {
  return PAGE_MUTATION_EVENTS.has(eventType)
}

function isDataSourceNavigationEvent(eventType: string) {
  return (
    DATA_SOURCE_NAV_EVENTS.has(eventType) || eventType.startsWith('database.')
  )
}

function isProjectionCandidateEvent(eventType: string) {
  return isPageMutationEvent(eventType) || eventType === CONTENT_UPDATED_EVENT
}

function createRevalidationPlan(): RevalidationPlan {
  return {
    tags: new Set<string>(),
    paths: new Set<string>(),
  }
}

function addTag(plan: RevalidationPlan, tag: string) {
  plan.tags.add(tag)
}

function addPath(plan: RevalidationPlan, path: string) {
  plan.paths.add(path)
}

function queueCommonCmsTags(plan: RevalidationPlan) {
  addTag(plan, CMS_TAGS.articles)
  addTag(plan, CMS_TAGS.projects)
  addTag(plan, CMS_TAGS.tech)
  addTag(plan, CMS_TAGS.uses)
  addTag(plan, CMS_TAGS.workHistory)
  addTag(plan, CMS_TAGS.pages)
}

function queueContentDiscoveryPaths(plan: RevalidationPlan) {
  addPath(plan, '/sitemap.xml')
  addPath(plan, '/feed.xml')
  addPath(plan, '/llms.txt')
  addPath(plan, '/llms-full.txt')
}

function queuePrimaryContentPaths(plan: RevalidationPlan) {
  addPath(plan, '/')
  addPath(plan, '/about')
  addPath(plan, '/articles')
  addPath(plan, '/projects')
  addPath(plan, '/tech')
  addPath(plan, '/uses')
}

function collectEventRevalidation(eventType: string, plan: RevalidationPlan) {
  if (isCommentEvent(eventType)) {
    return
  }

  if (isPageMutationEvent(eventType)) {
    queueCommonCmsTags(plan)
    queuePrimaryContentPaths(plan)
    queueContentDiscoveryPaths(plan)
    return
  }

  if (eventType === CONTENT_UPDATED_EVENT) {
    queueCommonCmsTags(plan)
    queueContentDiscoveryPaths(plan)
    return
  }

  if (eventType === SCHEMA_UPDATED_EVENT) {
    console.warn(
      '[cms:notion:webhook] Data source schema updated, verify mapper compatibility',
    )
    addTag(plan, CMS_TAGS.articles)
    addTag(plan, CMS_TAGS.pages)
    addTag(plan, CMS_TAGS.settings)
    addTag(plan, CMS_TAGS.navigation)
    return
  }

  if (isDataSourceNavigationEvent(eventType)) {
    addTag(plan, CMS_TAGS.navigation)
    addTag(plan, CMS_TAGS.settings)
  }
}

function applyRevalidationPlan(plan: RevalidationPlan) {
  for (const tag of plan.tags) {
    revalidateTag(tag, 'max')
  }
  for (const path of plan.paths) {
    revalidatePath(path)
  }
}

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

function shouldRunProjectionSync(eventType: string) {
  if (process.env.NOTION_ENABLE_ARTICLE_PROJECTION_SYNC === 'false') {
    return false
  }

  return isProjectionCandidateEvent(eventType)
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

  if (event.type === CONTENT_UPDATED_EVENT) {
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
  const revalidationPlan = createRevalidationPlan()
  const pendingSyncByKey = new Map<string, PendingSyncRequest[]>()

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

    collectEventRevalidation(eventType, revalidationPlan)

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

    const syncKey =
      eventType === CONTENT_UPDATED_EVENT
        ? FULL_SYNC_KEY
        : `page:${resolvedEntityId}`
    const pending = pendingSyncByKey.get(syncKey) ?? []
    pending.push({
      eventType,
      resolvedEntityId,
      ledgerPageId: ledgerPageId || undefined,
    })
    pendingSyncByKey.set(syncKey, pending)
  }

  applyRevalidationPlan(revalidationPlan)

  if (pendingSyncByKey.has(FULL_SYNC_KEY)) {
    const fullSyncRequests = pendingSyncByKey.get(FULL_SYNC_KEY) ?? []
    for (const [syncKey, requests] of pendingSyncByKey) {
      if (syncKey === FULL_SYNC_KEY) {
        continue
      }
      fullSyncRequests.push(...requests)
      pendingSyncByKey.delete(syncKey)
    }
    pendingSyncByKey.set(FULL_SYNC_KEY, fullSyncRequests)
  }

  for (const [syncKey, pendingRequests] of pendingSyncByKey) {
    const syncInput =
      syncKey === FULL_SYNC_KEY
        ? undefined
        : { pageId: pendingRequests[0]?.resolvedEntityId }

    try {
      diagnostics.syncAttempts += 1
      const syncResult = await syncPortfolioArticleProjection(syncInput)
      console.info('[cms:notion:webhook] projection sync', {
        syncKey,
        syncInput,
        ...syncResult,
      })

      if (!syncResult.ok) {
        diagnostics.syncFailures += 1
        const errorMessage = syncResult.errors
          .map((entry) => entry.message)
          .join('; ')
        for (const request of pendingRequests) {
          if (!request.ledgerPageId) {
            continue
          }
          await failWebhookEventClaim(request.ledgerPageId, errorMessage).catch(
            () => {},
          )
        }
      } else {
        diagnostics.syncSuccesses += 1
        for (const request of pendingRequests) {
          if (!request.ledgerPageId) {
            continue
          }
          await completeWebhookEventClaim(request.ledgerPageId).catch(() => {})
        }
      }
    } catch (error) {
      diagnostics.syncFailures += 1
      console.error('[cms:notion:webhook] projection sync failed', {
        syncKey,
        syncInput,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      for (const request of pendingRequests) {
        if (!request.ledgerPageId) {
          continue
        }
        await failWebhookEventClaim(
          request.ledgerPageId,
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
