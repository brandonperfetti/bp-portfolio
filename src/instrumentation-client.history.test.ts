import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  setUser: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  consoleLoggingIntegration: vi.fn(),
  logger: { warn },
}))

/** WebKit's exact refusal, as `BP-PORTFOLIO-M` recorded it (#249). */
const webkitThrottle = () =>
  new DOMException(
    'Attempt to use history.replaceState() more than 100 times per 10 seconds',
    'SecurityError',
  )

/** Let the guard's fire-and-forget `import('@sentry/nextjs')` log settle. */
const flushTelemetry = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * #268: the history-throttle guard is installed once by
 * `instrumentation-client.ts`, so it covers every route. The routes below are
 * deliberately NOT `/tech`, the only one the old per-route component covered.
 */
describe('instrumentation-client installs the history-write guard app-wide (#268)', () => {
  const nativeReplace = window.history.replaceState
  const nativePush = window.history.pushState
  let refuse: unknown = null

  beforeEach(() => {
    vi.resetModules()
    warn.mockClear()
    refuse = null
    window.history.pushState({}, '', '/articles')
    // A `History` that refuses what the test queues, standing in for WebKit.
    window.history.replaceState = function () {
      if (refuse) throw refuse
    }
    window.history.pushState = function () {
      if (refuse) throw refuse
    }
  })

  afterEach(() => {
    window.history.replaceState = nativeReplace
    window.history.pushState = nativePush
  })

  it('drops a throttle SecurityError on a non-/tech route and logs it with the route', async () => {
    await import('@/instrumentation-client')

    refuse = webkitThrottle()
    expect(() =>
      window.history.replaceState({}, '', '/articles?q=a'),
    ).not.toThrow()
    await flushTelemetry()

    expect(warn).toHaveBeenCalledWith('history.write_dropped', {
      method: 'replaceState',
      outcome: 'dropped',
      path: '/articles',
    })
  })

  it('attributes a refusal to the route that triggered it, even if the page moves before the log lands', async () => {
    await import('@/instrumentation-client')

    refuse = webkitThrottle()
    window.history.replaceState({}, '', '/articles?q=a')
    // The reader navigates away before the dynamic import resolves.
    nativePush.call(window.history, {}, '', '/work')
    await flushTelemetry()

    expect(warn).toHaveBeenCalledWith(
      'history.write_dropped',
      expect.objectContaining({ path: '/articles' }),
    )
  })

  it('still throws a SecurityError that is not the throttle', async () => {
    await import('@/instrumentation-client')

    const crossOrigin = new DOMException('Blocked attempt', 'SecurityError')
    refuse = crossOrigin
    expect(() =>
      window.history.replaceState({}, '', 'https://b.test/'),
    ).toThrow(crossOrigin)
    await flushTelemetry()

    expect(warn).not.toHaveBeenCalled()
  })

  it('wraps window.history when instrumentation-client loads', async () => {
    const before = window.history.replaceState
    await import('@/instrumentation-client')
    const guarded = window.history.replaceState

    expect(guarded).not.toBe(before)
  })
})
