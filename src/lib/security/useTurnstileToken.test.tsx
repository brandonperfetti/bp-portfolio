import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `useTurnstileToken` waits for its widget instead of giving up when called
 * early (#405).
 *
 * @remarks The Cloudflare script is never fetched: jsdom does not load
 * external scripts, so each test plays the script's part by hand — setting
 * `window.turnstile` and calling the `onload` callback it names, or firing
 * the script element's `onerror` as a blocker would. The module caches its
 * script promise, so every test imports a fresh copy.
 */

type Hook = typeof import('@/lib/security/useTurnstileToken')
type HookResult = ReturnType<Hook['useTurnstileToken']>
type RenderParams = { callback: (token: string) => void } & Record<
  string,
  unknown
>

let mod: Hook
let hook: HookResult
let params: RenderParams | null
let fakeApi: {
  render: ReturnType<typeof vi.fn>
  execute: ReturnType<typeof vi.fn>
  reset: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

/** Mount the hook with a container, as a form does, and expose its result. */
function Probe({
  enabled = true,
  loadOn,
}: {
  enabled?: boolean
  loadOn?: 'mount' | 'demand'
}) {
  const result = mod.useTurnstileToken({ enabled, loadOn })
  useEffect(() => {
    hook = result
  })
  return <div ref={result.containerRef} />
}

/** The script element the hook appended, as a blocker would see it. */
function turnstileScript() {
  const script = document.head.querySelector<HTMLScriptElement>(
    'script[src*="challenges.cloudflare.com/turnstile"]',
  )
  if (!script) throw new Error('Turnstile script was not appended')
  return script
}

/** Play the script arriving: expose the API and call its onload hook. */
async function loadScript() {
  window.turnstile = fakeApi as unknown as Window['turnstile']
  await act(async () => {
    window.__turnstileOnload?.()
  })
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key')
  vi.resetModules()
  mod = await import('@/lib/security/useTurnstileToken')
  params = null
  fakeApi = {
    render: vi.fn((_el: HTMLElement, p: RenderParams) => {
      params = p
      return 'widget-1'
    }),
    // A solved invisible challenge: the token arrives on the next tick.
    execute: vi.fn(() => {
      setTimeout(() => params?.callback('fresh-token'), 0)
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  }
})

afterEach(() => {
  delete window.turnstile
  delete window.__turnstileOnload
  document.head.innerHTML = ''
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('useTurnstileToken (#405)', () => {
  it('a call made before the widget renders resolves with the token once it is ready', async () => {
    render(<Probe />)
    const pending = hook.requestToken()
    // Nothing to execute yet: the old hook returned null right here.
    expect(fakeApi.execute).not.toHaveBeenCalled()

    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    await expect(pending).resolves.toEqual({
      status: 'token',
      token: 'fresh-token',
    })
    expect(fakeApi.reset).toHaveBeenCalledWith('widget-1')
    expect(fakeApi.execute).toHaveBeenCalledWith('widget-1')
  })

  it('getToken also waits for the widget, for callers that always send', async () => {
    render(<Probe />)
    const pending = hook.getToken()
    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(pending).resolves.toBe('fresh-token')
  })

  it('a blocked script resolves unavailable (getToken null) within the bound', async () => {
    render(<Probe />)
    const result = hook.requestToken()
    const token = hook.getToken()

    await act(async () => {
      turnstileScript().onerror?.(new Event('error'))
    })

    await expect(result).resolves.toEqual({ status: 'unavailable' })
    await expect(token).resolves.toBeNull()
    expect(fakeApi.execute).not.toHaveBeenCalled()
  })

  it('a script that never arrives resolves timeout at the ready bound, sending nothing', async () => {
    render(<Probe />)
    const pending = hook.requestToken()
    let settled = false
    void pending.then(() => (settled = true))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(mod.TURNSTILE_READY_TIMEOUT_MS - 1)
    })
    expect(settled).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await expect(pending).resolves.toEqual({ status: 'timeout' })
    expect(fakeApi.execute).not.toHaveBeenCalled()
  })

  it('a challenge that never returns resolves timeout at the call bound', async () => {
    fakeApi.execute.mockImplementation(() => {})
    render(<Probe />)
    await loadScript()

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(mod.TURNSTILE_TOKEN_TIMEOUT_MS)
    })
    await expect(pending).resolves.toEqual({ status: 'timeout' })
  })

  it('a widget that renders late still settles within the one call bound', async () => {
    fakeApi.execute.mockImplementation(() => {})
    render(<Probe />)
    const pending = hook.requestToken()
    let settled = false
    void pending.then(() => (settled = true))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(mod.TURNSTILE_READY_TIMEOUT_MS - 1)
    })
    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(
        mod.TURNSTILE_TOKEN_TIMEOUT_MS - mod.TURNSTILE_READY_TIMEOUT_MS,
      )
    })
    expect(settled).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await expect(pending).resolves.toEqual({ status: 'timeout' })
  })

  it('a slow script never turns into a tokenless send, and recovers when it arrives', async () => {
    render(<Probe />)
    const first = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    await expect(first).resolves.toEqual({ status: 'timeout' })

    // Past the old ten-second load timer, a retry still waits, not "unavailable".
    const second = hook.requestToken()
    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(second).resolves.toEqual({
      status: 'token',
      token: 'fresh-token',
    })
  })

  it('overlapping calls each get their own token, one after the other', async () => {
    let n = 0
    fakeApi.execute.mockImplementation(() => {
      const token = `token-${++n}`
      setTimeout(() => params?.callback(token), 10)
    })
    render(<Probe />)
    const first = hook.requestToken()
    const second = hook.requestToken()

    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    await expect(first).resolves.toEqual({ status: 'token', token: 'token-1' })
    await expect(second).resolves.toEqual({ status: 'token', token: 'token-2' })
    expect(fakeApi.execute).toHaveBeenCalledTimes(2)
  })

  it('a challenge cut off by unmount settles instead of hanging', async () => {
    fakeApi.execute.mockImplementation(() => {})
    const { unmount } = render(<Probe />)
    await loadScript()

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    unmount()

    await expect(pending).resolves.toEqual({ status: 'timeout' })
    expect(fakeApi.remove).toHaveBeenCalledWith('widget-1')
  })

  it('a challenge error resolves unavailable, so the server decides', async () => {
    fakeApi.execute.mockImplementation(() => {
      setTimeout(() => (params?.['error-callback'] as () => void)(), 0)
    })
    render(<Probe />)
    await loadScript()

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(pending).resolves.toEqual({ status: 'unavailable' })
  })

  it('a challenge timeout reported as error 110600 resolves timeout, not unavailable', async () => {
    fakeApi.execute.mockImplementation(() => {
      setTimeout(
        () => (params?.['error-callback'] as (code: string) => void)('110600'),
        0,
      )
    })
    render(<Probe />)
    await loadScript()

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(pending).resolves.toEqual({ status: 'timeout' })
  })

  it('a timed-out challenge resets the widget once', async () => {
    fakeApi.execute.mockImplementation(() => {})
    render(<Probe />)
    await loadScript()

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const resetsBefore = fakeApi.reset.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(mod.TURNSTILE_TOKEN_TIMEOUT_MS)
    })
    await expect(pending).resolves.toEqual({ status: 'timeout' })
    expect(fakeApi.reset.mock.calls.length).toBe(resetsBefore + 1)
  })

  it('a wall-clock jump backwards does not stretch the bound', async () => {
    fakeApi.execute.mockImplementation(() => {})
    render(<Probe />)
    const pending = hook.requestToken()
    let settled = false
    void pending.then(() => (settled = true))

    // Only Date moves; elapsed time (timers, performance.now) does not.
    vi.setSystemTime(Date.now() - 60_000)
    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(mod.TURNSTILE_TOKEN_TIMEOUT_MS)
    })
    expect(settled).toBe(true)
    await expect(pending).resolves.toEqual({ status: 'timeout' })
  })

  it('a ready widget answers without waiting', async () => {
    render(<Probe />)
    await loadScript()

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(pending).resolves.toEqual({
      status: 'token',
      token: 'fresh-token',
    })
  })

  it('is inactive with no site key, and loads nothing', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    render(<Probe />)
    await expect(hook.requestToken()).resolves.toEqual({ status: 'inactive' })
    await expect(hook.getToken()).resolves.toBeNull()
    expect(document.head.querySelector('script')).toBeNull()
  })

  it('is inactive when the surface turns it off', async () => {
    render(<Probe enabled={false} />)
    await expect(hook.requestToken()).resolves.toEqual({ status: 'inactive' })
  })
})

describe("useTurnstileToken loadOn: 'demand' (#475)", () => {
  /** Every Turnstile script element in the document. */
  const scripts = () =>
    document.querySelectorAll('script[src*="challenges.cloudflare.com"]')

  it('loads nothing on mount, by default it does', async () => {
    const { unmount } = render(<Probe loadOn="demand" />)
    expect(scripts()).toHaveLength(0)
    unmount()

    render(<Probe />)
    expect(scripts()).toHaveLength(1)
  })

  it('load() fetches the script once and renders the widget', async () => {
    render(<Probe loadOn="demand" />)
    await act(async () => {
      hook.load()
      hook.load()
    })
    expect(scripts()).toHaveLength(1)
    expect(fakeApi.render).not.toHaveBeenCalled()

    await loadScript()
    expect(fakeApi.render).toHaveBeenCalledTimes(1)

    const pending = hook.requestToken()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(pending).resolves.toEqual({
      status: 'token',
      token: 'fresh-token',
    })
  })

  it('a token request with nothing loaded starts the load and waits for it', async () => {
    render(<Probe loadOn="demand" />)
    let pending!: Promise<unknown>
    await act(async () => {
      pending = hook.requestToken()
    })
    expect(scripts()).toHaveLength(1)

    await loadScript()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await expect(pending).resolves.toEqual({
      status: 'token',
      token: 'fresh-token',
    })
  })

  it('a token request whose load never arrives still times out at the ready bound', async () => {
    render(<Probe loadOn="demand" />)
    let pending!: Promise<unknown>
    await act(async () => {
      pending = hook.requestToken()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(mod.TURNSTILE_READY_TIMEOUT_MS)
    })
    await expect(pending).resolves.toEqual({ status: 'timeout' })
    expect(fakeApi.execute).not.toHaveBeenCalled()
  })

  it('loads nothing when inactive, even on load()', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '')
    render(<Probe loadOn="demand" />)
    await act(async () => {
      hook.load()
    })
    await expect(hook.requestToken()).resolves.toEqual({ status: 'inactive' })
    expect(scripts()).toHaveLength(0)
  })
})
