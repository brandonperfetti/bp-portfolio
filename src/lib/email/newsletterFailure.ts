import { captureException } from '@sentry/nextjs'

/**
 * A newsletter step Resend did not complete, as reported to Sentry.
 *
 * @remarks Its message names only the step. Resend's error name and status
 * go as tags. Neither the address nor Resend's message, which can echo it,
 * is ever included.
 */
export class NewsletterCaptureError extends Error {
  constructor(stage: string) {
    super(`Newsletter capture failed at ${stage}`)
    this.name = 'NewsletterCaptureError'
  }
}

/**
 * Report a failed newsletter step (sending the confirmation, or the
 * join it confirms) to Sentry, with no address.
 *
 * @param stage - The step: `send`, a `captureContact` stage, or `skipped`.
 * @param error - Resend's error name and status, when it gave them.
 *
 * @remarks Shared by `/api/newsletter` and `/api/newsletter/confirm`, so the
 * two report with the same tag names (#409).
 */
export function reportNewsletterFailure(
  stage: string,
  error: { errorName?: string; statusCode?: number | null } = {},
): void {
  captureException(new NewsletterCaptureError(stage), {
    tags: {
      'newsletter.capture_stage': stage,
      'resend.error_name': error.errorName ?? 'none',
      'resend.status_code': String(error.statusCode ?? 'none'),
    },
  })
}
