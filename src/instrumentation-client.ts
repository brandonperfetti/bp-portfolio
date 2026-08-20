import * as Sentry from '@sentry/nextjs'

import {
  getClientSentryDsn,
  getSentryEnvironment,
  sentryTracesSampler,
} from '@/lib/observability/sentryConfig'

/**
 * Sentry SDK init for the browser. Next.js auto-loads this file (App
 * Router convention, replacing the older `sentry.client.config.ts`
 * pattern) before any client code runs.
 *
 * @remarks
 * Env-gated on {@link getClientSentryDsn} — with no
 * `NEXT_PUBLIC_SENTRY_DSN`, `Sentry.init` is never called, so the browser
 * never installs Sentry's global error/unhandled-rejection listeners or
 * makes any network calls to Sentry. `onRouterTransitionStart` still
 * exports unconditionally (Next requires it as a static export), but it
 * delegates to a `Sentry.captureRouterTransitionStart` that itself no-ops
 * pre-init.
 *
 * Defaults first (#73): no session replay, no user feedback widget — just
 * error capture (always on) and low-rate browser tracing via the shared
 * `tracesSampler`.
 */
const dsn = getClientSentryDsn()

if (dsn) {
  Sentry.init({
    dsn,
    environment: getSentryEnvironment(),
    tracesSampler: sentryTracesSampler,
    debug: false,
  })
}

/** Instruments App Router client-side navigations for tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
