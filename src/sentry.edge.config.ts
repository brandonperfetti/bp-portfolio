import * as Sentry from '@sentry/nextjs'

import {
  getSentryEnvironment,
  getSentryInitDecision,
  SENTRY_CONSOLE_LOG_LEVELS,
  sentryDropBotEvent,
  sentryDropNoisyLog,
  sentryTracesSampler,
  warnIfDevDsnIgnored,
} from '@/lib/observability/sentryConfig'

/**
 * Sentry SDK init for the Edge runtime (`src/proxy.ts` and any route
 * handlers that opt into `runtime: 'edge'`).
 *
 * @remarks
 * Imported by `src/instrumentation.ts`'s `register()` when
 * `NEXT_RUNTIME === 'edge'`. Obeys {@link getSentryInitDecision} verbatim,
 * exactly like the other two entrypoints — see `sentryConfig.ts` for the
 * #194 matrix, including the `'edge'` row and why that runtime has one:
 * `@sentry/vercel-edge` 10.70.0 ships no Spotlight support, so a local edge
 * decision is always "do not init" (it can neither reach the shared project
 * — the fence — nor a sidecar).
 *
 * The practical cost, stated where a reader will meet it: errors thrown in
 * `src/proxy.ts` are not visible in Spotlight locally. They still surface in
 * the terminal, and they are captured normally on every deployed
 * environment.
 */
const decision = getSentryInitDecision('edge')

warnIfDevDsnIgnored(decision)

if (decision.init) {
  Sentry.init({
    // Never a Spotlight-only init here (the 'edge' decision cannot produce
    // one), but the spread keeps the three entrypoints identically shaped.
    ...(decision.dsn ? { dsn: decision.dsn } : {}),
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
