import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  LimiterUnavailableError,
  reportLimiterOutage,
} from '@/lib/security/limiterOutage'

const captureExceptionMock = vi.fn()
vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

beforeEach(() => {
  captureExceptionMock.mockReset()
})

describe('reportLimiterOutage (#390)', () => {
  it('captures one LimiterUnavailableError carrying the upstream cause', () => {
    const upstream = new TypeError('s.map is not a function')

    const outage = reportLimiterOutage(upstream, {
      surface: 'chat',
      operation: 'checkChatLimits',
      redact: [],
    })

    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock.mock.calls[0]?.[0]).toBe(outage)
    expect(outage).toBeInstanceOf(LimiterUnavailableError)
    expect(outage.message).toBe(
      'Rate limiter unavailable on chat (checkChatLimits): TypeError: s.map is not a function',
    )
    const cause = outage.cause as Error
    expect(cause.name).toBe('TypeError')
    // A copy, never the upstream object, so nothing unredacted rides along.
    expect(cause).not.toBe(upstream)
    expect(cause.stack).toBeTruthy()
  })

  it('redacts the given identifiers and any IPv4 from message and stack', () => {
    const upstream = new Error(
      'ERR for key user:abc at 203.0.113.9 and 2001:db8::1',
    )

    const outage = reportLimiterOutage(upstream, {
      surface: 'contact',
      operation: 'checkChatLimits',
      redact: ['user:abc', '2001:db8::1', ''],
    })

    const cause = outage.cause as Error
    for (const text of [outage.message, cause.message, cause.stack ?? '']) {
      expect(text).not.toContain('user:abc')
      expect(text).not.toContain('203.0.113.9')
      expect(text).not.toContain('2001:db8::1')
    }
    expect(cause.message).toBe(
      'ERR for key [redacted] at [redacted] and [redacted]',
    )
  })

  it('never stringifies a non-Error throw', () => {
    const outage = reportLimiterOutage(
      { token: 'secret-token' },
      { surface: 'chat', operation: 'peekAnonFreeMessageCount', redact: [] },
    )

    expect(outage.message).not.toContain('secret-token')
    expect((outage.cause as Error).message).toBe('unknown')
  })
})
