'use client'

import { useEffect } from 'react'

/** The two History methods Safari's write throttle counts against. */
type HistoryWriteMethod = 'pushState' | 'replaceState'

/**
 * Is this the browser refusing a history write because of its rate limit?
 *
 * @param error - Whatever a `history.pushState` / `replaceState` call threw.
 * @returns `true` only for the throttle — WebKit's "Attempt to use
 *   history.replaceState() more than 100 times per 10 seconds" and Firefox's
 *   "Too many calls to Location or History APIs within a short timeframe".
 *
 * @remarks Matched on name AND message on purpose. A `SecurityError` from
 * these methods is also what a cross-origin URL throws, and that one is a real
 * bug that must keep surfacing, so the name alone is too broad.
 */
export function isHistoryThrottleError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  return (
    name === 'SecurityError' &&
    typeof message === 'string' &&
    /more than \d+ times|too many calls/i.test(message)
  )
}

/**
 * Wrap `history.pushState` / `replaceState` so a throttle refusal drops that
 * one URL update instead of throwing.
 *
 * @param history - The `History` to guard (`window.history` in the app).
 * @param onDrop - Called once per method per installation, on its first
 *   dropped write, so a burst is recorded without a report per call.
 * @returns An uninstall function. It restores the original method when the
 *   guard is still the outermost wrapper; when something wrapped it since (Next
 *   captures the current method as its "original" on mount), the guard is left
 *   in place but made inert, passing every error through again.
 *
 * @remarks Every other error is rethrown untouched, and the wrapped call keeps
 * the `history` receiver so native methods and Next's own patch both work.
 */
export function installHistoryWriteGuard(
  history: History,
  onDrop: (method: HistoryWriteMethod) => void,
): () => void {
  const uninstallers = (['pushState', 'replaceState'] as const).map(
    (method) => {
      const previous = history[method]
      let active = true
      let reported = false
      const guarded = function guardedHistoryWrite(
        ...args: Parameters<History[typeof method]>
      ): void {
        try {
          Reflect.apply(previous, history, args)
        } catch (error) {
          if (!active || !isHistoryThrottleError(error)) throw error
          if (!reported) {
            reported = true
            onDrop(method)
          }
        }
      }
      history[method] = guarded
      return () => {
        active = false
        if (history[method] === guarded) history[method] = previous
      }
    },
  )
  return () => {
    for (const uninstall of uninstallers) uninstall()
  }
}

/**
 * Record a dropped history write to Sentry Logs (not an Issue).
 *
 * @remarks Same dynamic-import, never-throws shape as
 * `src/lib/observability/clientTelemetry.ts`: importing this module never pulls
 * `@sentry/nextjs` into a bundle or a test that does not hit the path, and
 * `Sentry.logger` no-ops when Sentry is not initialised. Query Logs for
 * `tech.history.write_dropped` to see whether the throttle still fires.
 */
function reportDroppedHistoryWrite(method: HistoryWriteMethod): void {
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.logger?.warn?.('tech.history.write_dropped', {
        method,
        path: window.location.pathname,
      })
    })
    .catch(() => {
      // Observability is best-effort; never surface a telemetry failure.
    })
}

/**
 * Contains Safari's history-write throttle on `/tech` (#249). Renders nothing.
 *
 * @remarks The throw this contains is not ours to catch at a call site: it
 * comes from Next's own `HistoryUpdater`, which calls `replaceState` inside a
 * `useInsertionEffect` that sits ABOVE every app component, so no error
 * boundary around the explorer can see it — Next's framework-level boundary
 * catches it and replaces the whole app with its default error screen
 * `[measured: Playwright WebKit, production build]`. Wrapping the History
 * method is the one seam that reaches it. The trade is deliberate: a refused
 * write costs one URL update (the next successful write re-syncs the address
 * bar), where the throw costs the page. Scoped to the explorer's lifetime, and
 * the drop is logged, never silently ignored.
 */
export function HistoryWriteGuard(): null {
  useEffect(
    () => installHistoryWriteGuard(window.history, reportDroppedHistoryWrite),
    [],
  )
  return null
}
