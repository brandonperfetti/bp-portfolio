import { NextResponse } from 'next/server'

import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import { runProjectionCronAutomation } from '@/lib/cms/notion/cronAutomation'

import { isAuthorizedCronRequest } from '../_auth'
import { revalidateArticleSurfaces } from '../_revalidate'

type IntegrityRunMode = 'full' | 'incremental'

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = value ? Number(value) : Number.NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

function resolveIntegrityRunMode(request: Request): IntegrityRunMode {
  const forced = process.env.CMS_INTEGRITY_FORCE_MODE?.trim().toLowerCase()
  if (forced === 'full' || forced === 'incremental') {
    return forced
  }

  const url = new URL(request.url)
  const mode = url.searchParams.get('mode')?.trim().toLowerCase()
  if (mode === 'full' || mode === 'incremental') {
    return mode
  }

  const deep = url.searchParams.get('deep')?.trim()
  if (deep === '1' || deep === 'true') {
    return 'full'
  }
  if (deep === '0' || deep === 'false') {
    return 'incremental'
  }

  const userAgent = request.headers.get('user-agent') ?? ''
  const isVercelCron = /vercel-cron/i.test(userAgent)
  if (!isVercelCron) {
    return 'full'
  }

  const interval = parsePositiveInt(
    process.env.CMS_INTEGRITY_DEEP_RUN_INTERVAL,
    6,
  )
  const offset = parsePositiveInt(process.env.CMS_INTEGRITY_DEEP_RUN_OFFSET, 0)
  if (interval <= 1) {
    return 'full'
  }

  // Bucket by cron-sized 10-minute windows so deep runs happen predictably.
  const window = Math.floor(Date.now() / (10 * 60 * 1000))
  return (window + offset) % interval === 0 ? 'full' : 'incremental'
}

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
    const mode = resolveIntegrityRunMode(request)
    const fullRun = mode === 'full'
    const result = await runProjectionCronAutomation({
      includeQualityGate: fullRun,
      includeReconcile: fullRun,
      includeWebhookWatchdog: fullRun,
      errorLogWorkflow: 'cms-cron-integrity',
      errorLogEndpoint: '/api/cron/cms-integrity',
      skipReason: 'Disabled for incremental integrity run',
    })
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
      revalidateError
        ? { ...result, mode, revalidateError }
        : { ...result, mode },
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
