import * as Sentry from '@sentry/nextjs'

import {
  getSentryEnvironment,
  getServerSentryDsn,
  SENTRY_CONSOLE_LOG_LEVELS,
  sentryDropBotEvent,
  sentryDropNoisyLog,
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
    // Drop bot/crawler-UA error events (#98) and benign-message logs
    // (#95, incl. the Node `vm.USE_MAIN_CONTEXT_DEFAULT_LOADER` warning) —
    // shared with the Node runtime so the two can't drift.
    beforeSend: (event) => sentryDropBotEvent(event),
    beforeSendLog: (log) => sentryDropNoisyLog(log),
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: [...SENTRY_CONSOLE_LOG_LEVELS],
      }),
    ],
  })
}
