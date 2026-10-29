import type {
  HistoryWriteMethod,
  HistoryWriteOutcome,
} from '@/lib/history/historyWriteGuard'

/**
 * Best-effort client-side telemetry helpers that record to Sentry Logs (the
 * structured-logging view, `enableLogs: true` in `instrumentation-client.ts`)
 * without coupling the calling component to the Sentry SDK.
 *
 * @remarks Sentry is loaded with a dynamic `import()` INSIDE each function, so
 * importing this module never pulls `@sentry/nextjs` into a bundle (or a unit
 * test) that doesn't actually hit the code path. Every call is wrapped so a
 * telemetry failure — or Sentry being uninitialized (no DSN) — can never throw
 * into the UI; `Sentry.logger.*` already no-ops when logs are disabled.
 */

/**
 * Record a Corvus speech-recognition error to Sentry Logs with the raw
 * `event.error` code and whether a transcript had already arrived.
 *
 * @remarks This is diagnostics only — it does NOT create a Sentry Issue
 * (these errors are handled gracefully in `useSpeechInput`, so raising an
 * exception would be noise). It exists to turn an inference ("iOS Safari fires
 * spurious `network` errors") into field data: query Logs for
 * `corvus.speech.recognition_error` to see the actual codes and how often each
 * one arrives before vs. after a successful transcript.
 *
 * @param detail - The raw error code and whether recognition had transcribed.
 */
export function reportSpeechRecognitionError(detail: {
  error: string
  hadTranscript: boolean
}): void {
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.logger?.warn?.('corvus.speech.recognition_error', {
        error: detail.error,
        had_transcript: detail.hadTranscript,
      })
    })
    .catch(() => {
      // Observability is best-effort; never surface a telemetry failure.
    })
}

/**
 * Record a refused history write to Sentry Logs (not an Issue).
 *
 * @remarks Installed app-wide from `instrumentation-client.ts` (#268), so it
 * fires on any route. Carries the method, the {@link HistoryWriteOutcome} and
 * the pathname only (`window.location.pathname`: no query string, no user
 * data). Query Logs for `history.write_dropped` to see whether the throttle
 * still fires, and on which route. The type-only import keeps this module free
 * of a runtime dependency on the guard.
 *
 * @param method - The History method the caller used.
 * @param outcome - What became of the write.
 */
export function reportHistoryWriteRefusal(
  method: HistoryWriteMethod,
  outcome: HistoryWriteOutcome,
): void {
  // Read the route now, not inside the `.then`: the guard reports each
  // method-and-outcome pair once, and the dynamic import resolves later, so a
  // navigation in between would attribute the refusal to the wrong route.
  const path = window.location.pathname
  void import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.logger?.warn?.('history.write_dropped', {
        method,
        outcome,
        path,
      })
    })
    .catch(() => {
      // Observability is best-effort; never surface a telemetry failure.
    })
}
