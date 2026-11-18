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
    // The auto-grant is a save, and c15t finishes a save asynchronously: the
    // marker above is written at once, the record a moment later. Wait for
    // the record, or the navigation below would race the save it revokes.
    await waitFor(() => {
      expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull()
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
    // And the visitor is actually asked. Clearing the marker was all this
    // test checked until #361's review, and it passed while the banner stayed
    // hidden: the revoke used to SAVE a denial, which c15t counts as a choice.
    expect(
      await screen.findByRole('region', { name: /cookie consent/i }),
    ).toBeInTheDocument()
    // Nothing is stored as the visitor's decision.
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
  })

  it('still asks when the region changes while the auto-grant is being saved', async () => {
    // c15t commits a save only after awaiting a WebCrypto digest, so a save
    // can be in flight when the region changes. A reset made then used to be
    // overwritten when the save landed: the grant came back, the tag with it,
    // and the banner hid, with no marker left to say it was automatic. The
    // digest is held here so the save is in flight for certain; the real one
    // finishes in a few milliseconds, which is why this cannot be left to
    // timing.
    const realDigest = crypto.subtle.digest.bind(crypto.subtle)
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const digest = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args) => {
        await held
        return realDigest(...args)
      })

    try {
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
      await waitFor(() => expect(digest).toHaveBeenCalled())
      // The premise: the save is in flight and has stored nothing.
      expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()

      // The region changes on a client-side navigation.
      setConsentCookie('true')
      setMockPathname('/next')
      rerender(
        <ConsentManager>
          <div data-testid="app" />
        </ConsentManager>,
      )
      // Let the reprompt effect run while the save is still held.
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Now the save lands. It cannot be cancelled, so for a moment the
      // grant exists; the reprompt, which waited for it, then forgets it.
      // What is asserted is where things come to rest.
      release()

      await waitFor(() => {
        expect(
          window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY),
        ).toBeNull()
        expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
        expect(
          screen.getByRole('region', { name: /cookie consent/i }),
        ).toBeInTheDocument()
      })
      // And it stays that way once everything has settled.
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull()
      expect(
        screen.getByRole('region', { name: /cookie consent/i }),
      ).toBeInTheDocument()
    } finally {
      release()
      digest.mockRestore()
    }
  })
})
