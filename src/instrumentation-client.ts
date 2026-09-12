import * as Sentry from '@sentry/nextjs'

import {
  getSentryEnvironment,
  getSentryInitDecision,
  isFilteredUserAgent,
  SENTRY_CONSOLE_LOG_LEVELS,
  SENTRY_DENY_URLS,
  SENTRY_IGNORE_ERRORS,
  sentryDropNoisyLog,
  sentryTracesSampler,
  warnIfDevDsnIgnored,
} from '@/lib/observability/sentryConfig'
import { getOrCreateSessionId } from '@/lib/observability/sessionId'

/**
 * Sentry SDK init for the browser. Next.js auto-loads this file (App
 * Router convention, replacing the older `sentry.client.config.ts`
 * pattern) before any client code runs.
 *
 * @remarks
 * Env-gated on the shared {@link getSentryInitDecision} — with no
 * `NEXT_PUBLIC_SENTRY_DSN` and no Spotlight opt-in, `Sentry.init` is never
 * called, so the browser never installs Sentry's global
 * error/unhandled-rejection listeners or makes any network calls.
 * `onRouterTransitionStart` still exports unconditionally (Next requires it
 * as a static export), but it delegates to a
 * `Sentry.captureRouterTransitionStart` that itself no-ops pre-init.
 *
 * **Local development sends to Spotlight, never to the shared project
 * (#194).** `spotlight: true` is the browser SDK's own option — it needs no
 * import from `@spotlightjs/spotlight`, which is why that package is a
 * devDependency this file never references: `init()` translates the option
 * into `spotlightBrowserIntegration()` itself, and that whole branch is
 * compiled OUT of the production build of `@sentry/browser`
 * (`rollup-include-development-only`), so nothing about Spotlight can ship
 * to a visitor's browser
 * `[source: browser 10.70.0 build/npm/cjs/dev/sdk.js has the options.spotlight branch, prod/sdk.js does not]`.
 * With no sidecar listening the
 * integration gives up after three failed POSTs and logs only through
 * Sentry's debug logger, which `debug: false` leaves off.
 *
 * Defaults first (#73): no session replay, no user feedback widget — just
 * error capture (always on), low-rate browser tracing via the shared
 * `tracesSampler`, and Sentry Logs (`console.warn`/`console.error` only —
 * see {@link SENTRY_CONSOLE_LOG_LEVELS}).
 */
const decision = getSentryInitDecision('client')

warnIfDevDsnIgnored(decision)

if (decision.init) {
  Sentry.init({
    // Spread rather than `dsn: decision.dsn` — see the same note in
    // `sentry.server.config.ts`: a Spotlight-only init carries no `dsn`
    // key at all.
    ...(decision.dsn ? { dsn: decision.dsn } : {}),
    spotlight: decision.spotlight,
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
      return sentryDropNoisyLog(log)
    },
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: [...SENTRY_CONSOLE_LOG_LEVELS],
      }),
    ],
  })

  // #213: give every issue a distinct-SESSION count in place of the
  // structurally-zero "Users impacted" (#168). The id is a bare
  // `crypto.randomUUID()` kept in `sessionStorage` — no account identity,
  // no visitor attribute, nothing derivable back to a person; see
  // `sessionId.ts` for the storage and consent reasoning. `{ id }` and
  // nothing else: no email, no username, no ip_address.
  //
  // Deliberately inside the `decision.init` block, so a local run with no
  // Sentry SDK writes nothing to a developer's storage; when the local run
  // IS Spotlight-backed the id is set and visible there, which is
  // harmless and keeps dev and deployed shaped the same.
  //
  // Also gated on the same bot check as `beforeSend` above: a crawler's
  // events are dropped before they leave the browser, so counting one as a
  // session would be double noise — this way a bot tab never mints an id
  // at all (#98).
  if (
    typeof navigator === 'undefined' ||
    !isFilteredUserAgent(navigator.userAgent)
  ) {
    const sessionId = getOrCreateSessionId()
    if (sessionId) Sentry.setUser({ id: sessionId })
  }
}

/** Instruments App Router client-side navigations for tracing. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
