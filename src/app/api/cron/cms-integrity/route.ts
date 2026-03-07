import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runProjectionCronAutomation } from '@/lib/cms/notion/cronAutomation'

import { isAuthorizedCronRequest } from '../_auth'
import { revalidateArticleSurfaces } from '../_revalidate'

// TODO(backlog): Refactor cms-projection/cms-integrity into shared cron handler.
// Notion: https://www.notion.so/Refactor-cms-projection-cms-integrity-into-shared-cron-handler-31cbe01e1e06813f84ffeb50eedb7469
async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const result = await runProjectionCronAutomation()
    let revalidateError: string | null = null
    try {
      revalidateArticleSurfaces()
    } catch (error) {
      revalidateError = error instanceof Error ? error.message : String(error)
      await logAutomationErrorToNotion({
        workflow: 'cms-cron-integrity',
        endpoint: '/api/cron/cms-integrity',
        error: `Revalidation failed: ${revalidateError}`,
      }).catch((logError) => {
        console.error(
          '[cms-cron-integrity] failed to write revalidation error log',
          {
            error:
              logError instanceof Error ? logError.message : String(logError),
          },
        )
      })
    }
    return NextResponse.json(
      revalidateError ? { ...result, revalidateError } : result,
      { status: result.ok && !revalidateError ? 200 : 207 },
    )
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-cron-integrity',
      endpoint: '/api/cron/cms-integrity',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch((logError) => {
      console.error('[cms-cron-integrity] failed to write Notion error log', {
        error: logError instanceof Error ? logError.message : String(logError),
      })
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

export async function GET(request: Request) {
  return run(request)
}

export async function POST(request: Request) {
  return run(request)
}
