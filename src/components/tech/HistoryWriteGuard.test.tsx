import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  HistoryWriteGuard,
  installHistoryWriteGuard,
  isHistoryThrottleError,
} from '@/components/tech/HistoryWriteGuard'

/** WebKit's exact refusal, as `BP-PORTFOLIO-M` recorded it (#249). */
const webkitThrottle = () =>
  new DOMException(
    'Attempt to use history.replaceState() more than 100 times per 10 seconds',
    'SecurityError',
  )

/** A fake `History` whose writes throw whatever the test queues. */
function fakeHistory() {
  const calls: unknown[][] = []
  let nextError: unknown = null
  const write = function (this: unknown, ...args: unknown[]) {
    calls.push([this, ...args])
    if (nextError) {
      const error = nextError
      nextError = null
      throw error
    }
  }
  const history = {
    pushState: write,
    replaceState: write,
  } as unknown as History
  return {
    history,
    calls,
    throwNext: (error: unknown) => {
      nextError = error
    },
  }
}

afterEach(() => {
  cleanup()
})

describe('isHistoryThrottleError (#249)', () => {
  it('matches the WebKit and Firefox throttle refusals', () => {
    expect(isHistoryThrottleError(webkitThrottle())).toBe(true)
    expect(
      isHistoryThrottleError(
        new DOMException(
          'Too many calls to Location or History APIs within a short timeframe.',
          'SecurityError',
        ),
      ),
    ).toBe(true)
  })

  it('does not match a cross-origin SecurityError or any other error', () => {
    expect(
      isHistoryThrottleError(
        new DOMException(
          'Blocked attempt to use history.replaceState() to change session history URL from https://a.test/ to https://b.test/.',
          'SecurityError',
        ),
      ),
    ).toBe(false)
    expect(isHistoryThrottleError(new TypeError('more than 100 times'))).toBe(
      false,
    )
    expect(isHistoryThrottleError(null)).toBe(false)
    expect(isHistoryThrottleError('SecurityError')).toBe(false)
  })
})

describe('installHistoryWriteGuard (#249)', () => {
  it('drops a throttled write instead of throwing, and reports it once per method', () => {
    const { history, calls, throwNext } = fakeHistory()
    const onDrop = vi.fn()
    installHistoryWriteGuard(history, onDrop)

    throwNext(webkitThrottle())
    expect(() => history.replaceState({}, '', '/tech?q=a')).not.toThrow()
    throwNext(webkitThrottle())
    expect(() => history.replaceState({}, '', '/tech?q=b')).not.toThrow()
    throwNext(webkitThrottle())
    expect(() => history.pushState({}, '', '/tech?page=2')).not.toThrow()

    expect(onDrop.mock.calls).toEqual([['replaceState'], ['pushState']])
    // Writes still reach the underlying method, with `history` as receiver.
    expect(calls).toHaveLength(3)
    expect(calls[0][0]).toBe(history)
    expect(calls[0].slice(1)).toEqual([{}, '', '/tech?q=a'])
  })

  it('rethrows every error that is not the throttle', () => {
    const { history, throwNext } = fakeHistory()
    const onDrop = vi.fn()
    installHistoryWriteGuard(history, onDrop)

    const crossOrigin = new DOMException('Blocked attempt', 'SecurityError')
    throwNext(crossOrigin)
    expect(() => history.replaceState({}, '', 'https://b.test/')).toThrow(
      crossOrigin,
    )
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('restores the original methods on uninstall when it is still outermost', () => {
    const { history } = fakeHistory()
    const original = history.replaceState
    const uninstall = installHistoryWriteGuard(history, vi.fn())
    expect(history.replaceState).not.toBe(original)

    uninstall()

    expect(history.replaceState).toBe(original)
  })

  it('goes inert, not missing, when something wrapped it since (Next captures it on mount)', () => {
    const { history, throwNext } = fakeHistory()
    const onDrop = vi.fn()
    const uninstall = installHistoryWriteGuard(history, onDrop)
    // Next's app router captures the current method as its "original" and
    // installs its own patch on top.
    const captured = history.replaceState
    const nextPatch = (...args: Parameters<History['replaceState']>) =>
      captured.apply(history, args)
    history.replaceState = nextPatch

    uninstall()

    expect(history.replaceState).toBe(nextPatch)
    throwNext(webkitThrottle())
    expect(() => history.replaceState({}, '', '/x')).toThrow('more than 100')
    expect(onDrop).not.toHaveBeenCalled()
  })
})

/**
 * CodeRabbit round 6 (thread 4114273362): a refused `pushState` is a missing
 * history ENTRY, not a stale address bar. Next has already committed the new
 * page, so dropping it leaves the page ahead of the URL and Back skipping it
 * (measured in WebKit on a production build). These pin the retry.
 */
describe('installHistoryWriteGuard · refused pushes are retried (CR round 6)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A fake whose writes throw the throttle while `throttled` is true. */
  function throttledHistory() {
    const writes: Array<[string, unknown]> = []
    const box = { throttled: true }
    const make = (method: string) =>
      function (_data: unknown, _unused: string, url?: string | URL | null) {
        if (box.throttled) throw webkitThrottle()
        writes.push([method, url])
      }
    const history = {
      pushState: make('pushState'),
      replaceState: make('replaceState'),
    } as unknown as History
    return { history, writes, box }
  }

  it('retries a throttled push once the window clears, creating the entry', () => {
    vi.useFakeTimers()
    const { history, writes, box } = throttledHistory()
    installHistoryWriteGuard(history, vi.fn())

    expect(() => history.pushState({}, '', '/tech?page=2')).not.toThrow()
    expect(writes).toEqual([])

    vi.advanceTimersByTime(1000) // still throttled: stays pending
    expect(writes).toEqual([])

    box.throttled = false
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([['pushState', '/tech?page=2']])

    vi.advanceTimersByTime(20_000) // no duplicate entry
    expect(writes).toHaveLength(1)
  })

  it('a later write while a push is pending creates that entry instead of overwriting the one before it', () => {
    vi.useFakeTimers()
    const { history, writes, box } = throttledHistory()
    installHistoryWriteGuard(history, vi.fn())

    history.pushState({}, '', '/tech?page=2')
    box.throttled = false
    // Next's next sync for the same navigation is a replace; it must become
    // the missing push, or page 2 overwrites page 1's entry.
    history.replaceState({}, '', '/tech?page=2&q=x')
    vi.advanceTimersByTime(20_000)

    expect(writes).toEqual([['pushState', '/tech?page=2&q=x']])
  })

  it('still drops a throttled replace with nothing pending (no retry, no entry)', () => {
    vi.useFakeTimers()
    const { history, writes, box } = throttledHistory()
    installHistoryWriteGuard(history, vi.fn())

    expect(() => history.replaceState({}, '', '/tech?q=a')).not.toThrow()
    box.throttled = false
    vi.advanceTimersByTime(20_000)

    expect(writes).toEqual([])
  })

  it('gives up after its retry budget and cancels on uninstall', () => {
    vi.useFakeTimers()
    const { history, writes, box } = throttledHistory()
    const uninstall = installHistoryWriteGuard(history, vi.fn())

    history.pushState({}, '', '/tech?page=2')
    uninstall()
    box.throttled = false
    vi.advanceTimersByTime(20_000)
    expect(writes).toEqual([])

    const second = throttledHistory()
    installHistoryWriteGuard(second.history, vi.fn())
    second.history.pushState({}, '', '/tech?page=3')
    vi.advanceTimersByTime(60_000) // throttled the whole time
    second.box.throttled = false
    vi.advanceTimersByTime(20_000)
    expect(second.writes).toEqual([])
  })
})

describe('<HistoryWriteGuard /> (#249)', () => {
  it('guards window.history while mounted and restores it on unmount', () => {
    const original = window.history.replaceState
    const { unmount } = render(<HistoryWriteGuard />)
    expect(window.history.replaceState).not.toBe(original)

    unmount()

    expect(window.history.replaceState).toBe(original)
  })
})
