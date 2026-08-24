import * as Sentry from '@sentry/nextjs'

import {
  getClientSentryDsn,
  getSentryEnvironment,
  isFilteredUserAgent,
  isSuppressedSentryLogMessage,
  SENTRY_CONSOLE_LOG_LEVELS,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
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
 * error capture (always on), low-rate browser tracing via the shared
 * `tracesSampler`, and Sentry Logs (`console.warn`/`console.error` only —
 * see {@link SENTRY_CONSOLE_LOG_LEVELS}).
 */
const dsn = getClientSentryDsn()

if (dsn) {
  Sentry.init({
    dsn,
    environment: getSentryEnvironment(),
    tracesSampler: sentryTracesSampler,
    debug: false,
    // Sentry Logs (structured logging view, separate from error/tracing).
    enableLogs: true,
    // Drop Vercel Toolbar live-feedback noise (BP-PORTFOLIO-4, #95) — owner-
    // only, 0 real users — by both its injected source and its error message.
    denyUrls: SENTRY_DENY_URLS,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    // Drop everything from known bot/crawler user-agents (#98) — Sentry noise
    // + ingest cost, never a real user. Bots aren't blocked from the site, only
    // from Sentry (Turnstile/WAF own site access).
    beforeSend: (event) =>
      typeof navigator !== 'undefined' &&
      isFilteredUserAgent(navigator.userAgent)
        ? null
        : event,
    // Keep known-benign, high-volume warnings — and bot-UA logs — out of Sentry
    // Logs (#95, #94, #98).
    beforeSendLog: (log) => {
      if (
        typeof navigator !== 'undefined' &&
        isFilteredUserAgent(navigator.userAgent)
      ) {
        return null
      }
      return isSuppressedSentryLogMessage(String(log.message ?? ''))
        ? null
        : log
    },
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: [...SENTRY_CONSOLE_LOG_LEVELS],
      }),
    ],
  })
}

/** Instruments App Router client-side navigations for tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
