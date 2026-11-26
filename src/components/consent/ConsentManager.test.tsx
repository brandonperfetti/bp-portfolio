import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

import {
  CONSENT_AUTOGRANT_MARKER_KEY,
  CONSENT_STORAGE_KEY,
} from './consent-config'
import { ConsentManager } from './ConsentManager'

// `usePathname` is the client-navigation signal ConsentSurface re-reads the geo
// cookie on; drive it manually to simulate a client-side navigation with no
// remount.
const { getMockPathname, setMockPathname } = vi.hoisted(() => {
  let pathname = '/'
  return {
    getMockPathname: () => pathname,
    setMockPathname: (next: string) => {
      pathname = next
    },
  }
})
vi.mock('next/navigation', () => ({
  usePathname: () => getMockPathname(),
}))

// jsdom has no matchMedia; c15t's color-scheme hook needs it (mirrors the
// repo's CookieBanner/CookieDialog test pattern).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

function setConsentCookie(value: 'true' | 'false'): void {
  document.cookie = `${CONSENT_REQUIRED_COOKIE}=${value}; path=/`
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.cookie = `${CONSENT_REQUIRED_COOKIE}=; max-age=0; path=/`
  setMockPathname('/')
})

describe('ConsentManager — region change across a client navigation (#111, #375)', () => {
  // The regression this guards: `ConsentSurface` used to read the geo cookie
  // only on mount, so an opt-out visitor whose measurement was granted
  // automatically could cross into a consent-required region by client-side
  // navigation with measurement still on. The fix re-reads the cookie on each
  // navigation. Since #375 the automatic grant lives in memory only, so the
  // witness is the banner: hidden while the grant holds, back once the
  // re-read clears it. Nothing is stored at either step.
  it('re-reads the geo cookie on navigation and clears the automatic grant when the visitor enters a consent-required region', async () => {
    setConsentCookie('false')
    setMockPathname('/start')
    const { rerender } = render(
      <ConsentManager>
        <div data-testid="app" />
      </ConsentManager>,
    )

    const banner = () =>
      screen.queryByRole('region', { name: /cookie consent/i })

    // Give the runtime time to settle; the banner must stay hidden.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(banner()).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY)).toBeNull()

    // A client-side navigation into a consent-required region: the proxy has
    // flipped the cookie and only the pathname changes (no remount).
    setConsentCookie('true')
    setMockPathname('/next')
    rerender(
      <ConsentManager>
        <div data-testid="app" />
      </ConsentManager>,
    )

    // Without the on-navigation re-read the banner would stay hidden.
    await waitFor(() => {
      expect(banner()).toBeInTheDocument()
    })
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })
})
