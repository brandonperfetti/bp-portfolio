import { NextResponse } from 'next/server'

import { syncPortfolioArticleProjection } from '@/lib/cms/notion/projectionSync'
import { listProjectionSyncFailures, replayProjectionSyncFailures } from '@/lib/cms/notion/syncFailureQueue'

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!secret || body?.secret !== secret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const limit = typeof body?.limit === 'number' ? body.limit : undefined

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
            error: syncResult.errors.map((entry) => entry.message).join('; ').slice(0, 2000),
          }
        }
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown replay error',
        }
      }
    },
  })

  const queued = await listProjectionSyncFailures()

  return NextResponse.json({
    ok: result.failed === 0,
    ...result,
    queuedCount: queued.length,
  })
}
