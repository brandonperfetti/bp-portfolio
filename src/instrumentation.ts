import * as Sentry from '@sentry/nextjs'

/**
 * Next.js App Router instrumentation hook.
 *
 * @remarks
 * Registers the Sentry SDK for the Node.js and Edge runtimes by importing
 * the per-runtime config files, which each no-op their own `Sentry.init`
 * call when no DSN is configured (see `src/lib/observability/sentryConfig.ts`
 * and the #73 env-gating precedent in `payload.config.ts`) — so this hook
 * stays a harmless import with zero Sentry activity in DSN-less local dev
 * and CI.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Captures errors from Server Components, Route Handlers, and the proxy
 * (`src/proxy.ts`). Delegates to the Sentry SDK, which itself no-ops when
 * `Sentry.init` was never called (no DSN).
 */
export const onRequestError = Sentry.captureRequestError
