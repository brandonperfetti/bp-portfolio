import * as Sentry from '@sentry/nextjs'

import {
  getSentryEnvironment,
  getServerSentryDsn,
  isFilteredUserAgent,
  isSuppressedSentryLogMessage,
  SENTRY_CONSOLE_LOG_LEVELS,
  sentryTracesSampler,
} from '@/lib/observability/sentryConfig'

/**
 * Sentry SDK init for the Edge runtime (`src/proxy.ts` and any route
 * handlers that opt into `runtime: 'edge'`).
 *
 * @remarks
 * Imported by `src/instrumentation.ts`'s `register()` when
 * `NEXT_RUNTIME === 'edge'`. Same DSN gate as
 * `src/sentry.server.config.ts` — see that file's remarks — so the edge
 * bundle stays inert without a configured DSN.
 */
const dsn = getServerSentryDsn()

if (dsn) {
  Sentry.init({
    dsn,
    environment: getSentryEnvironment(),
    tracesSampler: sentryTracesSampler,
    debug: false,
    // Sentry Logs (structured logging view, separate from error/tracing) —
    // console.warn/console.error only, see SENTRY_CONSOLE_LOG_LEVELS.
    enableLogs: true,
    // Drop events from known bot/crawler user-agents (#98) — Sentry noise +
    // ingest cost, never a real user.
    beforeSend: (event) => {
      const ua =
        event.request?.headers?.['user-agent'] ??
        event.request?.headers?.['User-Agent']
      return isFilteredUserAgent(typeof ua === 'string' ? ua : undefined)
        ? null
        : event
    },
    // Keep the benign Node `vm.USE_MAIN_CONTEXT_DEFAULT_LOADER` experimental
    // warning out of Sentry Logs (#95).
    beforeSendLog: (log) =>
      isSuppressedSentryLogMessage(String(log.message ?? '')) ? null : log,
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: [...SENTRY_CONSOLE_LOG_LEVELS],
      }),
    ],
  })
}
