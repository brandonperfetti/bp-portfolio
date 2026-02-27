import { NextResponse } from 'next/server'

import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import {
  beginWebhookEventReplay,
  completeWebhookEventClaim,
  failWebhookEventClaim,
  listFailedWebhookEvents,
} from '@/lib/cms/notion/webhookEventLedger'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

const MAX_ERROR_MESSAGE_LENGTH = 2000

function truncateErrorMessage(message: string) {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message
}

function buildBoundedErrorMessage(messages: string[]) {
  let combined = ''

  for (const message of messages) {
    if (!message) {
      continue
    }

    const next = combined ? `${combined}; ${message}` : message
    if (next.length > MAX_ERROR_MESSAGE_LENGTH) {
      combined = next
      break
    }

    combined = next
  }

  return truncateErrorMessage(combined)
}

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!isValidSecret(body?.secret, secret)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const limit =
    typeof body?.limit === 'number' &&
    Number.isFinite(body.limit) &&
    body.limit > 0
      ? Math.floor(body.limit)
      : undefined

  const queuedFailures = await listFailedWebhookEvents({ limit })
  const replayed: Array<{ id: string; ok: boolean; error?: string }> = []
  let fullSyncOutcome: { ok: boolean; error?: string } | null = null

  for (const failure of queuedFailures) {
    try {
      const claimed = await beginWebhookEventReplay(failure)
      if (!claimed) {
        continue
      }

      let replayOk = true
      let replayError: string | undefined

      if (failure.pageId) {
        const syncResult = await syncPortfolioArticleProjection({
          pageId: failure.pageId,
        })
        if (!syncResult.ok) {
          replayOk = false
          replayError = buildBoundedErrorMessage(
            syncResult.errors.map((entry) => entry.message),
          )
        }
      } else {
        if (!fullSyncOutcome) {
          const firstFullSyncResult = await syncPortfolioArticleProjection()
          if (!firstFullSyncResult.ok) {
            fullSyncOutcome = {
              ok: false,
              error: buildBoundedErrorMessage(
                firstFullSyncResult.errors.map((entry) => entry.message),
              ),
            }
          } else {
            fullSyncOutcome = { ok: true }
          }
        }

        replayOk = fullSyncOutcome.ok
        replayError = fullSyncOutcome.error
      }

      if (!replayOk) {
        const error = replayError ?? 'Unknown replay error'
        await failWebhookEventClaim(failure.ledgerPageId, error)
        replayed.push({ id: failure.ledgerPageId, ok: false, error })
        continue
      }

      await completeWebhookEventClaim(failure.ledgerPageId)
      replayed.push({ id: failure.ledgerPageId, ok: true })
    } catch (error) {
      const message = truncateErrorMessage(
        error instanceof Error ? error.message : 'Unknown replay error',
      )
      await failWebhookEventClaim(failure.ledgerPageId, message).catch(
        (claimError) => {
          console.error(
            '[cms:sync:articles:replay-failures] failed to mark ledger row as failed',
            {
              ledgerPageId: failure.ledgerPageId,
              message,
              error:
                claimError instanceof Error
                  ? claimError.message
                  : 'Unknown error',
            },
          )
        },
      )
      replayed.push({ id: failure.ledgerPageId, ok: false, error: message })
    }
  }

  const remainingFailed = await listFailedWebhookEvents({ noLimit: true })
  const result = {
    totalQueued: queuedFailures.length,
    attempted: replayed.length,
    succeeded: replayed.filter((entry) => entry.ok).length,
    failed: replayed.filter((entry) => !entry.ok).length,
    remaining: remainingFailed.length,
    replayed,
  }

  return NextResponse.json(
    {
      ok: result.failed === 0,
      ...result,
      queuedCount: remainingFailed.length,
    },
    { status: result.failed === 0 ? 200 : 207 },
  )
}
