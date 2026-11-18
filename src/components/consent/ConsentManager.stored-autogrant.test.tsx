import { cleanup, render, screen } from '@testing-library/react'
import { useConsentManager } from '@c15t/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

import {
  CONSENT_AUTOGRANT_MARKER_KEY,
  CONSENT_STORAGE_KEY,
} from './consent-config'
import { ConsentManager } from './ConsentManager'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

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

const GA_ID = 'G-TEST12345'
const win = window as unknown as Record<string, unknown>

const googleScripts = () =>
  Array.from(document.querySelectorAll('script')).filter((el) =>
    el.src.includes('googletagmanager.com'),
  )

/** Reports when c15t has finished its init and its first script pass. */
function Ready() {
  const { hasFetchedBanner } = useConsentManager()
  return hasFetchedBanner ? <span data-testid="c15t-ready" /> : null
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  document.cookie = `${CONSENT_REQUIRED_COOKIE}=; max-age=0; path=/`
  document.cookie = `${CONSENT_STORAGE_KEY}=; max-age=0; path=/`
})

/**
 * #361: a `measurement` grant stored by the opt-out auto-grant must not load
 * Google's tag on a page served to a consent-required region.
 *
 * c15t restores the stored record as its store is created and makes its first
 * script pass on it; the #103 reprompt that revokes such a grant is an effect
 * and runs later. Without the up-front discard in `ConsentManager` the tag is
 * installed on that first pass. One scenario per file, as in
 * `ConsentManager.ga.test.tsx`: c15t's loaded-script registry is module state.
 */
describe('ConsentManager — a stored auto-grant in a consent-required region (#361)', () => {
  it('is dropped before c15t reads it: no tag is installed and the visitor is asked', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', GA_ID)
    // What an earlier visit from an opt-out region left behind.
    window.localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({
        consents: { necessary: true, measurement: true },
        consentInfo: { time: Date.now(), subjectId: 'sub_test' },
      }),
    )
    window.localStorage.setItem(CONSENT_AUTOGRANT_MARKER_KEY, '1')
    // This page is served to a consent-required region.
    document.cookie = `${CONSENT_REQUIRED_COOKIE}=true; path=/`

    render(
      <ConsentManager>
        <Ready />
      </ConsentManager>,
    )

    await screen.findByTestId('c15t-ready')
    expect(googleScripts()).toHaveLength(0)
    expect(win.dataLayer).toBeUndefined()
    expect(window.localStorage.getItem(CONSENT_AUTOGRANT_MARKER_KEY)).toBeNull()
    expect(
      await screen.findByRole('region', { name: /cookie consent/i }),
    ).toBeInTheDocument()
  })
})
