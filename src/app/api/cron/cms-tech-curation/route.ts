import { NextResponse } from 'next/server'

import { revalidateTechSurfaces } from '@/app/api/cron/_revalidate'
import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runTechCurationCron } from '@/lib/cms/notion/techCuration'

import { isAuthorizedCronRequest } from '../_auth'
import { parseDryRunParam } from '../_params'

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  try {
    const url = new URL(request.url)
    const body =
      request.method === 'POST'
        ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
        : {}
    const dryRun = parseDryRunParam(body, url.searchParams)

    const result = await runTechCurationCron({ dryRun })

    if (!result.dryRun && result.ok && result.enabled) {
      try {
        revalidateTechSurfaces()
      } catch (error) {
        const revalidateError =
          error instanceof Error ? error.message : String(error)
        await logAutomationErrorToNotion({
          workflow: 'cms-tech-curation',
          endpoint: '/api/cron/cms-tech-curation',
          error: `Tech revalidation failed: ${revalidateError}`,
        }).catch((logError) => {
          console.error(
            '[cms-tech-curation] failed to write revalidation error log',
            {
              error:
                logError instanceof Error ? logError.message : String(logError),
            },
          )
        })
      }
    }

    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'cms-tech-curation',
        endpoint: '/api/cron/cms-tech-curation',
        error: `Tech curation completed with ${result.errors.length} error(s)`,
        details: result,
      }).catch((logError) => {
        console.error('[cms-tech-curation] failed to write Notion error log', {
          error:
            logError instanceof Error ? logError.message : String(logError),
        })
      })
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-tech-curation',
      endpoint: '/api/cron/cms-tech-curation',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch((logError) => {
      console.error('[cms-tech-curation] failed to write Notion error log', {
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
