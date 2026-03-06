import { logAutomationErrorToNotion } from '@/lib/cms/notion/automationErrorLog'
import {
  autoHealSourceArticleQualityGate,
  evaluateSourceArticleQualityGate,
  processCoverRegenerationRequests,
  reconcilePortfolioArticleProjection,
  syncPortfolioArticleProjection,
} from '@/lib/cms/notion/projectionSync'
import { runWebhookLedgerWatchdog } from '@/lib/cms/notion/webhookEventLedger'

type AutomationIssue = {
  step: string
  message: string
  details?: unknown
}

type AutomationSummary = {
  ok: boolean
  startedAt: string
  errors: AutomationIssue[]
} & Record<string, unknown>

function resolveCoverLimit() {
  const raw = process.env.CMS_COVER_REGEN_CRON_LIMIT
  const parsed = raw ? Number(raw) : Number.NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return 2
}

async function writeErrorLog(
  workflow: string,
  endpoint: string,
  errors: AutomationIssue[],
  summary: Record<string, unknown>,
) {
  if (errors.length === 0) {
    return
  }

  await logAutomationErrorToNotion({
    workflow,
    endpoint,
    error: `${errors.length} unresolved automation error(s)`,
    details: {
      errors,
      summary,
    },
  }).catch((logError) => {
    console.error(`[${workflow}] failed to write Notion error log`, {
      error: logError instanceof Error ? logError.message : String(logError),
    })
  })
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function runStep<T>(
  step: string,
  run: () => Promise<T>,
  summary: Record<string, unknown>,
  summaryKey: string,
  errors: AutomationIssue[],
): Promise<T | null> {
  try {
    const result = await run()
    summary[summaryKey] = result
    return result
  } catch (error) {
    errors.push({
      step,
      message: `${step} failed`,
      details: toErrorMessage(error),
    })
    summary[summaryKey] = {
      ok: false,
      errors: [toErrorMessage(error)],
    }
    return null
  }
}

export async function runProjectionCronAutomation(options?: {
  logErrors?: boolean
}): Promise<AutomationSummary> {
  const startedAt = new Date().toISOString()
  const summary: Record<string, unknown> = {}
  const errors: AutomationIssue[] = []
  try {
    const projectionSync = await runStep(
      'projection-sync',
      () => syncPortfolioArticleProjection(),
      summary,
      'projectionSync',
      errors,
    )
    if (projectionSync && !projectionSync.ok) {
      errors.push({
        step: 'projection-sync',
        message: 'Projection sync completed with errors',
        details: projectionSync.errors,
      })
    }

    const qualityBefore = await runStep(
      'quality-gate-before',
      () => evaluateSourceArticleQualityGate(),
      summary,
      'qualityGateBefore',
      errors,
    )

    let autoHeal: Awaited<
      ReturnType<typeof autoHealSourceArticleQualityGate>
    > | null = null
    let qualityAfter = qualityBefore
    if (qualityBefore && !qualityBefore.ok) {
      autoHeal = await runStep(
        'auto-heal',
        () => autoHealSourceArticleQualityGate(),
        summary,
        'autoHeal',
        errors,
      )
      if (autoHeal && !autoHeal.ok) {
        errors.push({
          step: 'auto-heal',
          message: 'Auto-heal completed with errors',
          details: autoHeal.errors,
        })
      }

      qualityAfter = await runStep(
        'quality-gate-after',
        () => evaluateSourceArticleQualityGate(),
        summary,
        'qualityGateAfter',
        errors,
      )
    }

    if (qualityAfter && !qualityAfter.ok) {
      errors.push({
        step: 'quality-gate',
        message: `Quality gate still failing for ${qualityAfter.failed} source rows after remediation`,
        details: qualityAfter.failures,
      })
    }

    const reconcile = await runStep(
      'reconcile',
      () => reconcilePortfolioArticleProjection(),
      summary,
      'reconcile',
      errors,
    )
    if (reconcile && !reconcile.ok) {
      const critical = reconcile.findings.filter(
        (finding) => finding.severity === 'critical',
      )
      if (critical.length > 0) {
        errors.push({
          step: 'reconcile',
          message: `Reconcile found ${critical.length} critical findings`,
          details: critical,
        })
      }
    }

    const watchdog = await runStep(
      'webhook-watchdog',
      () =>
        runWebhookLedgerWatchdog({
          staleMinutes: 90,
          limit: 100,
        }),
      summary,
      'watchdog',
      errors,
    )
    if (watchdog && !watchdog.ok) {
      errors.push({
        step: 'webhook-watchdog',
        message: 'Webhook watchdog completed with errors',
        details: watchdog.errors,
      })
    }
  } catch (error) {
    errors.push({
      step: 'projection-cron',
      message: 'Unhandled projection cron error',
      details: toErrorMessage(error),
    })
  } finally {
    if (options?.logErrors !== false) {
      await writeErrorLog(
        'cms-cron-projection',
        '/api/cron/cms-projection',
        errors,
        summary,
      )
    }
  }

  return {
    ok: errors.length === 0,
    startedAt,
    errors,
    ...summary,
  }
}

export async function runCoverRegenerationCronAutomation(options?: {
  logErrors?: boolean
}): Promise<AutomationSummary> {
  const startedAt = new Date().toISOString()
  const summary: Record<string, unknown> = {}
  const errors: AutomationIssue[] = []
  try {
    const coverRegeneration = await runStep(
      'cover-regeneration',
      () =>
        processCoverRegenerationRequests({
          limit: resolveCoverLimit(),
        }),
      summary,
      'coverRegeneration',
      errors,
    )
    if (coverRegeneration && !coverRegeneration.ok) {
      errors.push({
        step: 'cover-regeneration',
        message: 'Cover regeneration completed with errors',
        details: coverRegeneration.errors,
      })
    }
  } catch (error) {
    errors.push({
      step: 'cover-regeneration-cron',
      message: 'Unhandled cover regeneration cron error',
      details: toErrorMessage(error),
    })
  } finally {
    if (options?.logErrors !== false) {
      await writeErrorLog(
        'cms-cron-cover-regeneration',
        '/api/cron/cms-cover-regeneration',
        errors,
        summary,
      )
    }
  }

  return {
    ok: errors.length === 0,
    startedAt,
    errors,
    ...summary,
  }
}

export async function runFullCmsCronAutomation(): Promise<AutomationSummary> {
  const startedAt = new Date().toISOString()
  const summary: Record<string, unknown> = {}
  const combinedErrors: AutomationIssue[] = []

  try {
    const projection = await runStep(
      'projection-cron',
      () => runProjectionCronAutomation({ logErrors: false }),
      summary,
      'projection',
      combinedErrors,
    )
    if (projection) {
      combinedErrors.push(...projection.errors)
    }

    const cover = await runStep(
      'cover-regeneration-cron',
      () => runCoverRegenerationCronAutomation({ logErrors: false }),
      summary,
      'cover',
      combinedErrors,
    )
    if (cover) {
      combinedErrors.push(...cover.errors)
    }
  } catch (error) {
    combinedErrors.push({
      step: 'full-cms-cron',
      message: 'Unhandled full CMS cron error',
      details: toErrorMessage(error),
    })
  } finally {
    await writeErrorLog(
      'cms-cron-automation',
      '/api/cron/cms-automation',
      combinedErrors,
      summary,
    )
  }

  return {
    ok: combinedErrors.length === 0,
    startedAt,
    errors: combinedErrors,
    ...summary,
  }
}
