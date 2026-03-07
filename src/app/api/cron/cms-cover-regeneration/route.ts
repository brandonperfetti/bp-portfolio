import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runCoverRegenerationCronAutomation } from '@/lib/cms/notion/cronAutomation'

import { isAuthorizedCronRequest } from '../_auth'
import { revalidateArticleSurfaces } from '../_revalidate'

function getRegeneratedCount(result: Record<string, unknown>) {
  const coverRegeneration =
    result.coverRegeneration && typeof result.coverRegeneration === 'object'
      ? (result.coverRegeneration as Record<string, unknown>)
      : null
  const regenerated = coverRegeneration?.regenerated
  return typeof regenerated === 'number' ? regenerated : 0
}

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const result = await runCoverRegenerationCronAutomation()
    let revalidateError: string | null = null
    if (getRegeneratedCount(result) > 0) {
      try {
        revalidateArticleSurfaces()
      } catch (error) {
        revalidateError = error instanceof Error ? error.message : String(error)
        await logAutomationErrorToNotion({
          workflow: 'cms-cron-cover-regeneration',
          endpoint: '/api/cron/cms-cover-regeneration',
          error: `Revalidation failed: ${revalidateError}`,
        }).catch((logError) => {
          console.error(
            '[cms-cron-cover-regeneration] failed to write revalidation error log',
            {
              error:
                logError instanceof Error ? logError.message : String(logError),
            },
          )
        })
      }
    }
    return NextResponse.json(
      revalidateError ? { ...result, revalidateError } : result,
      { status: result.ok && !revalidateError ? 200 : 207 },
    )
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-cron-cover-regeneration',
      endpoint: '/api/cron/cms-cover-regeneration',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch((logError) => {
      console.error(
        '[cms-cron-cover-regeneration] failed to write Notion error log',
        {
          error:
            logError instanceof Error ? logError.message : String(logError),
        },
      )
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
