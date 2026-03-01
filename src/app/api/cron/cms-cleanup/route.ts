import { NextResponse } from 'next/server'

import {
  logAutomationErrorToNotion,
  pruneAutomationErrorLogs,
} from '@/lib/cms/notion/automationErrorLog'
import { pruneImageJobs } from '@/lib/cms/notion/imageJobsCleanup'
import { pruneFailedWebhookEvents } from '@/lib/cms/notion/webhookEventLedger'

import { isAuthorizedCronRequest } from '../_auth'

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

function resolveWebhookRetentionDays() {
  return parsePositiveInt(process.env.CMS_WEBHOOK_EVENTS_RETENTION_DAYS, 30)
}

function resolveWebhookRetentionLimit() {
  return parsePositiveInt(process.env.CMS_WEBHOOK_EVENTS_RETENTION_LIMIT, 100)
}

function resolveErrorRetentionDays() {
  return parsePositiveInt(process.env.CMS_AUTOMATION_ERRORS_RETENTION_DAYS, 30)
}

function resolveErrorRetentionLimit() {
  return parsePositiveInt(
    process.env.CMS_AUTOMATION_ERRORS_RETENTION_LIMIT,
    100,
  )
}

function resolveImageJobsRetentionDays() {
  return parsePositiveInt(process.env.CMS_IMAGE_JOBS_RETENTION_DAYS, 30)
}

function resolveImageJobsLimit() {
  return parsePositiveInt(process.env.CMS_IMAGE_JOBS_CLEANUP_LIMIT, 100)
}

async function run(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 },
    )
  }

  const webhookRetentionDays = resolveWebhookRetentionDays()
  const webhookLimit = resolveWebhookRetentionLimit()
  const errorRetentionDays = resolveErrorRetentionDays()
  const errorLimit = resolveErrorRetentionLimit()
  const imageJobsRetentionDays = resolveImageJobsRetentionDays()
  const imageJobsLimit = resolveImageJobsLimit()

  try {
    const [webhookRetention, errorRetention, imageJobsRetention] =
      await Promise.all([
        pruneFailedWebhookEvents({
          retentionDays: webhookRetentionDays,
          limit: webhookLimit,
        }),
        pruneAutomationErrorLogs({
          retentionDays: errorRetentionDays,
          limit: errorLimit,
        }),
        pruneImageJobs({
          retentionDays: imageJobsRetentionDays,
          limit: imageJobsLimit,
        }),
      ])

    const errors = [
      ...webhookRetention.errors.map((error) => ({
        step: 'webhook-ledger-retention',
        ...error,
      })),
      ...errorRetention.errors.map((error) => ({
        step: 'automation-error-retention',
        ...error,
      })),
      ...imageJobsRetention.errors.map((error) => ({
        step: 'image-jobs-retention',
        ...error,
      })),
    ]

    const result = {
      ok: webhookRetention.ok && errorRetention.ok && imageJobsRetention.ok,
      webhookRetention,
      errorRetention,
      imageJobsRetention,
      errors,
    }

    if (!result.ok) {
      await logAutomationErrorToNotion({
        workflow: 'cms-cron-cleanup',
        endpoint: '/api/cron/cms-cleanup',
        error: `Cleanup completed with ${errors.length} error(s)`,
        details: {
          webhookRetentionDays,
          webhookLimit,
          errorRetentionDays,
          errorLimit,
          imageJobsRetentionDays,
          imageJobsLimit,
          result,
        },
      }).catch((logError) => {
        console.error('[cms-cron-cleanup] failed to write Notion error log', {
          error:
            logError instanceof Error ? logError.message : String(logError),
        })
      })
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 207 })
  } catch (error) {
    await logAutomationErrorToNotion({
      workflow: 'cms-cron-cleanup',
      endpoint: '/api/cron/cms-cleanup',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: {
        webhookRetentionDays,
        webhookLimit,
        errorRetentionDays,
        errorLimit,
        imageJobsRetentionDays,
        imageJobsLimit,
      },
    }).catch((logError) => {
      console.error('[cms-cron-cleanup] failed to write Notion error log', {
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
