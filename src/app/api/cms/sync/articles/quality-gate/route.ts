import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { evaluateSourceArticleQualityGate } from '@/lib/cms/notion/projectionSync'
import { isValidSecret } from '@/lib/security/timingSafeSecret'

export async function POST(request: Request) {
  const secret = process.env.CMS_REVALIDATE_SECRET
  const body = await request.json().catch(() => ({}))

  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Server misconfiguration: CMS_REVALIDATE_SECRET missing',
      },
      { status: 500 },
    )
  }

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

  try {
    const result = await evaluateSourceArticleQualityGate({ sourcePageId })
    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'cms-quality-gate',
        endpoint: '/api/cms/sync/articles/quality-gate',
        error: `Quality gate failed for ${result.failed} publish-safe source rows`,
        details: {
          sourcePageId,
          failed: result.failed,
          failures: result.failures,
        },
      }).catch((logError) => {
        console.error('[cms-quality-gate] failed to write Notion error log', {
          error:
            logError instanceof Error ? logError.message : String(logError),
        })
      })
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-quality-gate',
      endpoint: '/api/cms/sync/articles/quality-gate',
      error: error instanceof Error ? error.message : 'Unknown error',
      sourcePageId,
    }).catch((logError) => {
      console.error('[cms-quality-gate] failed to write Notion error log', {
        error: logError instanceof Error ? logError.message : String(logError),
      })
    })

    console.error('[cms:sync:articles:quality-gate] evaluation failed', {
      sourcePageId,
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
