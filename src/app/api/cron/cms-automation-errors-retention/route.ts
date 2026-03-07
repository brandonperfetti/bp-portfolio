import { NextResponse } from 'next/server'

import {
  logAutomationErrorToNotion,
  pruneAutomationErrorLogs,
} from '@/lib/cms/notion/automationErrorLog'

import { isAuthorizedCronRequest } from '../_auth'
import { parsePositiveInt } from '../_params'

function resolveRetentionDays() {
  return parsePositiveInt(process.env.CMS_AUTOMATION_ERRORS_RETENTION_DAYS, 30)
}

function resolveRetentionLimit() {
  return parsePositiveInt(
    process.env.CMS_AUTOMATION_ERRORS_RETENTION_LIMIT,
    100,
  )
}

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const retentionDays = resolveRetentionDays()
  const limit = resolveRetentionLimit()

  try {
    const result = await pruneAutomationErrorLogs({ retentionDays, limit })

    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'cms-cron-error-retention',
        endpoint: '/api/cron/cms-automation-errors-retention',
        error: `Retention cleanup completed with ${result.errors.length} errors`,
        details: {
          retentionDays,
          limit,
          result,
        },
      }).catch((logError) => {
        console.error(
          '[cms-cron-error-retention] failed to write Notion error log',
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
      workflow: 'cms-cron-error-retention',
      endpoint: '/api/cron/cms-automation-errors-retention',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        retentionDays,
        limit,
      },
    }).catch((logError) => {
      console.error(
        '[cms-cron-error-retention] failed to write Notion error log',
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
