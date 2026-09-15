/** A deadline: the signal to hand around, and the cleanup that cancels it. */
export interface Deadline {
  /** Pass to every step; aborts once the budget is spent. */
  signal: AbortSignal
  /** Call in a `finally` — cancels the pending timer when the work finished. */
  done: () => void
}

/**
 * One wall-clock budget, shared by every step of one operation.
 *
 * @remarks An `AbortController` driven by `setTimeout` rather than
 * `AbortSignal.timeout(ms)`, for two reasons that pull the same way.
 *
 * `AbortSignal.timeout` is driven by an internal timer that test fake-timer
 * libraries do not patch, so a bound built on it is one no test can assert
 * without waiting out the real clock — which is how the first version of this
 * shipped a timeout test that asserted `expect.any(AbortSignal)` and a
 * constant, and would have passed against a ten-minute budget or against two
 * independent ones. A bound nothing can measure is a bound nobody will notice
 * losing.
 *
 * The plain-timer objection — that a pending `setTimeout` holds a serverless
 * function alive while `AbortSignal.timeout` does not — is answered by
 * {@link Deadline.done}: the caller clears it in a `finally`, so the timer
 * outlives the operation by nothing.
 *
 * @param ms - The budget, in milliseconds.
 * @returns The shared signal and its cleanup.
 */
export function createDeadline(ms: number): Deadline {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(
      new Error(`[corvus] deadline of ${ms}ms exceeded; giving up on the work`),
    )
  }, ms)
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
    },
  }
}

/**
 * Bound a promise by an `AbortSignal`, for the work the signal cannot reach.
 *
 * @remarks Threading an `AbortSignal` into `embedChunks` bounds the PROVIDER
 * call and nothing else. The other two things a Corvus refresh does — the
 * drizzle statements, and the `payload.find` over a whole collection — take no
 * signal at all, so a slow database stalls a content save for as long as it
 * likes while the hook's docblock promises "an awaited-but-bounded call has a
 * knowable worst case". This is what makes that sentence true: the same signal
 * that reaches the provider also decides when the caller stops waiting.
 *
 * Rejecting is not cancelling, and the difference matters enough to name.
 * `work` keeps running after this rejects — a promise cannot be cancelled from
 * outside — so an abandoned statement may still complete and write. That is
 * acceptable here and only here: every caller of this function is a fail-open
 * hook whose failure path is "log, leave the stale row, let the save finish",
 * and a late write lands the row the hook wanted anyway. It is a belt over the
 * signal's own braces, not a replacement for passing the signal in: callers
 * pass it to BOTH, so the provider call still aborts at the source rather than
 * being merely abandoned.
 *
 * @typeParam T - What the work resolves to.
 * @param work - The promise to bound.
 * @param signal - The deadline; when absent the work is returned unbounded,
 * which is the right shape for a repair script that should fail loudly and be
 * re-run rather than give up on a clock.
 * @returns `work`'s result, or a rejection at the signal's deadline.
 */
export function withDeadline<T>(
  work: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return work

  const abortError = (): unknown =>
    signal.reason ??
    new Error('[corvus] deadline exceeded before the work completed')

  if (signal.aborted) {
    // Do not swallow the rejection of work that was started anyway: attaching
    // a no-op handler keeps an already-running statement from surfacing as an
    // unhandled rejection while this function returns the abort instead.
    void work.catch(() => {})
    return Promise.reject(abortError())
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    // Cleanup BEFORE settling, not in a trailing `.finally`: a `finally`
    // callback runs a microtask after the returned promise resolves, so an
    // `await` would come back with the listener still attached — and every
    // bounded call would leak one onto a signal that outlives it.
    const release = () => signal.removeEventListener('abort', onAbort)
    work.then(
      (value) => {
        release()
        resolve(value)
      },
      (error: unknown) => {
        release()
        reject(error)
      },
    )
  })
}
