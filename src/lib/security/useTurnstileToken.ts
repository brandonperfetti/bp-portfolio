'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    params: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: (errorCode?: string) => void
      'expired-callback'?: () => void
      'timeout-callback'?: () => void
      execution?: 'render' | 'execute'
      appearance?: 'always' | 'execute' | 'interaction-only'
      action?: string
    },
  ) => string
  execute: (widgetId: string) => void
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
    __turnstileOnload?: () => void
  }
}

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__turnstileOnload&render=explicit'

/**
 * How long a call made before the widget has rendered waits for it (#405).
 * Short on purpose: the visitor is looking at a pressed button.
 */
export const TURNSTILE_READY_TIMEOUT_MS = 5_000

/**
 * The whole bound on one call, from the moment it is made: waiting for an
 * earlier call, for the widget and for the challenge all count against it.
 */
export const TURNSTILE_TOKEN_TIMEOUT_MS = 15_000

/**
 * What a form shows when the check timed out (#405). It sends nothing: a
 * tokenless request would only earn the server's 403, and the visitor would
 * not know whether to wait or resubmit.
 */
export const TURNSTILE_RETRY_MESSAGE =
  'The spam check is taking longer than usual. Please try again in a moment.'

/**
 * The outcome of one token request.
 *
 * - `token`: send it.
 * - `inactive`: Turnstile is off for this surface or has no site key; send
 *   without a token, the server is not checking.
 * - `unavailable`: the script was blocked or failed, or the challenge
 *   errored; send without a token and let the server decide.
 * - `timeout`: the widget was still loading, or the challenge did not finish,
 *   within its bound; do not send, ask the visitor to retry.
 */
export type TurnstileTokenResult =
  | { status: 'token'; token: string }
  | { status: 'inactive' }
  | { status: 'unavailable' }
  | { status: 'timeout' }

type WidgetState = 'loading' | 'ready' | 'failed'

/**
 * Is this Turnstile `error-callback` code a timeout?
 *
 * @remarks Cloudflare's client-side codes in the `1106xx` family are the
 * challenge or its interaction timing out (110600, 110620). A timeout asks
 * the visitor to retry like any other (#405); every other code is a failed
 * challenge, sent on without a token for the server to decide.
 *
 * @param errorCode - The code the widget passed, when it passed one.
 */
function isTimeoutErrorCode(errorCode: string | undefined): boolean {
  return typeof errorCode === 'string' && errorCode.startsWith('1106')
}

let scriptPromise: Promise<TurnstileApi | null> | null = null

/**
 * Load the Turnstile script once per page; resolve `null` (never reject) if
 * it fails to load — privacy blockers commonly block challenges.cloudflare.com,
 * and a blocked script must degrade to "no token", not a crashed feature.
 *
 * @remarks A slow script is not a failed one, so there is no load timeout
 * here (#405): a call that cannot wait any longer gives up on its own bound
 * and says `timeout`, and a script that arrives late still renders the widget
 * for the visitor's retry. Before, a ten-second timer settled the load as
 * failed for the life of the page, and every later submit went tokenless.
 */
function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    window.__turnstileOnload = () => resolve(window.turnstile ?? null)
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Invisible Turnstile tokens on demand for a protected endpoint.
 *
 * @remarks One widget per calling surface in `execution: 'execute'` mode:
 * nothing is visible unless Cloudflare decides an interactive challenge is
 * required, in which case it renders into the returned `containerRef`
 * element (give it room via CSS only when populated).
 *
 * `requestToken()` runs the challenge and resolves a
 * {@link TurnstileTokenResult}, always within
 * {@link TURNSTILE_TOKEN_TIMEOUT_MS} of the call. A call made before the
 * widget has rendered waits up to {@link TURNSTILE_READY_TIMEOUT_MS} for it
 * instead of giving up at once (#405), which sent an early submit tokenless
 * into a 403. A blocked or failed script still resolves `unavailable` —
 * callers send anyway and let the server decide, so an unreachable
 * Cloudflare degrades to a server-side policy call rather than a dead
 * client. Only a timeout tells the caller to hold the request. `getToken()`
 * is the older shape, the token or `null`, for callers that always send.
 *
 * Calls run one at a time. The widget has one pending challenge and tokens
 * are single-use, so a second call made while the first runs (two quick
 * chat sends) waits its turn rather than resetting the first one's
 * challenge; the deadline still counts from the second call itself.
 *
 * Enablement is per-surface (§ the Turnstile rollout decision, 2026-08-10):
 * pass `enabled: false` to compile the whole flow out of a surface without
 * touching markup.
 *
 * When the script loads is per-surface too. `loadOn: 'demand'` fetches
 * nothing from Cloudflare until the surface calls the returned `load()` (a
 * form does so on its first focus) or asks for a token, so a visitor who never
 * uses the form makes no request to Cloudflare (#475, Brandon's #368
 * decision). `'mount'`, the default, loads as soon as the surface mounts, for
 * a surface whose first use should not wait for the script.
 */
export function useTurnstileToken(options: {
  enabled: boolean
  loadOn?: 'mount' | 'demand'
}) {
  const { enabled, loadOn = 'mount' } = options
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const active = enabled && Boolean(siteKey)
  // Whether this surface wants the script yet; once true it stays true.
  const [wanted, setWanted] = useState(loadOn === 'mount')
  const load = useCallback(() => setWanted(true), [])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const apiRef = useRef<TurnstileApi | null>(null)
  const resolverRef = useRef<((result: TurnstileTokenResult) => void) | null>(
    null,
  )
  const widgetStateRef = useRef<WidgetState>('loading')
  const readyWaitersRef = useRef(new Set<() => void>())
  // The previous call, which the next one waits for; never rejects.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())

  const settle = useCallback((result: TurnstileTokenResult) => {
    resolverRef.current?.(result)
    resolverRef.current = null
  }, [])

  const setWidgetState = useCallback((state: WidgetState) => {
    widgetStateRef.current = state
    if (state === 'loading') return
    const waiters = [...readyWaitersRef.current]
    readyWaitersRef.current.clear()
    for (const wake of waiters) wake()
  }, [])

  useEffect(() => {
    if (!active || !siteKey || !wanted) return
    let disposed = false
    setWidgetState('loading')
    void loadTurnstile().then((api) => {
      if (disposed) return
      if (!api || !containerRef.current) {
        setWidgetState('failed')
        return
      }
      try {
        apiRef.current = api
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: siteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          callback: (token) =>
            settle(
              token ? { status: 'token', token } : { status: 'unavailable' },
            ),
          'error-callback': (errorCode) =>
            settle(
              isTimeoutErrorCode(errorCode)
                ? { status: 'timeout' }
                : { status: 'unavailable' },
            ),
          'expired-callback': () => settle({ status: 'timeout' }),
          'timeout-callback': () => settle({ status: 'timeout' }),
        })
        setWidgetState('ready')
      } catch {
        setWidgetState('failed')
      }
    })
    return () => {
      disposed = true
      // The widget is going; a challenge running on it will never answer.
      settle({ status: 'timeout' })
      if (apiRef.current && widgetIdRef.current) {
        try {
          apiRef.current.remove(widgetIdRef.current)
        } catch {
          // Widget already gone (navigation teardown) — nothing to clean.
        }
      }
      widgetIdRef.current = null
      // A remount renders a new widget; a waiter keeps waiting for it.
      widgetStateRef.current = 'loading'
    }
  }, [active, siteKey, wanted, settle, setWidgetState])

  /** Resolve once the widget has rendered or failed, or after `ms`. */
  const waitForWidget = useCallback((ms: number): Promise<WidgetState> => {
    if (widgetStateRef.current !== 'loading' || ms <= 0) {
      return Promise.resolve(widgetStateRef.current)
    }
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timeout)
        resolve(widgetStateRef.current)
      }
      const timeout = setTimeout(() => {
        readyWaitersRef.current.delete(wake)
        resolve(widgetStateRef.current)
      }, ms)
      readyWaitersRef.current.add(wake)
    })
  }, [])

  /** Run one challenge on the rendered widget, settling within `ms`. */
  const runChallenge = useCallback(
    (api: TurnstileApi, widgetId: string, ms: number) =>
      new Promise<TurnstileTokenResult>((resolve) => {
        if (ms <= 0) {
          resolve({ status: 'timeout' })
          return
        }
        const timeout = setTimeout(() => {
          resolverRef.current = null
          // Cancel the abandoned challenge, so it cannot answer the next call.
          try {
            api.reset(widgetId)
          } catch {
            // Widget already gone; nothing left to answer.
          }
          resolve({ status: 'timeout' })
        }, ms)
        resolverRef.current = (result) => {
          clearTimeout(timeout)
          resolve(result)
        }
        try {
          // Tokens are single-use: reset then execute for a fresh one per call.
          api.reset(widgetId)
          api.execute(widgetId)
        } catch {
          resolverRef.current = null
          clearTimeout(timeout)
          resolve({ status: 'unavailable' })
        }
      }),
    [],
  )

  const requestToken = useCallback((): Promise<TurnstileTokenResult> => {
    if (!active) return Promise.resolve({ status: 'inactive' })
    // A submit can arrive before any focus did (autofill, a script); it starts
    // the load itself and waits for the widget like any early call.
    load()
    // A monotonic clock: a wall-clock correction must not stretch the bound.
    const deadline = performance.now() + TURNSTILE_TOKEN_TIMEOUT_MS
    const left = () => deadline - performance.now()
    const run = queueRef.current.then(
      async (): Promise<TurnstileTokenResult> => {
        if (left() <= 0) return { status: 'timeout' }
        const state = await waitForWidget(
          Math.min(TURNSTILE_READY_TIMEOUT_MS, left()),
        )
        if (state === 'loading') return { status: 'timeout' }
        const api = apiRef.current
        const widgetId = widgetIdRef.current
        if (state === 'failed' || !api || !widgetId) {
          return { status: 'unavailable' }
        }
        return runChallenge(api, widgetId, left())
      },
    )
    queueRef.current = run
    return run
  }, [active, load, waitForWidget, runChallenge])

  const getToken = useCallback(async (): Promise<string | null> => {
    const result = await requestToken()
    return result.status === 'token' ? result.token : null
  }, [requestToken])

  return { containerRef, getToken, requestToken, load, active }
}
