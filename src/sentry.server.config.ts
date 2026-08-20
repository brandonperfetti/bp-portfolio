import * as Sentry from '@sentry/nextjs'

import {
  getSentryEnvironment,
  getServerSentryDsn,
  sentryTracesSampler,
} from '@/lib/observability/sentryConfig'

/**
 * Sentry SDK init for the Node.js runtime (server components, route
 * handlers, server actions).
 *
 * @remarks
 * Imported by `src/instrumentation.ts`'s `register()` when
 * `NEXT_RUNTIME === 'nodejs'`. Entirely env-gated: `Sentry.init` is only
 * called when {@link getServerSentryDsn} returns a value, so local dev and
 * CI with no DSN configured never initialize the SDK — no error capture,
 * no tracing, no outbound requests.
 *
 * Defaults first (#73): no session replay, no cron monitoring, no
 * alerting-rule buildout — just error capture (always on) and low-rate
 * tracing via the shared `tracesSampler`.
 */
const dsn = getServerSentryDsn()

if (dsn) {
  Sentry.init({
    dsn,
    environment: getSentryEnvironment(),
    tracesSampler: sentryTracesSampler,
    // Internal SDK debug logging only, not app logs — keep it off outside
    // of manual troubleshooting.
    debug: false,
  })
}
