'use client'

import { useCallback, useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    params: {
      sitekey: string
      callback: (token: string) => void
      'error-callback'?: () => void
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

let scriptPromise: Promise<TurnstileApi | null> | null = null

/**
 * Load the Turnstile script once per page; resolve `null` (never reject) if
 * it can't load — privacy blockers commonly block challenges.cloudflare.com,
 * and a blocked script must degrade to "no token", not a crashed feature.
 */
function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10_000)
    window.__turnstileOnload = () => {
      clearTimeout(timeout)
      resolve(window.turnstile ?? null)
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onerror = () => {
      clearTimeout(timeout)
      resolve(null)
    }
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
 * element (give it room via CSS only when populated). `getToken()` runs the
 * challenge and resolves the fresh single-use token, or `null` when
 * Turnstile is disabled, blocked, or timing out — callers send the request
 * anyway and let the server decide, so an unreachable Cloudflare degrades
 * to a server-side policy call rather than a dead client.
 *
 * Enablement is per-surface (§ the Turnstile rollout decision, 2026-08-10):
 * pass `enabled: false` to compile the whole flow out of a surface without
 * touching markup.
 */
export function useTurnstileToken(options: { enabled: boolean }) {
  const { enabled } = options
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const active = enabled && Boolean(siteKey)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const apiRef = useRef<TurnstileApi | null>(null)
  const resolverRef = useRef<((token: string | null) => void) | null>(null)

  const settle = useCallback((token: string | null) => {
    resolverRef.current?.(token)
    resolverRef.current = null
  }, [])

  useEffect(() => {
    if (!active || !siteKey) return
    let disposed = false
    void loadTurnstile().then((api) => {
      if (disposed || !api || !containerRef.current) return
      apiRef.current = api
      widgetIdRef.current = api.render(containerRef.current, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token) => settle(token),
        'error-callback': () => settle(null),
        'expired-callback': () => settle(null),
        'timeout-callback': () => settle(null),
      })
    })
    return () => {
      disposed = true
      if (apiRef.current && widgetIdRef.current) {
        try {
          apiRef.current.remove(widgetIdRef.current)
        } catch {
          // Widget already gone (navigation teardown) — nothing to clean.
        }
      }
      widgetIdRef.current = null
    }
  }, [active, siteKey, settle])

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!active) return null
    const api = apiRef.current
    const widgetId = widgetIdRef.current
    if (!api || !widgetId) return null
    return new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => {
        if (resolverRef.current) {
          resolverRef.current = null
          resolve(null)
        }
      }, 15_000)
      resolverRef.current = (token) => {
        clearTimeout(timeout)
        resolve(token)
      }
      try {
        // Tokens are single-use: reset then execute for a fresh one per call.
        api.reset(widgetId)
        api.execute(widgetId)
      } catch {
        resolverRef.current = null
        clearTimeout(timeout)
        resolve(null)
      }
    })
  }, [active])

  return { containerRef, getToken, active }
}
