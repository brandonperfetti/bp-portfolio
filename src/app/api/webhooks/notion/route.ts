import { createHmac, timingSafeEqual } from 'node:crypto'

import { revalidatePath, revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { CMS_TAGS } from '@/lib/cms/cache'
import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import { enqueueProjectionSyncFailure } from '@/lib/cms/notion/syncFailureQueue'
import {
  claimWebhookEvent,
  completeWebhookEventClaim,
  failWebhookEventClaim,
} from '@/lib/cms/notion/webhookEventLedger'

type NotionWebhookEvent = {
  id?: string
  type?: string
  data?: {
    id?: string
    [key: string]: unknown
  }
  timestamp?: string
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

    return
  }

  if (eventType === 'data_source.content_updated') {
    revalidateTag(CMS_TAGS.articles, 'max')
    revalidateTag(CMS_TAGS.projects, 'max')
    revalidateTag(CMS_TAGS.tech, 'max')
    revalidateTag(CMS_TAGS.uses, 'max')
    revalidateTag(CMS_TAGS.workHistory, 'max')
    revalidateTag(CMS_TAGS.pages, 'max')
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

export async function POST(request: Request) {
  const verificationToken = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN
  const webhookSecret = process.env.NOTION_WEBHOOK_SECRET

  const rawBody = await request.text()
  const signature = request.headers.get('x-notion-signature')

  let payload: {
    verification_token?: string
    events?: NotionWebhookEvent[]
  }
  try {
    payload = JSON.parse(rawBody || '{}') as {
      verification_token?: string
      events?: NotionWebhookEvent[]
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON payload' },
      { status: 400 },
    )
  }

  if (payload.verification_token) {
    console.info('[cms:notion:webhook] setup debug', {
      verificationToken: payload.verification_token,
      signature,
    })

    if (!verificationToken) {
      console.info(
        '[cms:notion:webhook] received verification token; set NOTION_WEBHOOK_VERIFICATION_TOKEN',
        {
          verificationToken: payload.verification_token,
        },
      )
    }

    if (
      !verificationToken ||
      payload.verification_token !== verificationToken
    ) {
      return NextResponse.json(
        { ok: false, error: 'Invalid verification token' },
        { status: 401 },
      )
    }

    return NextResponse.json({ ok: true, verified: true })
  }

  if (!webhookSecret && process.env.NODE_ENV === 'production') {
    console.error(
      '[cms:notion:webhook] NOTION_WEBHOOK_SECRET is required in production',
    )
    return NextResponse.json(
      { ok: false, error: 'Webhook secret not configured' },
      { status: 500 },
    )
  }

  if (
    webhookSecret &&
    (!signature || !verifySignature(rawBody, signature, webhookSecret))
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

  for (const event of payload.events ?? []) {
    if (typeof event !== 'object' || event === null) {
      continue
    }

    const eventId = typeof event.id === 'string' ? event.id : undefined

    if (eventId && eventDedupe.has(eventId)) {
      continue
    }

    const eventType = typeof event.type === 'string' ? event.type : 'unknown'
    const eventData =
      typeof event.data === 'object' && event.data !== null
        ? event.data
        : undefined
    const entityId =
      typeof eventData?.id === 'string' ? eventData.id : undefined

    console.info('[cms:notion:webhook] received', {
      eventId,
      eventType,
      entityId,
      timestamp: event.timestamp,
    })

    let ledgerPageId = ''
    if (eventId) {
      try {
        const claim = await claimWebhookEvent({
          eventId,
          eventType,
          entityId,
        })
        if (
          claim.action === 'skip_duplicate' ||
          claim.action === 'skip_processed'
        ) {
          continue
        }
        if (claim.action === 'claimed') {
          ledgerPageId = claim.ledgerPageId
          eventDedupe.set(eventId, Date.now())
        }
        if (claim.action === 'ignored') {
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

    if (!shouldRunProjectionSync(eventType)) {
      if (ledgerPageId) {
        await completeWebhookEventClaim(ledgerPageId).catch(() => {})
      }
      continue
    }

    if (eventType.startsWith('page.') && !entityId) {
      console.warn(
        '[cms:notion:webhook] page event missing entity id; skipping sync',
        {
          eventId,
          eventType,
        },
      )
      if (ledgerPageId) {
        await failWebhookEventClaim(
          ledgerPageId,
          'Page event missing entity id',
        ).catch(() => {})
      }
      continue
    }

    try {
      const syncResult = await syncPortfolioArticleProjection(
        eventType === 'data_source.content_updated'
          ? undefined
          : { pageId: entityId },
      )
      console.info('[cms:notion:webhook] projection sync', {
        eventType,
        entityId,
        ...syncResult,
      })

      if (!syncResult.ok) {
        try {
          await enqueueProjectionSyncFailure({
            eventType,
            entityId,
            pageId:
              eventType === 'data_source.content_updated'
                ? undefined
                : entityId,
            reason: 'Projection sync completed with errors',
            lastError: syncResult.errors
              .map((entry) => entry.message)
              .join('; ')
              .slice(0, 2000),
          })
        } catch (queueError) {
          console.error(
            '[cms:notion:webhook] failed to enqueue projection sync failure',
            {
              eventType,
              entityId,
              error:
                queueError instanceof Error
                  ? queueError.message
                  : 'Unknown enqueue error',
            },
          )
        }
        if (ledgerPageId) {
          await failWebhookEventClaim(
            ledgerPageId,
            syncResult.errors.map((entry) => entry.message).join('; '),
          ).catch(() => {})
        }
      } else if (ledgerPageId) {
        await completeWebhookEventClaim(ledgerPageId).catch(() => {})
      }
    } catch (error) {
      console.error('[cms:notion:webhook] projection sync failed', {
        eventType,
        entityId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      try {
        await enqueueProjectionSyncFailure({
          eventType,
          entityId,
          pageId:
            eventType === 'data_source.content_updated' ? undefined : entityId,
          reason: 'Projection sync threw exception',
          lastError: error instanceof Error ? error.message : 'Unknown error',
        })
      } catch (queueError) {
        console.error(
          '[cms:notion:webhook] failed to enqueue projection sync failure',
          {
            eventType,
            entityId,
            error:
              queueError instanceof Error
                ? queueError.message
                : 'Unknown enqueue error',
          },
        )
      }
      if (ledgerPageId) {
        await failWebhookEventClaim(
          ledgerPageId,
          error instanceof Error ? error.message : 'Unknown error',
        ).catch(() => {})
      }
    }
  }

  return NextResponse.json({ ok: true })
}
