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

export async function runProjectionCronAutomation(options?: {
  logErrors?: boolean
}): Promise<AutomationSummary> {
  const startedAt = new Date().toISOString()
  const summary: Record<string, unknown> = {}
  const errors: AutomationIssue[] = []

  const projectionSync = await syncPortfolioArticleProjection()
  summary.projectionSync = projectionSync
  if (!projectionSync.ok) {
    errors.push({
      step: 'projection-sync',
      message: 'Projection sync completed with errors',
      details: projectionSync.errors,
    })
  }

  const qualityBefore = await evaluateSourceArticleQualityGate()
  summary.qualityGateBefore = qualityBefore

  let autoHeal = null
  let qualityAfter = qualityBefore
  if (!qualityBefore.ok) {
    autoHeal = await autoHealSourceArticleQualityGate()
    summary.autoHeal = autoHeal

    qualityAfter = await evaluateSourceArticleQualityGate()
    summary.qualityGateAfter = qualityAfter
  }

  if (!qualityAfter.ok) {
    errors.push({
      step: 'quality-gate',
      message: `Quality gate still failing for ${qualityAfter.failed} source rows after remediation`,
      details: qualityAfter.failures,
    })
  }

  if (autoHeal && !autoHeal.ok) {
    errors.push({
      step: 'auto-heal',
      message: 'Auto-heal completed with errors',
      details: autoHeal.errors,
    })
  }

  const reconcile = await reconcilePortfolioArticleProjection()
  summary.reconcile = reconcile
  if (!reconcile.ok) {
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

  const watchdog = await runWebhookLedgerWatchdog({
    staleMinutes: 90,
    limit: 100,
  })
  summary.watchdog = watchdog
  if (!watchdog.ok) {
    errors.push({
      step: 'webhook-watchdog',
      message: 'Webhook watchdog completed with errors',
      details: watchdog.errors,
    })
  }

  if (options?.logErrors !== false) {
    await writeErrorLog(
      'cms-cron-projection',
      '/api/cron/cms-projection',
      errors,
      summary,
    )
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

  const coverRegeneration = await processCoverRegenerationRequests({
    limit: resolveCoverLimit(),
  })
  summary.coverRegeneration = coverRegeneration
  if (!coverRegeneration.ok) {
    errors.push({
      step: 'cover-regeneration',
      message: 'Cover regeneration completed with errors',
      details: coverRegeneration.errors,
    })
  }

  if (options?.logErrors !== false) {
    await writeErrorLog(
      'cms-cron-cover-regeneration',
      '/api/cron/cms-cover-regeneration',
      errors,
      summary,
    )
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
  const projection = await runProjectionCronAutomation({ logErrors: false })
  const cover = await runCoverRegenerationCronAutomation({ logErrors: false })

  const combinedErrors: AutomationIssue[] = [
    ...projection.errors,
    ...cover.errors,
  ]
  const summary = {
    projection,
    cover,
  }

  await writeErrorLog(
    'cms-cron-automation',
    '/api/cron/cms-automation',
    combinedErrors,
    summary,
  )

  return {
    ok: combinedErrors.length === 0,
    startedAt,
    errors: combinedErrors,
    ...summary,
  }
}
