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
const eventDedupe = new Map<string, number>()

function cleanupEventCache() {
  const cutoff = Date.now() - EVENT_TTL_MS
  for (const [eventId, timestamp] of eventDedupe) {
    if (timestamp < cutoff) {
      eventDedupe.delete(eventId)
    }
  }
}

function verifySignature(payload: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex')
  const provided = signatureHeader.trim().toLowerCase().replace(/^sha256=/, '')

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  if (expectedBuffer.length !== providedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, providedBuffer)
}

function applyEventRevalidation(eventType: string, pageId?: string) {
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

    void pageId

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
    console.warn('[cms:notion:webhook] Data source schema updated, verify mapper compatibility')
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

  if (webhookSecret) {
    if (!signature || !verifySignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 })
    }
  }

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
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 })
  }

  if (payload.verification_token) {
    if (!verificationToken || payload.verification_token !== verificationToken) {
      return NextResponse.json({ ok: false, error: 'Invalid verification token' }, { status: 401 })
    }

    return NextResponse.json({ ok: true, verified: true })
  }

  cleanupEventCache()

  for (const event of payload.events ?? []) {
    const eventId = event.id

    if (eventId && eventDedupe.has(eventId)) {
      continue
    }

    if (eventId) {
      eventDedupe.set(eventId, Date.now())
    }

    const eventType = event.type ?? 'unknown'
    const entityId = event.data?.id

    console.info('[cms:notion:webhook] received', {
      eventId,
      eventType,
      entityId,
      timestamp: event.timestamp,
    })

    applyEventRevalidation(eventType, entityId)

    let ledgerPageId = ''
    if (eventId) {
      try {
        const claim = await claimWebhookEvent({
          eventId,
          eventType,
          entityId,
        })
        if (claim.action === 'skip_duplicate' || claim.action === 'skip_processed') {
          continue
        }
        if (claim.action === 'claimed') {
          ledgerPageId = claim.ledgerPageId
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

    if (!shouldRunProjectionSync(eventType)) {
      if (ledgerPageId) {
        await completeWebhookEventClaim(ledgerPageId).catch(() => {})
      }
      continue
    }

    try {
      const syncResult = await syncPortfolioArticleProjection(
        eventType === 'data_source.content_updated' ? undefined : { pageId: entityId },
      )
      console.info('[cms:notion:webhook] projection sync', {
        eventType,
        entityId,
        ...syncResult,
      })

      if (!syncResult.ok) {
        await enqueueProjectionSyncFailure({
          eventType,
          entityId,
          pageId: eventType === 'data_source.content_updated' ? undefined : entityId,
          reason: 'Projection sync completed with errors',
          lastError: syncResult.errors.map((entry) => entry.message).join('; ').slice(0, 2000),
        })
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
      await enqueueProjectionSyncFailure({
        eventType,
        entityId,
        pageId: eventType === 'data_source.content_updated' ? undefined : entityId,
        reason: 'Projection sync threw exception',
        lastError: error instanceof Error ? error.message : 'Unknown error',
      })
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
