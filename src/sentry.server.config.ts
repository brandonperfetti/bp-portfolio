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
 * Sentry SDK init for the Node.js runtime (server components, route
 * handlers, server actions).
 *
 * @remarks
 * Imported by `src/instrumentation.ts`'s `register()` when
 * `NEXT_RUNTIME === 'nodejs'`. Entirely env-gated via the shared
 * {@link getSentryInitDecision}: deployed environments init only with a
 * DSN (unchanged), CI never inits, and a local `pnpm dev` inits **without
 * a DSN** and forwards to the Spotlight sidecar instead (#194) — so a
 * laptop error surfaces immediately and reaches the shared `bp-portfolio`
 * project never.
 *
 * `spotlight: true` is the SDK's own option; it resolves the sidecar URL
 * from `SENTRY_SPOTLIGHT` when that holds a URL rather than a boolean, and
 * otherwise defaults to `http://localhost:8969/stream`
 * `[source: node-core 10.70.0 utils+integrations/spotlight.ts]`.
 * With no sidecar listening the integration counts failures and stops
 * after three, logging only through Sentry's debug logger — which
 * `debug: false` leaves disabled, so an absent sidecar prints nothing
 * `[source: core 10.70.0 utils/debug-logger.js _maybeLog]`.
 *
 * Defaults first (#73): no session replay, no cron monitoring, no
 * alerting-rule buildout — just error capture (always on), low-rate
 * tracing via the shared `tracesSampler`, and Sentry Logs
 * (`console.warn`/`console.error` only — see
 * {@link SENTRY_CONSOLE_LOG_LEVELS}).
 */
const decision = getSentryInitDecision('server')

warnIfDevDsnIgnored(decision)

if (decision.init) {
  Sentry.init({
    // Spread rather than `dsn: decision.dsn`: a Spotlight-only init must
    // carry NO `dsn` key at all, not a key holding undefined, so "no DSN"
    // is literal in the options object a reader (or a test) inspects.
    ...(decision.dsn ? { dsn: decision.dsn } : {}),
    spotlight: decision.spotlight,
    environment: getSentryEnvironment(),
    tracesSampler: sentryTracesSampler,
    // Internal SDK debug logging only, not app logs — keep it off outside
    // of manual troubleshooting.
    debug: false,
    // Sentry Logs (structured logging view, separate from error/tracing).
    enableLogs: true,
    // Drop bot/crawler-UA error events (#98) and benign-message logs
    // (#95, incl. the Node `vm.USE_MAIN_CONTEXT_DEFAULT_LOADER` warning) —
    // shared with the edge runtime so the two can't drift.
    beforeSend: (event) => sentryDropBotEvent(event),
    beforeSendLog: (log) => sentryDropNoisyLog(log),
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: [...SENTRY_CONSOLE_LOG_LEVELS],
      }),
    ],
  })
}
