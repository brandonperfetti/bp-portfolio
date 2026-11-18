import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

import {
  CONSENT_AUTOGRANT_MARKER_KEY,
  CONSENT_STORAGE_KEY,
} from './consent-config'
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
 * #361: a second tab must not turn this tab's automatic grant into a choice.
 *
 * The stored record and the auto-grant marker are shared by every tab; a
 * grant in a running tab lives in that tab's memory. When the region changes
 * and a second tab loads fresh, its stored-auto-grant check drops the shared
 * record and marker. This tab's next region check then found its live grant
 * unmarked, took it for an explicit choice, and did not revoke it, where
 * production (no discard) revokes. The second tab is simulated by what it
 * does to shared storage. One scenario per file: c15t caches its store in
 * module scope.
 */
describe('ConsentManager — another tab’s fresh-load discard does not reclassify this tab’s auto-grant (#361)', () => {
  it('still revokes on the next region check', async () => {
    setConsentCookie('false')
    setMockPathname('/start')
    const { rerender } = render(
      <ConsentManager>
        <div data-testid="app" />
      </ConsentManager>,
    )
    await waitFor(() => {
      expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).not.toBeNull()
    })
    expect(window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY)).toBe('1')
    expect(liveMeasurement()).toBe(true)

    // The region changes, and a second tab loads fresh in it: that tab's
    // check drops the record and the marker both tabs share.
    setConsentCookie('true')
    window.localStorage.removeItem(CONSENT_STORAGE_KEY)
    window.localStorage.removeItem(CONSENT_AUTOGRANT_MARKER_KEY)
    document.cookie = `${CONSENT_STORAGE_KEY}=; max-age=0; path=/`
    // This tab's grant is untouched by that.
    expect(liveMeasurement()).toBe(true)

    // This tab navigates. Its grant is still the automatic one, so it must
    // be revoked.
    setMockPathname('/next')
    rerender(
      <ConsentManager>
        <div data-testid="app" />
      </ConsentManager>,
    )
    await waitFor(() => {
      expect(liveMeasurement()).toBe(false)
    })
  })
})
