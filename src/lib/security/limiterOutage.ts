import * as Sentry from '@sentry/nextjs'

import { boundedErrorMessage } from '@/lib/observability/boundedErrorMessage'

/** Which route a limiter outage blocked. */
export type LimiterSurface = 'chat' | 'contact'

/** Which limiter call failed, so the Sentry issue says where. */
export type LimiterOperation =
  | 'checkChatLimits'
  | 'peekAnonFreeMessageCount'
  | 'incrementAnonFreeMessageCount'

const REDACTED = '[redacted]'

// Belt and braces for the one identifier shape we can recognise without being
// told: the caller also passes its own keys, which is what catches IPv6 and
// HMAC digests.
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g

/**
 * The rate-limit store (Upstash Redis) failed, so a request was refused
 * instead of running unlimited (#390).
 *
 * @remarks Built by {@link reportLimiterOutage} from a sanitised copy of the
 * upstream error, never the upstream error itself: an `@upstash/*` error can
 * carry a response body, and the contact limiter's key is a raw client IP.
 * The sanitised copy rides on `cause`, so Sentry's linked-errors integration
 * still shows the Upstash frames (`withAutoPipeline`, `limit`) that locate a
 * fault such as `s.map is not a function`.
 */
export class LimiterUnavailableError extends Error {
  readonly surface: LimiterSurface
  readonly operation: LimiterOperation

  /**
   * @param surface - The route the outage blocked.
   * @param operation - The limiter call that failed.
   * @param cause - The sanitised upstream error.
   */
  constructor(
    surface: LimiterSurface,
    operation: LimiterOperation,
    cause: Error,
  ) {
    super(
      `Rate limiter unavailable on ${surface} (${operation}): ${cause.name}: ${cause.message}`,
      { cause },
    )
    this.name = 'LimiterUnavailableError'
    this.surface = surface
    this.operation = operation
  }
}

const redact = (text: string, secrets: readonly string[]) => {
  let out = text
  for (const secret of secrets) {
    if (secret) out = out.replaceAll(secret, REDACTED)
  }
  return out.replace(IPV4_PATTERN, REDACTED)
}

/**
 * Report a rate-limiter failure to Sentry, once, with its cause and without
 * the request's identifiers.
 *
 * @param error - Whatever the limiter call threw.
 * @param context - The blocked surface, the failed call, and every
 * request-derived value (client IP, limiter key) that must not reach Sentry.
 * @returns The error that was captured, for a caller or test that wants it.
 *
 * @remarks Callers turn the outage into a 503 right after this, so a request
 * reports at most one outage: the first failing limiter call ends it. The
 * routes catch the failure themselves, so Next's `onRequestError` never sees
 * it and cannot report it a second time. The upstream message is bounded by
 * {@link boundedErrorMessage} and redacted in both the message and the stack,
 * because a stack's first line repeats the message.
 */
export function reportLimiterOutage(
  error: unknown,
  context: {
    surface: LimiterSurface
    operation: LimiterOperation
    redact: readonly string[]
  },
): LimiterUnavailableError {
  const cause = new Error(redact(boundedErrorMessage(error), context.redact))
  if (error instanceof Error) {
    cause.name = error.name
    cause.stack = error.stack ? redact(error.stack, context.redact) : undefined
  }
  const outage = new LimiterUnavailableError(
    context.surface,
    context.operation,
    cause,
  )
  Sentry.captureException(outage, {
    level: 'error',
    tags: {
      'limiter.surface': context.surface,
      'limiter.operation': context.operation,
    },
    // One issue per surface, whatever the upstream message: a plan cap and a
    // network fault are the same outage to whoever is paged.
    fingerprint: ['limiter-unavailable', context.surface],
  })
  return outage
}
