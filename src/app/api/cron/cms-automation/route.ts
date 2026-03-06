import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runFullCmsCronAutomation } from '@/lib/cms/notion/cronAutomation'

import { isAuthorizedCronRequest } from '../_auth'
import { revalidateArticleSurfaces } from '../_revalidate'

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const result = await runFullCmsCronAutomation()
    let revalidateError: string | null = null
    try {
      revalidateArticleSurfaces()
    } catch (error) {
      revalidateError = error instanceof Error ? error.message : String(error)
      await logAutomationErrorToNotion({
        workflow: 'cms-cron-automation',
        endpoint: '/api/cron/cms-automation',
        error: `Revalidation failed: ${revalidateError}`,
      }).catch((logError) => {
        console.error(
          '[cms-cron-automation] failed to write revalidation error log',
          {
            error:
              logError instanceof Error ? logError.message : String(logError),
          },
        )
      })
    }

    return NextResponse.json(
      revalidateError ? { ...result, revalidateError } : result,
      { status: result.ok ? 200 : 207 },
    )
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-cron-automation',
      endpoint: '/api/cron/cms-automation',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch((logError) => {
      console.error('[cms-cron-automation] failed to write Notion error log', {
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
