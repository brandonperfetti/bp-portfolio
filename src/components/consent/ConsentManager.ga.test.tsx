import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useConsentManager } from '@c15t/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { CONSENT_REQUIRED_COOKIE } from '@/lib/consent/cookie'

import { gaDisableKey } from './consent-config'
import { ConsentManager } from './ConsentManager'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

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

const GA_ID = 'G-TEST12345'
const win = window as unknown as Record<string, unknown>

const TAG_HOST = 'googletagmanager.com'
/**
 * A script counts when its `src` is served from Google's tag host or a
 * subdomain of it. A script with no `src`, or one that is not a URL, is not
 * a Google script and is skipped, never an error.
 */
const isTagScript = (el: HTMLScriptElement) => {
  try {
    const { hostname } = new URL(el.src)
    return hostname === TAG_HOST || hostname.endsWith(`.${TAG_HOST}`)
  } catch {
    return false
  }
}
const googleScripts = () =>
  Array.from(document.querySelectorAll('script')).filter(isTagScript)

/**
 * Stands in for the dialog's "Reject non-essential" on a later visit, and
 * reports when c15t has finished initialising.
 *
 * @remarks The ready marker is what makes the "nothing before a grant"
 * assertion mean something. c15t runs its first script pass at the end of an
 * async init, so an assertion made as soon as the banner paints passes for an
 * always-load tag too: it simply has not been installed yet. `hasFetchedBanner`
 * flips in the same store update that the script pass follows.
 */
function Probe() {
  const { saveConsents, hasFetchedBanner } = useConsentManager()
  return (
    <>
      {hasFetchedBanner ? <span data-testid="c15t-ready" /> : null}
      <button type="button" onClick={() => void saveConsents('necessary')}>
        withdraw
      </button>
    </>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  window.localStorage.clear()
  document.cookie = `${CONSENT_REQUIRED_COOKIE}=; max-age=0; path=/`
})

/**
 * #361, against the real c15t runtime in jsdom: what the DOM and `window`
 * hold before a choice, after a grant and after a withdrawal. One ordered
 * scenario on purpose: c15t keeps its loaded-script registry in module scope
 * with no reset, so separate cases in one file would inherit each other's
 * state. That a browser then makes no request is the e2e tier's to prove
 * (`e2e/consent-google-analytics.spec.ts`); jsdom fetches no scripts.
 */
describe('ConsentManager — Google Analytics waits for consent (#361)', () => {
  it('installs nothing from Google before a grant, installs the tag on accept, and stops it on withdrawal', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', GA_ID)
    document.cookie = `${CONSENT_REQUIRED_COOKIE}=true; path=/`

    render(
      <ConsentManager>
        <Probe />
      </ConsentManager>,
    )

    // Consent required, no choice made: the banner is up and nothing of the
    // tag exists. Not the script element, and not the `dataLayer`/`gtag`
    // globals its setup would have created.
    await screen.findByTestId('c15t-ready')
    const banner = await screen.findByRole('region', {
      name: /cookie consent/i,
    })
    expect(googleScripts()).toHaveLength(0)
    expect(win.dataLayer).toBeUndefined()
    expect(win.gtag).toBeUndefined()

    fireEvent.click(
      Array.from(banner.querySelectorAll('button')).find(
        (el) => el.textContent === 'Accept all',
      )!,
    )

    await waitFor(() => expect(googleScripts()).toHaveLength(1))
    expect(googleScripts()[0]!.src).toContain(`gtag/js?id=${GA_ID}`)
    expect(win[gaDisableKey(GA_ID)]).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'withdraw' }))

    await waitFor(() => expect(win[gaDisableKey(GA_ID)]).toBe(true))
    const calls = (win.dataLayer as ArrayLike<unknown>[]).map((args) =>
      Array.from(args),
    )
    expect(calls.at(-1)).toEqual([
      'consent',
      'update',
      { analytics_storage: 'denied' },
    ])
  })
})
