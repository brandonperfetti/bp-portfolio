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
