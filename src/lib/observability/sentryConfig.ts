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
 * it's the one var that tags all three runtimes consistently.
 * `SENTRY_ENVIRONMENT` remains as a server-only override (e.g. to diverge
 * server tagging from the client without touching the public var).
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is the browser's only deployment-target signal
 * and is why this chain exists in this order (#134): `VERCEL_ENV` is
 * server-only, so on a Preview deploy whose dashboard config sets
 * `NEXT_PUBLIC_SENTRY_ENVIRONMENT` for Production/Staging **only**, the
 * client bundle used to fall through every server-side var straight to
 * `NODE_ENV` — `'production'` on every built deploy, Preview included —
 * and tagged preview browser errors `environment=production`, polluting
 * the production feed and paging production alerts.
 *
 * `NODE_ENV` is deliberately NOT in this chain: it names a **build mode**
 * (`production` | `development` | `test`), not a deployment target, and
 * conflating the two is exactly the #134 defect. When nothing identifies a
 * deployment, the honest answer is `'development'` — a local/CI run, which
 * is also the only situation where nothing is set.
 *
 * Access shape matters: Next inlines `process.env.NEXT_PUBLIC_*` into the
 * browser bundle only for **static member access** written literally
 * (`process.env.NEXT_PUBLIC_VERCEL_ENV`). Computed access
 * (`process.env[name]`), destructuring, or spreading `process.env` is NOT
 * inlined and would read back `undefined` client-side — keep every
 * `NEXT_PUBLIC_*` read below written out literally.
 *
 * @returns `NEXT_PUBLIC_SENTRY_ENVIRONMENT` if set, else
 * `SENTRY_ENVIRONMENT`, else Vercel's own env name (`VERCEL_ENV`:
 * `production` | `preview` | `development`), else its browser-readable
 * twin `NEXT_PUBLIC_VERCEL_ENV`, else `'development'`.
 */
export function getSentryEnvironment(): string {
  return (
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
    process.env.SENTRY_ENVIRONMENT ||
    process.env.VERCEL_ENV ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
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

/**
 * Browser event source URLs to drop entirely (Sentry `denyUrls`, applied
 * by the default event-filters integration).
 *
 * @remarks
 * The Vercel Toolbar's live-feedback widget — served only to the
 * authenticated project owner from `app:///_next-live/…` — throws
 * `InvalidNodeTypeError` from its own `requestAnimationFrame` handler
 * (#95 / BP-PORTFOLIO-4). It is toolbar noise, never a site defect, seen
 * by 0 real users, so any event whose frames originate in the injected
 * `_next-live` bundle is dropped. Client-only: server/edge stacks have no
 * such frames.
 */
export const SENTRY_DENY_URLS: RegExp[] = [/_next-live\//]

/**
 * Browser error messages to drop (Sentry `ignoreErrors`), belt-and-
 * suspenders alongside {@link SENTRY_DENY_URLS} for the same Vercel
 * Toolbar feedback error (#95 / BP-PORTFOLIO-4), in case a future toolbar
 * build reports it without a `_next-live` frame.
 */
export const SENTRY_IGNORE_ERRORS: Array<string | RegExp> = [
  /Failed to execute 'selectNode' on 'Range'/,
]

/**
 * Substrings identifying benign, high-volume log lines the console-logging
 * integration would otherwise forward to Sentry Logs as noise (#95).
 *
 * @remarks
 * - `vm.USE_MAIN_CONTEXT_DEFAULT_LOADER` — a benign Node experimental-
 *   feature warning (`ExperimentalWarning`) emitted server-side and
 *   forwarded to Logs; pure noise (#95).
 * - `[Cloudflare Turnstile] Error: 300031` — Turnstile's documented
 *   transient/retriable "generic challenge failure" baseline (a client
 *   `console.warn`). The hostname misconfiguration is already fixed; this
 *   residual is the expected baseline every Turnstile deployment emits,
 *   folded in per #94. Drop this one entry to keep every Turnstile warning
 *   visible.
 * - `./.next/server/pages/_next/image.js` — the Vercel image optimizer's
 *   cold-start `MODULE_NOT_FOUND` burst (#99, split from #92). Right after
 *   each production deploy the optimizer function is not yet warm and throws
 *   `Cannot find module './.next/server/pages/_next/image.js'` for the first
 *   requests, measured only for tech-stack logo assets and never for article
 *   covers; it self-resolves within seconds as the function warms, and no user
 *   sees a broken image. Accepted as transient rather than papered over with a
 *   post-deploy warmup hook — standing infrastructure for a cosmetic log line
 *   — per #99's option 3. The pattern is the exact **module path**, not
 *   `MODULE_NOT_FOUND` and not `Cannot find module`: a real missing module
 *   anywhere else in the app must still reach Logs, and this is the one path
 *   that is a warmup artifact by construction.
 */
const SUPPRESSED_LOG_MESSAGE_PATTERNS = [
  'vm.USE_MAIN_CONTEXT_DEFAULT_LOADER',
  '[Cloudflare Turnstile] Error: 300031',
  './.next/server/pages/_next/image.js',
] as const

/**
 * Whether a forwarded console log message is known-benign noise that
 * should not reach Sentry Logs — used by each runtime's `beforeSendLog`.
 *
 * @param message - The log message body. Coerce non-strings before
 * calling; an empty message is never suppressed.
 * @returns `true` when `message` contains a
 * {@link SUPPRESSED_LOG_MESSAGE_PATTERNS} entry.
 */
export function isSuppressedSentryLogMessage(message: string): boolean {
  if (!message) return false
  return SUPPRESSED_LOG_MESSAGE_PATTERNS.some((pattern) =>
    message.includes(pattern),
  )
}

/**
 * User-Agent substrings (matched case-insensitively) identifying automated /
 * crawler clients whose Sentry events and logs are noise, not signal (#98).
 *
 * @remarks
 * A plain substring denylist, checked by {@link isFilteredUserAgent} in each
 * runtime's `beforeSend` (errors) and the client `beforeSendLog` (logs). This
 * only keeps bot traffic out of SENTRY (noise + ingest cost) — it never blocks
 * bots from the site itself (that's Turnstile's / the WAF's job, deliberately
 * out of scope).
 * `bot` is the broad catch (googlebot, bingbot, semrushbot, applebot,
 * yandexbot, ahrefsbot, …); the rest name crawlers/monitors/HTTP clients that
 * don't carry `bot`. NOTE: headless scrapers that spoof a real browser UA are
 * NOT caught here — those are handled by the message-based
 * {@link isSuppressedSentryLogMessage} filter (e.g. the Turnstile 300031
 * baseline), not by UA.
 */
export const SENTRY_FILTERED_USER_AGENTS = [
  'bot',
  'spider',
  'crawler',
  'slurp',
  'pingdom',
  'facebookexternalhit',
  'headlesschrome',
  'okhttp',
  'python-requests',
  'go-http-client',
  'curl',
  'wget',
  'axios',
  'node-fetch',
] as const

/**
 * Whether a request's User-Agent belongs to a known automated/bot client whose
 * Sentry events/logs should be dropped (#98).
 *
 * @param userAgent - Raw User-Agent (client: `navigator.userAgent`;
 * server/edge: `event.request?.headers?.['user-agent']`). An empty/absent UA is
 * NOT treated as a bot — never drop an event merely for a missing UA.
 * @returns `true` when `userAgent` contains a
 * {@link SENTRY_FILTERED_USER_AGENTS} token.
 */
export function isFilteredUserAgent(
  userAgent: string | undefined | null,
): boolean {
  if (!userAgent) return false
  const ua = userAgent.toLowerCase()
  return SENTRY_FILTERED_USER_AGENTS.some((token) => ua.includes(token))
}

/**
 * Minimal structural shapes so the shared Sentry hooks below stay framework-
 * free (no `@sentry/nextjs` import) and unit-testable. The runtime configs pass
 * the SDK's real `ErrorEvent` / `Log`, which structurally satisfy these.
 */
type SentryEventLike = {
  request?: { headers?: Record<string, string | undefined> }
}
type SentryLogLike = { message?: unknown }

/**
 * Shared server/edge `beforeSend`: drop error events whose request User-Agent
 * is a filtered bot/crawler (#98). Lives here — beside the other shared, tested
 * Sentry helpers — so `sentry.server.config.ts` and `sentry.edge.config.ts`
 * share ONE implementation instead of duplicating the body and risking drift.
 *
 * @typeParam E - the concrete Sentry error-event type, preserved in the return.
 * @returns the event unchanged, or `null` to drop it.
 */
export function sentryDropBotEvent<E extends SentryEventLike>(
  event: E,
): E | null {
  const ua =
    event.request?.headers?.['user-agent'] ??
    event.request?.headers?.['User-Agent']
  return isFilteredUserAgent(typeof ua === 'string' ? ua : undefined)
    ? null
    : event
}

/**
 * Shared `beforeSendLog`: drop logs whose message is known-benign noise (#95).
 * Used by every runtime; the client additionally wraps it with a
 * `navigator.userAgent` bot check (#98) it owns inline.
 *
 * @typeParam L - the concrete Sentry log type, preserved in the return.
 * @returns the log unchanged, or `null` to drop it.
 */
export function sentryDropNoisyLog<L extends SentryLogLike>(log: L): L | null {
  return isSuppressedSentryLogMessage(String(log.message ?? '')) ? null : log
}
