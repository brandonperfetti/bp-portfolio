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

/** How often a refused push is retried, and for how long (#249, CR round 6). */
const PUSH_RETRY_INTERVAL_MS = 1000
/**
 * Retry budget for one refused push.
 *
 * @remarks WebKit's window is ten seconds from its first counted write, and a
 * refused call does not count against it, so fifteen one-second attempts
 * outlast any single window with margin.
 */
const PUSH_RETRY_LIMIT = 15

/**
 * Wrap `history.pushState` / `replaceState` so a throttle refusal never throws:
 * a refused replace is dropped, and a refused push is retried until it lands.
 *
 * @param history - The `History` to guard (`window.history` in the app).
 * @param onDrop - Called once per method per installation, on its first
 *   refused write, so a burst is recorded without a report per call.
 * @returns An uninstall function. It cancels a pending retry and restores the
 *   original methods when the guard is still the outermost wrapper; when
 *   something wrapped it since (Next captures the current method as its
 *   "original" on mount), the guard is left in place but made inert, passing
 *   every call and error straight through.
 *
 * @remarks The two methods fail differently, so they are contained differently.
 * A refused `replaceState` only leaves the address bar stale, and the next
 * successful write re-syncs it, so it is dropped. A refused `pushState` is a
 * missing history ENTRY: Next has already committed the new page, so the page
 * runs ahead of the URL and Back skips it (measured in WebKit on a production
 * build: page 2 shown, URL still `/tech`, Back left `/tech` entirely). So the
 * push is kept pending and retried every second until the window clears, and
 * while it is pending every later write is sent as that push instead: the
 * latest intended state creates the missing entry rather than overwriting the
 * one before it. A later write that lands clears the pending push. Every
 * non-throttle error is rethrown untouched, and calls keep the `history`
 * receiver so native methods and Next's own patch both work.
 */
export function installHistoryWriteGuard(
  history: History,
  onDrop: (method: HistoryWriteMethod) => void,
): () => void {
  const previous = {
    pushState: history.pushState,
    replaceState: history.replaceState,
  }
  let active = true
  const reported = new Set<HistoryWriteMethod>()
  let pendingPush: Parameters<History['pushState']> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retries = 0

  const write = (
    method: HistoryWriteMethod,
    args: Parameters<History['pushState']>,
  ): void => {
    Reflect.apply(previous[method], history, args)
  }
  const clearPending = () => {
    pendingPush = null
    retries = 0
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
  }
  const scheduleRetry = () => {
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (!active || !pendingPush) return
      try {
        write('pushState', pendingPush)
        clearPending()
      } catch (error) {
        retries += 1
        if (!isHistoryThrottleError(error) || retries >= PUSH_RETRY_LIMIT) {
          clearPending()
          return
        }
        scheduleRetry()
      }
    }, PUSH_RETRY_INTERVAL_MS)
  }

  const guard = (method: HistoryWriteMethod) =>
    function guardedHistoryWrite(
      ...args: Parameters<History['pushState']>
    ): void {
      if (!active) {
        write(method, args)
        return
      }
      const effective: HistoryWriteMethod = pendingPush ? 'pushState' : method
      try {
        write(effective, args)
        if (pendingPush) clearPending()
      } catch (error) {
        if (!isHistoryThrottleError(error)) throw error
        if (!reported.has(method)) {
          reported.add(method)
          onDrop(method)
        }
        if (effective === 'pushState') {
          pendingPush = args
          scheduleRetry()
        }
      }
    }

  const guarded = {
    pushState: guard('pushState'),
    replaceState: guard('replaceState'),
  }
  history.pushState = guarded.pushState
  history.replaceState = guarded.replaceState
  return () => {
    active = false
    clearPending()
    for (const method of ['pushState', 'replaceState'] as const) {
      if (history[method] === guarded[method])
        history[method] = previous[method]
    }
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
        // A refused push is retried until it lands; a refused replace is not.
        outcome: method === 'pushState' ? 'retrying' : 'dropped',
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
 * replace costs one URL update (the next successful write re-syncs the address
 * bar) and a refused push lands late (retried once the window clears), where
 * the throw costs the page. Scoped to the explorer's lifetime, and every
 * refusal is logged, never silently ignored.
 */
export function HistoryWriteGuard(): null {
  useEffect(
    () => installHistoryWriteGuard(window.history, reportDroppedHistoryWrite),
    [],
  )
  return null
}
