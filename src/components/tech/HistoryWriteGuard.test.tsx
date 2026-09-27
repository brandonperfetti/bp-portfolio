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

describe('<HistoryWriteGuard /> (#249)', () => {
  it('guards window.history while mounted and restores it on unmount', () => {
    const original = window.history.replaceState
    const { unmount } = render(<HistoryWriteGuard />)
    expect(window.history.replaceState).not.toBe(original)

    unmount()

    expect(window.history.replaceState).toBe(original)
  })
})
