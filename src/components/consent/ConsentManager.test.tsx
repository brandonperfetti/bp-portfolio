import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

import { CONSENT_AUTOGRANT_MARKER_KEY } from './consent-config'
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

describe('ConsentManager — region change across a client navigation (#111)', () => {
  // The regression this guards: `ConsentSurface` used to read the geo cookie
  // only on mount, so an opt-out visitor whose measurement was auto-granted
  // could cross into a consent-required region via client-side navigation with
  // measurement still enabled and the #103 reprompt never firing. The fix
  // re-reads the cookie on each navigation. The auto-grant marker is the
  // deterministic witness: it is written when the opt-out auto-grant runs and
  // cleared when the region-change reprompt revokes it — so `'1'` → `null`
  // across a navigation proves the re-read happened and the revoke fired.
  it('re-reads the geo cookie on navigation and revokes an auto-grant when the visitor enters a consent-required region', async () => {
    // Opt-out region on first load: measurement is auto-granted (marker set),
    // and the banner stays hidden.
    setConsentCookie('false')
    setMockPathname('/start')
    const { rerender } = render(
      <ConsentManager>
        <div data-testid="app" />
      </ConsentManager>,
    )

    await waitFor(() => {
      expect(window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY)).toBe(
        '1',
      )
    })
    expect(
      screen.queryByRole('region', { name: /cookie consent/i }),
    ).not.toBeInTheDocument()

    // Simulate a client-side navigation into a consent-required region: the
    // proxy has flipped the cookie and only the pathname changes (no remount).
    setConsentCookie('true')
    setMockPathname('/next')
    rerender(
      <ConsentManager>
        <div data-testid="app" />
      </ConsentManager>,
    )

    // The re-read drives the #103 reprompt: the auto-grant is revoked, clearing
    // the marker. Without the on-navigation re-read the marker would stay '1'.
    await waitFor(() => {
      expect(
        window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY),
      ).toBeNull()
    })
  })
})
