/** The two History methods Safari's write throttle counts against. */
export type HistoryWriteMethod = 'pushState' | 'replaceState'

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
 * `history.write_dropped`.
 *
 * - `retrying`: a refused push or replace, or a refused write folded into a
 *   pending push; re-sent every second (#249 CR round 6 for a push, #272 for
 *   a replace).
 * - `gave_up`: a pending write still refused after {@link RETRY_LIMIT}
 *   attempts; abandoned.
 * - `retry_failed`: a retry threw something other than the throttle;
 *   abandoned (a timer has no caller to rethrow to).
 *
 * A refused replace used to be logged `dropped`; since #272 it is retried, so
 * that outcome is no longer emitted.
 */
export type HistoryWriteOutcome = 'retrying' | 'gave_up' | 'retry_failed'

/** How often a refused write is retried (#249 CR round 6, #272). */
const RETRY_INTERVAL_MS = 1000
/**
 * Retry budget for one refused write: about fifteen seconds.
 *
 * @remarks Sized to outlast one WebKit window. That the window is ten seconds
 * from its first counted write and that a refused call does not count against
 * it is `[inference: recalled from the WebKit source, not re-read]`;
 * `[measured]` a push refused right after exhausting the budget landed within
 * twelve seconds (Playwright WebKit 26.5, production build).
 */
const RETRY_LIMIT = 15

/**
 * Wrap `history.pushState` / `replaceState` so a throttle refusal never throws:
 * a refused write is retried every second for about fifteen seconds, then
 * given up.
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
 * A refused `replaceState` leaves the address bar stale. It used to be dropped
 * on the reasoning that the next write re-syncs it, but a reader who stops
 * changing filters sends no next write, so the new list stayed under the old
 * URL (#272, decided as option (b) on #249 AC-2). The guard now keeps the
 * latest refused replace and re-sends it on the push's cadence and budget; a
 * later write that lands, a pending push, or a traversal supersedes it. A
 * refused `pushState` is a missing history ENTRY: Next has already committed
 * the new page, so the page runs ahead of the URL and Back skips it (measured
 * in WebKit on a production build: page 2 shown, URL still `/tech`, Back left
 * `/tech` entirely). So the push is kept pending and retried every second,
 * and while it is pending every later write is sent as that push instead: the
 * latest intended state creates the missing entry rather than overwriting the
 * one before it. A later write that lands clears the pending push.
 *
 * What this does not fix, stated so nobody relies on it:
 * - Until the window clears (up to one window, about ten seconds) the page
 *   still runs ahead of the address bar.
 * - Only the LATEST refused replace is kept; an earlier one is superseded,
 *   which is right for a replace (it overwrites the same entry).
 * - A replace still refused after about fifteen seconds is given up (logged
 *   `gave_up`), leaving the pre-#272 stale address bar.
 * - Two pushes refused within one window merge into ONE entry (the later
 *   state), so Back skips the first of them.
 * - A push still refused after about fifteen seconds is given up (logged
 *   `gave_up`), which leaves the pre-fix inconsistency.
 * - A Back/Forward traversal while a write is pending cancels it
 *   (`popstate`), so Next's restore write for the traversed entry is not
 *   turned into a new push that would cut off forward history, and a pending
 *   replace is never re-sent over the entry the reader traversed to (#272).
 *   The listener is registered in the capture phase so it runs before Next's
 *   bubble-phase `popstate` listener
 *   (`next/dist/client/components/app-router.js`) whichever mounted first.
 *   That capture listeners on the event's own target fire before its bubble
 *   listeners is an inference recalled from the DOM spec's dispatch order, not
 *   re-read. The pending entry is abandoned: measured in WebKit on a
 *   production build, Back from a refused page 3 (shown over the page-2 entry)
 *   landed on page 1, no stray entry appeared after the window, and Forward
 *   still reached page 2.
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
  let pending: {
    method: HistoryWriteMethod
    args: Parameters<History['pushState']>
  } | null = null
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
    pending = null
    retries = 0
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
  }
  const scheduleRetry = () => {
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (!active || !pending) return
      const { method, args } = pending
      try {
        write(method, args)
        clearPending()
      } catch (error) {
        retries += 1
        if (!isHistoryThrottleError(error)) {
          report(method, 'retry_failed')
          clearPending()
          return
        }
        if (retries >= RETRY_LIMIT) {
          report(method, 'gave_up')
          clearPending()
          return
        }
        scheduleRetry()
      }
    }, RETRY_INTERVAL_MS)
  }
  // A traversal moves the browser to an existing entry; the pending write was
  // for the entry the reader just left, so it must not be re-sent on top.
  const onPopState = () => {
    if (active) clearPending()
  }
  // Capture phase, so this listener runs ahead of Next's own bubble-phase
  // `popstate` listener on `window`. The guard is installed before hydration
  // (`instrumentation-client.ts`), so it always registers first; capture keeps
  // the order whatever the registration order, and it must hold: were ours to
  // run second, Next's restore write would reach the guard with the push still
  // pending and be sent as a push.
  target.addEventListener('popstate', onPopState, { capture: true })

  const guard = (method: HistoryWriteMethod) =>
    function guardedHistoryWrite(
      ...args: Parameters<History['pushState']>
    ): void {
      if (!active) {
        write(method, args)
        return
      }
      // A pending PUSH turns every later write into that push; a pending
      // replace does not, since a replace never owes the history a new entry.
      const effective: HistoryWriteMethod =
        pending?.method === 'pushState' ? 'pushState' : method
      try {
        write(effective, args)
        if (pending) clearPending()
      } catch (error) {
        if (!isHistoryThrottleError(error)) throw error
        report(method, 'retrying')
        // The latest refused write supersedes the previous one; a refused push
        // always wins over a pending replace.
        pending = { method: effective, args }
        // ...and gets a budget of its own: the one it replaced may have spent
        // nearly all of its attempts, which would abandon the newer URL after
        // one more refusal.
        retries = 0
        scheduleRetry()
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
    target.removeEventListener('popstate', onPopState, { capture: true })
    for (const method of ['pushState', 'replaceState'] as const) {
      if (history[method] === guarded[method])
        history[method] = previous[method]
    }
  }
}
