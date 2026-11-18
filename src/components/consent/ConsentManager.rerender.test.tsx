import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

import {
  CONSENT_AUTOGRANT_MARKER_KEY,
  CONSENT_STORAGE_KEY,
} from './consent-config'
import { DEFAULT_CONSENT_CONFIG } from './consent-content'
import { ConsentManager } from './ConsentManager'

const { getMockPathname, setMockPathname } = vi.hoisted(() => {
  let pathname = '/'
  return {
    getMockPathname: () => pathname,
    setMockPathname: (next: string) => {
      pathname = next
    },
  }
})
vi.mock('next/navigation', () => ({ usePathname: () => getMockPathname() }))

// jsdom has no matchMedia; c15t's color-scheme hook needs it.
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

/** The measurement consent c15t's live store holds right now. */
const liveMeasurement = (): boolean | undefined =>
  (
    window as unknown as {
      c15tStore?: {
        getState: () => { consents: { measurement?: boolean } }
      }
    }
  ).c15tStore?.getState().consents.measurement

function setConsentCookie(value: 'true' | 'false'): void {
  document.cookie = `${CONSENT_REQUIRED_COOKIE}=${value}; path=/`
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.cookie = `${CONSENT_REQUIRED_COOKIE}=; max-age=0; path=/`
  document.cookie = `${CONSENT_STORAGE_KEY}=; max-age=0; path=/`
  setMockPathname('/')
})

/**
 * #361: the stored-auto-grant check belongs to the first render of a
 * document, before c15t's store exists.
 *
 * The root layout can re-render later with an equal but new `consentConfig`
 * object (Clerk refreshes the router on sign-in and sign-out), which re-runs
 * the memo the check lives in. Run then, with the geo cookie already saying
 * "required", it wiped the stored record and the marker while the live store
 * kept the grant; the navigation that followed found a grant with no marker,
 * took it for an explicit choice, and did not revoke it, leaving Analytics on
 * in a consent-required region for the rest of the visit. One scenario per
 * file: c15t caches its store in module scope.
 */
describe('ConsentManager — a re-render with new props does not re-run the stored-auto-grant check (#361)', () => {
  it('keeps a live auto-grant marked, so the next region check still revokes it', async () => {
    const config = () => structuredClone(DEFAULT_CONSENT_CONFIG)
    setConsentCookie('false')
    setMockPathname('/start')
    const { rerender } = render(
      <ConsentManager consentConfig={config()}>
        <div data-testid="app" />
      </ConsentManager>,
    )
    await waitFor(() => {
      expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull()
    })
    expect(window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY)).toBe('1')
    expect(liveMeasurement()).toBe(true)

    // The region changes, and the app re-renders in place: same pathname, a
    // new config object.
    setConsentCookie('true')
    rerender(
      <ConsentManager consentConfig={config()}>
        <div data-testid="app" />
      </ConsentManager>,
    )
    expect(window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY)).toBe('1')
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull()

    // The next navigation is where the region is re-read. The auto-grant
    // must still be recognised as one and revoked in the live store.
    setMockPathname('/next')
    rerender(
      <ConsentManager consentConfig={config()}>
        <div data-testid="app" />
      </ConsentManager>,
    )
    await waitFor(() => {
      expect(
        window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY),
      ).toBeNull()
    })
    await waitFor(() => {
      expect(liveMeasurement()).toBe(false)
    })
  })
})
