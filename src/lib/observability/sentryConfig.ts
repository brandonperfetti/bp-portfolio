/**
 * Shared Sentry configuration read by every runtime entrypoint
 * (`instrumentation-client.ts`, `sentry.server.config.ts`,
 * `sentry.edge.config.ts`).
 *
 * @remarks
 * Every helper here is env-gated on a Sentry DSN being present, mirroring
 * the Resend/Blob pattern in `payload.config.ts`
 * (`process.env.RESEND_API_KEY ? {...} : {}`,
 * `enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN)`). With no DSN,
 * {@link getClientSentryDsn} / {@link getServerSentryDsn} return
 * `undefined` and every entrypoint skips its `Sentry.init` call entirely —
 * local dev and CI boot with zero Sentry activity (no network calls, no
 * global error handlers installed, no tunnel route traffic). This module
 * is intentionally framework-free (no `@sentry/nextjs` import) so it stays
 * trivially unit-testable without mocking the SDK.
 */

/**
 * Client-safe DSN, inlined into the browser bundle at build time.
 *
 * @returns The configured DSN, or `undefined` when Sentry is not
 * configured for the client.
 */
export function getClientSentryDsn(): string | undefined {
  return process.env.NEXT_PUBLIC_SENTRY_DSN || undefined
}

/**
 * Server/edge DSN.
 *
 * @remarks Falls back to the public client DSN — Sentry DSNs are not
 * secret (that's why the client one is safe to prefix `NEXT_PUBLIC_`), so
 * a single DSN value is enough for the common case. Setting `SENTRY_DSN`
 * explicitly lets server/edge report to a different Sentry project than
 * the browser if that's ever useful.
 *
 * @returns The configured DSN, or `undefined` when Sentry is not
 * configured for the server/edge runtimes.
 */
export function getServerSentryDsn(): string | undefined {
  return process.env.SENTRY_DSN || getClientSentryDsn()
}

const DEFAULT_TRACES_SAMPLE_RATE = 0.1

/**
 * Conservative tracing sample rate (errors are always captured regardless
 * of this value — this only throttles performance transactions).
 *
 * @returns A rate in `[0, 1]`, defaulting to `0.1` and overridable via
 * `SENTRY_TRACES_SAMPLE_RATE` for environments that want it lower/higher.
 * An unparsable or out-of-range override falls back to the default rather
 * than silently disabling or over-sampling tracing.
 */
export function getTracesSampleRate(): number {
  // Trimmed before parsing: Number('   ') is 0, so an accidental
  // whitespace-only value would silently DISABLE tracing instead of using
  // the documented default.
  const raw = process.env.SENTRY_TRACES_SAMPLE_RATE?.trim()
  if (!raw) return DEFAULT_TRACES_SAMPLE_RATE
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_TRACES_SAMPLE_RATE
}

/**
 * Environment tag attached to every Sentry event.
 *
 * @remarks
 * Checks `NEXT_PUBLIC_SENTRY_ENVIRONMENT` first, deliberately — the
 * `NEXT_PUBLIC_` prefix is what gets it inlined into the browser bundle at
 * build time, and it's equally readable server/edge-side at runtime, so
 * it's the one var that tags all three runtimes consistently. Without it,
 * `instrumentation-client.ts`'s `Sentry.init` would fall through past the
 * server-only `SENTRY_ENVIRONMENT`/`VERCEL_ENV` (both `undefined` in the
 * browser bundle) straight to `NODE_ENV`, which is `'production'` on
 * every built deploy — silently mis-tagging staging/preview client events
 * as production. `SENTRY_ENVIRONMENT` remains as a server-only override
 * (e.g. to diverge server tagging from the client without touching the
 * public var); `VERCEL_ENV`/`NODE_ENV` remain as the last-resort fallback
 * for server/edge when neither is set.
 *
 * @returns `NEXT_PUBLIC_SENTRY_ENVIRONMENT` if set, else
 * `SENTRY_ENVIRONMENT`, else Vercel's own env name (`VERCEL_ENV`:
 * `production` | `preview` | `development`), else `NODE_ENV`, else
 * `'development'`.
 */
export function getSentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV ||
    'development'
  )
}

/**
 * Path substrings that identify the Payload admin's chatty background
 * traffic — the admin UI itself plus its autosave/access/preferences
 * polling. Noisy, low-value transactions we sample out; error capture is
 * untouched by this list (see {@link sentryTracesSampler}).
 */
const NOISY_TRANSACTION_PATTERNS = [
  '/admin',
  '/api/access',
  '/api/preferences',
  '/api/users/me',
  '/api/health',
]

/**
 * Whether a transaction name matches the Payload admin's chatty paths.
 *
 * @param name - Transaction name (typically a route path) from Sentry's
 * sampling context.
 * @returns `true` if the transaction should be excluded from tracing.
 */
export function isNoisyTransaction(name: string | undefined): boolean {
  if (!name) return false
  // Segment-boundary match, not substring: bare includes() would also
  // suppress unrelated routes that merely CONTAIN a pattern (e.g.
  // /articles/admin-guide contains /admin).
  return NOISY_TRANSACTION_PATTERNS.some(
    (pattern) => name === pattern || name.startsWith(`${pattern}/`),
  )
}

/**
 * Shared `tracesSampler` for all three runtimes.
 *
 * @remarks Drops the Payload admin's chatty polling transactions entirely
 * (rate `0`), otherwise applies {@link getTracesSampleRate}. This only
 * affects performance transactions — error events are captured
 * regardless of the sampling decision here.
 *
 * @param samplingContext - Sentry's sampling context; only `name` is used.
 * @returns The sampling rate in `[0, 1]` for this transaction.
 */
export function sentryTracesSampler(samplingContext: {
  name?: string
}): number {
  if (isNoisyTransaction(samplingContext.name)) return 0
  return getTracesSampleRate()
}

/**
 * Console levels forwarded to Sentry Logs by every runtime's
 * `Sentry.consoleLoggingIntegration({ levels: [...SENTRY_CONSOLE_LOG_LEVELS] })`.
 *
 * @remarks
 * Deliberately `warn`/`error` only — the integration's own default also
 * forwards `log`/`info`/`debug`/`trace`/`assert`, which would flood
 * Sentry Logs with routine console noise instead of the signal Brandon
 * actually wants there. Exported as a single constant so the three
 * runtime entrypoints (`instrumentation-client.ts`,
 * `sentry.server.config.ts`, `sentry.edge.config.ts`) can't drift from
 * each other. This module stays framework-free (no `@sentry/nextjs`
 * import) — the entrypoints own the actual
 * `Sentry.consoleLoggingIntegration(...)` call.
 */
export const SENTRY_CONSOLE_LOG_LEVELS = ['warn', 'error'] as const
