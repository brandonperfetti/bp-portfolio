import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { processCoverRegenerationRequests } from '@/lib/cms/notion/projectionSync'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

/**
 * Triggers cover-regeneration processing for source articles.
 *
 * Expects JSON body:
 * - `secret` (required): must match `CMS_REVALIDATE_SECRET`
 * - `sourcePageId` (optional): restrict processing to one source page
 * - `limit` (optional): max queued items to process this run
 *
 * Returns 401 for invalid secret, 500 for server misconfiguration, and 207 when
 * the batch partially succeeds (some item-level failures).
 */
export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Server misconfiguration: CMS_REVALIDATE_SECRET missing',
      },
      { status: 500 },
    )
  }

  const body = await request.json().catch(() => ({}))

  if (!isValidSecret(body?.secret, secret)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const sourcePageId =
    typeof body?.sourcePageId === 'string' &&
    body.sourcePageId.trim().length > 0
      ? body.sourcePageId.trim()
      : undefined
  const limit =
    typeof body?.limit === 'number' && body.limit > 0
      ? Math.floor(body.limit)
      : undefined

  try {
    const result = await processCoverRegenerationRequests({
      sourcePageId,
      limit,
    })
    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'cms-cover-regeneration',
        endpoint: '/api/cms/sync/articles/cover-regeneration',
        error: `Cover regeneration completed with ${result.errors.length} errors`,
        details: {
          sourcePageId,
          limit,
          result,
        },
      }).catch((logError) => {
        console.error(
          '[cms-cover-regeneration] failed to write Notion error log',
          {
            error:
              logError instanceof Error ? logError.message : String(logError),
          },
        )
      })
    }
    // 207 Multi-Status indicates partial success when batch item errors exist.
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-cover-regeneration',
      endpoint: '/api/cms/sync/articles/cover-regeneration',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        sourcePageId,
        limit,
      },
    }).catch((logError) => {
      console.error(
        '[cms-cover-regeneration] failed to write Notion error log',
        {
          error:
            logError instanceof Error ? logError.message : String(logError),
        },
      )
    })

    console.error('[cms:sync:articles:cover-regeneration] run failed', {
      sourcePageId,
      limit,
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
