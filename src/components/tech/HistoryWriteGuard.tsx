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
 * What became of a refused history write — the `outcome` field logged with
 * `tech.history.write_dropped`.
 *
 * - `dropped`: a refused replace with no push pending; not retried.
 * - `retrying`: a refused push, or a refused write folded into a pending push;
 *   retried every second.
 * - `gave_up`: a pending push still refused after {@link PUSH_RETRY_LIMIT}
 *   attempts; abandoned.
 * - `retry_failed`: a retry threw something other than the throttle;
 *   abandoned (a timer has no caller to rethrow to).
 */
export type HistoryWriteOutcome =
  'dropped' | 'retrying' | 'gave_up' | 'retry_failed'

/** How often a refused push is retried (#249, CR round 6). */
const PUSH_RETRY_INTERVAL_MS = 1000
/**
 * Retry budget for one refused push: about fifteen seconds.
 *
 * @remarks Sized to outlast one WebKit window. That the window is ten seconds
 * from its first counted write and that a refused call does not count against
 * it is `[inference: recalled from the WebKit source, not re-read]`;
 * `[measured]` a push refused right after exhausting the budget landed within
 * twelve seconds (Playwright WebKit 26.5, production build).
 */
const PUSH_RETRY_LIMIT = 15

/**
 * Wrap `history.pushState` / `replaceState` so a throttle refusal never throws:
 * a refused replace is dropped, and a refused push is retried for about fifteen
 * seconds, then given up.
 *
 * @param history - The `History` to guard (`window.history` in the app).
 * @param onRefusal - Called with the method that was called and what became of
 *   the write, once per method-and-outcome pair per installation, so a burst is
 *   recorded without a report per call. It is not called for every refusal.
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
 * push is kept pending and retried every second, and while it is pending every
 * later write is sent as that push instead: the latest intended state creates
 * the missing entry rather than overwriting the one before it. A later write
 * that lands clears the pending push.
 *
 * What this does not fix, stated so nobody relies on it:
 * - Until the window clears (up to one window, about ten seconds) the page
 *   still runs ahead of the address bar.
 * - Two pushes refused within one window merge into ONE entry (the later
 *   state), so Back skips the first of them.
 * - A push still refused after about fifteen seconds is given up (logged
 *   `gave_up`), which leaves the pre-fix inconsistency.
 * - A Back/Forward traversal while a push is pending cancels the pending push
 *   (`popstate`), so Next's restore write for the traversed entry is not
 *   turned into a new push that would cut off forward history. The pending
 *   entry is abandoned: measured in WebKit on a production build, Back from a
 *   refused page 3 (shown over the page-2 entry) landed on page 1, no stray
 *   entry appeared after the window, and Forward still reached page 2.
 *
 * A non-throttle error from a call made on the caller's stack is rethrown
 * untouched. One from a timer retry has no caller to reach, so it is logged
 * `retry_failed` and the retry stops. Calls keep the `history` receiver, so
 * native methods and Next's own patch both work.
 */
export function installHistoryWriteGuard(
  history: History,
  onRefusal: (method: HistoryWriteMethod, outcome: HistoryWriteOutcome) => void,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const previous = {
    pushState: history.pushState,
    replaceState: history.replaceState,
  }
  let active = true
  const reported = new Set<string>()
  let pendingPush: Parameters<History['pushState']> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retries = 0

  const report = (method: HistoryWriteMethod, outcome: HistoryWriteOutcome) => {
    const key = `${method}:${outcome}`
    if (reported.has(key)) return
    reported.add(key)
    onRefusal(method, outcome)
  }
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
        if (!isHistoryThrottleError(error)) {
          report('pushState', 'retry_failed')
          clearPending()
          return
        }
        if (retries >= PUSH_RETRY_LIMIT) {
          report('pushState', 'gave_up')
          clearPending()
          return
        }
        scheduleRetry()
      }
    }, PUSH_RETRY_INTERVAL_MS)
  }
  // A traversal moves the browser to an existing entry; the pending push was
  // for the entry the reader just left, so it must not be recreated on top.
  const onPopState = () => {
    if (active) clearPending()
  }
  target.addEventListener('popstate', onPopState)

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
        if (effective === 'pushState') {
          report(method, 'retrying')
          pendingPush = args
          scheduleRetry()
        } else {
          report(method, 'dropped')
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
    target.removeEventListener('popstate', onPopState)
    for (const method of ['pushState', 'replaceState'] as const) {
      if (history[method] === guarded[method])
        history[method] = previous[method]
    }
  }
}

/**
 * Record a refused history write to Sentry Logs (not an Issue).
 *
 * @remarks Same dynamic-import, never-throws shape as
 * `src/lib/observability/clientTelemetry.ts`: importing this module never pulls
 * `@sentry/nextjs` into a bundle or a test that does not hit the path, and
 * `Sentry.logger` no-ops when Sentry is not initialised. Carries the method,
 * the {@link HistoryWriteOutcome} and the pathname only. Query Logs for
 * `tech.history.write_dropped` to see whether the throttle still fires.
 */
function reportRefusedHistoryWrite(
  method: HistoryWriteMethod,
  outcome: HistoryWriteOutcome,
): void {
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.logger?.warn?.('tech.history.write_dropped', {
        method,
        outcome,
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
 * bar) and a refused push is retried for about fifteen seconds (see
 * {@link installHistoryWriteGuard} for what that does not fix), where the throw
 * costs the page. Scoped to the explorer's lifetime. Refusals are logged once
 * per method-and-outcome pair per mount, never silently ignored.
 */
export function HistoryWriteGuard(): null {
  useEffect(
    () => installHistoryWriteGuard(window.history, reportRefusedHistoryWrite),
    [],
  )
  return null
}
