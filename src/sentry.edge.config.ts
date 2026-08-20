import * as Sentry from '@sentry/nextjs'

import {
  getSentryEnvironment,
  getServerSentryDsn,
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
  })
}
