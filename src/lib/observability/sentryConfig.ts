/**
 * Shared Sentry configuration read by every runtime entrypoint
 * (`instrumentation-client.ts`, `sentry.server.config.ts`,
 * `sentry.edge.config.ts`).
 *
 * @remarks
 * Outside local development every helper here is env-gated on a Sentry DSN
 * being present, mirroring the Resend/Blob pattern in `payload.config.ts`
 * (`process.env.RESEND_API_KEY ? {...} : {}`,
 * `enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN)`). With no DSN,
 * {@link getClientSentryDsn} / {@link getServerSentryDsn} return
 * `undefined` and every entrypoint skips its `Sentry.init` call entirely —
 * CI and DSN-less deploys boot with zero Sentry activity (no network calls,
 * no global error handlers installed, no tunnel route traffic).
 *
 * **Local development is the one exception (#194).** DSN presence used to be
 * the ONLY send gate, so a `pnpm dev` server ingested laptop errors — and
 * ~110 envelopes per `pnpm test:e2e` run — into the same shared
 * `bp-portfolio` project as production. The gate is now
 * "DSN present **or** Spotlight enabled in development", expressed once in
 * {@link getSentryInitDecision}, and in a local run a configured DSN is
 * deliberately **ignored** rather than honoured. See that function for the
 * full matrix.
 *
 * This module is intentionally framework-free (no `@sentry/nextjs` import)
 * so it stays trivially unit-testable without mocking the SDK.
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
 * Whether this process is a **local** run (a developer's `pnpm dev`, a
 * `vitest` run, a script) rather than a deployed one.
 *
 * @remarks
 * Both halves carry weight and neither alone is sufficient:
 *
 * - `getSentryEnvironment() === 'development'` is the deployment-target
 *   half. It is the documented fall-through of the #134 chain — nothing
 *   identifies a deployment, so this is a laptop or CI. It alone is not
 *   enough because an operator can set `NEXT_PUBLIC_SENTRY_ENVIRONMENT=development`
 *   on a real Vercel deployment, which must keep sending to Sentry.
 * - `NODE_ENV === 'development'` is the build-mode half — `next dev` only.
 *   It alone is not enough either: `NODE_ENV` is `production` on every
 *   built deploy including Preview (the #134 defect), and `test` under
 *   Vitest.
 *
 * Requiring both means CI (`NODE_ENV=test`, no deployment signal) is NOT
 * "local development" for this purpose — it never initialises Sentry at
 * all, because it has no DSN, which is the pre-#194 behaviour preserved.
 *
 * Written as literal `process.env.NODE_ENV` static member access so Next
 * inlines it into the browser bundle (see {@link getSentryEnvironment}).
 *
 * @returns `true` for a local `next dev` run, `false` for every deployed
 * environment and for CI.
 */
export function isLocalDevelopmentEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    getSentryEnvironment() === 'development'
  )
}

/**
 * Values of the Spotlight switch that mean "off". Anything else — including
 * the documented `1` — means on.
 */
const SPOTLIGHT_DISABLED_VALUES = new Set(['0', 'false', 'off', 'no'])

/**
 * Whether the developer has opted into Spotlight, the local error sink
 * (#194).
 *
 * @remarks
 * `NEXT_PUBLIC_SENTRY_SPOTLIGHT` is read first, deliberately, for exactly
 * the reason {@link getSentryEnvironment} reads its `NEXT_PUBLIC_` twin
 * first: the prefix is what gets the value inlined into the **browser**
 * bundle, and it is equally readable server-side, so one variable arms
 * both runtimes that can reach a sidecar — the browser and Node. (The edge
 * runtime cannot, and {@link getSentryInitDecision} never gives it a
 * Spotlight decision regardless of this switch.) `SENTRY_SPOTLIGHT` — the
 * name the Sentry Node SDK reads natively
 * `[source: @sentry/node-core 10.70.0 utils/spotlight.ts]` — remains as a
 * server-only fallback so an operator who sets the SDK's own variable is
 * not surprised by the server ignoring it.
 *
 * Opt-in rather than on-by-default in development: a contributor who has
 * never installed Spotlight gets today's behaviour (no init, no sockets)
 * instead of a per-envelope POST to a dead port. `.env.example` therefore
 * ships this **empty**, documented, for the developer to set in their own
 * `.env.local` — which is also what keeps that file's "leave every var
 * below empty and zero Sentry code paths run" header true.
 *
 * @returns `true` when either variable is set to anything other than an
 * explicit off value.
 */
export function isSpotlightRequested(): boolean {
  const raw = (
    process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT ||
    process.env.SENTRY_SPOTLIGHT ||
    ''
  )
    .trim()
    .toLowerCase()
  if (!raw) return false
  return !SPOTLIGHT_DISABLED_VALUES.has(raw)
}

/**
 * Which runtime is asking. It selects the DSN variables to read and, for
 * `'edge'`, whether Spotlight is reachable at all.
 *
 * @remarks
 * `'server'` and `'edge'` read the same DSN chain (`SENTRY_DSN`, then the
 * public one) and differ only in their Spotlight capability — see
 * {@link getSentryInitDecision}.
 */
export type SentryRuntimeKind = 'client' | 'server' | 'edge'

/**
 * The single send decision every `Sentry.init` call site in this repo obeys.
 *
 * @remarks
 * `init: false` means the entrypoint must not call `Sentry.init` at all —
 * not "call it disabled". `dsn` is only ever present when `init` is true.
 */
export type SentryInitDecision = {
  /** Whether the entrypoint calls `Sentry.init` at all. */
  init: boolean
  /** DSN to send to, or `undefined` for a Spotlight-only (local) init. */
  dsn?: string
  /** Whether to attach the Spotlight sidecar forwarder. */
  spotlight: boolean
  /**
   * `true` when a DSN is configured but a local run is deliberately
   * dropping it — the one case worth a startup line, since it is the
   * difference between "my errors go nowhere" and "my errors go to
   * Spotlight" for someone who still has the old `.env.local`.
   */
  dsnIgnoredInDevelopment: boolean
}

/**
 * Resolve whether — and how — a runtime initialises Sentry (#194).
 *
 * @remarks
 * The matrix, which the unit tests pin case for case:
 *
 * | env shape | init | dsn | spotlight |
 * | --- | --- | --- | --- |
 * | client/server, local, `SENTRY_SPOTLIGHT` on, no DSN | yes | — | yes |
 * | client/server, local, `SENTRY_SPOTLIGHT` on, DSN set | yes | **ignored** | yes |
 * | client/server, local, Spotlight off, no DSN | no | — | no |
 * | client/server, local, Spotlight off, DSN set | no | **ignored** | no |
 * | **edge**, local, Spotlight on or off, DSN set or not | **no** | **ignored** | no |
 * | any runtime, production / staging / preview, DSN set | yes | yes | no |
 * | any runtime, production / staging / preview, no DSN | no | — | no |
 * | any runtime, CI (`NODE_ENV=test`, no DSN) | no | — | no |
 *
 * **Why `'edge'` has its own row.** `@sentry/vercel-edge` 10.70.0 ships no
 * `spotlight` option and no Spotlight integration: the Node one POSTs over
 * `node:http` and the browser one over the page's `fetch`, neither of which
 * exists in that runtime `[source: vercel-edge 10.70.0 build/types has no spotlight symbol]`.
 * So a local edge decision can neither send to the shared project (the
 * fence) nor forward to a sidecar — the honest answer is not to initialise
 * a client with nowhere to send. The rule lives here rather than at the
 * call site so `sentry.edge.config.ts` obeys the decision verbatim, like
 * the other two, and so the fence is provable in the same test file as
 * every other row.
 *
 * Two invariants are load-bearing and are each pinned by their own test:
 *
 * 1. **Deployed behaviour is byte-identical to pre-#194**: outside local
 *    development this is still exactly `Boolean(dsn)`, and `spotlight` is
 *    never true — an accidental `SENTRY_SPOTLIGHT=1` in a Vercel
 *    environment cannot arm a sidecar forwarder in production.
 * 2. **The shared DSN cannot fire from a laptop**: in a local run the DSN
 *    is dropped on the floor whether or not Spotlight is on. Local capture
 *    is still intentional (Brandon, #194) — Spotlight is simply the sink
 *    now, so errors surface faster and never touch the shared project's
 *    quota or its `escalating` state.
 *
 * A DSN-less `Sentry.init` still reaches Spotlight: `Client#sendEnvelope`
 * emits `beforeEnvelope` — which is where both Spotlight integrations hook
 * — *before* it checks for a transport, and `Client#init` force-installs
 * integrations when no DSN is set but a `Spotlight*` integration is present
 * `[source: @sentry/core 10.70.0 client.js:288-295,404-406]`.
 *
 * @param runtime - `'client'` reads {@link getClientSentryDsn}; `'server'`
 * and `'edge'` read {@link getServerSentryDsn}, and differ only in whether
 * Spotlight can be reached.
 * @returns The decision this runtime must obey.
 */
export function getSentryInitDecision(
  runtime: SentryRuntimeKind,
): SentryInitDecision {
  const dsn = runtime === 'client' ? getClientSentryDsn() : getServerSentryDsn()

  if (!isLocalDevelopmentEnvironment()) {
    return {
      init: Boolean(dsn),
      dsn,
      spotlight: false,
      dsnIgnoredInDevelopment: false,
    }
  }

  const spotlight = runtime !== 'edge' && isSpotlightRequested()
  return {
    init: spotlight,
    dsn: undefined,
    spotlight,
    dsnIgnoredInDevelopment: Boolean(dsn),
  }
}

/**
 * Startup line printed by every runtime whose decision carries
 * {@link SentryInitDecision.dsnIgnoredInDevelopment}.
 *
 * @remarks
 * Names the variables, never their values — this repo is public and the
 * message is the one thing here that could plausibly grow a value by
 * accident.
 */
export const SENTRY_DEV_DSN_IGNORED_WARNING =
  '[sentry] A Sentry DSN is set locally (NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN) ' +
  'and is being IGNORED: local runs never send to the shared project (#194). ' +
  'Remove it from .env.local and set NEXT_PUBLIC_SENTRY_SPOTLIGHT=1 to see ' +
  'local errors in Spotlight instead.'

/**
 * Print {@link SENTRY_DEV_DSN_IGNORED_WARNING} when this runtime's decision
 * is dropping a locally-configured DSN.
 *
 * @remarks
 * Lives here rather than being repeated in each entrypoint so the three
 * cannot drift — the same reason {@link sentryDropBotEvent} does. Each
 * runtime makes its own decision and calls this itself, so a local run with
 * a leftover DSN prints the line once per runtime that loads (client, Node,
 * and edge if it is exercised). That is deliberate: silence from one
 * runtime would suggest that runtime is still sending.
 *
 * @param decision - The decision from {@link getSentryInitDecision}.
 */
export function warnIfDevDsnIgnored(decision: SentryInitDecision): void {
  if (decision.dsnIgnoredInDevelopment) {
    console.warn(SENTRY_DEV_DSN_IGNORED_WARNING)
  }
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
