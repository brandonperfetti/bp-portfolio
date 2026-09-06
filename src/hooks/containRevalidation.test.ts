import { describe, expect, it, vi } from 'vitest'

import { containRevalidation } from '@/hooks/containRevalidation'

/**
 * The containment guarantee itself (#135, #156), tested once at its own seam
 * rather than only through the three hooks that use it.
 *
 * The behaviour under test is deliberately narrow and total: whatever the purge
 * does, the caller returns normally, and a failure is always logged at `error`
 * with the target and the underlying reason attached.
 */
const makeLogger = () => ({ error: vi.fn(), info: vi.fn() })

describe('containRevalidation', () => {
  it('runs the purge and stays silent when it succeeds', () => {
    const logger = makeLogger()
    const purge = vi.fn()

    containRevalidation({ logger } as never, 'post write', 'the path /a', purge)

    expect(purge).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('never propagates a throw from the purge', () => {
    const logger = makeLogger()

    expect(() =>
      containRevalidation(
        { logger } as never,
        'post write',
        'the path /a',
        () => {
          throw new Error('Invariant: static generation store missing')
        },
      ),
    ).not.toThrow()
  })

  it('logs the target, the surviving subject and the reason', () => {
    const logger = makeLogger()
    const err = new Error('Invariant: static generation store missing')

    containRevalidation(
      { logger } as never,
      'redirect row',
      'the redirects tag',
      () => {
        throw err
      },
    )

    expect(logger.error).toHaveBeenCalledTimes(1)
    const [meta, message] = logger.error.mock.calls[0] as [
      { err: unknown },
      string,
    ]
    expect(meta.err).toBe(err)
    expect(message).toContain('the redirects tag')
    expect(message).toContain('the redirect row is kept')
  })

  it('contains a non-Error throw too', () => {
    // `revalidatePath` is not the only thing that can go wrong inside a purge
    // group, and a `catch` that assumed `Error` would itself throw.
    const logger = makeLogger()

    expect(() =>
      containRevalidation(
        { logger } as never,
        'page write',
        'the path /a',
        () => {
          throw 'string failure'
        },
      ),
    ).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(
      { err: 'string failure' },
      expect.stringContaining('the page write is kept'),
    )
  })

  it('stops the group at the first failure, by design', () => {
    // Documented granularity: the real failure mode is scope-wide, so callers
    // group purges that would all fail together rather than wrapping each call.
    const logger = makeLogger()
    const second = vi.fn()

    containRevalidation({ logger } as never, 'post write', 'the tags', () => {
      if (logger) throw new Error('boom')
      second()
    })

    expect(second).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
