import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getPrefersReducedMotion,
  usePrefersReducedMotion,
} from '@/lib/motion/usePrefersReducedMotion'

/**
 * A `matchMedia` stand-in with a live change registry, so tests can flip the
 * reduced-motion preference after mount and assert the hook reacts. jsdom
 * ships no `matchMedia`; every animation surface reads it through this module.
 */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>()
  const state = { matches: initialMatches }

  const make = (query: string) =>
    ({
      get matches() {
        return state.matches
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener)
      },
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => make(query)),
  })

  return {
    set(matches: boolean) {
      state.matches = matches
      for (const listener of listeners) listener()
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  // Drop the stubbed matchMedia so suites can't leak state into each other.
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('getPrefersReducedMotion (shared synchronous read)', () => {
  it('is false when the platform reports no reduced-motion preference', () => {
    installMatchMedia(false)
    expect(getPrefersReducedMotion()).toBe(false)
  })

  it('is true when the platform requests reduced motion', () => {
    installMatchMedia(true)
    expect(getPrefersReducedMotion()).toBe(true)
  })

  it('queries the reduced-motion media exactly', () => {
    installMatchMedia(false)
    getPrefersReducedMotion()
    expect(window.matchMedia).toHaveBeenCalledWith(
      '(prefers-reduced-motion: reduce)',
    )
  })
})

describe('usePrefersReducedMotion (reactive wrapper)', () => {
  it('reports the current preference after mount', () => {
    installMatchMedia(true)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(true)
  })

  it('updates when the preference changes at runtime', () => {
    const control = installMatchMedia(false)
    const { result } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)

    act(() => control.set(true))
    expect(result.current).toBe(true)

    act(() => control.set(false))
    expect(result.current).toBe(false)
  })
})
