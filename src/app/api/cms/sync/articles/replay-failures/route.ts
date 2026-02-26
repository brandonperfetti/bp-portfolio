import { NextResponse } from 'next/server'

import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import {
  listProjectionSyncFailures,
  replayProjectionSyncFailures,
} from '@/lib/cms/notion/syncFailureQueue'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

const MAX_ERROR_MESSAGE_LENGTH = 2000

function truncateErrorMessage(message: string) {
  return message.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}…`
    : message
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

  const result = await replayProjectionSyncFailures({
    limit,
    runSync: async (failure) => {
      try {
        const syncResult = await syncPortfolioArticleProjection(
          failure.pageId ? { pageId: failure.pageId } : undefined,
        )
        if (!syncResult.ok) {
          return {
            ok: false,
            error: syncResult.errors
              .map((entry) => entry.message)
              .join('; ')
              .slice(0, MAX_ERROR_MESSAGE_LENGTH),
          }
        }
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: truncateErrorMessage(
            error instanceof Error ? error.message : 'Unknown replay error',
          ),
        }
      }
    },
  })

  const queued = await listProjectionSyncFailures()

  return NextResponse.json(
    {
      ok: result.failed === 0,
      ...result,
      queuedCount: queued.length,
    },
    { status: result.failed === 0 ? 200 : 207 },
  )
}
