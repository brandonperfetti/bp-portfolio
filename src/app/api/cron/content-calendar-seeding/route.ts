import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runCalendarIdeaSeedingCron } from '@/lib/cms/notion/calendarSeeding'

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

    const result = await runCalendarIdeaSeedingCron({ dryRun })
    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'calendar-idea-seeding',
        endpoint: '/api/cron/content-calendar-seeding',
        error: `Calendar seeding completed with ${result.errors.length} error(s)`,
        details: result,
      }).catch((logError) => {
        console.error(
          '[calendar-idea-seeding] failed to write Notion error log',
          {
            error:
              logError instanceof Error ? logError.message : String(logError),
          },
        )
      })
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'calendar-idea-seeding',
      endpoint: '/api/cron/content-calendar-seeding',
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch((logError) => {
      console.error(
        '[calendar-idea-seeding] failed to write Notion error log',
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
